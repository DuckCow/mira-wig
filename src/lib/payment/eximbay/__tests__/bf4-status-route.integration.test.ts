import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import type { EximbayBf4Fetch } from "../bf4-contact";
import {
  EXIMBAY_BF4_STATUS_ROUTE_ENABLED,
  handleEximbayBf4StatusRoute,
} from "../bf4-status-route";

const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const API_KEY = "BF4_ROUTE_SYNTHETIC_KEY_DO_NOT_LOG";
const MID = "BF4_ROUTE_MID";
const NOW = new Date("2026-08-17T02:00:00.000Z");
const RECEIVED_AT = new Date("2026-08-17T02:01:00.000Z");

// Ingress and fail-closed behavior remain Mira's installed contract. The successful
// ACK media type follows provider communication evidence; actual TEST acceptance is pending.

interface Fixture {
  readonly userId: string;
  readonly styleId: string;
  readonly variantId: string;
  readonly sessionId: string;
  readonly paymentId: string;
  readonly providerOrderId: string;
  readonly transactionId: string;
  readonly amount: number;
  readonly raw: string;
}

interface TrackedRequest {
  readonly request: Request;
  bodyAccesses(): number;
}

describe("Eximbay BF4 status route transport profile", () => {
  const transport = vi.fn<EximbayBf4Fetch>();

  it.each([undefined, ""])("keeps an unset/blank gate disabled before body read (%s)", async (gate) => {
    const tracked = trackedStringRequest("not-read");

    const response = await handleEximbayBf4StatusRoute(
      unusableDb(),
      tracked.request,
      gateEnv(gate),
      transport,
    );

    await expectEmpty(response, 404);
    expect(tracked.bodyAccesses()).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails an invalid nonblank gate closed before body read", async () => {
    const tracked = trackedStringRequest("not-read");

    const response = await handleEximbayBf4StatusRoute(
      unusableDb(),
      tracked.request,
      gateEnv("enabled"),
      transport,
    );

    await expectEmpty(response, 503);
    expect(tracked.bodyAccesses()).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it("catches an unexpected helper failure and returns an empty 503", async () => {
    const tracked = trackedStringRequest("not-read");
    const env: Record<string, string | undefined> = {};
    Object.defineProperty(env, EXIMBAY_BF4_STATUS_ROUTE_ENABLED, {
      get() {
        throw new Error("synthetic BF4 gate read failure");
      },
    });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, env, transport);

    await expectEmpty(response, 503);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it("admits processing only for exact ENABLED", async () => {
    const tracked = trackedStringRequest("malformed");

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, gateEnv("ENABLED"), transport);

    await expectEmpty(response, 400);
    expect(tracked.bodyAccesses()).toBeGreaterThan(0);
  });

  it("accepts POST only", async () => {
    const tracked = trackedStringRequest("not-read", { method: "PUT" });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 405);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it.each([
    "https://mira.example/api/payments/eximbay/status?source=query",
    "https://mira.example/api/payments/eximbay/status?",
  ])("rejects every URL-query component instead of merging it with the body", async (url) => {
    const tracked = trackedStringRequest("not-read", { url });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 400);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it.each([
    ["missing", new Headers()],
    ["wrong media", new Headers({ "Content-Type": "application/json" })],
    ["unknown parameter", new Headers({ "Content-Type": `${FORM_CONTENT_TYPE}; boundary=x` })],
    ["duplicate parameter", new Headers({
      "Content-Type": `${FORM_CONTENT_TYPE}; charset=utf-8; charset=utf-8`,
    })],
  ])("rejects %s Content-Type before body read", async (_label, headers) => {
    const tracked = trackedStringRequest("not-read", { headers });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 415);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it.each([
    FORM_CONTENT_TYPE,
    "Application/X-WWW-Form-Urlencoded; Charset = UTF-8",
  ])("admits the exact form media type profile (%s)", async (contentType) => {
    const tracked = trackedStringRequest("malformed", {
      headers: new Headers({ "Content-Type": contentType }),
    });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 400);
    expect(tracked.bodyAccesses()).toBeGreaterThan(0);
  });

  it("rejects compressed Content-Encoding before body read", async () => {
    const tracked = trackedStringRequest("not-read", {
      headers: new Headers({
        "Content-Type": FORM_CONTENT_TYPE,
        "Content-Encoding": "gzip",
      }),
    });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 415);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it("accepts identity Content-Encoding", async () => {
    const tracked = trackedStringRequest("malformed", {
      headers: new Headers({
        "Content-Type": FORM_CONTENT_TYPE,
        "Content-Encoding": "Identity",
      }),
    });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 400);
    expect(tracked.bodyAccesses()).toBeGreaterThan(0);
  });

  it("rejects a canonical oversized Content-Length before body read", async () => {
    const tracked = trackedStringRequest("not-read", {
      headers: new Headers({
        "Content-Type": FORM_CONTENT_TYPE,
        "Content-Length": "16385",
      }),
    });

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 413);
    expect(tracked.bodyAccesses()).toBe(0);
  });

  it("enforces the streamed byte bound when Content-Length is missing or noncanonical", async () => {
    for (const contentLength of [undefined, "016385"]) {
      let cancelled = 0;
      const headers = new Headers({ "Content-Type": FORM_CONTENT_TYPE });
      if (contentLength !== undefined) headers.set("Content-Length", contentLength);
      const tracked = trackedStreamRequest(
        [new Uint8Array(16_385)],
        { headers, stayOpenAfterChunks: true, onCancel: () => { cancelled += 1; } },
      );

      const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

      await expectEmpty(response, 413);
      expect(cancelled).toBe(1);
    }
  });

  it("accepts exactly 16,384 streamed bytes at ingress and then rejects malformed form semantics", async () => {
    const tracked = trackedStreamRequest([new TextEncoder().encode("x".repeat(16_384))]);

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 400);
  });

  it("rejects and cancels more than 256 request chunks", async () => {
    let cancelled = 0;
    const tracked = trackedStreamRequest(
      Array.from({ length: 257 }, () => new Uint8Array([0x61])),
      { stayOpenAfterChunks: true, onCancel: () => { cancelled += 1; } },
    );

    const response = await handleEximbayBf4StatusRoute(db, tracked.request, enabledEnv(), transport);

    await expectEmpty(response, 400);
    expect(cancelled).toBe(1);
  });

  it("rejects empty and invalid UTF-8 bodies", async () => {
    const empty = trackedStringRequest("");
    const invalidUtf8 = trackedStreamRequest([new Uint8Array([0xc3, 0x28])]);

    await expectEmpty(
      await handleEximbayBf4StatusRoute(db, empty.request, enabledEnv(), transport),
      400,
    );
    await expectEmpty(
      await handleEximbayBf4StatusRoute(db, invalidUtf8.request, enabledEnv(), transport),
      400,
    );
  });

  it("rejects aborted and failed streams without retaining a raw prefix", async () => {
    const abortController = new AbortController();
    const aborted = trackedStreamRequest([new Uint8Array([0x61])], { signal: abortController.signal });
    abortController.abort();
    const failed = trackedFailingStreamRequest();

    await expectEmpty(
      await handleEximbayBf4StatusRoute(db, aborted.request, enabledEnv(), transport),
      400,
    );
    await expectEmpty(
      await handleEximbayBf4StatusRoute(db, failed.request, enabledEnv(), transport),
      400,
    );
  });

  it("maps a non-correlated engine result to an empty fail-closed response", async () => {
    const raw = statusRaw({
      providerOrderId: syntheticEximbayProviderOrderId(),
      transactionId: `missing-${randomUUID()}`,
      amount: 1234,
    });

    const response = await handleEximbayBf4StatusRoute(
      db,
      trackedStringRequest(raw).request,
      enabledEnv(),
      transport,
    );

    await expectEmpty(response, 503);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe.sequential("Eximbay BF4 status route provider-free integration", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await cleanupFixture(fixture);
  });

  it("preserves the exact POST body, completes durably, and replays the exact success body", async () => {
    const transport = vi.fn<EximbayBf4Fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.endsWith("/verify")) {
        expect(init?.body).toBe(JSON.stringify({ data: fixture.raw }));
        return Promise.resolve(jsonResponse({ rescode: "0000", resmsg: "verified" }));
      }
      return Promise.resolve(retrieveSuccess(fixture));
    });

    const first = await routeRequest(fixture.raw, transport);
    const duplicate = await routeRequest(fixture.raw, transport);

    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(first.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(first.text()).resolves.toBe("rescode=0000&resmsg=Success");
    expect(duplicate.status).toBe(200);
    expect(duplicate.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    await expect(duplicate.text()).resolves.toBe("rescode=0000&resmsg=Success");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.filter(([input]) => requestUrl(input).endsWith("/verify"))).toHaveLength(1);
    expect(transport.mock.calls.filter(([input]) => requestUrl(input).endsWith("/retrieve"))).toHaveLength(1);
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(1);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
        providerPaymentKey: fixture.transactionId,
      });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: fixture.sessionId } }))
      .resolves.toMatchObject({ status: CheckoutSessionStatus.COMPLETED });
  });

  it("returns empty 503 for an engine non-success disposition", async () => {
    const transport = vi.fn<EximbayBf4Fetch>(() => Promise.resolve(jsonResponse({
      rescode: "9999",
      resmsg: "not admitted",
    })));

    const response = await routeRequest(fixture.raw, transport);

    await expectEmpty(response, 503);
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
  });

  it("catches an internal engine/config failure and emits an empty 503", async () => {
    const response = await handleEximbayBf4StatusRoute(
      db,
      trackedStringRequest(fixture.raw).request,
      { [EXIMBAY_BF4_STATUS_ROUTE_ENABLED]: "ENABLED" },
      vi.fn<EximbayBf4Fetch>(),
      monotonicClock(),
    );

    await expectEmpty(response, 503);
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } }))
      .resolves.toBe(0);
  });

  it("rejects a correlated LIVE Payment before config, event claim, mutation, or transport", async () => {
    await db.payment.update({
      where: { id: fixture.paymentId },
      data: { mode: PaymentMode.LIVE },
    });
    const transport = vi.fn<EximbayBf4Fetch>();

    const response = await routeRequest(fixture.raw, transport);

    await expectEmpty(response, 503);
    expect(transport).not.toHaveBeenCalled();
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } }))
      .resolves.toBe(0);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        mode: PaymentMode.LIVE,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        providerPaymentKey: null,
      });
  });
});

