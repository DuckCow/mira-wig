import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, transitionCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { completeFromCapture, recordCapture, type CaptureFacts } from "@/lib/payment/complete";

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
    expect(order.items[0]?.mr).not.toBeNull();
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
    await expect(db.cartItem.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
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

  it("STOCKED 부족은 완료 효과를 롤백하고 void 인텐트를 남긴다", async () => {
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

  it("금액 불일치는 주문 없이 FAILED와 pg.void 행 1개로 귀결된다", async () => {
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

  it("expiresAt 후 캡처는 void 인텐트로 귀결된다", async () => {
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

  it("providerRef가 있는 pending payment도 providerPaymentKey null 조건으로 캡처 claim 된다", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_${randomUUID()}`;
    const payment = await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.MOCK,
        status: PaymentAttemptStatus.INITIATED,
        amount: session.totalAmount,
        currency: session.currency,
        providerRef,
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

  it("같은 캡처 재실패는 void enqueue를 행 1개로 멱등 처리한다", async () => {
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
): Promise<void> {
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity },
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
    providerPaymentKey,
    amount: session.totalAmount,
    currency: session.currency,
    receivedAt: new Date(session.expiresAt.getTime() - 1_000),
    ...overrides,
  };
  context.outboxDedupKeys.push(voidDedupKey(facts));
  return facts;
}

function defaultNow(): Date {
  return new Date(B2_DEFAULT_NOW);
}

function voidDedupKey(facts: CaptureFacts): string {
  return `void:${facts.provider}:${facts.providerPaymentKey}`;
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

async function outboxCount(facts: CaptureFacts): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: voidDedupKey(facts) } });
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
