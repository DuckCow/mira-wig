import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OutboxStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  Prisma,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import type { PaymentOutbox } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, transitionCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { completeFromCapture, recordCapture, type CaptureFacts, type CompleteFromCaptureResult } from "@/lib/payment/complete";
import { dispatchPending, enqueue, OUTBOX_ZOMBIE_AFTER_MS } from "@/lib/payment/outbox";
import { handleWebhook } from "@/lib/payment/webhook/handle";
import { createMockWebhookPipeline } from "@/lib/payment/webhook/mock-pipeline";
import type { VoidExecutor, VoidExecutorInput, VoidExecutorResult } from "@/lib/payment/void";
import { createVoidHandler } from "@/lib/payment/void";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/market/resolve", () => ({ getCurrentMarketCode: vi.fn() }));

import { getCurrentMarketCode } from "@/lib/market/resolve";
import { getSession } from "@/lib/session";
import { confirmPayment } from "@/app/actions/payment";

const mockGetSession = vi.mocked(getSession);
const mockGetCurrentMarketCode = vi.mocked(getCurrentMarketCode);
const ORIGINAL_MOCK_MODE = process.env.PAYMENT_MOCK_MODE;
const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;
const C1_NOW = new Date("2026-08-04T00:00:00.000Z");
const C1_RECEIVED_AT = new Date("2026-08-04T00:02:00.000Z");

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  outboxDedupKeys: string[];
  outboxTopics: string[];
  transmissionIds: string[];
}

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

interface SessionResult {
  sessionId: string;
  expiresAt: Date;
  totalAmount: number;
  currency: string;
}

interface TestVariant {
  id: string;
  styleId: string;
}

interface MockWebhookPayload {
  transmissionId: string;
  eventType: string;
  checkoutSessionId: string;
  providerPaymentKey: string;
  amount: number;
  currency: string;
  capturedAt?: string;
}

