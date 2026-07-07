import { randomUUID } from "crypto";
import {
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentEventFailureStage,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  ShippingCountry,
  WebhookIngressRejectionStage,
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
import { WEBHOOK_RAW_PREFIX_CHARS } from "../rejections";

const B4_NOW = new Date("2026-08-02T00:00:00.000Z");
const B4_RECEIVED_AT = new Date("2026-08-02T00:02:00.000Z");
const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;

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
    process.env.PAYMENT_MODE = "SANDBOX";
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    restorePaymentMode();
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

  it("conflicting webhook mode fails closed without completing the pending payment", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(payload));
    const payment = await onlyPayment(session.sessionId);
    const event = await eventSnapshot(payload.transmissionId);

    expect(result.kind).toBe("failed");
    expect(result.status).toBe(200);
    expect(event.status).toBe(PaymentEventStatus.FAILED);
    expect(event.failureStage).toBe(PaymentEventFailureStage.COMPLETE);
    expect(event.failureCode).toBe("COMPLETE.MODE_MISMATCH");
    expect(payment).toMatchObject({
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(payload))).resolves.toBe(0);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("completed same-key webhook duplicate under flipped mode is benign and void-less", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const firstPayload = capturePayload(ctx, session);
    const secondPayload = capturePayload(ctx, session, { providerPaymentKey: firstPayload.providerPaymentKey });

    await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(firstPayload));
    process.env.PAYMENT_MODE = "LIVE";
    const second = await handleWebhook(db, PaymentProvider.TOSS, rawWebhook(secondPayload));
    const payment = await onlyPayment(session.sessionId);

    expect(second.status).toBe(200);
    await expect(eventStatus(secondPayload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    expect(payment).toMatchObject({
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentKey: firstPayload.providerPaymentKey,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(firstPayload))).resolves.toBe(0);
  });

  it("verification failure writes rejected inbound row without reserving PaymentEvent", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(db, PaymentProvider.TOSS, {
      ...rawWebhook(payload),
      headers: { "x-mira-verify": "fail" },
    });

    expect(result.kind).toBe("verifyFailed");
    expect(result.status).toBeGreaterThanOrEqual(400);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.stage).toBe(WebhookIngressRejectionStage.VERIFY);
    expect(rejection.code).toBe("VERIFY.FAILED");
    expect(rejection.candidateEventType).toBe(payload.eventType);
    expect(rejection.rawBodyHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("metadata extraction failure writes rejected inbound row without PaymentEvent", async () => {
    const transmissionId = trackTransmissionId(ctx);
    const body = JSON.stringify({ transmissionId, kind: "capture" });

    const result = await handleWebhook(db, PaymentProvider.TOSS, { body, receivedAt: B4_RECEIVED_AT });

    expect(result.kind).toBe("verifyFailed");
    expect(result.status).toBe(400);
    await expect(eventCount(transmissionId)).resolves.toBe(0);
    const rejection = await onlyRejection(transmissionId);
    expect(rejection.stage).toBe(WebhookIngressRejectionStage.METADATA_EXTRACT);
    expect(rejection.code).toBe("METADATA.MISSING_EVENT_TYPE");
    expect(rejection.candidateEventType).toBeNull();
  });

  it("forged verify-fail candidate transmissionId does not block later genuine webhook", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const forged = await handleWebhook(db, PaymentProvider.TOSS, {
      ...raw,
      headers: { "x-mira-verify": "fail" },
    });
    const genuine = await handleWebhook(db, PaymentProvider.TOSS, raw);

    expect(forged.kind).toBe("verifyFailed");
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect(genuine.status).toBe(200);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(1);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
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

  it("authenticated parse failure records terminal FAILED(PARSE) and does not enqueue void", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const invalidPayload = { ...payload };
    delete invalidPayload.amount;

    const result = await handleWebhook(db, PaymentProvider.TOSS, {
      body: JSON.stringify(invalidPayload),
      receivedAt: B4_RECEIVED_AT,
    });

    expect(result.kind).toBe("failed");
    expect(result.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.FAILED);
    const event = await eventSnapshot(payload.transmissionId);
    expect(event.failureStage).toBe(PaymentEventFailureStage.PARSE);
    expect(event.failureCode).toBe("PARSE.FIELD_MISSING");
    expect(event.attemptCount).toBe(0);
    expect(event.lastAttemptAt).toBeNull();
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(payload))).resolves.toBe(0);
  });

  it("retryable COMPLETE failure records RETRYABLE_FAILED and replay converges to PROCESSED", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const conflict = await createConflictingOrder(ctx, session);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const first = await handleWebhook(db, PaymentProvider.TOSS, raw);
    const retryable = await eventSnapshot(payload.transmissionId);
    await deleteConflictingOrder(conflict);
    const second = await handleWebhook(db, PaymentProvider.TOSS, raw);

    expect(first.kind).toBe("retryable");
    expect(first.status).toBe(500);
    expect(retryable.status).toBe(PaymentEventStatus.RETRYABLE_FAILED);
    expect(retryable.failureStage).toBe(PaymentEventFailureStage.COMPLETE);
    expect(retryable.failureCode).toBe("COMPLETE.TRANSIENT_DB_ERROR");
    expect(retryable.attemptCount).toBe(1);
    expect(retryable.lastAttemptAt?.toISOString()).toBe(B4_RECEIVED_AT.toISOString());
    expect(second.status).toBe(200);
    const processed = await eventSnapshot(payload.transmissionId);
    expect(processed.status).toBe(PaymentEventStatus.PROCESSED);
    expect(processed.failureStage).toBeNull();
    expect(processed.failureCode).toBeNull();
    expect(processed.attemptCount).toBe(0);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("non-terminal duplicate with raw mismatch writes rejection and preserves trusted event", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const conflict = await createConflictingOrder(ctx, session);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const first = await handleWebhook(db, PaymentProvider.TOSS, raw);
    await deleteConflictingOrder(conflict);
    const duplicateProviderKey = providerPaymentKeyFor(ctx);
    const duplicateBody = JSON.stringify({
      ...payload,
      providerPaymentKey: duplicateProviderKey,
      filler: "x".repeat(WEBHOOK_RAW_PREFIX_CHARS + 128),
    });
    const duplicate = await handleWebhook(db, PaymentProvider.TOSS, {
      body: duplicateBody,
      receivedAt: B4_RECEIVED_AT,
    });

    expect(first.kind).toBe("retryable");
    expect(duplicate.kind).toBe("retryable");
    expect(duplicate.status).toBe(400);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.stage).toBe(WebhookIngressRejectionStage.VERIFY);
    expect(rejection.code).toBe("VERIFY.RAW_MISMATCH");
    expect(rejection.candidateEventType).toBe(payload.eventType);
    expect(rejection.rawBodyBytes).toBe(Buffer.byteLength(duplicateBody, "utf8"));
    expect(rejection.rawBodyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rejection.rawBodyPrefix).toBe(duplicateBody.slice(0, WEBHOOK_RAW_PREFIX_CHARS));
    expect(rejection.rawBodyPrefix).not.toBe(duplicateBody);
    const trusted = await eventSnapshot(payload.transmissionId);
    expect(trusted.status).toBe(PaymentEventStatus.RETRYABLE_FAILED);
    expect(trusted.attemptCount).toBe(1);
    expect(trusted.raw).toBe(raw.body);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("simultaneous RETRYABLE_FAILED duplicate replay reprocesses without duplicate effects", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const conflict = await createConflictingOrder(ctx, session);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    await handleWebhook(db, PaymentProvider.TOSS, raw);
    await deleteConflictingOrder(conflict);

    let firstReplay: Promise<Awaited<ReturnType<typeof handleWebhook>>> | undefined;
    let secondReplay: Promise<Awaited<ReturnType<typeof handleWebhook>>> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "CheckoutSession" WHERE "id" = ${session.sessionId} FOR UPDATE
      `);
      firstReplay = handleWebhook(db, PaymentProvider.TOSS, raw);
      secondReplay = handleWebhook(db, PaymentProvider.TOSS, raw);
      await delay(50);
    });
    if (!firstReplay || !secondReplay) throw new Error("Replay promises were not initialized");
    const [firstResult, secondResult] = await Promise.all([firstReplay, secondReplay]);

    expect(firstResult.status).toBe(200);
    expect(secondResult.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("rejected inbound raw storage is bounded and excludes full raw body", async () => {
    const transmissionId = trackTransmissionId(ctx);
    const body = JSON.stringify({
      transmissionId,
      eventType: "PAYMENT.CAPTURED",
      filler: "x".repeat(WEBHOOK_RAW_PREFIX_CHARS + 128),
    });

    const result = await handleWebhook(db, PaymentProvider.TOSS, {
      body,
      headers: { "x-mira-verify": "fail" },
      receivedAt: B4_RECEIVED_AT,
    });

    expect(result.kind).toBe("verifyFailed");
    const rejection = await onlyRejection(transmissionId);
    expect(rejection.rawBodyBytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(rejection.rawBodyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rejection.rawBodyPrefix).toBe(body.slice(0, WEBHOOK_RAW_PREFIX_CHARS));
    expect(rejection.rawBodyPrefix).not.toBe(body);
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
    mode: PaymentMode.SANDBOX,
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

function trackTransmissionId(context: TestContext): string {
  const transmissionId = `b4_tx_${randomUUID()}`;
  context.transmissionIds.push(transmissionId);
  return transmissionId;
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
  await db.webhookIngressRejection.deleteMany({
    where: { candidateTransmissionId: { in: context.transmissionIds } },
  });
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

async function createConflictingOrder(
  context: TestContext,
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
): Promise<{ orderId: string; paymentId: string }> {
  const providerPaymentKey = `b4_conflict_${randomUUID()}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: session.totalAmount,
      currency: session.currency,
      providerPaymentKey,
      idempotencyKey: `b4_conflict_${randomUUID()}`,
    },
    select: { id: true },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.sessionId,
      paymentId: payment.id,
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: session.currency,
      subtotalAmount: session.subtotalAmount,
      shippingAmount: session.shippingAmount,
      totalAmount: session.totalAmount,
      paidAt: B4_RECEIVED_AT,
    },
    select: { id: true },
  });
  return { orderId: order.id, paymentId: payment.id };
}

