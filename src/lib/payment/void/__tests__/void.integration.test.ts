import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OutboxStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import type { PaymentOutbox } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { completeFromCapture, type CaptureFacts } from "@/lib/payment/complete";
import { dispatchPending, enqueue, OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox";
import type { VoidExecutor, VoidExecutorInput, VoidExecutorResult } from "../executor";
import { createVoidHandler, type VoidPayload } from "../handler";

const B5_NOW = new Date("2026-08-03T00:00:00.000Z");

interface TestContext {
  userId: string;
  voidTopic: string;
  sessionIds: string[];
  paymentIds: string[];
  styleIds: string[];
  variantIds: string[];
  dedupKeys: string[];
}

interface TestPayment {
  id: string;
  provider: PaymentProvider;
  providerPaymentKey: string;
}

describe("pg.void handler", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("normal void marks Payment VOIDED and outbox DONE", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    const dedupKey = await enqueueVoid(ctx, payment);
    const exec = countingExecutor();

    const result = await dispatchVoid(ctx, exec.executor);

    expect(result.succeeded).toBe(1);
    await expect(paymentStatus(payment.id)).resolves.toBe(PaymentAttemptStatus.VOIDED);
    await expect(outboxStatus(dedupKey)).resolves.toMatchObject({ status: OutboxStatus.DONE });
    expect(exec.calls[0]?.operationKey).toBe(dedupKey);
  });

  it("already VOIDED payment succeeds without executor call", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.VOIDED);
    const dedupKey = await enqueueVoid(ctx, payment);
    const exec = countingExecutor();

    const result = await dispatchVoid(ctx, exec.executor);

    expect(result.succeeded).toBe(1);
    expect(exec.calls).toHaveLength(0);
    await expect(paymentStatus(payment.id)).resolves.toBe(PaymentAttemptStatus.VOIDED);
    await expect(outboxStatus(dedupKey)).resolves.toMatchObject({ status: OutboxStatus.DONE });
  });

  it("executor retryable failure throws to dispatcher retry", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    const dedupKey = await enqueueVoid(ctx, payment);
    const exec = countingExecutor("retryable");

    const result = await dispatchVoid(ctx, exec.executor);
    const row = await outboxStatus(dedupKey);

    expect(result.retried).toBe(1);
    expect(row.status).toBe(OutboxStatus.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    await expect(paymentStatus(payment.id)).resolves.toBe(PaymentAttemptStatus.SUCCEEDED);
  });

  it("maxAttempts exceeded marks outbox FAILED", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    const dedupKey = await enqueueVoid(ctx, payment, OUTBOX_MAX_ATTEMPTS - 1);
    const exec = countingExecutor("retryable");

    const result = await dispatchVoid(ctx, exec.executor);

    expect(result.terminalFailed).toBe(1);
    await expect(outboxStatus(dedupKey)).resolves.toMatchObject({
      status: OutboxStatus.FAILED,
      attempts: OUTBOX_MAX_ATTEMPTS,
    });
  });

  it("executor success requires a SUCCEEDED to VOIDED transition", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    await enqueueVoid(ctx, payment);
    const exec = countingExecutor();

    const result = await dispatchVoid(ctx, exec.executor);

    expect(result.succeeded).toBe(1);
    expect(exec.calls).toHaveLength(1);
    await expect(voidedPaymentCount(payment.id)).resolves.toBe(1);
  });

  it("B2 terminal compensation dispatches through pg.void to VOIDED", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const facts = captureFacts(ctx, session, { amount: session.totalAmount + 1 });
    const completion = await completeFromCapture(db, facts);
    const exec = countingExecutor();
    await moveVoidIntentToTestTopic(ctx, facts);

    const result = await dispatchVoid(ctx, exec.executor);

    expect(completion.kind).toBe("compensationEnqueued");
    expect(result.succeeded).toBe(1);
    const payment = await paymentByKey(facts.providerPaymentKey);
    await expect(paymentStatus(payment.id)).resolves.toBe(PaymentAttemptStatus.VOIDED);
  });

  it("re-entry after executor success but missing transition converges to one VOIDED state", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    const dedupKey = await enqueueVoid(ctx, payment);
    const exec = countingExecutor();
    const transition = failFirstTransition();

    const first = await dispatchVoid(ctx, exec.executor, transition);
    const pending = await outboxStatus(dedupKey);
    const second = await dispatchVoid(ctx, exec.executor, transition, requireDate(pending.nextAttemptAt));

    expect(first.retried).toBe(1);
    expect(second.succeeded).toBe(1);
    expect(exec.calls).toHaveLength(2);
    await expect(voidedPaymentCount(payment.id)).resolves.toBe(1);
  });

  it("payload providerPaymentKey mismatch never calls executor and marks outbox FAILED", async () => {
    const payment = await createPayment(ctx, PaymentAttemptStatus.SUCCEEDED);
    const dedupKey = await enqueueVoid(ctx, payment, 0, { providerPaymentKey: `wrong_${randomUUID()}` });
    const exec = countingExecutor();

    const result = await dispatchVoid(ctx, exec.executor);
    const outbox = await outboxStatus(dedupKey);

    expect(result.terminalFailed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(exec.calls).toHaveLength(0);
    await expect(paymentSnapshot(payment.id)).resolves.toMatchObject({
      provider: payment.provider,
      providerPaymentKey: payment.providerPaymentKey,
      status: PaymentAttemptStatus.SUCCEEDED,
    });
    expect(outbox.status).toBe(OutboxStatus.FAILED);
    expect(outbox.nextAttemptAt).toBeNull();
    expect(outbox.lastError).toContain("payload provider key mismatch");
  });
});