interface MinimalPayment {
  id: string;
  provider: PaymentProvider;
  providerPaymentKey: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

// C1 is evidence/regression coverage over real Postgres READ COMMITTED interleavings, not a proof system.
describe.sequential("C1-core payment concurrency harness", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PAYMENT_MOCK_MODE = "success";
    process.env.PAYMENT_MODE = "SANDBOX";
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
    mockGetSession.mockResolvedValue(makeSession(ctx.userId));
    mockGetCurrentMarketCode.mockResolvedValue(MarketCode.KR);
  });

  afterEach(async () => {
    restoreMockMode();
    restorePaymentMode();
    await cleanup(ctx);
  });

  it("C1-1: beta FOR UPDATE serializes contenders and loser performs no duplicate effects", async () => {
    const variant = await createCatalogVariant(ctx, { amount: 12_000, stock: 2, fulfillmentType: FulfillmentType.STOCKED });
    await addCart(ctx, variant, 1);
    const session = await submitSession(ctx);
    const facts = captureFacts(ctx, session);
    const completions: Promise<CompleteFromCaptureResult>[] = [];

    await db.$transaction(async (tx) => {
      await lockCheckoutSession(tx, session.sessionId);
      completions.push(completeFromCapture(db, facts), completeFromCapture(db, facts));

      await delay(100);
      expect(await settlesWithin(completions[0], 40)).toBe(false);
      await expect(orderCount(ctx.userId)).resolves.toBe(0);
      await expect(stockOf(variant.id)).resolves.toBe(2);
      await expect(cartCount(ctx.userId)).resolves.toBe(1);
    });

    const results = await Promise.all(completions);

    expect(kinds(results).sort()).toEqual(["alreadyCompleted", "completed"]);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(stockOf(variant.id)).resolves.toBe(1);
    await expect(cartCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCountForFacts(facts)).resolves.toBe(0);
  });

  it("C1-2: alpha-only durable state re-enters and converges to one completed order", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session);

    await recordCapture(db, facts);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    const result = await completeFromCapture(db, facts);

    expect(result.kind).toBe("completed");
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("C1-3: STOCKED stock=1 concurrent completion creates one order and no oversell", async () => {
    const rounds = 3;

    for (let round = 0; round < rounds; round += 1) {
      const variant = await createCatalogVariant(ctx, {
        amount: 12_000 + round,
        stock: 1,
        fulfillmentType: FulfillmentType.STOCKED,
      });
      await addCart(ctx, variant, 1);
      const first = await submitSession(ctx);
      const second = await submitSession(ctx);
      const firstFacts = captureFacts(ctx, first);
      const secondFacts = captureFacts(ctx, second);

      const results = await Promise.all([
        completeFromCapture(db, firstFacts),
        completeFromCapture(db, secondFacts),
      ]);

      expect(kinds(results).sort()).toEqual(["compensationEnqueued", "completed"]);
      await expect(orderCountForSessions([first.sessionId, second.sessionId])).resolves.toBe(1);
      await expect(stockOf(variant.id)).resolves.toBe(0);
      await expect(totalRemediationSignalCount([firstFacts, secondFacts])).resolves.toBe(1);
    }

    await expect(orderCount(ctx.userId)).resolves.toBe(rounds);
  });

  it("C1-4: slow void executor plus forced zombie can double-call executor but converges to one VOIDED payment", async () => {
    const payment = await createVoidPayment(ctx);
    const topic = trackTopic(ctx, `c1-void-${randomUUID()}`);
    const dedupKey = await enqueueVoid(ctx, topic, payment);
    const executor = deferredVoidExecutor();
    const firstDispatch = dispatchVoid(topic, executor.executor, C1_NOW);

    await executor.waitForCalls(1);
    await forceOutboxZombie(dedupKey, C1_NOW);
    const secondDispatch = dispatchVoid(topic, executor.executor, C1_NOW);
    await executor.waitForCalls(2);

    executor.resolveAll({ ok: true });
    await Promise.all([firstDispatch, secondDispatch]);
    await dispatchVoid(topic, executor.executor, nextRetryNow());

    expect(executor.calls).toHaveLength(2);
    expect(new Set(executor.calls.map((call) => call.operationKey))).toEqual(new Set([dedupKey]));
    await expect(voidedPaymentCount(payment.id)).resolves.toBe(1);
    await expect(outboxStatus(dedupKey)).resolves.toMatchObject({ status: OutboxStatus.DONE });
  });

  it("C1-5: capturedAt, not sweeper timing, decides late-valid completion versus void", async () => {
    // Decision matrix, not live sweeper-race proof: C1-1 covers row-lock serialization,
    // B1 sweeper only targets SUBMITTED, and this verifies post-sweep EXPIRED completion by capturedAt.
    const unswept = await submitSessionWithOneLine(ctx);
    const swept = await submitSessionWithOneLine(ctx);
    const expired = await submitSessionWithOneLine(ctx);
    const validCapturedAt = unswept.expiresAt;
    await transitionCheckoutSession(db, {
      sessionId: swept.sessionId,
      transition: { from: "SUBMITTED", to: "EXPIRED" },
      now: new Date(swept.expiresAt.getTime() + 1),
    });

    const unsweptResult = await completeFromCapture(db, captureFacts(ctx, unswept, { capturedAt: validCapturedAt }));
    const sweptResult = await completeFromCapture(db, captureFacts(ctx, swept, { capturedAt: swept.expiresAt }));
    const expiredFacts = captureFacts(ctx, expired, { capturedAt: new Date(expired.expiresAt.getTime() + 1) });
    const expiredResult = await completeFromCapture(db, expiredFacts);

    expect(unsweptResult.kind).toBe("completed");
    expect(sweptResult.kind).toBe("completed");
    expect(expiredResult.kind).toBe("compensationEnqueued");
    await expect(statusOf(unswept.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
    await expect(statusOf(swept.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
    await expect(orderCount(ctx.userId)).resolves.toBe(2);
    await expect(outboxCountForFacts(expiredFacts)).resolves.toBe(1);
  });

  it("C1-6: confirm action racing webhook core completes one order with equivalent success", async () => {
    const rounds = 3;

    for (let round = 0; round < rounds; round += 1) {
      const variant = await createCatalogVariant(ctx, {
        amount: 12_000 + round,
        stock: 1,
        fulfillmentType: FulfillmentType.STOCKED,
      });
      await addCart(ctx, variant, 1);
      const session = await submitSession(ctx);
      await createPendingPaymentAttempt(session);
      const providerPaymentKey = `c1_confirm_webhook_${randomUUID()}`;
      const payload = capturePayload(ctx, session, providerPaymentKey);

      const [confirmResult, webhookResult] = await Promise.all([
        confirmPayment(session.sessionId, { providerPaymentKey }),
        handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload), {
          testOnlyPipeline: createMockWebhookPipeline(PaymentProvider.TOSS),
        }),
      ]);

      if (!confirmResult.success) expect(confirmResult.errorCode).toBe("PAYMENT_UNAVAILABLE");
      expect(webhookResult.status).toBe(200);
      await expect(orderCountBySession(session.sessionId)).resolves.toBe(1);
      await expect(paymentCount(session.sessionId)).resolves.toBe(1);
      await expect(eventStatus(payload.transmissionId)).resolves.toBe("PROCESSED");
      await expect(stockOf(variant.id)).resolves.toBe(0);
      await expect(cartItemCount(ctx.userId, variant.id)).resolves.toBe(0);
    }

    await expect(orderCount(ctx.userId)).resolves.toBe(rounds);
  });

  it("C1-7: two distinct financial successes block ordering and emit neutral remediation", async () => {
    const rounds = 3;

    for (let round = 0; round < rounds; round += 1) {
      const session = await submitSessionWithOneLine(ctx);
      const firstFacts = captureFacts(ctx, session);
      const secondFacts = captureFacts(ctx, session);

      const results = await Promise.all([
        completeFromCapture(db, firstFacts),
        completeFromCapture(db, secondFacts),
      ]);

      expect(kinds(results).sort()).toEqual(["compensationEnqueued", "compensationEnqueued"]);
      await expect(orderCountBySession(session.sessionId)).resolves.toBe(0);
      await expect(paymentCount(session.sessionId)).resolves.toBe(2);
      await expect(totalRemediationSignalCount([firstFacts, secondFacts])).resolves.toBe(2);
    }

    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("C1-8: bounded jitter stress for same-session completion keeps effects single", async () => {
    const rounds = 3;
    const contenders = 6;

    for (let round = 0; round < rounds; round += 1) {
      const variant = await createCatalogVariant(ctx, {
        amount: 12_000 + round,
        stock: 1,
        fulfillmentType: FulfillmentType.STOCKED,
      });
      await addCart(ctx, variant, 1);
      const session = await submitSession(ctx);
      const facts = captureFacts(ctx, session);

      const results = await Promise.all(
        Array.from({ length: contenders }, async (_value, index) => {
          await delay((index % 3) * 5);
          return completeFromCapture(db, facts);
        }),
      );

      const expectedKinds = [
        "completed",
        ...Array.from({ length: contenders - 1 }, () => "alreadyCompleted"),
      ].sort();
      expect(kinds(results).sort()).toEqual(expectedKinds);
      await expect(orderCountBySession(session.sessionId)).resolves.toBe(1);
      await expect(stockOf(variant.id)).resolves.toBe(0);
      await expect(cartItemCount(ctx.userId, variant.id)).resolves.toBe(0);
    }

    await expect(orderCount(ctx.userId)).resolves.toBe(rounds);
  });
});

function makeContext(): TestContext {
  return {
    userId: `c1_${randomUUID()}`,
    styleIds: [],
    variantIds: [],
    outboxDedupKeys: [],
    outboxTopics: [],
    transmissionIds: [],
  };
}

function makeSession(userId: string): Session {
  return {
    user: { id: userId, email: `${userId}@example.test`, name: "C1 User", role: "CUSTOMER" },
    expires: "2099-01-01",
  };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions = {}): Promise<TestVariant> {
  const style = await db.wigStyle.create({
    data: {
      name: `C1 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/c1-cover.png",
      availableMarkets: { create: { marketCode: MarketCode.KR, isActive: true } },
    },
    select: { id: true },
  });
  context.styleIds.push(style.id);

  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: 88_000,
      stock: options.stock ?? 10,
      sku: `C1-${randomUUID()}`,
      fulfillmentType: options.fulfillmentType ?? FulfillmentType.MTO,
    },
    select: { id: true },
  });
  context.variantIds.push(variant.id);

  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.KR, amount: options.amount ?? 12_000 },
  });
  return { id: variant.id, styleId: style.id };
}

async function addCart(context: TestContext, variant: TestVariant, quantity: number): Promise<void> {
  await db.cartItem.upsert({
    where: { userId_variantId: { userId: context.userId, variantId: variant.id } },
    update: { quantity },
    create: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity },
  });
}

async function submitSession(context: TestContext, now = C1_NOW): Promise<SessionResult> {
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    communicationLocale: "ko",
    shipping: validShipping(),
    now,
  });
}

async function submitSessionWithOneLine(context: TestContext): Promise<SessionResult> {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 10 });
  await addCart(context, variant, 1);
  return submitSession(context);
}

async function createPendingPaymentAttempt(session: SessionResult): Promise<string> {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `c1_initiate_${randomUUID()}`,
      contactIntentAt: C1_NOW,
      contactStartedAt: C1_NOW,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      initiationCompletedAt: C1_NOW,
    },
    select: { id: true },
  });
  return payment.id;
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
  session: SessionResult,
  overrides: Partial<CaptureFacts> = {},
): CaptureFacts {
  const providerPaymentKey = overrides.providerPaymentKey ?? `c1_capture_${randomUUID()}`;
  const facts = {
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.TOSS,
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

function capturePayload(context: TestContext, session: SessionResult, providerPaymentKey: string): MockWebhookPayload {
  const payload = {
    transmissionId: `c1_tx_${randomUUID()}`,
    eventType: "PAYMENT.CAPTURED",
    checkoutSessionId: session.sessionId,
    providerPaymentKey,
    amount: session.totalAmount,
    currency: session.currency,
    capturedAt: new Date(C1_NOW.getTime() + 60_000).toISOString(),
  };
  context.transmissionIds.push(payload.transmissionId);
  return payload;
}

function rawWebhook(payload: MockWebhookPayload) {
  return { body: JSON.stringify(payload), receivedAt: C1_RECEIVED_AT };
}

async function lockCheckoutSession(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${sessionId} FOR UPDATE
  `);
}

async function createVoidPayment(context: TestContext): Promise<MinimalPayment> {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      status: CheckoutSessionStatus.FAILED,
      subtotalAmount: 12_000,
      shippingAmount: 0,
      totalAmount: 12_000,
      expiresAt: new Date(C1_NOW.getTime() + 30 * 60_000),
    },
    select: { id: true },
  });

  const providerPaymentKey = `c1_void_payment_${randomUUID()}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: 12_000,
      currency: "KRW",
      providerPaymentKey,
      contactIntentAt: C1_NOW,
      contactStartedAt: C1_NOW,
      financialSucceededAt: C1_NOW,
      idempotencyKey: `c1_void_idem_${randomUUID()}`,
    },
    select: { id: true, provider: true, providerPaymentKey: true },
  });
  if (!payment.providerPaymentKey) throw new Error("Missing providerPaymentKey");
  return { id: payment.id, provider: payment.provider, providerPaymentKey: payment.providerPaymentKey };
}

async function enqueueVoid(context: TestContext, topic: string, payment: MinimalPayment): Promise<string> {
  const dedupKey = `void:${payment.provider}:${payment.providerPaymentKey}`;
  await db.$transaction((tx) => enqueue(tx, {
    topic,
    dedupKey,
    payload: {
      paymentId: payment.id,
      provider: payment.provider,
      providerPaymentKey: payment.providerPaymentKey,
      reason: "C1_TEST",
    },
  }));
  context.outboxDedupKeys.push(dedupKey);
  return dedupKey;
}

function dispatchVoid(topic: string, executor: VoidExecutor, now: Date) {
  return dispatchPending({
    client: db,
    registry: { [topic]: createVoidHandler(db, { executor }) },
    now,
    limit: 10,
  });
}

function deferredVoidExecutor() {
  const calls: VoidExecutorInput[] = [];
  const pending: Deferred<VoidExecutorResult>[] = [];
  const executor: VoidExecutor = {
    void: (input) => {
      calls.push(input);
      const next = deferred<VoidExecutorResult>();
      pending.push(next);
      return next.promise;
    },
  };
  return {
    calls,
    executor,
    resolveAll(result: VoidExecutorResult) {
      for (const item of pending) item.resolve(result);
    },
    async waitForCalls(count: number): Promise<void> {
      await waitFor(() => calls.length >= count);
    },
  };
}

function deferred<T>(): Deferred<T> {
  let resolveValue: (value: T) => void = () => undefined;
  let rejectValue: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  return { promise, resolve: resolveValue, reject: rejectValue };
}

async function forceOutboxZombie(dedupKey: string, now: Date): Promise<void> {
  await db.paymentOutbox.update({
    where: { dedupKey },
    data: { updatedAt: new Date(now.getTime() - OUTBOX_ZOMBIE_AFTER_MS - 1_000) },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.paymentEvent.deleteMany({ where: { transmissionId: { in: context.transmissionIds } } });
  await db.paymentOutbox.deleteMany({
    where: { OR: [{ dedupKey: { in: context.outboxDedupKeys } }, { topic: { in: context.outboxTopics } }] },
  });
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

function restoreMockMode(): void {
  if (ORIGINAL_MOCK_MODE === undefined) {
    delete process.env.PAYMENT_MOCK_MODE;
    return;
  }
  process.env.PAYMENT_MOCK_MODE = ORIGINAL_MOCK_MODE;
}

function restorePaymentMode(): void {
  if (ORIGINAL_PAYMENT_MODE === undefined) {
    delete process.env.PAYMENT_MODE;
    return;
  }
  process.env.PAYMENT_MODE = ORIGINAL_PAYMENT_MODE;
}

function kinds(results: CompleteFromCaptureResult[]): CompleteFromCaptureResult["kind"][] {
  return results.map((result) => result.kind);
}

function remediationDedupKey(facts: Pick<CaptureFacts, "provider" | "providerPaymentKey">): string {
  return `payment-remediation:${facts.provider}:${facts.providerPaymentKey}`;
}

function trackTopic(context: TestContext, topic: string): string {
  context.outboxTopics.push(topic);
  return topic;
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

async function orderCountBySession(sessionId: string): Promise<number> {
  return db.order.count({ where: { checkoutSessionId: sessionId } });
}

async function orderCountForSessions(sessionIds: string[]): Promise<number> {
  return db.order.count({ where: { checkoutSessionId: { in: sessionIds } } });
}

async function paymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({ where: { checkoutSessionId } });
}

async function outboxCountForFacts(facts: CaptureFacts): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: remediationDedupKey(facts) } });
}

async function totalRemediationSignalCount(facts: CaptureFacts[]): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: { in: facts.map(remediationDedupKey) } } });
}

async function stockOf(variantId: string): Promise<number> {
  const variant = await db.wigVariant.findUnique({ where: { id: variantId }, select: { stock: true } });
  if (!variant) throw new Error(`Missing variant ${variantId}`);
  return variant.stock;
}

async function cartCount(userId: string): Promise<number> {
  return db.cartItem.count({ where: { userId } });
}

async function cartItemCount(userId: string, variantId: string): Promise<number> {
  return db.cartItem.count({ where: { userId, variantId } });
}

async function statusOf(sessionId: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session.status;
}

async function voidedPaymentCount(paymentId: string): Promise<number> {
  return db.payment.count({ where: { id: paymentId, status: PaymentAttemptStatus.VOIDED } });
}

async function outboxStatus(
  dedupKey: string,
): Promise<Pick<PaymentOutbox, "status" | "attempts" | "nextAttemptAt" | "lastError">> {
  const row = await db.paymentOutbox.findUnique({
    where: { dedupKey },
    select: { status: true, attempts: true, nextAttemptAt: true, lastError: true },
  });
  if (!row) throw new Error(`Missing outbox ${dedupKey}`);
  return row;
}

async function eventStatus(transmissionId: string): Promise<string> {
  const event = await db.paymentEvent.findFirst({ where: { transmissionId }, select: { status: true } });
  if (!event) throw new Error(`Missing event ${transmissionId}`);
  return event.status;
}

async function settlesWithin<T>(promise: Promise<T> | undefined, ms: number): Promise<boolean> {
  if (!promise) throw new Error("Expected promise");
  return Promise.race([
    promise.then(() => true, () => true),
    delay(ms).then(() => false),
  ]);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1_000) throw new Error("Timed out waiting for C1 interleaving");
    await delay(10);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextRetryNow(): Date {
  return new Date(C1_NOW.getTime() + 60_000);
}