async function routeRequest(raw: string, transport: EximbayBf4Fetch): Promise<Response> {
  return handleEximbayBf4StatusRoute(
    db,
    trackedStringRequest(raw).request,
    enabledEnv(),
    transport,
    monotonicClock(),
  );
}

function trackedStringRequest(
  body: string,
  options: Readonly<{
    url?: string;
    method?: string;
    headers?: Headers;
  }> = {},
): TrackedRequest {
  const headers = options.headers ?? new Headers({ "Content-Type": FORM_CONTENT_TYPE });
  const request = new Request(
    options.url ?? "https://mira.example/api/payments/eximbay/status",
    { method: options.method ?? "POST", headers, body },
  );
  return trackBodyAccess(request);
}

function trackedStreamRequest(
  chunks: readonly Uint8Array[],
  options: Readonly<{
    headers?: Headers;
    signal?: AbortSignal;
    onCancel?: () => void;
    stayOpenAfterChunks?: boolean;
  }> = {},
): TrackedRequest {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else if (!options.stayOpenAfterChunks) controller.close();
    },
    cancel() {
      options.onCancel?.();
    },
  });
  return trackedRequestFromStream(stream, options.headers, options.signal);
}

function trackedFailingStreamRequest(): TrackedRequest {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("synthetic BF4 body stream failure"));
    },
  });
  return trackedRequestFromStream(stream);
}