async function deleteConflictingOrder(conflict: { orderId: string; paymentId: string }): Promise<void> {
  await db.order.delete({ where: { id: conflict.orderId } });
  await db.payment.delete({ where: { id: conflict.paymentId } });
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

async function eventSnapshot(transmissionId: string) {
  const event = await db.paymentEvent.findFirst({
    where: { transmissionId },
    select: {
      status: true,
      raw: true,
      attemptCount: true,
      lastAttemptAt: true,
      failureStage: true,
      failureCode: true,
      lastError: true,
    },
  });
  if (!event) throw new Error(`Missing event ${transmissionId}`);
  return event;
}

async function onlyRejection(transmissionId: string) {
  const rejection = await db.webhookIngressRejection.findFirst({
    where: { candidateTransmissionId: transmissionId },
    orderBy: { createdAt: "desc" },
    select: {
      stage: true,
      code: true,
      candidateEventType: true,
      rawBodyBytes: true,
      rawBodyHash: true,
      rawBodyPrefix: true,
      lastError: true,
    },
  });
  if (!rejection) throw new Error(`Missing webhook rejection ${transmissionId}`);
  return rejection;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function restorePaymentMode(): void {
  if (ORIGINAL_PAYMENT_MODE === undefined) {
    delete process.env.PAYMENT_MODE;
    return;
  }
  process.env.PAYMENT_MODE = ORIGINAL_PAYMENT_MODE;
}
