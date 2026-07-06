import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { providerForMarket } from "@/lib/payment/providers/routing";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/market/resolve", () => ({ getCurrentMarketCode: vi.fn() }));

import { getCurrentMarketCode } from "@/lib/market/resolve";
import { getSession } from "@/lib/session";
import { confirmPayment, initiatePayment } from "../payment";

const mockGetSession = vi.mocked(getSession);
const mockGetCurrentMarketCode = vi.mocked(getCurrentMarketCode);
const ORIGINAL_MOCK_MODE = process.env.PAYMENT_MOCK_MODE;

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  providerPaymentKeys: string[];
}

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

describe("payment actions", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PAYMENT_MOCK_MODE = "success";
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
    mockGetSession.mockResolvedValue(makeSession(ctx.userId));
    mockGetCurrentMarketCode.mockResolvedValue(MarketCode.KR);
  });

  afterEach(async () => {
    restoreMockMode();
    await cleanup(ctx);
  });

  it("initiate creates an INITIATED payment for a usable owned session", async () => {
    const session = await submitSessionWithOneLine(ctx);

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.provider).toBe(PaymentProvider.TOSS);
      expect(result.paymentId).toBeTruthy();
    }
    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.INITIATED);
    expect(payment.idempotencyKey).toMatch(`initiate:${session.sessionId}:`);
  });

  it("initiate rejects expired and other-user sessions without payment residue", async () => {
    const expired = await submitSessionWithOneLine(ctx, new Date("2026-07-01T00:00:00.000Z"));
    const expiredResult = await initiatePayment(expired.sessionId);
    expect(expiredResult.success).toBe(false);
    if (!expiredResult.success) expect(expiredResult.errorCode).toBe("SESSION_NOT_USABLE");

    const owned = await submitSessionWithOneLine(ctx);
    mockGetSession.mockResolvedValue(makeSession(`other_${randomUUID()}`));
    const otherResult = await initiatePayment(owned.sessionId);
    expect(otherResult.success).toBe(false);
    if (!otherResult.success) expect(otherResult.errorCode).toBe("SESSION_UNAVAILABLE");
    await expect(paymentCount(expired.sessionId)).resolves.toBe(0);
    await expect(paymentCount(owned.sessionId)).resolves.toBe(0);
  });

  it("confirm after initiate claims the existing payment and creates one order", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiatePayment(session.sessionId);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(true);
    if (result.success) expect(result.orderId).toBeTruthy();
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(payment.providerPaymentKey).toBe(key);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("confirm without initiate creates a captured payment and completes the order", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(true);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("amount mismatch returns terminal failure and enqueues one void intent", async () => {
    process.env.PAYMENT_MOCK_MODE = "amount-mismatch";
    const session = await submitSessionWithOneLine(ctx);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PAYMENT_FAILED");
      expect(result.retryable).toBe(false);
    }
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(1);
  });

  it("retryable provider failure returns retryable response and no void intent", async () => {
    process.env.PAYMENT_MOCK_MODE = "retryable-throw";
    const session = await submitSessionWithOneLine(ctx);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_RETRYABLE");
      expect(result.retryable).toBe(true);
    }
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("routes markets to their configured payment provider", () => {
    expect(providerForMarket(MarketCode.KR)).toBe(PaymentProvider.TOSS);
    expect(providerForMarket(MarketCode.US)).toBe(PaymentProvider.PAYPAL);
    expect(providerForMarket(MarketCode.JP)).toBe(PaymentProvider.PAYPAL);
    expect(providerForMarket("ZZ")).toBe(PaymentProvider.MOCK);
  });
});

function makeContext(): TestContext {
  return { userId: `b3_${randomUUID()}`, styleIds: [], variantIds: [], providerPaymentKeys: [] };
}

function makeSession(userId: string): Session {
  return { user: { id: userId, email: `${userId}@example.test`, name: "B3 User", role: "CUSTOMER" }, expires: "2099-01-01" };
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

async function submitSessionWithOneLine(context: TestContext, now?: Date) {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await addCart(context, variant, 1);
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
    now,
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `B3 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b3-cover.png",
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
      sku: `B3-${randomUUID()}`,
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

function providerPaymentKey(context: TestContext): string {
  const key = `b3_capture_${randomUUID()}`;
  context.providerPaymentKeys.push(key);
  return key;
}

async function cleanup(context: TestContext): Promise<void> {
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

async function statusOf(sessionId: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session.status;
}

function restoreMockMode(): void {
  if (ORIGINAL_MOCK_MODE === undefined) {
    delete process.env.PAYMENT_MOCK_MODE;
    return;
  }
  process.env.PAYMENT_MOCK_MODE = ORIGINAL_MOCK_MODE;
}

