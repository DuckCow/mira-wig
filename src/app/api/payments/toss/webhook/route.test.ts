// ============================================================
// Toss webhook route — 수신/검증/멱등/복구 행동 검증
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { orderHasUnreconciledPayment } from "@/lib/payment/reconciliation";
import { POST } from "./route";
import type { PaymentAttemptStatus } from "@prisma/client";

interface Ctx {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
}

const TEST_SNAPSHOT = {
  styleName: "테스트", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

function webhookBody(ctx: Ctx, paymentKey: string, secret: string, status = "DONE", amount = 85000): string {
  return JSON.stringify({
    eventType: "PAYMENT_STATUS_CHANGED",
    data: { orderId: ctx.orderId, paymentKey, status, totalAmount: amount, currency: "KRW", secret },
  });
}

function webhookRequest(rawBody: string, transmissionId: string): NextRequest {
  return new NextRequest("http://localhost/api/payments/toss/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": transmissionId,
    },
    body: rawBody,
  });
}

async function setupFixtures(stock = 10): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const userId = `webhook_${runId}`;
  await db.user.create({ data: { id: userId, email: `${runId}@webhook.test`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: { name: `웹훅 ${runId}`, category: "FASHION", tags: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } } },
  });
  const variant = await db.wigVariant.create({
    data: { wigStyleId: style.id, color: "블랙", length: "long", curl: "straight",
      price: 85000, stock, sku: `TEST_WEBHOOK_${runId}`,
      marketPrices: { create: { marketCode: "KR", amount: 85000 } } },
  });
  const order = await db.order.create({
    data: { userId, status: "PENDING_PAYMENT", marketCode: "KR", currency: "KRW",
      totalAmount: 85000, shippingFee: 0, recipientName: "홍길동",
      phone: "010-1234-5678", country: "KR", postalCode: "06234",
      city: "강남구", addressLine1: "테헤란로 1",
      items: { create: [{ variantId: variant.id, quantity: 1, unitPrice: 85000,
        snapshotData: TEST_SNAPSHOT, manufacturingRequest: { create: {} } }] } },
  });
  await db.cartItem.create({ data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 } });
  return { userId, orderId: order.id, variantId: variant.id, styleId: style.id, initialStock: stock };
}

async function cleanupFixtures(ctx: Ctx | null): Promise<void> {
  if (!ctx) return;
  await db.paymentWebhookEvent.deleteMany({ where: { orderId: ctx.orderId } });
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.order.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

async function createStoredPayment(
  ctx: Ctx,
  paymentKey: string,
  secret: string | null,
  status: PaymentAttemptStatus = "PENDING",
  idempotencyKey = `stored:${ctx.orderId}:${paymentKey}:${status}`,
): Promise<void> {
  await db.payment.create({
    data: {
      orderId: ctx.orderId,
      provider: "toss",
      providerTransactionId: paymentKey,
      providerWebhookSecret: secret,
      idempotencyKey,
      status,
      amount: 85000,
      currency: "KRW",
    },
  });
}

async function post(ctx: Ctx, paymentKey: string, secret: string, transmissionId: string, status = "DONE"): Promise<Response> {
  return POST(webhookRequest(webhookBody(ctx, paymentKey, secret, status), transmissionId));
}

describe("POST /api/payments/toss/webhook", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => {
    vi.stubEnv("PAYMENT_LIVE_MARKETS", "KR");
    vi.stubEnv("TOSS_SECRET_KEY", "test_sk_webhook");
    ctx = await setupFixtures(10);
  });
  afterEach(async () => {
    await cleanupFixtures(ctx);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    ctx = null;
  });

  it("유효 secret + DONE + PENDING_PAYMENT 주문은 PAID로 복구한다", async () => {
    await createStoredPayment(ctx!, "pay_webhook_ok", "secret_ok");
    const response = await post(ctx!, "pay_webhook_ok", "secret_ok", "tr_ok");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const event = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: "tr_ok" } });
    expect(response.status).toBe(200);
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(event.processedAt).not.toBeNull();
  });

  it("unconfirmed 마커의 secret으로 검증하고 복구 성공 후 마커를 해소한다", async () => {
    await createStoredPayment(
      ctx!,
      "pay_unconfirmed_webhook",
      "secret_unconfirmed",
      "PENDING",
      `unconfirmed:${ctx!.orderId}:pay_unconfirmed_webhook`,
    );
    const response = await post(ctx!, "pay_unconfirmed_webhook", "secret_unconfirmed", "tr_unconfirmed");
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId }, orderBy: { createdAt: "asc" } });
    expect(response.status).toBe(200);
    expect(payments.map((payment) => payment.status)).toEqual(["CANCELLED", "SUCCEEDED"]);
    expect(payments[0]?.providerWebhookSecret).toBe("secret_unconfirmed");
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
  });

  it("같은 transmissionId 재전송은 재처리하지 않는다", async () => {
    await createStoredPayment(ctx!, "pay_webhook_retry", "secret_retry");
    await post(ctx!, "pay_webhook_retry", "secret_retry", "tr_retry");
    const second = await post(ctx!, "pay_webhook_retry", "secret_retry", "tr_retry");
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const succeeded = await db.payment.findMany({ where: { orderId: ctx!.orderId, status: "SUCCEEDED" } });
    expect(second.status).toBe(200);
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(succeeded).toHaveLength(1);
  });

  it("무효 secret은 주문을 변경하지 않는다", async () => {
    await createStoredPayment(ctx!, "pay_bad_secret", "real_secret");
    const response = await post(ctx!, "pay_bad_secret", "fake_secret", "tr_bad_secret");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    expect(response.status).toBe(401);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(variant.stock).toBe(ctx!.initialStock);
  });

  it("저장된 secret이 없으면 복구하지 않고 로그를 남긴다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await createStoredPayment(ctx!, "pay_missing_secret", null);
    const response = await post(ctx!, "pay_missing_secret", "secret_from_webhook", "tr_missing_secret");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    expect(response.status).toBe(409);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(errorSpy).toHaveBeenCalledWith("TOSS_WEBHOOK_SECRET_MISSING", {
      orderId: ctx!.orderId,
      providerTransactionId: "pay_missing_secret",
    });
  });

  it("본문 형식 불량은 400을 반환하고 이벤트를 기록하지 않는다", async () => {
    const response = await POST(webhookRequest(JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: {} }), "tr_bad_body"));
    const event = await db.paymentWebhookEvent.findUnique({ where: { transmissionId: "tr_bad_body" } });
    expect(response.status).toBe(400);
    expect(event).toBeNull();
  });

  it("DONE이 아닌 상태는 200으로 수신 인정하고 주문은 변경하지 않는다", async () => {
    await createStoredPayment(ctx!, "pay_ready", "secret_ready");
    const response = await post(ctx!, "pay_ready", "secret_ready", "tr_ready", "IN_PROGRESS");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const event = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: "tr_ready" } });
    expect(response.status).toBe(200);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(event.processedAt).not.toBeNull();
  });

  it("이미 PAID 주문의 유효 웹훅은 200으로 멱등 처리한다", async () => {
    await db.order.update({ where: { id: ctx!.orderId }, data: { status: "PAID", paymentStatus: "PAID" } });
    await createStoredPayment(ctx!, "pay_already_paid", "secret_paid", "SUCCEEDED");
    const response = await post(ctx!, "pay_already_paid", "secret_paid", "tr_paid");
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    expect(response.status).toBe(200);
    expect(variant.stock).toBe(ctx!.initialStock);
  });
});
