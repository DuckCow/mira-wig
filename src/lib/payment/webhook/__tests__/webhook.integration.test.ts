import { randomUUID } from "crypto";
import {
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentEventStatus,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as tossWebhookPost } from "@/app/api/payments/toss/webhook/route";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { createMockPaymentProvider } from "@/lib/payment/providers/mock";
import { handleWebhook } from "../handle";

const B4_NOW = new Date("2026-08-02T00:00:00.000Z");
const B4_RECEIVED_AT = new Date("2026-08-02T00:02:00.000Z");

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  transmissionIds: string[];
  providerPaymentKeys: string[];
}

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

interface MockWebhookPayload {
  transmissionId: string;
  eventType: string;
  checkoutSessionId?: string;
  providerPaymentKey?: string;
  amount?: number;
  currency?: string;
  capturedAt?: string;
  kind?: string;
}

describe("payment webhook core", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("valid webhook records PROCESSED, completes payment, and route returns 2xx", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = capturePayload(ctx, session);

    const response = await tossWebhookPost(routeRequest(payload));

    expect(response.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("same transmissionId replay is absorbed without reprocessing", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const first = await handleWebhook(db, PaymentProvider.TOSS, raw);
    const second = await handleWebhook(db, PaymentProvider.TOSS, raw);

    expect(first.status).toBe(200);
    expect(second.kind).toBe("duplicate");
    expect(second.status).toBe(200);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("distinct event with the same completed capture converges idempotently", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const firstPayload = capturePayload(ctx, session);
    const secondPayload = capturePayload(ctx, session, { providerPaymentKey: firstPayload.providerPaymentKey });

    await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(firstPayload));
    const second = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(secondPayload));

    expect(second.status).toBe(200);
    await expect(eventStatus(secondPayload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("verification failure is stored as FAILED and returns non-2xx", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(db, PaymentProvider.TOSS, {
      ...rawWebhook(payload),
      headers: { "x-mira-verify": "fail" },
    });

    expect(result.kind).toBe("verifyFailed");
    expect(result.status).toBeGreaterThanOrEqual(400);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.FAILED);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("ignored webhook records IGNORED and has no completion side effect", async () => {
    const payload = ignoredPayload(ctx);

    const result = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.kind).toBe("ignored");
    expect(result.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.IGNORED);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("terminal amount mismatch returns 2xx and enqueues one void intent", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session, { amount: session.totalAmount + 1 });

    const result = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(payload))).resolves.toBe(1);
  });

  it("retryable parse injection returns non-2xx and does not enqueue void", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session, { kind: "retryable" });

    const result = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.kind).toBe("retryable");
    expect(result.status).toBeGreaterThanOrEqual(500);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.FAILED);
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(payload))).resolves.toBe(0);
  });

  it("webhook-first capture creates a payment and completes the order", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.status).toBe(200);
    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });
});

function makeContext(): TestContext {
  return { userId: `b4_${randomUUID()}`, styleIds: [], variantIds: [], transmissionIds: [], providerPaymentKeys: [] };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function submitSessionWithOneLine(context: TestContext) {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await addCart(context, variant, 1);
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
    now: B4_NOW,
  });
}

async function initiateForSession(context: TestContext, sessionId: string): Promise<void> {
  await initiatePaymentAttempt(db, {
    sessionId,
    userId: context.userId,
    provider: createMockPaymentProvider(PaymentProvider.TOSS),
    now: B4_RECEIVED_AT,
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `B4 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b4-cover.png",
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
      sku: `B4-${randomUUID()}`,
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

function capturePayload(
  context: TestContext,
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  overrides: Partial<MockWebhookPayload> = {},
): MockWebhookPayload {
  const providerPaymentKey = overrides.providerPaymentKey ?? providerPaymentKeyFor(context);
  return trackTransmission(context, {
    transmissionId: `b4_tx_${randomUUID()}`,
    eventType: "PAYMENT.CAPTURED",
    checkoutSessionId: session.sessionId,
    providerPaymentKey,
    amount: session.totalAmount,
    currency: session.currency,
    capturedAt: new Date(B4_NOW.getTime() + 60_000).toISOString(),
    ...overrides,
  });
}

function ignoredPayload(context: TestContext): MockWebhookPayload {
  return trackTransmission(context, {
    transmissionId: `b4_tx_${randomUUID()}`,
    eventType: "PAYMENT.PENDING",
    kind: "ignore",
  });
}

function trackTransmission(context: TestContext, payload: MockWebhookPayload): MockWebhookPayload {
  context.transmissionIds.push(payload.transmissionId);
  return payload;
}

function providerPaymentKeyFor(context: TestContext): string {
  const key = `b4_capture_${randomUUID()}`;
  context.providerPaymentKeys.push(key);
  return key;
}

function rawWebhook(payload: MockWebhookPayload) {
  return { body: JSON.stringify(payload), receivedAt: B4_RECEIVED_AT };
}

function routeRequest(payload: MockWebhookPayload): Request {
  return new Request("http://localhost/api/payments/toss/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.paymentEvent.deleteMany({ where: { transmissionId: { in: context.transmissionIds } } });
  await deleteOutbox(context);
  await deleteOrders(context.userId);
  await deletePaymentsAndSessions(context.userId);
  await db.cartItem.deleteMany({ where: { userId: context.userId } });
  await deleteVariants(context);
  await db.user.deleteMany({ where: { id: context.userId } });
}

async function deleteOutbox(context: TestContext): Promise<void> {
  const dedupKeys = context.providerPaymentKeys.map((key) => `void:${PaymentProvider.TOSS}:${key}`);
  await db.paymentOutbox.deleteMany({ where: { dedupKey: { in: dedupKeys } } });
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

function requiredProviderKey(payload: MockWebhookPayload): string {
  if (payload.providerPaymentKey) return payload.providerPaymentKey;
  throw new Error("Missing providerPaymentKey");
}

async function eventStatus(transmissionId: string): Promise<PaymentEventStatus> {
  const event = await db.paymentEvent.findFirst({ where: { transmissionId }, select: { status: true } });
  if (!event) throw new Error(`Missing event ${transmissionId}`);
  return event.status;
}

async function eventCount(transmissionId: string): Promise<number> {
  return db.paymentEvent.count({ where: { transmissionId } });
}

async function paymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({ where: { checkoutSessionId } });
}

async function onlyPayment(checkoutSessionId: string) {
  const payment = await db.payment.findFirst({ where: { checkoutSessionId } });
  if (!payment) throw new Error(`Missing payment for ${checkoutSessionId}`);
  return payment;
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

async function outboxCount(provider: PaymentProvider, providerPaymentKey: string): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: `void:${provider}:${providerPaymentKey}` } });
}

