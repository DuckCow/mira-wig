import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { deriveTossOrderId } from "../order-id";
import { persistTossCallbackProviderRef } from "../callback";

const AMOUNT = 12_000;

interface TestContext {
  userId: string;
  sessionIds: string[];
}

interface PaymentOptions {
  provider?: PaymentProvider;
  status?: PaymentAttemptStatus;
  providerRef?: string | null;
  providerPaymentKey?: string | null;
  amount?: number;
  currency?: string;
  marketCode?: string;
}

describe("Toss callback providerRef persistence", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = { userId: `toss_cb_${randomUUID()}`, sessionIds: [] };
    await ensureMarket(MarketCode.KR, "KRW");
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("persists callback paymentKey as providerRef without setting providerPaymentKey", async () => {
    const payment = await createPayment(ctx);
    const paymentKey = tossPaymentKey();

    const result = await callback(payment.id, paymentKey, `${AMOUNT}`);
    const persisted = await loadPayment(payment.id);

    expect(result).toMatchObject({ ok: true, status: "ACCEPTED_PROVIDER_REF", paymentId: payment.id });
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      providerRef: paymentKey,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("treats duplicate callback with the same paymentKey as idempotent", async () => {
    const paymentKey = tossPaymentKey();
    const payment = await createPayment(ctx, { providerRef: paymentKey });

    const result = await callback(payment.id, paymentKey, `${AMOUNT}`);

    expect(result).toMatchObject({ ok: true, status: "IDEMPOTENT_PROVIDER_REF", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: paymentKey, providerPaymentKey: null });
  });

  it("fails closed for duplicate callback with a different paymentKey", async () => {
    const payment = await createPayment(ctx, { providerRef: tossPaymentKey() });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "CONFLICTING_PROVIDER_REF", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: payment.providerRef });
  });

  it("does not write providerRef for wrong amount", async () => {
    const existingRef = tossPaymentKey();
    const payment = await createPayment(ctx, { providerRef: existingRef });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT + 1}`);

    expect(result).toMatchObject({ ok: false, status: "AMOUNT_MISMATCH", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: existingRef, providerPaymentKey: null });
  });

  it("rejects invalid amount format without changing providerRef", async () => {
    const payment = await createPayment(ctx, { providerRef: tossPaymentKey() });

    await expectInvalidCallbackLeavesPayment(payment.id, "not-a-number", "INVALID_REQUEST");
  });

  it("rejects negative amount without changing providerRef", async () => {
    const payment = await createPayment(ctx, { providerRef: tossPaymentKey() });

    await expectInvalidCallbackLeavesPayment(payment.id, "-1000", "INVALID_REQUEST");
  });

  it("documents zero amount as accepted only when the local persisted amount is zero", async () => {
    const payment = await createPayment(ctx, { amount: 0 });
    const paymentKey = tossPaymentKey();

    const result = await callback(payment.id, paymentKey, "0");

    expect(result).toMatchObject({ ok: true, status: "ACCEPTED_PROVIDER_REF", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      providerRef: paymentKey,
      providerPaymentKey: null,
    });
  });

  it("rejects non-integer decimal amount without changing providerRef", async () => {
    const payment = await createPayment(ctx, { providerRef: tossPaymentKey() });

    await expectInvalidCallbackLeavesPayment(payment.id, "1000.5", "INVALID_REQUEST");
  });

  it("rejects KR market with non-KRW payment currency without changing providerRef", async () => {
    const existingRef = tossPaymentKey();
    const payment = await createPayment(ctx, { currency: "USD", providerRef: existingRef });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "STOP", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: existingRef, providerPaymentKey: null });
  });

  it("rejects non-KR market for Toss callback without changing providerRef", async () => {
    const existingRef = tossPaymentKey();
    const payment = await createPayment(ctx, {
      marketCode: MarketCode.US,
      currency: "KRW",
      providerRef: existingRef,
    });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "STOP", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: existingRef, providerPaymentKey: null });
  });

  it("rejects non-pending payment with no final providerPaymentKey without changing providerRef", async () => {
    const existingRef = tossPaymentKey();
    const payment = await createPayment(ctx, {
      status: PaymentAttemptStatus.FAILED,
      providerRef: existingRef,
    });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "NOT_PENDING", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: existingRef, providerPaymentKey: null });
  });

  it("does not write providerRef for wrong orderId", async () => {
    const payment = await createPayment(ctx);

    const result = await persistTossCallbackProviderRef(db, {
      paymentKey: tossPaymentKey(),
      orderId: "mira_toss_missingpayment",
      amount: `${AMOUNT}`,
    });

    expect(result).toMatchObject({ ok: false, status: "NOT_FOUND" });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: null });
  });

  it("does not write providerRef for wrong provider", async () => {
    const payment = await createPayment(ctx, { provider: PaymentProvider.PAYPAL });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "WRONG_PROVIDER", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({ providerRef: null });
  });

  it("treats already succeeded payment with same paymentKey as already completed", async () => {
    const paymentKey = tossPaymentKey();
    const payment = await createPayment(ctx, {
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef: paymentKey,
      providerPaymentKey: paymentKey,
    });

    const result = await callback(payment.id, paymentKey, `${AMOUNT}`);

    expect(result).toMatchObject({ ok: true, status: "ALREADY_COMPLETED", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef: paymentKey,
      providerPaymentKey: paymentKey,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("fails closed when final providerPaymentKey differs", async () => {
    const existingRef = tossPaymentKey();
    const finalKey = tossPaymentKey();
    const payment = await createPayment(ctx, {
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef: existingRef,
      providerPaymentKey: finalKey,
    });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);

    expect(result).toMatchObject({ ok: false, status: "CONFLICTING_PROVIDER_PAYMENT_KEY", paymentId: payment.id });
    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef: existingRef,
      providerPaymentKey: finalKey,
    });
  });

  it("does not overwrite providerRef under competing callback writes", async () => {
    const payment = await createPayment(ctx);
    const firstKey = tossPaymentKey();
    const secondKey = tossPaymentKey();

    const results = await Promise.all([
      callback(payment.id, firstKey, `${AMOUNT}`),
      callback(payment.id, secondKey, `${AMOUNT}`),
    ]);
    const statuses = results.map((result) => result.status).sort();
    const persisted = await loadPayment(payment.id);

    expect(statuses).toEqual(["ACCEPTED_PROVIDER_REF", "CONFLICTING_PROVIDER_REF"]);
    expect([firstKey, secondKey]).toContain(persisted?.providerRef);
    expect(persisted?.providerPaymentKey).toBeNull();
  });

  it("never completes local payment or calls provider APIs from callback persistence", async () => {
    const payment = await createPayment(ctx, { status: PaymentAttemptStatus.AWAITING });

    const result = await callback(payment.id, tossPaymentKey(), `${AMOUNT}`);
    const persisted = await loadPayment(payment.id);

    expect(result.ok).toBe(true);
    expect(persisted).toMatchObject({ status: PaymentAttemptStatus.AWAITING, providerPaymentKey: null });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });
});

async function callback(paymentId: string, paymentKey: string, amount: string) {
  return persistTossCallbackProviderRef(db, { paymentKey, orderId: deriveTossOrderId(paymentId), amount });
}

async function expectInvalidCallbackLeavesPayment(
  paymentId: string,
  amount: string,
  status: "INVALID_REQUEST",
): Promise<void> {
  const before = await loadPayment(paymentId);

  const result = await callback(paymentId, tossPaymentKey(), amount);

  expect(result).toMatchObject({ ok: false, status });
  await expect(loadPayment(paymentId)).resolves.toEqual(before);
}

async function createPayment(context: TestContext, options: PaymentOptions = {}) {
  const session = await createSession(context, options);
  return db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: options.provider ?? PaymentProvider.TOSS,
      status: options.status ?? PaymentAttemptStatus.INITIATED,
      amount: options.amount ?? AMOUNT,
      currency: options.currency ?? "KRW",
      providerRef: options.providerRef ?? undefined,
      providerPaymentKey: options.providerPaymentKey ?? undefined,
      idempotencyKey: `toss-callback:${session.id}:${randomUUID()}`,
    },
  });
}

async function createSession(context: TestContext, options: PaymentOptions) {
  await ensureMarket(options.marketCode ?? MarketCode.KR, options.currency ?? "KRW");
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: options.marketCode ?? MarketCode.KR,
      currency: options.currency ?? "KRW",
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: options.amount ?? AMOUNT,
      shippingAmount: 0,
      totalAmount: options.amount ?? AMOUNT,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  context.sessionIds.push(session.id);
  return session;
}

async function ensureMarket(code: string, currency: string): Promise<void> {
  await db.market.upsert({
    where: { code },
    update: { currency, shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code, currency, shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function loadPayment(paymentId: string) {
  return db.payment.findUnique({
    where: { id: paymentId },
    select: { status: true, providerRef: true, providerPaymentKey: true },
  });
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

function tossPaymentKey(): string {
  return `toss_pay_${randomUUID()}`;
}

async function cleanup(context: TestContext): Promise<void> {
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: context.sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