function makeContext(): TestContext {
  return {
    userId: `b5_${randomUUID()}`,
    voidTopic: `pg.void.b5.${randomUUID()}`,
    sessionIds: [],
    paymentIds: [],
    styleIds: [],
    variantIds: [],
    dedupKeys: [],
  };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function createPayment(
  context: TestContext,
  status: PaymentAttemptStatus,
): Promise<TestPayment> {
  const sessionId = await createMinimalSession(context);
  const providerPaymentKey = `b5_payment_${randomUUID()}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status,
      amount: 12_000,
      currency: "KRW",
      providerPaymentKey,
      idempotencyKey: `b5_idem_${randomUUID()}`,
    },
    select: { id: true, provider: true, providerPaymentKey: true },
  });
  context.paymentIds.push(payment.id);
  if (!payment.providerPaymentKey) throw new Error("Missing created providerPaymentKey");
  return { id: payment.id, provider: payment.provider, providerPaymentKey: payment.providerPaymentKey };
}

async function createMinimalSession(context: TestContext): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      status: CheckoutSessionStatus.FAILED,
      subtotalAmount: 12_000,
      shippingAmount: 0,
      totalAmount: 12_000,
      expiresAt: new Date(B5_NOW.getTime() + 30 * 60_000),
    },
    select: { id: true },
  });
  context.sessionIds.push(session.id);
  return session.id;
}

async function enqueueVoid(
  context: TestContext,
  payment: TestPayment,
  attempts = 0,
  overrides: Partial<VoidPayload> = {},
): Promise<string> {
  const providerPaymentKey = overrides.providerPaymentKey ?? payment.providerPaymentKey;
  const dedupKey = `void:${payment.provider}:${providerPaymentKey}`;
  const payload = { paymentId: payment.id, provider: payment.provider, providerPaymentKey, reason: "TEST", ...overrides };
  await db.$transaction((tx) => enqueue(tx, { topic: context.voidTopic, payload, dedupKey }));
  if (attempts > 0) await db.paymentOutbox.updateMany({ where: { dedupKey }, data: { attempts } });
  context.dedupKeys.push(dedupKey);
  return dedupKey;
}

function countingExecutor(mode: "success" | "retryable" = "success") {
  const calls: VoidExecutorInput[] = [];
  const executor: VoidExecutor = {
    void: (input) => {
      calls.push(input);
      return Promise.resolve(voidResult(mode));
    },
  };
  return { executor, calls };
}

function voidResult(mode: "success" | "retryable"): VoidExecutorResult {
  if (mode === "retryable") return { retryable: true, reason: "retry later" };
  return { ok: true };
}

function failFirstTransition() {
  let shouldFail = true;
  return async (paymentId: string): Promise<number> => {
    if (shouldFail) {
      shouldFail = false;
      return 0;
    }
    const result = await db.payment.updateMany({
      where: { id: paymentId, status: PaymentAttemptStatus.SUCCEEDED },
      data: { status: PaymentAttemptStatus.VOIDED },
    });
    return result.count;
  };
}

async function dispatchVoid(
  context: TestContext,
  executor: VoidExecutor,
  transitionPayment?: (paymentId: string) => Promise<number>,
  now = B5_NOW,
) {
  return dispatchPending({
    client: db,
    registry: { [context.voidTopic]: createVoidHandler(db, { executor, transitionPayment }) },
    now,
    limit: 10,
  });
}

async function submitSessionWithOneLine(context: TestContext) {
  const variant = await createCatalogVariant(context);
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
    now: B5_NOW,
  });
}

async function createCatalogVariant(context: TestContext) {
  const style = await db.wigStyle.create({
    data: {
      name: `B5 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b5-cover.png",
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
      stock: 5,
      sku: `B5-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
    },
    select: { id: true },
  });
  context.variantIds.push(variant.id);
  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.KR, amount: 12_000 },
  });
  return { id: variant.id, styleId: style.id };
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
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  overrides: Partial<CaptureFacts> = {},
): CaptureFacts {
  const providerPaymentKey = `b5_capture_${randomUUID()}`;
  context.dedupKeys.push(`void:${PaymentProvider.TOSS}:${providerPaymentKey}`);
  return {
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey,
    amount: session.totalAmount,
    currency: session.currency,
    receivedAt: B5_NOW,
    ...overrides,
  };
}

async function moveVoidIntentToTestTopic(context: TestContext, facts: CaptureFacts): Promise<void> {
  await db.paymentOutbox.update({
    where: { dedupKey: `void:${facts.provider}:${facts.providerPaymentKey}` },
    data: { topic: context.voidTopic },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.paymentOutbox.deleteMany({ where: { dedupKey: { in: context.dedupKeys } } });
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

async function paymentStatus(paymentId: string): Promise<PaymentAttemptStatus> {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
  if (!payment) throw new Error(`Missing payment ${paymentId}`);
  return payment.status;
}

async function paymentSnapshot(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { provider: true, providerPaymentKey: true, status: true },
  });
  if (!payment) throw new Error(`Missing payment ${paymentId}`);
  return payment;
}

async function voidedPaymentCount(paymentId: string): Promise<number> {
  return db.payment.count({ where: { id: paymentId, status: PaymentAttemptStatus.VOIDED } });
}

async function outboxStatus(
  dedupKey: string,
): Promise<Pick<PaymentOutbox, "status" | "attempts" | "nextAttemptAt" | "lastError">> {
  const row = await db.paymentOutbox.findFirst({
    where: { dedupKey },
    select: { status: true, attempts: true, nextAttemptAt: true, lastError: true },
  });
  if (!row) throw new Error(`Missing outbox ${dedupKey}`);
  return row;
}

async function paymentByKey(providerPaymentKey: string): Promise<TestPayment> {
  const payment = await db.payment.findFirst({
    where: { providerPaymentKey },
    select: { id: true, provider: true, providerPaymentKey: true },
  });
  if (!payment || !payment.providerPaymentKey) throw new Error(`Missing payment ${providerPaymentKey}`);
  return { id: payment.id, provider: payment.provider, providerPaymentKey: payment.providerPaymentKey };
}

function requireDate(value: Date | null): Date {
  if (value) return value;
  throw new Error("Missing retry date");
}
