import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  handlePaymentWebhook,
  type NormalizedWebhookEvent,
  type ValidationResult,
  type WebhookParseResult,
  type WebhookValidationStrategy,
} from "../webhook-handler";

type Ctx = {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
};

const VALID: ValidationResult = { ok: true };
const SNAPSHOT = {
  styleName: "웹훅", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await response.text());
  if (!isRecord(parsed)) throw new Error("response json 형식 오류");
  return parsed;
}

function request(body = "{}"): NextRequest {
  return new NextRequest("http://localhost/api/payments/mock/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function event(ctx: Ctx, eventId: string, providerTransactionId: string): NormalizedWebhookEvent {
  return {
    eventId,
    eventType: "MOCK.PAYMENT.DONE",
    orderId: ctx.orderId,
    providerTransactionId,
    status: "DONE",
    amount: 85000,
    currency: "KRW",
    raw: { eventId },
  };
}

function strategy(
  parsed: WebhookParseResult,
  auth: ValidationResult = VALID,
  authorize: ValidationResult = VALID,
): WebhookValidationStrategy {
  return {
    provider: "mock-webhook",
    parse: () => Promise.resolve(parsed),
    authenticateDelivery: () => Promise.resolve(auth),
    authorizeEvent: () => Promise.resolve(authorize),
    toRecoveryInput(normalized) {
      if (normalized.status !== "DONE" || typeof normalized.amount !== "number" || !normalized.currency) return null;
      return {
        orderId: normalized.orderId,
        paymentKey: normalized.providerTransactionId,
        amount: normalized.amount,
        currency: normalized.currency,
        status: normalized.status,
        provider: "mock-webhook",
      };
    },
  };
}

async function setupFixtures(stock = 10): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const userId = `webhook_helper_${runId}`;
  await db.user.create({ data: { id: userId, email: `${runId}@helper.test`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: {
      name: `공통 웹훅 ${runId}`,
      category: "FASHION",
      tags: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } },
    },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "블랙",
      length: "long",
      curl: "straight",
      price: 85000,
      stock,
      sku: `TEST_WEBHOOK_HELPER_${runId}`,
      marketPrices: { create: { marketCode: "KR", amount: 85000 } },
    },
  });
  const order = await db.order.create({
    data: {
      userId,
      status: "PENDING_PAYMENT",
      marketCode: "KR",
      currency: "KRW",
      totalAmount: 85000,
      shippingFee: 0,
      recipientName: "홍길동",
      phone: "010-1234-5678",
      country: "KR",
      postalCode: "06234",
      city: "강남구",
      addressLine1: "테헤란로 1",
      items: {
        create: [{
          variantId: variant.id,
          quantity: 1,
          unitPrice: 85000,
          snapshotData: SNAPSHOT,
          manufacturingRequest: { create: {} },
        }],
      },
    },
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

describe("handlePaymentWebhook — strategy injection", () => {
  let ctx: Ctx | null = null;

  beforeEach(async () => {
    ctx = await setupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures(ctx);
    vi.unstubAllEnvs();
    ctx = null;
  });

  it("Mock strategy 정상 흐름은 이벤트 기록 후 복구를 실행한다", async () => {
    const response = await handlePaymentWebhook(
      request(),
      strategy({ ok: true, event: event(ctx!, "mock_ok", "mock_capture_ok") }),
    );
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const webhook = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: "mock_ok" } });
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: ctx!.orderId, status: "SUCCEEDED" } });
    expect(response.status).toBe(200);
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(webhook.provider).toBe("mock-webhook");
    expect(webhook.processedAt).not.toBeNull();
    expect(payment.provider).toBe("mock-webhook");
    expect(payment.providerTransactionId).toBe("mock_capture_ok");
  });

  it("authenticateDelivery 실패는 멱등 이벤트를 기록하지 않는다", async () => {
    const response = await handlePaymentWebhook(
      request(),
      strategy(
        { ok: true, event: event(ctx!, "mock_auth_fail", "mock_capture_auth_fail") },
        { ok: false, status: 401, error: "bad_signature" },
      ),
    );
    const webhook = await db.paymentWebhookEvent.findUnique({ where: { transmissionId: "mock_auth_fail" } });
    expect(response.status).toBe(401);
    expect(webhook).toBeNull();
  });

  it("authorizeEvent 실패는 이벤트를 기록하고 주문을 변경하지 않는다", async () => {
    const response = await handlePaymentWebhook(
      request(),
      strategy(
        { ok: true, event: event(ctx!, "mock_authorize_fail", "mock_capture_authorize_fail") },
        VALID,
        { ok: false, status: 401, error: "invalid_event" },
      ),
    );
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const webhook = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: "mock_authorize_fail" } });
    expect(response.status).toBe(401);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(webhook.processedAt).toBeNull();
  });

  it("parse 거부는 400을 반환하고 이벤트를 기록하지 않는다", async () => {
    const response = await handlePaymentWebhook(
      request(),
      strategy({ ok: false, error: "invalid_json" }),
    );
    const webhooks = await db.paymentWebhookEvent.findMany({ where: { orderId: ctx!.orderId } });
    expect(response.status).toBe(400);
    expect(webhooks).toHaveLength(0);
  });

  it("복구 finalize가 실패하고 provider refund도 실패하면 200으로 종결하고 처리 기록을 남긴다", async () => {
    vi.stubEnv("PAYMENT_MOCK_FORCE_FAIL", "1");
    await db.wigVariant.update({ where: { id: ctx!.variantId }, data: { stock: 0 } });
    const response = await handlePaymentWebhook(
      request(),
      strategy({ ok: true, event: event(ctx!, "mock_unconfirmed_refund_failed", "mock_capture_refund_failed") }),
    );
    const body = await responseJson(response);
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const webhook = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: "mock_unconfirmed_refund_failed" } });
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    const adjustments = await db.paymentAdjustment.findMany({ where: { payment: { orderId: ctx!.orderId } } });
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, result: "unconfirmed" });
    expect(webhook.processedAt).not.toBeNull();
    expect(variant.stock).toBe(0);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("PENDING");
    expect(payments[0]?.providerTransactionId).toBe("mock_capture_refund_failed");
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.status).toBe("FAILED");
    expect(adjustments[0]?.idempotencyKey).toBe(`auto-refund:${ctx!.orderId}:mock_capture_refund_failed`);
  });
});