function trackedRequestFromStream(
  stream: ReadableStream<Uint8Array>,
  headers = new Headers({ "Content-Type": FORM_CONTENT_TYPE }),
  signal?: AbortSignal,
): TrackedRequest {
  const init: RequestInit = {
    method: "POST",
    headers,
    body: "synthetic-stream-body",
    ...(signal === undefined ? {} : { signal }),
  };
  return trackBodyAccess(
    new Request("https://mira.example/api/payments/eximbay/status", init),
    stream,
  );
}

function trackBodyAccess(
  request: Request,
  body: ReadableStream<Uint8Array> | null = request.body,
): TrackedRequest {
  let accesses = 0;
  Object.defineProperty(request, "body", {
    configurable: true,
    enumerable: true,
    get() {
      accesses += 1;
      return body;
    },
  });
  return { request, bodyAccesses: () => accesses };
}

function gateEnv(value: string | undefined) {
  return value === undefined ? {} : { [EXIMBAY_BF4_STATUS_ROUTE_ENABLED]: value };
}

function unusableDb() {
  return new Proxy(db, {
    get() {
      throw new Error("BF4 route touched the database before admission.");
    },
  });
}

function enabledEnv() {
  return {
    [EXIMBAY_BF4_STATUS_ROUTE_ENABLED]: "ENABLED",
    EXIMBAY_SANDBOX_API_KEY: API_KEY,
    EXIMBAY_SANDBOX_MID: MID,
  };
}

