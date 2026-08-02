import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { deriveTossOrderId } from "@/lib/payment/providers/toss/order-id";
import { GET } from "../route";

const AMOUNT = 12_000;

interface TestContext {
  userId: string;
  sessionIds: string[];
}

interface TossRouteParams {
  paymentKey?: string;
  orderId?: string;
  amount?: string;
}

describe("Toss success route scaffold", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = { userId: `toss_route_${randomUUID()}`, sessionIds: [] };
    await ensureMarket();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
    vi.restoreAllMocks();
  });

  it("returns an accepted non-completion response for a valid callback", async () => {
    const payment = await createPayment(ctx);
    const paymentKey = `route_pay_${randomUUID()}`;
    const response = await GET(request(payment.id, paymentKey, `${AMOUNT}`));
    const body = await readJson(response);
    const persisted = await loadPayment(payment.id);

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      ok: true,
      status: "ACCEPTED_PROVIDER_REF",
      paymentId: payment.id,
      confirm: "blocked_until_real_toss_adapter",
    });
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      providerRef: paymentKey,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("returns invalid request for missing query fields", async () => {
    const response = await GET(new Request("http://localhost/api/payments/toss/success"));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, status: "INVALID_REQUEST" });
    expect(body).not.toHaveProperty("reason");
  });

  it("returns a safe invalid response for invalid amount format without mutating payment", async () => {
    const payment = await createPayment(ctx);

    await expectInvalidRouteInputDoesNotMutate(ctx, payment.id, {
      paymentKey: `route_pay_${randomUUID()}`,
      orderId: deriveTossOrderId(payment.id),
      amount: "not-a-number",
    });
  });

  it("returns a safe invalid response for negative amount without mutating payment", async () => {
    const payment = await createPayment(ctx);

    await expectInvalidRouteInputDoesNotMutate(ctx, payment.id, {
      paymentKey: `route_pay_${randomUUID()}`,
      orderId: deriveTossOrderId(payment.id),
      amount: "-1000",
    });
  });

  it.each([
    ["paymentKey", (paymentId: string) => ({ orderId: deriveTossOrderId(paymentId), amount: `${AMOUNT}` })],
    ["orderId", () => ({ paymentKey: `route_pay_${randomUUID()}`, amount: `${AMOUNT}` })],
    ["amount", (paymentId: string) => ({ paymentKey: `route_pay_${randomUUID()}`, orderId: deriveTossOrderId(paymentId) })],
  ])("returns a safe invalid response when %s is missing", async (_fieldName, paramsFor) => {
    const payment = await createPayment(ctx);

    await expectInvalidRouteInputDoesNotMutate(ctx, payment.id, paramsFor(payment.id));
  });

  it("does not mark local payment succeeded through the route", async () => {
    const payment = await createPayment(ctx);

    await GET(request(payment.id, `route_pay_${randomUUID()}`, `${AMOUNT}`));

    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("does not call Toss HTTP from the success route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const payment = await createPayment(ctx);

    await GET(request(payment.id, `route_pay_${randomUUID()}`, `${AMOUNT}`));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function request(paymentId: string, paymentKey: string, amount: string): Request {
  return requestWithParams({ paymentKey, orderId: deriveTossOrderId(paymentId), amount });
}

function requestWithParams(params: TossRouteParams): Request {
  const url = new URL("http://localhost/api/payments/toss/success");
  if (params.paymentKey !== undefined) url.searchParams.set("paymentKey", params.paymentKey);
  if (params.orderId !== undefined) url.searchParams.set("orderId", params.orderId);
  if (params.amount !== undefined) url.searchParams.set("amount", params.amount);
  return new Request(url);
}

async function createPayment(context: TestContext) {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: AMOUNT,
      shippingAmount: 0,
      totalAmount: AMOUNT,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  context.sessionIds.push(session.id);
  return db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: AMOUNT,
      currency: "KRW",
      idempotencyKey: `toss-route:${session.id}:${randomUUID()}`,
      contactIntentAt: new Date(),
      contactStartedAt: new Date(),
    },
  });
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
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

async function sideEffectCounts(userId: string): Promise<{ cartItems: number; manufacturingRequests: number; orders: number }> {
  const [orders, manufacturingRequests, cartItems] = await Promise.all([
    db.order.count({ where: { userId } }),
    db.manufacturingRequest.count({ where: { orderItem: { order: { userId } } } }),
    db.cartItem.count({ where: { userId } }),
  ]);
  return { orders, manufacturingRequests, cartItems };
}

async function expectInvalidRouteInputDoesNotMutate(
  context: TestContext,
  paymentId: string,
  params: TossRouteParams,
): Promise<void> {
  const beforePayment = await loadPayment(paymentId);
  const beforeEffects = await sideEffectCounts(context.userId);

  const response = await GET(requestWithParams(params));
  const body = await readJson(response);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({ ok: false, status: "INVALID_REQUEST" });
  expect(body).not.toHaveProperty("reason");
  await expect(loadPayment(paymentId)).resolves.toEqual(beforePayment);
  await expect(sideEffectCounts(context.userId)).resolves.toEqual(beforeEffects);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (isRecord(body)) return body;
  throw new Error("Route response body must be an object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function cleanup(context: TestContext): Promise<void> {
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: context.sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
