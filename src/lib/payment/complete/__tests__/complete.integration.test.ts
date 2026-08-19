import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationOperation,
  PaymentRemediationStatus,
  Prisma,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import { createCheckoutSession, transitionCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import {
  completeFromCapture,
  EximbayWebhookFirstCaptureError,
  recordCapture,
  runCompletionTransaction,
  type CaptureFacts,
} from "@/lib/payment/complete";

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  outboxDedupKeys: string[];
}

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

const B2_DEFAULT_NOW = "2026-08-01T00:00:00.000Z";

describe("payment completion core", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("정상 완료는 주문·배송·MTO MR·카트 정리·세션 완료를 원자로 만든다", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 2);
    const session = await submitSession(ctx);

    const result = await completeFromCapture(db, captureFacts(ctx, session));
    const order = await requireOrder(ctx.userId);

    expect(result.kind).toBe("completed");
    expect(order.totalAmount).toBe(session.totalAmount);
    expect(order.shipping?.recipientName).toBe("홍길동");
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.wigStyleId).toBe(variant.styleId);
    const sessionLine = await db.checkoutSessionLine.findFirstOrThrow({
      where: { sessionId: session.sessionId, variantId: variant.id },
      select: { wigStyleId: true },
    });
    expect(sessionLine.wigStyleId).toBe(variant.styleId);
    expect(order.items[0]?.mr).not.toBeNull();
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
    await expect(db.cartItem.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
  });

  it("finalization reasserts exact parent identity before order or MR writes", async () => {
    const purchased = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const wrongParent = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, purchased, 1);
    const session = await submitSession(ctx);
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: session.sessionId, variantId: purchased.id },
      data: { wigStyleId: wrongParent.styleId },
    });
    const facts = captureFacts(ctx, session);

    const result = await completeFromCapture(db, facts);

    expect(result).toMatchObject({
      kind: "compensationEnqueued",
      failure: { code: "VARIANT_PARENT_MISMATCH" },
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(mrCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(facts)).resolves.toBe(1);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
    await expect(db.cartItem.count({ where: { userId: ctx.userId } })).resolves.toBe(1);
  });

  it("unpublication after frozen session creation is prospective at finalization", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: { wigStyleId: variant.styleId, marketCode: MarketCode.KR } },
      data: { isActive: false },
    });
    const facts = captureFacts(ctx, session);

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(mrCount(ctx.userId)).resolves.toBe(1);
    await expect(outboxCount(facts)).resolves.toBe(0);
  });

  it("ordinary catalog and price edits after contact authorization are prospective", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const attempt = await initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      adapterContext: {
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        market: MarketCode.KR,
        method: PaymentMethod.MOCK,
        currency: session.currency,
        ruleId: "test.finalization.prospective",
        credentials: [],
        liveGuard: { kind: "blocked", liveEnabled: false, reason: "test sandbox" },
      },
      now: defaultNow(),
      contactBoundaryClock: () => new Date(defaultNow().getTime() + 1),
    });
    await db.wigStyle.update({ where: { id: variant.styleId }, data: { isActive: false } });
    await db.wigVariant.update({ where: { id: variant.id }, data: { isActive: false, stock: 0 } });
    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: { wigStyleId: variant.styleId, marketCode: MarketCode.KR } },
      data: { isActive: false },
    });
    await db.variantMarketPrice.delete({
      where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.KR } },
    });

    const result = await completeFromCapture(db, {
      ...captureFacts(ctx, session),
      paymentId: attempt.paymentId,
    });

    expect(result.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(mrCount(ctx.userId)).resolves.toBe(1);
  });

  it("price value changes after commitment are prospective just like price deletion", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await db.variantMarketPrice.update({
      where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.KR } },
      data: { amount: 99_000 },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result.kind).toBe("completed");
    const order = await requireOrder(ctx.userId);
    expect(order.items[0]?.unitAmount).toBe(12_000);
  });

  it("KR 빈 administrativeArea 세션은 완료 시 OrderShipping에도 빈 문자열로 복사한다", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.KR,
      shipping: { ...validShipping(), administrativeArea: "" },
      now: defaultNow(),
    });
    const sessionShipping = await db.checkoutSessionShipping.findUnique({
      where: { sessionId: session.sessionId },
      select: { administrativeArea: true },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));
    const order = await requireOrder(ctx.userId);

    expect(sessionShipping?.administrativeArea).toBe("");
    expect(result.kind).toBe("completed");
    expect(order.shipping?.administrativeArea).toBe("");
  });

  it("STOCKED 라인은 완료 시 stock을 조건부 차감하고 MR을 만들지 않는다", async () => {
    const variant = await createCatalogVariant(ctx, {
      amount: 9_000,
      stock: 3,
      fulfillmentType: FulfillmentType.STOCKED,
    });
    await addCart(ctx, variant, 2);
    const session = await submitSession(ctx);

    await completeFromCapture(db, captureFacts(ctx, session));
    const order = await requireOrder(ctx.userId);

    await expect(stockOf(variant.id)).resolves.toBe(1);
    expect(order.items[0]?.mr).toBeNull();
  });

  it("STOCKED 부족은 완료 효과를 롤백하고 중립 remediation 신호를 남긴다", async () => {
    const variant = await createCatalogVariant(ctx, {
      amount: 9_000,
      stock: 1,
      fulfillmentType: FulfillmentType.STOCKED,
    });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await db.wigVariant.update({ where: { id: variant.id }, data: { stock: 0 } });
    const facts = captureFacts(ctx, session);

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("compensationEnqueued");
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
    await expect(outboxCount(facts)).resolves.toBe(1);
    await expect(db.cartItem.count({ where: { userId: ctx.userId } })).resolves.toBe(1);
  });

  it("a completion rollback leaves neither cart mutation nor sibling-Order cleanup witness", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const facts = captureFacts(ctx, session);
    const captured = await recordCapture(db, facts);
    await db.payment.update({
      where: { id: captured.id },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
        blockingEndedAt: facts.receivedAt,
      },
    });

    const rolledBack = await runCompletionTransaction(db, facts, captured);

    expect(rolledBack.kind).toBe("retryableFailure");
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 2 });

    await db.payment.update({
      where: { id: captured.id },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        blockingEndedAt: null,
      },
    });
    const retried = await runCompletionTransaction(db, facts, captured);

    expect(retried.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("같은 캡처 2회는 주문 1개와 효과 1회로 수렴한다", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const facts = captureFacts(ctx, session);

    const first = await completeFromCapture(db, facts);
    const second = await completeFromCapture(db, facts);

    expect(first.kind).toBe("completed");
    expect(second.kind).toBe("alreadyCompleted");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(mrCount(ctx.userId)).resolves.toBe(1);
    await expect(outboxCount(facts)).resolves.toBe(0);
  });

  it("post-submit same-row additions preserve the exact CartItem id and positive residual", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await incrementCart(source.id, 1);

    await completeFromCapture(db, captureFacts(ctx, session));

    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("larger post-submit excess is decremented only by the frozen quantity", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await incrementCart(source.id, 2);

    await completeFromCapture(db, captureFacts(ctx, session));

    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 2 });
  });

  it("a current source quantity below the frozen quantity deletes only that source row", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 2);
    const session = await submitSession(ctx);
    await db.cartItem.update({ where: { id: source.id }, data: { quantity: 1 } });

    await completeFromCapture(db, captureFacts(ctx, session));

    await expect(cartRow(source.id)).resolves.toBeNull();
  });

  it("delete and re-add creates a new CartItem generation that old completion cannot consume", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const firstSource = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await db.cartItem.delete({ where: { id: firstSource.id } });
    const secondSource = await addCart(ctx, variant, 2);

    await completeFromCapture(db, captureFacts(ctx, session));

    expect(secondSource.id).not.toBe(firstSource.id);
    await expect(cartRow(secondSource.id)).resolves.toEqual({ id: secondSource.id, quantity: 2 });
  });

  it("legacy null provenance completes the order and conservatively leaves the live cart untouched", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: session.sessionId },
      data: { sourceCartItemId: null },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("corrupted provenance cannot consume another user's CartItem", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const otherUserId = `b2_other_${randomUUID()}`;
    await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@example.test` } });
    const foreign = await db.cartItem.create({
      data: { userId: otherUserId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 3 },
      select: { id: true },
    });
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: session.sessionId },
      data: { sourceCartItemId: foreign.id },
    });

    try {
      const result = await completeFromCapture(db, captureFacts(ctx, session));
      expect(result.kind).toBe("completed");
      await expect(cartRow(foreign.id)).resolves.toEqual({ id: foreign.id, quantity: 3 });
    } finally {
      await db.cartItem.deleteMany({ where: { userId: otherUserId } });
      await db.user.deleteMany({ where: { id: otherUserId } });
    }
  });

  it("corrupted provenance cannot consume another variant's CartItem", async () => {
    const purchased = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, purchased, 1);
    const session = await submitSession(ctx);
    const unrelated = await createCatalogVariant(ctx, { amount: 8_000, stock: 5 });
    const foreign = await addCart(ctx, unrelated, 3);
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: session.sessionId },
      data: { sourceCartItemId: foreign.id },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result.kind).toBe("completed");
    await expect(cartRow(foreign.id)).resolves.toEqual({ id: foreign.id, quantity: 3 });
  });

  it("corrupted provenance cannot consume a CartItem with another style identity", async () => {
    const purchased = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const original = await addCart(ctx, purchased, 1);
    const session = await submitSession(ctx);
    await db.cartItem.delete({ where: { id: original.id } });
    const wrongStyle = await createCatalogVariant(ctx, { amount: 8_000, stock: 5 });
    const foreign = await db.cartItem.create({
      data: { userId: ctx.userId, wigStyleId: wrongStyle.styleId, variantId: purchased.id, quantity: 3 },
      select: { id: true },
    });
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: session.sessionId },
      data: { sourceCartItemId: foreign.id },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result.kind).toBe("completed");
    await expect(cartRow(foreign.id)).resolves.toEqual({ id: foreign.id, quantity: 3 });
  });

  it("same frozen quantities preserve post-submit intent when the first-created session completes first", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const firstCreated = await submitSession(ctx);
    const secondCreated = await submitSession(ctx);
    await incrementCart(source.id, 1);

    const first = await completeFromCapture(db, captureFacts(ctx, firstCreated));
    const second = await completeFromCapture(db, captureFacts(ctx, secondCreated));

    expect(first.kind).toBe("completed");
    expect(second.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(2);
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("same frozen quantities preserve post-submit intent when the later-created session completes first", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const firstCreated = await submitSession(ctx);
    const secondCreated = await submitSession(ctx);
    await incrementCart(source.id, 1);

    const second = await completeFromCapture(db, captureFacts(ctx, secondCreated));
    const first = await completeFromCapture(db, captureFacts(ctx, firstCreated));

    expect(second.kind).toBe("completed");
    expect(first.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(2);
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("a larger frozen quantity advances the cleanup watermark after a smaller completion", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const smaller = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const larger = await submitSession(ctx);

    const smallerResult = await completeFromCapture(db, captureFacts(ctx, smaller));
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
    const largerResult = await completeFromCapture(db, captureFacts(ctx, larger));

    expect(smallerResult.kind).toBe("completed");
    expect(largerResult.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(2);
    await expect(cartRow(source.id)).resolves.toBeNull();
  });

  it("a smaller frozen quantity cannot consume again after a larger completion", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const smaller = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const larger = await submitSession(ctx);

    const largerResult = await completeFromCapture(db, captureFacts(ctx, larger));
    const smallerResult = await completeFromCapture(db, captureFacts(ctx, smaller));

    expect(largerResult.kind).toBe("completed");
    expect(smallerResult.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(2);
    await expect(cartRow(source.id)).resolves.toBeNull();
  });

  it("future intent after the larger snapshot survives smaller-then-larger completion", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const smaller = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const larger = await submitSession(ctx);
    await incrementCart(source.id, 1);

    await completeFromCapture(db, captureFacts(ctx, smaller));
    await completeFromCapture(db, captureFacts(ctx, larger));

    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("future intent after the larger snapshot survives larger-then-smaller completion", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const smaller = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const larger = await submitSession(ctx);
    await incrementCart(source.id, 1);

    await completeFromCapture(db, captureFacts(ctx, larger));
    await completeFromCapture(db, captureFacts(ctx, smaller));

    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("a committed sibling from another user does not contribute to the cleanup watermark", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const corruptedSibling = await submitSession(ctx);
    const current = await submitSession(ctx);
    await incrementCart(source.id, 1);
    await completeFromCapture(db, captureFacts(ctx, corruptedSibling));
    const otherUserId = `b2_watermark_other_${randomUUID()}`;
    await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@example.test` } });
    await db.checkoutSession.update({
      where: { id: corruptedSibling.sessionId },
      data: { userId: otherUserId },
    });

    try {
      await completeFromCapture(db, captureFacts(ctx, current));
      await expect(cartRow(source.id)).resolves.toBeNull();
    } finally {
      await db.checkoutSession.update({
        where: { id: corruptedSibling.sessionId },
        data: { userId: ctx.userId },
      });
      await db.user.delete({ where: { id: otherUserId } });
    }
  });

  it("a committed sibling with another variant does not contribute to the cleanup watermark", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const corruptedSibling = await submitSession(ctx);
    const current = await submitSession(ctx);
    await incrementCart(source.id, 1);
    await completeFromCapture(db, captureFacts(ctx, corruptedSibling));
    const unrelated = await createCatalogVariant(ctx, { amount: 8_000, stock: 5 });
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: corruptedSibling.sessionId },
      data: { variantId: unrelated.id },
    });

    await completeFromCapture(db, captureFacts(ctx, current));

    await expect(cartRow(source.id)).resolves.toBeNull();
  });

  it("a committed sibling with another style does not contribute to the cleanup watermark", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const corruptedSibling = await submitSession(ctx);
    const current = await submitSession(ctx);
    await incrementCart(source.id, 1);
    await completeFromCapture(db, captureFacts(ctx, corruptedSibling));
    const unrelated = await createCatalogVariant(ctx, { amount: 8_000, stock: 5 });
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: corruptedSibling.sessionId },
      data: { wigStyleId: unrelated.styleId },
    });

    await completeFromCapture(db, captureFacts(ctx, current));

    await expect(cartRow(source.id)).resolves.toBeNull();
  });

  it("different frozen quantities causally serialize at the exact CartItem row and consume only the maximum", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const smaller = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const larger = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const frozenQuantities = await db.checkoutSessionLine.findMany({
      where: { sessionId: { in: [smaller.sessionId, larger.sessionId] } },
      select: { quantity: true },
    });
    expect(frozenQuantities.map((line) => line.quantity).sort()).toEqual([1, 2]);
    const boundary = await holdCartItemCleanupBoundary(source.id);

    try {
      const completions = Promise.all([
        completeFromCapture(db, captureFacts(ctx, smaller)),
        completeFromCapture(db, captureFacts(ctx, larger)),
      ]);
      const evidence = await waitForBlockedCartCleanup(boundary, 2);
      expect(evidence).toHaveLength(2);
      expect(evidence.every((row) => row.query.includes('FROM "CartItem"') && row.query.includes("FOR UPDATE"))).toBe(true);
      expect(evidence.some((row) => row.blockingPids.includes(boundary.blockerPid))).toBe(true);
      const contenderPids = evidence.map((row) => row.pid);
      expect(evidence.some((row) => row.blockingPids.some((pid) => contenderPids.includes(pid)))).toBe(true);
      await boundary.release();

      const results = await completions;
      expect(results.map((result) => result.kind)).toEqual(["completed", "completed"]);
      await expect(orderCount(ctx.userId)).resolves.toBe(2);
      await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
    } finally {
      await boundary.close();
    }
  }, 10_000);

  it("capture replay after a post-submit add does not consume the residual twice", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    await incrementCart(source.id, 1);
    const facts = captureFacts(ctx, session);

    const first = await completeFromCapture(db, facts);
    const replay = await completeFromCapture(db, facts);

    expect(first.kind).toBe("completed");
    expect(replay.kind).toBe("alreadyCompleted");
    await expect(cartRow(source.id)).resolves.toEqual({ id: source.id, quantity: 1 });
  });

  it("completed same-key duplicate under flipped mode remains benign and void-less", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session);

    const first = await completeFromCapture(db, facts);
    const second = await completeFromCapture(db, {
      ...facts,
      mode: PaymentMode.LIVE,
      receivedAt: new Date(facts.receivedAt.getTime() + 1_000),
    });
    const payment = await paymentByKey(facts);

    expect(first.kind).toBe("completed");
    expect(second.kind).toBe("alreadyCompleted");
    expect(payment).toMatchObject({ mode: PaymentMode.SANDBOX, status: PaymentAttemptStatus.SUCCEEDED });
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(succeededPaymentCount(facts)).resolves.toBe(1);
    await expect(outboxCount(facts)).resolves.toBe(0);
  });

  it("동시 completeFromCapture 경쟁도 주문 1개로 수렴한다", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const facts = captureFacts(ctx, session);

    const results = await Promise.all([
      completeFromCapture(db, facts),
      completeFromCapture(db, facts),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["alreadyCompleted", "completed"]);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("금액 불일치는 주문 없이 FAILED와 중립 remediation 신호 1개로 귀결된다", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const facts = captureFacts(ctx, session, { amount: session.totalAmount + 1 });

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("compensationEnqueued");
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
    await expect(outboxCount(facts)).resolves.toBe(1);
  });

  it("expiresAt 전 캡처는 신호 수신이 늦어도 스윕 전이면 완료된다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, {
      capturedAt: session.expiresAt,
      receivedAt: new Date(session.expiresAt.getTime() + 10_000),
    });

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("completed");
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
  });

  it("expiresAt 전 캡처는 EXPIRED 전이 뒤에도 완료된다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await transitionCheckoutSession(db, {
      sessionId: session.sessionId,
      transition: { from: "SUBMITTED", to: "EXPIRED" },
      now: new Date(session.expiresAt.getTime() + 1),
    });
    const facts = captureFacts(ctx, session, {
      capturedAt: session.expiresAt,
      receivedAt: new Date(session.expiresAt.getTime() + 10_000),
    });

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("completed");
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
  });

  it("expiresAt 후 캡처는 중립 remediation 신호로 귀결된다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, {
      capturedAt: new Date(session.expiresAt.getTime() + 1),
      receivedAt: new Date(session.expiresAt.getTime() + 10_000),
    });

    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("compensationEnqueued");
    await expect(outboxCount(facts)).resolves.toBe(1);
  });

  it("α만 수행된 상태에서 재진입하면 β가 완료로 수렴한다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session);

    await recordCapture(db, facts);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("completed");
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("a verifiably REMEDIATED sibling no longer blocks completion", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const remediatedAt = new Date();
    await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.VOIDED,
        attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_REMEDIATED,
        remediationStatus: PaymentRemediationStatus.REMEDIATED,
        amount: session.totalAmount,
        currency: session.currency,
        providerPaymentKey: `remediated_${randomUUID()}`,
        idempotencyKey: `remediated:${randomUUID()}`,
        financialSucceededAt: remediatedAt,
        blockingEndedAt: remediatedAt,
        remediationOperation: PaymentRemediationOperation.VOID,
        remediationResultRef: `void-result:${randomUUID()}`,
        remediatedAt,
      },
    });

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result.kind).toBe("completed");
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("an unresolved sibling still blocks completion and leaves no commerce writes", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session);
    const primary = await recordCapture(db, facts);
    await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        amount: session.totalAmount,
        currency: session.currency,
        providerPaymentKey: `sibling_${randomUUID()}`,
        idempotencyKey: `sibling:${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        financialSucceededAt: new Date(),
        blockingEndedAt: new Date(),
        suspendedByPaymentId: primary.id,
      },
    });

    const result = await completeFromCapture(db, facts);

    expect(result).toMatchObject({
      kind: "compensationEnqueued",
      failure: { code: "PAYMENT_BLOCKED_BY_REMEDIATION" },
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(mrCount(ctx.userId)).resolves.toBe(0);
  });

  it("a same-session suspension cycle cannot finalize or create commerce rows", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const [cycleA, cycleB] = await Promise.all([
      createOrdinarySuperseded(session, "cycle-a"),
      createOrdinarySuperseded(session, "cycle-b"),
    ]);
    await db.$executeRaw(Prisma.sql`
      UPDATE "Payment"
      SET "attemptLifecycle" = 'SUSPENDED',
          "suspendedByPaymentId" = CASE "id"
            WHEN ${cycleA.id} THEN ${cycleB.id}
            WHEN ${cycleB.id} THEN ${cycleA.id}
          END
      WHERE "id" IN (${cycleA.id}, ${cycleB.id})
    `);

    const result = await completeFromCapture(db, captureFacts(ctx, session));

    expect(result).toMatchObject({
      kind: "compensationEnqueued",
      failure: { code: "PAYMENT_BLOCKED_BY_REMEDIATION" },
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(mrCount(ctx.userId)).resolves.toBe(0);
  });

  it("providerRef가 있는 pending payment도 providerPaymentKey null 조건으로 캡처 claim 된다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_${randomUUID()}`;
    const payment = await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        providerRef,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        idempotencyKey: `pref_idem_${randomUUID()}`,
      },
      select: { id: true, providerPaymentKey: true },
    });
    const facts = captureFacts(ctx, session);

    const result = await completeFromCapture(db, facts);
    const captured = await db.payment.findUnique({
      where: { id: payment.id },
      select: { providerRef: true, providerPaymentKey: true, status: true },
    });

    expect(payment.providerPaymentKey).toBeNull();
    expect(result.kind).toBe("completed");
    expect(captured).toEqual({
      providerRef,
      providerPaymentKey: facts.providerPaymentKey,
      status: PaymentAttemptStatus.SUCCEEDED,
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("webhook/API-first capture does not require providerConfirmIdempotencyKey", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session);

    const result = await completeFromCapture(db, facts);
    const payment = await db.payment.findUnique({
      where: {
        provider_providerPaymentKey: {
          provider: facts.provider,
          providerPaymentKey: facts.providerPaymentKey,
        },
      },
      select: { providerConfirmIdempotencyKey: true, idempotencyKey: true, providerPaymentKey: true },
    });

    expect(result.kind).toBe("completed");
    expect(payment).toEqual({
      providerConfirmIdempotencyKey: null,
      idempotencyKey: `capture:${facts.provider}:${facts.providerPaymentKey}`,
      providerPaymentKey: facts.providerPaymentKey,
    });
  });

  it("webhook/API-first capture persists the capture mode", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, { mode: PaymentMode.LIVE });

    const payment = await recordCapture(db, facts);
    const persisted = await db.payment.findUnique({
      where: { id: payment.id },
      select: { mode: true, providerPaymentKey: true },
    });

    expect(payment.mode).toBe(PaymentMode.LIVE);
    expect(persisted).toEqual({ mode: PaymentMode.LIVE, providerPaymentKey: facts.providerPaymentKey });
  });

  it("fails EXIMBAY webhook-first capture closed without fabricating a Payment or providerOrderId", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, { provider: PaymentProvider.EXIMBAY });

    await expect(recordCapture(db, facts)).rejects.toBeInstanceOf(EximbayWebhookFirstCaptureError);
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("allows an explicitly correlated existing EXIMBAY attempt without replacing its identities", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerOrderId = syntheticEximbayProviderOrderId();
    const providerRef = `eximbay_ref_${randomUUID()}`;
    const providerConfirmIdempotencyKey = `eximbay_confirm_${randomUUID()}`;
    const idempotencyKey = `eximbay_attempt_${randomUUID()}`;
    const payment = await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        providerOrderId,
        providerRef,
        providerConfirmIdempotencyKey,
        idempotencyKey,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
      },
      select: { id: true },
    });
    const facts = captureFacts(ctx, session, {
      paymentId: payment.id,
      provider: PaymentProvider.EXIMBAY,
    });

    await expect(recordCapture(db, facts)).resolves.toMatchObject({
      id: payment.id,
      providerPaymentKey: facts.providerPaymentKey,
    });
    await expect(db.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: {
        providerOrderId: true,
        providerRef: true,
        providerPaymentKey: true,
        providerConfirmIdempotencyKey: true,
        idempotencyKey: true,
      },
    })).resolves.toEqual({
      providerOrderId,
      providerRef,
      providerPaymentKey: facts.providerPaymentKey,
      providerConfirmIdempotencyKey,
      idempotencyKey,
    });
  });

  it("capture mode mismatch is terminal, void-less, and does not claim or duplicate the pending attempt", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const pending = await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        idempotencyKey: `mode_mismatch_${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
      },
      select: { id: true },
    });
    const facts = captureFacts(ctx, session, { mode: PaymentMode.LIVE });

    const result = await completeFromCapture(db, facts);
    const persisted = await db.payment.findUnique({
      where: { id: pending.id },
      select: { mode: true, status: true, providerPaymentKey: true },
    });

    expect(result.kind).toBe("compensationSkipped");
    if (result.kind === "compensationSkipped") {
      expect(result.failure.code).toBe("MODE_MISMATCH");
      expect(result.failure.paymentId).toBe(pending.id);
      expect(result).not.toHaveProperty("outboxDedupKey");
    }
    expect(persisted).toEqual({
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      providerPaymentKey: null,
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(facts)).resolves.toBe(0);
  });

  it("orphan succeeded payment with mismatched duplicate capture stays unchanged and void-less", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerPaymentKey = `orphan_mode_${randomUUID()}`;
    const payment = await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        providerPaymentKey,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        financialSucceededAt: new Date(),
        idempotencyKey: `orphan_mode_${randomUUID()}`,
      },
      select: { id: true },
    });
    const facts = captureFacts(ctx, session, { mode: PaymentMode.LIVE, providerPaymentKey });

    const result = await completeFromCapture(db, facts);
    const persisted = await db.payment.findUnique({
      where: { id: payment.id },
      select: { mode: true, status: true, providerPaymentKey: true },
    });

    expect(result.kind).toBe("compensationSkipped");
    if (result.kind === "compensationSkipped") expect(result.failure.code).toBe("MODE_MISMATCH");
    expect(persisted).toEqual({
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentKey,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(outboxCount(facts)).resolves.toBe(0);
  });

  it("mode mismatch does not consume the remediation dedup slot for a later legitimate signal", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        idempotencyKey: `dedup_mode_${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
      },
    });
    const providerPaymentKey = `dedup_mode_capture_${randomUUID()}`;
    const mismatch = captureFacts(ctx, session, { mode: PaymentMode.LIVE, providerPaymentKey });
    const legitimate = captureFacts(ctx, session, { providerPaymentKey, amount: session.totalAmount + 1 });

    const skipped = await completeFromCapture(db, mismatch);
    const enqueued = await completeFromCapture(db, legitimate);

    expect(skipped.kind).toBe("compensationSkipped");
    expect(enqueued.kind).toBe("compensationEnqueued");
    await expect(outboxCount(legitimate)).resolves.toBe(1);
  });

  it("같은 캡처 재실패는 remediation 신호를 행 1개로 멱등 처리한다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, { amount: session.totalAmount + 1 });

    await completeFromCapture(db, facts);
    await completeFromCapture(db, facts);

    await expect(outboxCount(facts)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("카트의 비구매 라인은 완료 후에도 남는다", async () => {
    const purchased = await createCatalogVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, purchased, 1);
    const session = await submitSession(ctx);
    const remaining = await createCatalogVariant(ctx, { amount: 8_000, stock: 5 });
    await addCart(ctx, remaining, 1);

    await completeFromCapture(db, captureFacts(ctx, session));
    const rows = await db.cartItem.findMany({ where: { userId: ctx.userId }, select: { variantId: true } });

    expect(rows).toEqual([{ variantId: remaining.id }]);
  });
});