async function expectEmpty(response: Response, status: number): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  await expect(response.text()).resolves.toBe("");
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `bf4_route_user_${suffix}`;
  await ensureUsMarket();
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "BF4 Route Buyer" } });
  const style = await db.wigStyle.create({
    data: {
      name: "BF4 Route Style",
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      isActive: true,
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
    select: { id: true },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 1234,
      stock: 3,
      sku: `BF4-ROUTE-${suffix}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "US", amount: 1234 } },
    },
    select: { id: true },
  });
  await db.cartItem.create({
    data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 },
  });
  const session = await createCheckoutSession(db, {
    userId,
    marketCode: "US",
    communicationLocale: "en",
    shipping: validShipping(),
    now: NOW,
  });
  const providerOrderId = syntheticEximbayProviderOrderId();
  const transactionId = `bf4-route-tx-${suffix}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId,
      idempotencyKey: `bf4-route-idem-${suffix}`,
      contactIntentAt: NOW,
      contactStartedAt: new Date(NOW.getTime() + 1),
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      initiationCompletedAt: new Date(NOW.getTime() + 2),
    },
    select: { id: true },
  });
  const fixture = {
    userId,
    styleId: style.id,
    variantId: variant.id,
    sessionId: session.sessionId,
    paymentId: payment.id,
    providerOrderId,
    transactionId,
    amount: session.totalAmount,
    raw: "",
  };
  return { ...fixture, raw: statusRaw(fixture) };
}

function statusRaw(input: Pick<Fixture, "providerOrderId" | "transactionId" | "amount">): string {
  return [
    "transaction_type=PAYMENT",
    `mid=${MID}`,
    `order_id=${input.providerOrderId}`,
    "currency=USD",
    `amount=${amountWire(input.amount)}`,
    "rescode=0000",
    "resmsg=Success+exact",
    "fgkey=status-only-not-ready",
    `transaction_id=${input.transactionId}`,
  ].join("&");
}

function retrieveSuccess(fixture: Fixture): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "retrieved",
    mid: MID,
    payment: {
      order_id: fixture.providerOrderId,
      currency: "USD",
      amount: amountWire(fixture.amount),
      transaction_id: fixture.transactionId,
      status: "SALE",
      transaction_date: "20260817020100",
    },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function amountWire(amount: number): string {
  const digits = String(amount).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function monotonicClock(): () => Date {
  let offset = 0;
  return () => {
    offset += 1;
    return new Date(RECEIVED_AT.getTime() + offset);
  };
}

async function ensureUsMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
    create: { code: "US", currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
  });
}

function validShipping(): CheckoutShippingInput {
  return {
    recipientName: "BF4 Route Recipient",
    phone: "+1-555-0101",
    country: ShippingCountry.US,
    postalCode: "94105",
    administrativeArea: "CA",
    city: "San Francisco",
    addressLine1: "1 Market Street",
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  await db.paymentEvent.deleteMany({ where: { checkoutSessionId: fixture.sessionId } });
  await db.paymentOutbox.deleteMany({
    where: { dedupKey: `payment-remediation:EXIMBAY:${fixture.transactionId}` },
  });
  const order = await db.order.findUnique({ where: { paymentId: fixture.paymentId }, select: { id: true } });
  if (order) {
    const items = await db.orderItem.findMany({ where: { orderId: order.id }, select: { id: true } });
    await db.manufacturingRequest.deleteMany({ where: { orderItemId: { in: items.map((item) => item.id) } } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.orderShipping.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
  await db.payment.deleteMany({ where: { id: fixture.paymentId } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSession.deleteMany({ where: { id: fixture.sessionId } });
  await db.cartItem.deleteMany({ where: { userId: fixture.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: fixture.variantId } });
  await db.wigVariant.deleteMany({ where: { id: fixture.variantId } });
  await db.wigStyle.deleteMany({ where: { id: fixture.styleId } });
  await db.user.deleteMany({ where: { id: fixture.userId } });
}
