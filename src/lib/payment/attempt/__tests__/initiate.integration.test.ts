import { randomUUID } from "crypto";
import {
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { completeFromCapture, type CaptureFacts } from "@/lib/payment/complete";
import { createMockPaymentProvider } from "@/lib/payment/providers/mock";
import type {
  PaymentInitiateInput,
  PaymentInitiateResult,
  PaymentProvider as PaymentProviderPort,
} from "@/lib/payment/providers/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { initiatePaymentAttempt } from "../initiate";

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
}

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

describe("payment initiate providerRef persistence", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("persists providerRef for ready initiate and keeps providerPaymentKey null", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_ready_${randomUUID()}`;

    const result = await initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef }),
    });

    const payment = await onlyPayment(session.sessionId);
    expect(result.status).toBe(PaymentAttemptStatus.INITIATED);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      providerRef,
      providerPaymentKey: null,
    });
  });

  it("persists providerRef and marks AWAITING for redirect initiate", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_redirect_${randomUUID()}`;

    const result = await initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({
        kind: "redirect",
        approveUrl: "https://fake-provider.example.test/approve",
        providerRef,
      }),
    });

    const payment = await onlyPayment(session.sessionId);
    expect(result.status).toBe(PaymentAttemptStatus.AWAITING);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.AWAITING,
      providerRef,
      providerPaymentKey: null,
    });
  });

  it("leaves providerRef null when initiate result omits it", async () => {
    const session = await submitSessionWithOneLine(ctx);

    await initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
    });

    const payment = await onlyPayment(session.sessionId);
    expect(payment.providerRef).toBeNull();
    expect(payment.providerPaymentKey).toBeNull();
  });

  it("does not write providerRef when provider initiate fails", async () => {
    const session = await submitSessionWithOneLine(ctx);

    await expect(initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: failingProvider(),
    })).rejects.toThrow("Fake provider initiate failure");

    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.INITIATED);
    expect(payment.providerRef).toBeNull();
    expect(payment.providerPaymentKey).toBeNull();
  });

  it("final capture sets providerPaymentKey while preserving providerRef", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_capture_${randomUUID()}`;
    await initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef }),
    });
    const facts = captureFacts(session);

    const result = await completeFromCapture(db, facts);
    const payment = await onlyPayment(session.sessionId);

    expect(result.kind).toBe("completed");
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef,
      providerPaymentKey: facts.providerPaymentKey,
    });
  });
});

function fakeProvider(initiateResult: PaymentInitiateResult): PaymentProviderPort {
  const provider = createMockPaymentProvider(PaymentProvider.TOSS);
  return {
    ...provider,
    initiate: (_input: PaymentInitiateInput) => Promise.resolve(initiateResult),
  };
}

function failingProvider(): PaymentProviderPort {
  const provider = createMockPaymentProvider(PaymentProvider.TOSS);
  return {
    ...provider,
    initiate: (_input: PaymentInitiateInput) => Promise.reject(new Error("Fake provider initiate failure")),
  };
}

function makeContext(): TestContext {
  return { userId: `d1b_initiate_${randomUUID()}`, styleIds: [], variantIds: [] };
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
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `D1B Initiate Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/d1b-initiate-cover.png",
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
      sku: `D1B-INIT-${randomUUID()}`,
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
  session: { sessionId: string; totalAmount: number; currency: string },
): CaptureFacts {
  return {
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.TOSS,
    providerPaymentKey: `capture_${randomUUID()}`,
    amount: session.totalAmount,
    currency: session.currency,
    receivedAt: new Date(),
  };
}

async function onlyPayment(checkoutSessionId: string) {
  const payment = await db.payment.findFirst({ where: { checkoutSessionId } });
  if (!payment) throw new Error(`Missing payment for ${checkoutSessionId}`);
  return payment;
}

async function cleanup(context: TestContext): Promise<void> {
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