function makeContext(): TestContext {
  return { userId: `b2_${randomUUID()}`, styleIds: [], variantIds: [], outboxDedupKeys: [] };
}

async function ensureMarkets(): Promise<void> {
  await upsertMarket(MarketCode.KR, "KRW", [ShippingCountry.KR], "ko");
}

async function upsertMarket(
  code: MarketCode,
  currency: string,
  shippableCountries: ShippingCountry[],
  defaultLocale: string,
): Promise<void> {
  await db.market.upsert({
    where: { code },
    update: { currency, shippableCountries, defaultLocale, isActive: true },
    create: { code, currency, shippableCountries, defaultLocale, isActive: true },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.paymentOutbox.deleteMany({ where: { dedupKey: { in: context.outboxDedupKeys } } });
  await deleteOrders(context.userId);
  await deletePaymentsAndSessions(context.userId);
  await db.cartItem.deleteMany({ where: { userId: context.userId } });
  await deleteVariants(context);
  await db.user.deleteMany({ where: { id: context.userId } });
}

async function deleteOrders(userId: string): Promise<void> {
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return;
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  await db.manufacturingRequest.deleteMany({ where: { orderItemId: { in: items.map((item) => item.id) } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderShipping.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function deletePaymentsAndSessions(userId: string): Promise<void> {
  const sessions = await db.checkoutSession.findMany({ where: { userId }, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) return;
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
}

async function deleteVariants(context: TestContext): Promise<void> {
  if (context.variantIds.length > 0) {
    await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
    await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  }
  if (context.styleIds.length > 0) {
    await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  }
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `B2 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b2-cover.png",
      availableMarkets: { create: { marketCode: MarketCode.KR, isActive: true } },
    },
    select: { id: true },
  });
  context.styleIds.push(style.id);
  return createVariant(context, style.id, options);
}

async function createVariant(context: TestContext, styleId: string, options: VariantOptions) {
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: styleId,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: 88_000,
      stock: options.stock ?? 10,
      sku: `B2-${randomUUID()}`,
      fulfillmentType: options.fulfillmentType ?? FulfillmentType.MTO,
    },
    select: { id: true },
  });
  context.variantIds.push(variant.id);
  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.KR, amount: options.amount ?? 12_000 },
  });
  return { id: variant.id, styleId };
}

async function addCart(
  context: TestContext,
  variant: { id: string; styleId: string },
  quantity: number,
): Promise<{ id: string }> {
  return db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity },
    select: { id: true },
  });
}

async function submitSession(context: TestContext, now?: Date) {
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
    now: now ?? defaultNow(),
  });
}

async function submitSessionWithOneLine(context: TestContext, now?: Date) {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await addCart(context, variant, 1);
  return submitSession(context, now);
}

async function createOrdinarySuperseded(
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  label: string,
) {
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `${label}:${randomUUID()}`,
      contactIntentAt: new Date(),
      supersededAt: new Date(),
      blockingEndedAt: new Date(),
    },
    select: { id: true },
  });
}

function validShipping(): CheckoutShippingInput {
  return {
    recipientName: "홍길동",
    phone: "010-1234-5678",
    country: ShippingCountry.KR,
    postalCode: "12345",
    administrativeArea: "서울특별시",
    city: "강남구",
    addressLine1: "테헤란로 1",
  };
}

function captureFacts(
  context: TestContext,
  session: Awaited<ReturnType<typeof submitSession>>,
  overrides: Partial<CaptureFacts> = {},
): CaptureFacts {
  const providerPaymentKey = overrides.providerPaymentKey ?? `capture_${randomUUID()}`;
  const facts = {
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey,
    amount: session.totalAmount,
    currency: session.currency,
    receivedAt: new Date(session.expiresAt.getTime() - 1_000),
    ...overrides,
  };
  context.outboxDedupKeys.push(remediationDedupKey(facts));
  return facts;
}

function defaultNow(): Date {
  return new Date(B2_DEFAULT_NOW);
}

function remediationDedupKey(facts: CaptureFacts): string {
  return `payment-remediation:${facts.provider}:${facts.providerPaymentKey}`;
}

async function requireOrder(userId: string) {
  const order = await db.order.findFirst({
    where: { userId },
    include: { items: { include: { mr: true } }, shipping: true },
  });
  if (!order) throw new Error(`Missing order for user ${userId}`);
  return order;
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

async function mrCount(userId: string): Promise<number> {
  return db.manufacturingRequest.count({ where: { orderItem: { order: { userId } } } });
}

async function paymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({ where: { checkoutSessionId } });
}

async function paymentByKey(facts: CaptureFacts) {
  const payment = await db.payment.findUnique({
    where: {
      provider_providerPaymentKey: {
        provider: facts.provider,
        providerPaymentKey: facts.providerPaymentKey,
      },
    },
    select: { mode: true, status: true, providerPaymentKey: true },
  });
  if (!payment) throw new Error(`Missing payment ${facts.providerPaymentKey}`);
  return payment;
}

async function succeededPaymentCount(facts: CaptureFacts): Promise<number> {
  return db.payment.count({
    where: {
      provider: facts.provider,
      providerPaymentKey: facts.providerPaymentKey,
      status: PaymentAttemptStatus.SUCCEEDED,
    },
  });
}

async function outboxCount(facts: CaptureFacts): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: remediationDedupKey(facts) } });
}

async function statusOf(sessionId: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session.status;
}

async function stockOf(variantId: string): Promise<number> {
  const variant = await db.wigVariant.findUnique({ where: { id: variantId }, select: { stock: true } });
  if (!variant) throw new Error(`Missing variant ${variantId}`);
  return variant.stock;
}

async function incrementCart(cartItemId: string, quantity: number): Promise<void> {
  await db.cartItem.update({ where: { id: cartItemId }, data: { quantity: { increment: quantity } } });
}

async function cartRow(cartItemId: string): Promise<{ id: string; quantity: number } | null> {
  return db.cartItem.findUnique({ where: { id: cartItemId }, select: { id: true, quantity: true } });
}

interface CartCleanupBoundary {
  client: Client;
  observer: Client;
  blockerPid: number;
  release(): Promise<void>;
  close(): Promise<void>;
}

interface CartCleanupWaitEvidence {
  pid: number;
  blockingPids: number[];
  query: string;
  state: string;
  waitEventType: string | null;
}

async function holdCartItemCleanupBoundary(cartItemId: string): Promise<CartCleanupBoundary> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for completion lock verification");
  const client = new Client({
    connectionString,
    application_name: `wig_cart_provenance_boundary_${randomUUID()}`,
  });
  await client.connect();
  const observer = new Client({
    connectionString,
    application_name: `wig_cart_provenance_observer_${randomUUID()}`,
  });
  await observer.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const locked = await client.query<{ id: string }>(
      'SELECT "id" FROM "CartItem" WHERE "id" = $1 FOR UPDATE',
      [cartItemId],
    );
    if (locked.rowCount !== 1) throw new Error(`Expected to lock CartItem ${cartItemId}`);
    const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const blockerPid = pidResult.rows[0]?.pid;
    if (blockerPid === undefined) throw new Error("Expected CartItem cleanup blocker pid");
    return {
      client,
      observer,
      blockerPid,
      release: async () => {
        if (!transactionOpen) return;
        await client.query("COMMIT");
        transactionOpen = false;
      },
      close: async () => {
        if (transactionOpen) await client.query("ROLLBACK");
        transactionOpen = false;
        await observer.end();
        await client.end();
      },
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    await observer.end();
    await client.end();
    throw error;
  }
}

async function waitForBlockedCartCleanup(
  boundary: CartCleanupBoundary,
  expectedCount: number,
): Promise<CartCleanupWaitEvidence[]> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await boundary.observer.query<CartCleanupWaitEvidence>(`
      SELECT a.pid,
             pg_blocking_pids(a.pid) AS "blockingPids",
             a.query,
             a.state,
             a.wait_event_type AS "waitEventType"
      FROM pg_stat_activity a
      WHERE a.datname = current_database()
        AND a.pid <> pg_backend_pid()
      ORDER BY a.pid
    `);
    const blocked = result.rows.filter((row) => (
      row.waitEventType === "Lock"
      && row.blockingPids.length > 0
      && row.query.includes('FROM "CartItem"')
      && row.query.includes("FOR UPDATE")
    ));
    if (blocked.length >= expectedCount) return blocked.slice(0, expectedCount);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${expectedCount} blocked CartItem cleanup transactions`);
}
