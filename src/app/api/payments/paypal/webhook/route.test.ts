// ============================================================
// PayPal webhook route — signature strategy + helper integration
// ============================================================
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { POST } from "./route";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
type Ctx = {
  prefix: string;
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
};

const SNAPSHOT = {
  styleName: "PayPal 테스트", color: "브라운", colorHex: null,
  length: "long", curl: "wave", coverImageKey: null, currencyCode: "USD",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockFetch(...responses: Response[]): FetchMock {
  const fetchMock = vi.fn<typeof fetch>();
  for (const item of responses) fetchMock.mockResolvedValueOnce(item);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function oauthResponse(): Response {
  return response({ access_token: "paypal_access_token", expires_in: 3600 });
}

function verifyResponse(status = "SUCCESS"): Response {
  return response({ verification_status: status });
}

function fetchJsonBody(fetchMock: FetchMock, index: number): Record<string, unknown> {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch 호출 없음: ${index}`);
  const [, init] = call;
  if (!init || typeof init.body !== "string") throw new Error("fetch body 없음");
  const parsed: unknown = JSON.parse(init.body);
  if (!isRecord(parsed)) throw new Error("fetch body 형식 오류");
  return parsed;
}

function capturePayload(ctx: Ctx, overrides: {
  captureId?: string;
  customId?: string;
  status?: string;
  amount?: string;
  currency?: string;
  eventType?: string;
} = {}): string {
  return JSON.stringify({
    id: `${ctx.prefix}_event`,
    event_type: overrides.eventType ?? "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: overrides.captureId ?? `${ctx.prefix}_capture`,
      status: overrides.status ?? "COMPLETED",
      custom_id: overrides.customId ?? ctx.orderId,
      amount: {
        currency_code: overrides.currency ?? "USD",
        value: overrides.amount ?? "77.99",
      },
    },
  });
}

function webhookRequest(ctx: Ctx, rawBody: string, transmissionId: string): NextRequest {
  return new NextRequest("http://localhost/api/payments/paypal/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "PAYPAL-AUTH-ALGO": "SHA256withRSA",
      "PAYPAL-CERT-URL": "https://api-m.sandbox.paypal.com/v1/notifications/certs/test",
      "PAYPAL-TRANSMISSION-ID": `${ctx.prefix}_${transmissionId}`,
      "PAYPAL-TRANSMISSION-SIG": "signature",
      "PAYPAL-TRANSMISSION-TIME": "2026-06-25T00:00:00Z",
    },
    body: rawBody,
  });
}

async function setupFixtures(stock = 10): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const prefix = `paypal_wh_${runId}`;
  const userId = `${prefix}_user`;
  await db.user.create({ data: { id: userId, email: `${prefix}@webhook.test`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "US" },
    update: {},
    create: { code: "US", currency: "USD", shippableCountries: ["US"], defaultLocale: "en" },
  });
  const style = await db.wigStyle.create({
    data: {
      name: `PayPal 웹훅 ${runId}`,
      category: "FASHION",
      tags: [],
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "브라운",
      length: "long",
      curl: "wave",
      price: 7799,
      stock,
      sku: `TEST_PAYPAL_WEBHOOK_${runId}`,
      marketPrices: { create: { marketCode: "US", amount: 7799 } },
    },
  });
  const order = await db.order.create({
    data: {
      userId,
      status: "PENDING_PAYMENT",
      marketCode: "US",
      currency: "USD",
      totalAmount: 7799,
      shippingFee: 0,
      recipientName: "Jane Doe",
      phone: "555-0100",
      country: "US",
      postalCode: "10001",
      city: "New York",
      addressLine1: "1 Test St",
      items: {
        create: [{
          variantId: variant.id,
          quantity: 1,
          unitPrice: 7799,
          snapshotData: SNAPSHOT,
          manufacturingRequest: { create: {} },
        }],
      },
    },
  });
  await db.cartItem.create({ data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 } });
  return { prefix, userId, orderId: order.id, variantId: variant.id, styleId: style.id, initialStock: stock };
}

async function cleanupFixtures(ctx: Ctx | null): Promise<void> {
  if (!ctx) return;
  await db.paymentWebhookEvent.deleteMany({
    where: { OR: [{ orderId: ctx.orderId }, { transmissionId: { startsWith: ctx.prefix } }] },
  });
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.order.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

async function post(ctx: Ctx, transmissionId: string, body = capturePayload(ctx)): Promise<Response> {
  return POST(webhookRequest(ctx, body, transmissionId));
}

describe("POST /api/payments/paypal/webhook", () => {
  let ctx: Ctx | null = null;

  beforeEach(async () => {
    vi.stubEnv("PAYPAL_ENV", "sandbox");
    vi.stubEnv("PAYPAL_CLIENT_ID", "client_id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "webhook_id");
    ctx = await setupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures(ctx);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    ctx = null;
  });

  it("유효 서명 + PAYMENT.CAPTURE.COMPLETED는 주문을 PAID로 복구한다", async () => {
    const fetchMock = mockFetch(oauthResponse(), verifyResponse());
    const response = await post(ctx!, "tr_ok");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: ctx!.orderId, status: "SUCCEEDED" } });
    const event = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: `${ctx!.prefix}_tr_ok` } });
    const verifyBody = fetchJsonBody(fetchMock, 1);
    expect(response.status).toBe(200);
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(payment.provider).toBe("paypal");
    expect(payment.providerTransactionId).toBe(`${ctx!.prefix}_capture`);
    expect(payment.amount).toBe(7799);
    expect(event.provider).toBe("paypal");
    expect(event.processedAt).not.toBeNull();
    expect(verifyBody.webhook_id).toBe("webhook_id");
    expect(verifyBody.transmission_id).toBe(`${ctx!.prefix}_tr_ok`);
    expect(verifyBody.webhook_event).toEqual(JSON.parse(capturePayload(ctx!)));
  });

  it("무효 서명은 401이며 PaymentWebhookEvent를 기록하지 않는다", async () => {
    mockFetch(oauthResponse(), verifyResponse("FAILURE"));
    const response = await post(ctx!, "tr_bad_sig");
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const event = await db.paymentWebhookEvent.findUnique({ where: { transmissionId: `${ctx!.prefix}_tr_bad_sig` } });
    expect(response.status).toBe(401);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(event).toBeNull();
  });

  it("같은 transmission id 재전송은 멱등 200으로 재처리하지 않는다", async () => {
    mockFetch(oauthResponse(), verifyResponse(), oauthResponse(), verifyResponse());
    await post(ctx!, "tr_retry");
    const second = await post(ctx!, "tr_retry");
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const succeeded = await db.payment.findMany({ where: { orderId: ctx!.orderId, status: "SUCCEEDED" } });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(succeeded).toHaveLength(1);
  });

  it("이미 PAID인 주문은 200으로 멱등 처리한다", async () => {
    mockFetch(oauthResponse(), verifyResponse());
    await db.order.update({ where: { id: ctx!.orderId }, data: { status: "PAID", paymentStatus: "PAID" } });
    const response = await post(ctx!, "tr_paid");
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    expect(response.status).toBe(200);
    expect(variant.stock).toBe(ctx!.initialStock);
  });

  it("custom_id로 주문을 찾지 못하면 복구하지 않는다", async () => {
    mockFetch(oauthResponse(), verifyResponse());
    const response = await post(ctx!, "tr_wrong_order", capturePayload(ctx!, { customId: `${ctx!.prefix}_missing_order` }));
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const event = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: `${ctx!.prefix}_tr_wrong_order` } });
    expect(response.status).toBe(401);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(event.processedAt).toBeNull();
  });

  it("COMPLETED가 아닌 capture status는 200으로 수신 인정하고 복구하지 않는다", async () => {
    mockFetch(oauthResponse(), verifyResponse());
    const response = await post(ctx!, "tr_pending", capturePayload(ctx!, { status: "PENDING" }));
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const event = await db.paymentWebhookEvent.findUniqueOrThrow({ where: { transmissionId: `${ctx!.prefix}_tr_pending` } });
    expect(response.status).toBe(200);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(event.processedAt).not.toBeNull();
  });
});
