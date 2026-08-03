import { createHash, randomUUID } from "crypto";
import {
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventFailureStage,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  ShippingCountry,
  WebhookIngressRejectionStage,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as paypalWebhookPost } from "@/app/api/payments/paypal/webhook/route";
import { POST as tossWebhookPost } from "@/app/api/payments/toss/webhook/route";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import { TOSS_SANDBOX_SECRET_KEY } from "@/lib/payment/providers/credentials";
import {
  TOSS_SANDBOX_EXTERNAL_ENABLED,
  type SandboxExternalCodeRegistryEntry,
} from "@/lib/payment/providers/factory";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import { deriveTossOrderId } from "@/lib/payment/providers/toss/order-id";
import { handleWebhook } from "../handle";
import { createMockWebhookPipeline } from "../mock-pipeline";
import type { WebhookHandleOptions } from "../pipeline-types";
import {
  WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
  WEBHOOK_MAX_CONTENT_LENGTH_BYTES,
  WEBHOOK_RAW_PREFIX_CHARS,
} from "../rejections";

const B4_NOW = new Date("2026-08-02T00:00:00.000Z");
const B4_RECEIVED_AT = new Date("2026-08-02T00:02:00.000Z");
const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;
const ORIGINAL_TOSS_EXTERNAL_ENABLED = process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
const ORIGINAL_TOSS_SECRET = process.env.TOSS_SANDBOX_SECRET_KEY;
const ORIGINAL_PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const ORIGINAL_PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const ORIGINAL_PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

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

interface TossWebhookPayload {
  transmissionId: string;
  eventType: string;
  eventId: string;
  paymentKey?: string;
}

interface TossFetchCall {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
}

interface PublicStreamProbe {
  pullCount: number;
  cancelCount: number;
  pullsAfterCancellation: number;
  cancelled: boolean;
}

describe("payment webhook core", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    process.env.PAYMENT_MODE = "SANDBOX";
    delete process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
    delete process.env.TOSS_SANDBOX_SECRET_KEY;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_WEBHOOK_ID;
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    restoreWebhookEnvironment();
    await cleanup(ctx);
  });

  it.each([
    ["Toss", PaymentProvider.TOSS, tossWebhookPost],
    ["PayPal", PaymentProvider.PAYPAL, paypalWebhookPost],
  ] as const)(
    "public %s route rejects exact unsigned checkout facts with zero financial/order mutation",
    async (_label, provider, post) => {
      const session = await submitSessionWithOneLine(ctx);
      const payload = capturePayload(ctx, session);
      const response = await post(publicRouteRequest(provider, payload));
      const replay = await post(publicRouteRequest(provider, payload));

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(replay.status).toBeGreaterThanOrEqual(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, kind: "verifyFailed" });
      await expect(replay.json()).resolves.toMatchObject({ ok: false, kind: "verifyFailed" });
      await expectZeroPublicIngressWrites(ctx, session, payload, provider);
    },
  );

  it.each([
    ["PAYMENT_MODE missing", undefined, "ENABLED", "test_secret_present"],
    ["PAYMENT_MODE blank", "   ", "ENABLED", "test_secret_present"],
    ["SANDBOX alone", "SANDBOX", undefined, undefined],
    ["LIVE without a verifier", "LIVE", "ENABLED", "test_secret_present"],
    ["malformed PAYMENT_MODE", "sandbox", "ENABLED", "test_secret_present"],
    ["external flag absent with credential", "SANDBOX", undefined, "test_secret_present"],
    ["partial external flag", "SANDBOX", "enabled", "test_secret_present"],
    ["valid external flag with missing credential", "SANDBOX", "ENABLED", "   "],
  ] as const)(
    "public Toss route denies %s without mock fallback",
    async (_label, paymentMode, externalEnabled, secret) => {
      setOptionalEnv("PAYMENT_MODE", paymentMode);
      setOptionalEnv(TOSS_SANDBOX_EXTERNAL_ENABLED, externalEnabled);
      setOptionalEnv(TOSS_SANDBOX_SECRET_KEY, secret);
      const session = await submitSessionWithOneLine(ctx);
      const payload = capturePayload(ctx, session);

      const response = await tossWebhookPost(publicRouteRequest(PaymentProvider.TOSS, payload));

      expect(response.status).toBeGreaterThanOrEqual(400);
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
    },
  );

  it("keeps explicit mock injection isolated from a parallel public Toss call", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const publicPayload = capturePayload(ctx, session);
    const injectedPayload = capturePayload(ctx, session);

    const [publicResponse, injectedResult] = await Promise.all([
      tossWebhookPost(publicRouteRequest(PaymentProvider.TOSS, publicPayload)),
      handleTestWebhook(PaymentProvider.TOSS, rawWebhook(injectedPayload)),
    ]);

    expect(publicResponse.status).toBeGreaterThanOrEqual(400);
    await expect(publicResponse.json()).resolves.toMatchObject({
      ok: false,
      kind: "verifyFailed",
    });
    expect(injectedResult).toMatchObject({ kind: "processed", status: 200 });
    await expect(eventCount(publicPayload.transmissionId)).resolves.toBe(0);
    await expect(eventStatus(injectedPayload.transmissionId))
      .resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    const payment = await onlyPayment(session.sessionId);
    expect(payment.providerPaymentKey).toBe(injectedPayload.providerPaymentKey);
  });

  it("public Toss route cancels chunked oversize ingress before verification with zero financial/order mutation", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const streamed = oversizedPublicRouteRequest(payload);

    const response = await tossWebhookPost(streamed.request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ ok: false, kind: "verifyFailed" });
    expect(streamed.probe).toMatchObject({
      pullCount: 2,
      cancelCount: 1,
      pullsAfterCancellation: 0,
      cancelled: true,
    });
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("BODY.TOO_LARGE");
    expect(rejection.rawBodyBytes).toBe(WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND);
    expect(rejection.rawBodyHash).toBeNull();
    expect(rejection.rawBodyPrefix).toHaveLength(WEBHOOK_RAW_PREFIX_CHARS);
    expect(rejection.rawBodyPrefix).not.toContain("\u0000");
    expect(rejection.rawBodyPrefix?.startsWith("\uFFFD")).toBe(true);
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
  });

  it.each([
    "65537",
    "2147483647",
    "2147483648",
    "9007199254740991",
    "9007199254740992",
    "9".repeat(512),
  ])(
    "public Toss route rejects canonical declared oversize %s without reading or financial mutation",
    async (contentLength) => {
      const session = await submitSessionWithOneLine(ctx);
      const payload = capturePayload(ctx, session);
      const streamed = declaredLengthPublicRouteRequest(payload, contentLength);

      const response = await tossWebhookPost(streamed.request);

      expect(response.status).toBe(413);
      expect(streamed.probe).toMatchObject({
        pullCount: 0,
        cancelCount: 0,
        pullsAfterCancellation: 0,
      });
      const rejection = await onlyRejection(payload.transmissionId);
      expect(rejection.code).toBe("BODY.TOO_LARGE");
      expect(rejection.rawBodyBytes).toBe(WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND);
      expect(rejection.rawBodyHash).toBeNull();
      expect(rejection.lastError).toContain("at least 65,537 bytes");
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
    },
  );

  it("public Toss route persists a complete NUL-containing rejection without changing exact body evidence", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const body = `\u0000${JSON.stringify(payload)}`;
    const response = await tossWebhookPost(completePublicRouteRequest(payload, body));

    expect(response.status).toBe(400);
    const rejection = await onlyRejection(payload.transmissionId);
    const originalBytes = new TextEncoder().encode(body);
    expect(rejection.rawBodyBytes).toBe(originalBytes.byteLength);
    expect(rejection.rawBodyHash).toBe(independentByteHash(originalBytes));
    expect(rejection.rawBodyPrefix).toBe(`\uFFFD${JSON.stringify(payload)}`.slice(0, WEBHOOK_RAW_PREFIX_CHARS));
    expect(rejection.rawBodyPrefix).not.toContain("\u0000");
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
  });

  it.each([
    {
      label: "malformed UTF-8",
      bytes: Uint8Array.of(0xC3, 0x28),
      prefix: "\uFFFD(",
    },
    {
      label: "valid Korean and emoji UTF-8",
      bytes: new TextEncoder().encode("가발🙂"),
      prefix: "가발🙂",
    },
    {
      label: "embedded NUL plus malformed UTF-8",
      bytes: Uint8Array.of(0x00, 0xC3, 0x28),
      prefix: "\uFFFD\uFFFD(",
    },
    {
      label: "ordinary JSON rejection",
      bytes: new TextEncoder().encode('{"message":"ordinary rejection"}'),
      prefix: '{"message":"ordinary rejection"}',
    },
  ])(
    "public Toss route keeps exact original-byte evidence for complete $label",
    async ({ bytes, prefix }) => {
      const session = await submitSessionWithOneLine(ctx);
      const payload = capturePayload(ctx, session);

      const response = await tossWebhookPost(completePublicRouteByteRequest(payload, [bytes]));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, kind: "verifyFailed" });
      const rejection = await onlyRejection(payload.transmissionId);
      expect(rejection.rawBodyBytes).toBe(bytes.byteLength);
      expect(rejection.rawBodyHash).toBe(independentByteHash(bytes));
      expect(rejection.rawBodyPrefix).toBe(prefix);
      expect(rejection.rawBodyPrefix).not.toContain("\u0000");
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
    },
  );

  it("public overflow diagnostic failure performs one insert attempt and no financial write", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const streamed = oversizedPublicRouteRequest(payload);
    const createSpy = vi.spyOn(db.webhookIngressRejection, "create")
      .mockRejectedValue(new Error("diagnostic insert sentinel"));

    try {
      await expect(tossWebhookPost(streamed.request)).rejects.toThrow("diagnostic insert sentinel");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0]?.[0].data).toMatchObject({
        code: "BODY.TOO_LARGE",
        rawBodyBytes: WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
        rawBodyHash: null,
      });
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("public read-failure diagnostic failure performs one insert attempt and no financial write", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const request = failingPublicRouteRequest(payload);
    const createSpy = vi.spyOn(db.webhookIngressRejection, "create")
      .mockRejectedValue(new Error("diagnostic insert sentinel"));

    try {
      await expect(tossWebhookPost(request)).rejects.toThrow("diagnostic insert sentinel");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0]?.[0].data).toMatchObject({
        code: "BODY.READ_FAILED",
        rawBodyHash: null,
      });
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("normalizes NUL produced by JSON escapes in every persisted candidate metadata field", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const unsafeTransmissionId = `${payload.transmissionId}\u0000unsafe`;
    const unsafeEventType = "PAYMENT.CAPTURED\u0000unsafe";
    const safeTransmissionId = unsafeTransmissionId.replace("\u0000", "\uFFFD");
    ctx.transmissionIds.push(safeTransmissionId);
    const body = JSON.stringify({
      transmissionId: unsafeTransmissionId,
      eventType: unsafeEventType,
    });

    const result = await handleTestWebhook(PaymentProvider.TOSS, {
      body,
      headers: { "x-mira-verify": "fail" },
      receivedAt: B4_RECEIVED_AT,
    });

    expect(result).toMatchObject({ kind: "verifyFailed", status: 400 });
    const rejection = await onlyRejection(safeTransmissionId);
    expect(rejection.candidateEventType).toBe(unsafeEventType.replace("\u0000", "\uFFFD"));
    expect(safeTransmissionId).not.toContain("\u0000");
    expect(rejection.candidateEventType).not.toContain("\u0000");
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.TOSS);
  });

  it.each([
    ["test", "SANDBOX"],
    ["development", "SANDBOX"],
    ["production", "LIVE"],
  ] as const)(
    "public PayPal route denies credentials/placeholders in %s with %s mode",
    async (nodeEnv, paymentMode) => {
      setOptionalEnv("NODE_ENV", nodeEnv);
      process.env.PAYMENT_MODE = paymentMode;
      process.env.PAYPAL_CLIENT_ID = "present_client_id";
      process.env.PAYPAL_CLIENT_SECRET = "present_client_secret";
      process.env.PAYPAL_WEBHOOK_ID = "present_webhook_id";
      const session = await submitSessionWithOneLine(ctx);
      const payload = capturePayload(ctx, session);

      const response = await paypalWebhookPost(publicRouteRequest(PaymentProvider.PAYPAL, payload));

      expect(response.status).toBeGreaterThanOrEqual(400);
      await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.PAYPAL);
    },
  );

  it("unsupported public provider is rejected without obtaining mock authority", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(
      db,
      PaymentProvider.MOCK,
      rawWebhook(payload),
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    await expect(onlyRejection(payload.transmissionId)).resolves.toMatchObject({
      code: "PROVIDER.PUBLIC_WEBHOOK_UNSUPPORTED",
      lastError: "Public webhook provider is unsupported.",
    });
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.MOCK);
  });

  it("preserves the PayPal unavailable diagnostic without changing its public behavior", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleWebhook(db, PaymentProvider.PAYPAL, rawWebhook(payload));

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    await expect(onlyRejection(payload.transmissionId)).resolves.toMatchObject({
      code: "PAYPAL.PUBLIC_WEBHOOK_VERIFIER_UNAVAILABLE",
      lastError: "PayPal public webhook verification is unavailable.",
    });
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.PAYPAL);
  });

  it("rejects Eximbay before any environment, resolver, or provider-contact seam is used", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    let environmentReads = 0;
    let registryReads = 0;
    let providerContacts = 0;
    const env = new Proxy<Record<string, string | undefined>>({}, {
      get: () => { environmentReads += 1; return undefined; },
    });
    const options: WebhookHandleOptions = {
      env,
      fetchFn: () => {
        providerContacts += 1;
        return Promise.reject(new Error("Eximbay provider contact must remain unreachable."));
      },
    };
    Object.defineProperty(options, "sandboxExternalCodeRegistry", {
      get: () => { registryReads += 1; return []; },
    });

    const result = await handleWebhook(
      db,
      PaymentProvider.EXIMBAY,
      rawWebhook(payload),
      options,
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    await expect(onlyRejection(payload.transmissionId)).resolves.toMatchObject({
      code: "EXIMBAY.PUBLIC_WEBHOOK_UNAVAILABLE",
      lastError: "Eximbay public webhook ingress is unavailable.",
    });
    expect(environmentReads).toBe(0);
    expect(registryReads).toBe(0);
    expect(providerContacts).toBe(0);
    await expectZeroPublicIngressWrites(ctx, session, payload, PaymentProvider.EXIMBAY);
  });

  it("same transmissionId replay is absorbed without reprocessing", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const first = await handleTestWebhook(PaymentProvider.TOSS, raw);
    const second = await handleTestWebhook(PaymentProvider.TOSS, raw);

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

    await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(firstPayload));
    const second = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(secondPayload));

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

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));
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

    await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(firstPayload));
    process.env.PAYMENT_MODE = "LIVE";
    const second = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(secondPayload));
    const payment = await onlyPayment(session.sessionId);

    expect(second.status).toBe(200);
    await expect(eventStatus(secondPayload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    expect(payment).toMatchObject({
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      providerPaymentKey: firstPayload.providerPaymentKey,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(outboxCount(PaymentProvider.TOSS, requiredProviderKey(firstPayload))).resolves.toBe(0);
  });

  it("verification failure writes rejected inbound row without reserving PaymentEvent", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleTestWebhook(PaymentProvider.TOSS, {
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

    const result = await handleTestWebhook(PaymentProvider.TOSS, { body, receivedAt: B4_RECEIVED_AT });

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

    const forged = await handleTestWebhook(PaymentProvider.TOSS, {
      ...raw,
      headers: { "x-mira-verify": "fail" },
    });
    const genuine = await handleTestWebhook(PaymentProvider.TOSS, raw);

    expect(forged.kind).toBe("verifyFailed");
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect(genuine.status).toBe(200);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(1);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("ignored webhook records IGNORED and has no completion side effect", async () => {
    const payload = ignoredPayload(ctx);

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.kind).toBe("ignored");
    expect(result.status).toBe(200);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.IGNORED);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("terminal amount mismatch returns 2xx and enqueues one provider remediation request", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session, { amount: session.totalAmount + 1 });

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));

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

    const result = await handleTestWebhook(PaymentProvider.TOSS, {
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

  it("explicit mock injection records invalid PAYMENT_MODE retryably and reprocesses after config is fixed", async () => {
    process.env.PAYMENT_MODE = "prod";
    const session = await submitSessionWithOneLine(ctx);
    const payload = capturePayload(ctx, session);

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));
    const retryable = await eventSnapshot(payload.transmissionId);

    expect(result).toMatchObject({ kind: "retryable", status: 500 });
    expect(retryable.status).toBe(PaymentEventStatus.RETRYABLE_FAILED);
    expect(retryable.failureStage).toBe(PaymentEventFailureStage.COMPLETE);
    expect(retryable.failureCode).toBe("COMPLETE.CONFIG_UNAVAILABLE");
    expect(retryable.lastError).toBe("Payment processing is temporarily unavailable.");
    expect(retryable.lastError).not.toContain("prod");
    expect(retryable.lastError).not.toContain("PAYMENT_MODE");
    expect(retryable.lastError).not.toContain("PaymentModeConfigException");
    expect(retryable.attemptCount).toBe(1);
    expect(retryable.lastAttemptAt).not.toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);

    process.env.PAYMENT_MODE = "SANDBOX";
    const replay = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));
    const processed = await eventSnapshot(payload.transmissionId);

    expect(replay.status).toBe(200);
    expect(processed.status).toBe(PaymentEventStatus.PROCESSED);
    expect(processed.failureStage).toBeNull();
    expect(processed.failureCode).toBeNull();
    expect(processed.lastError).toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("retryable COMPLETE failure records RETRYABLE_FAILED and replay converges to PROCESSED", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const conflict = await createConflictingOrder(ctx, session);
    const payload = capturePayload(ctx, session);
    const raw = rawWebhook(payload);

    const first = await handleTestWebhook(PaymentProvider.TOSS, raw);
    const retryable = await eventSnapshot(payload.transmissionId);
    await deleteConflictingOrder(conflict);
    const second = await handleTestWebhook(PaymentProvider.TOSS, raw);

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

    const first = await handleTestWebhook(PaymentProvider.TOSS, raw);
    await deleteConflictingOrder(conflict);
    const duplicateProviderKey = providerPaymentKeyFor(ctx);
    const duplicateBody = JSON.stringify({
      ...payload,
      providerPaymentKey: duplicateProviderKey,
      filler: "x".repeat(WEBHOOK_RAW_PREFIX_CHARS + 128),
    });
    const duplicate = await handleTestWebhook(PaymentProvider.TOSS, {
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

    await handleTestWebhook(PaymentProvider.TOSS, raw);
    await deleteConflictingOrder(conflict);

    let firstReplay: Promise<Awaited<ReturnType<typeof handleWebhook>>> | undefined;
    let secondReplay: Promise<Awaited<ReturnType<typeof handleWebhook>>> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "CheckoutSession" WHERE "id" = ${session.sessionId} FOR UPDATE
      `);
      firstReplay = handleTestWebhook(PaymentProvider.TOSS, raw);
      secondReplay = handleTestWebhook(PaymentProvider.TOSS, raw);
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

    const result = await handleTestWebhook(PaymentProvider.TOSS, {
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

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawWebhook(payload));

    expect(result.status).toBe(200);
    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("Toss SANDBOX webhook code key only fails closed without reserving PaymentEvent", async () => {
    const payload = tossPayload(ctx, "toss_half_config_code_only");
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), {
      env: { PAYMENT_MODE: "SANDBOX" },
      fetchFn: fetch.fetchFn,
      sandboxExternalCodeRegistry: tossWebhookCodeRegistry(),
    });

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    expect(fetch.calls).toEqual([]);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.stage).toBe(WebhookIngressRejectionStage.VERIFY);
    expect(rejection.code).toBe("SANDBOX_EXTERNAL_MISCONFIGURED");
  });

  it("Toss SANDBOX webhook enabled without secret fails closed without reserving PaymentEvent", async () => {
    const payload = tossPayload(ctx, "toss_missing_secret");
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), {
      env: {
        PAYMENT_MODE: "SANDBOX",
        [TOSS_SANDBOX_EXTERNAL_ENABLED]: "ENABLED",
      },
      fetchFn: fetch.fetchFn,
    });

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    expect(fetch.calls).toEqual([]);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("SANDBOX_EXTERNAL_CREDENTIALS_MISSING");
  });

  it("Toss lookup unavailable is rejected before PaymentEvent record and can redeliver later", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const payload = tossPayload(ctx, `toss_lookup_${randomUUID()}`);
    const unavailable = recordingTossFetch(new Response(JSON.stringify({ code: "FAILED_INTERNAL" }), { status: 503 }));

    const first = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(unavailable.fetchFn));
    expect(first).toMatchObject({ kind: "verifyFailed", status: 503 });
    await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.stage).toBe(WebhookIngressRejectionStage.VERIFY);
    expect(rejection.code).toBe("TOSS.LOOKUP_HTTP_ERROR");

    const available = recordingTossFetch(tossLookupResponse({
      paymentKey: requiredTossPaymentKey(payload),
      orderId: deriveTossOrderId(payment.id),
      amount: session.totalAmount,
      currency: session.currency,
    }));
    const second = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(available.fetchFn));

    expect(second.status).toBe(200);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("configured Toss path rejects a missing payment authentication fact without mock fallback", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = tossPayload(ctx, undefined, { paymentKey: undefined });
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: "unused" }));

    const result = await handleTestWebhook(
      PaymentProvider.TOSS,
      rawTossWebhook(payload),
      realTossOptions(fetch.fetchFn),
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 400 });
    expect(fetch.calls).toEqual([]);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("TOSS.PAYMENT_KEY_MISSING");
    await expectRejectedTossWithoutCompletion(ctx, session, payload);
  });

  it("configured Toss path rejects malformed provider verification without mock fallback", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(new Response(JSON.stringify({ status: "DONE" }), { status: 200 }));

    const result = await handleTestWebhook(
      PaymentProvider.TOSS,
      rawTossWebhook(payload),
      realTossOptions(fetch.fetchFn),
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 502 });
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("TOSS.LOOKUP_MALFORMED");
    await expectRejectedTossWithoutCompletion(ctx, session, payload);
  });

  it("configured Toss path rejects mismatched lookup facts without mock fallback", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: "different_provider_payment_key" }));

    const result = await handleTestWebhook(
      PaymentProvider.TOSS,
      rawTossWebhook(payload),
      realTossOptions(fetch.fetchFn),
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 400 });
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("TOSS.PAYMENT_KEY_MISMATCH");
    await expectRejectedTossWithoutCompletion(ctx, session, payload);
  });

  it("configured Toss verifier exception rejects without mock fallback", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = tossPayload(ctx);
    const rejectingFetch: typeof fetch = () => Promise.reject(new Error("deterministic lookup failure"));

    const result = await handleTestWebhook(
      PaymentProvider.TOSS,
      rawTossWebhook(payload),
      realTossOptions(rejectingFetch),
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("TOSS.LOOKUP_NETWORK_ERROR");
    await expectRejectedTossWithoutCompletion(ctx, session, payload);
  });

  it("configured Toss verifier construction failure rejects without mock fallback", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(
      PaymentProvider.TOSS,
      rawTossWebhook(payload),
      {
        ...realTossOptions(fetch.fetchFn),
        tossLookupTimeoutMs: 0,
      },
    );

    expect(result).toMatchObject({ kind: "verifyFailed", status: 503 });
    expect(fetch.calls).toEqual([]);
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("TOSS.WEBHOOK_VERIFIER_CONSTRUCTION_FAILED");
    await expectRejectedTossWithoutCompletion(ctx, session, payload);
  });

  it.each(["CANCEL_STATUS_CHANGED", "DEPOSIT_CALLBACK"])(
    "Toss %s is acked unsupported with no PaymentEvent and no lookup",
    async (eventType) => {
      const payload = tossPayload(ctx, undefined, { eventType, paymentKey: undefined });
      const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: "unused" }));

      const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));

      expect(result).toMatchObject({ kind: "verifyFailed", status: 200 });
      expect(fetch.calls).toEqual([]);
      await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
      const rejection = await onlyRejection(payload.transmissionId);
      expect(rejection.code).toBe("TOSS.EVENT_ACKED_UNSUPPORTED");
      expect(rejection.stage).toBe(WebhookIngressRejectionStage.VERIFY);
    },
  );

  it("Toss SANDBOX verified webhook completes capture and persists verified provenance", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(tossLookupResponse({
      paymentKey: requiredTossPaymentKey(payload),
      orderId: deriveTossOrderId(payment.id),
      amount: session.totalAmount,
      currency: session.currency,
    }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    const call = onlyTossFetchCall(fetch.calls);

    expect(result.status).toBe(200);
    expect(new Headers(call.init?.headers).get("Authorization")).toBe(tossBasicAuthorization(fakeTossSecret()));
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.PROCESSED);
    await expect(eventProvenance(payload.transmissionId)).resolves.toEqual({
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("duplicate verified Toss delivery remains idempotent", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const payload = tossPayload(ctx);
    const raw = rawTossWebhook(payload);
    const fetch = recordingTossFetch(tossLookupResponse({
      paymentKey: requiredTossPaymentKey(payload),
      orderId: deriveTossOrderId(payment.id),
      amount: session.totalAmount,
      currency: session.currency,
    }));
    const options = realTossOptions(fetch.fetchFn);

    const first = await handleTestWebhook(PaymentProvider.TOSS, raw, options);
    const second = await handleTestWebhook(PaymentProvider.TOSS, raw, options);

    expect(first).toMatchObject({ kind: "processed", status: 200 });
    expect(second).toMatchObject({ kind: "duplicate", status: 200 });
    expect(fetch.calls).toHaveLength(2);
    await expect(eventCount(payload.transmissionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it.each([
    ["amount", { amount: 12_001, currency: "KRW" }],
    ["currency", { amount: 12_000, currency: "USD" }],
  ] as const)(
    "Toss verified webhook %s mismatch fails closed and queues one compensation",
    async (_label, mismatch) => {
      const session = await submitSessionWithOneLine(ctx);
      await initiateForSession(ctx, session.sessionId);
      const payment = await onlyPayment(session.sessionId);
      const payload = tossPayload(ctx);
      const fetch = recordingTossFetch(tossLookupResponse({
        paymentKey: requiredTossPaymentKey(payload),
        orderId: deriveTossOrderId(payment.id),
        amount: mismatch.amount,
        currency: mismatch.currency,
      }));

      const result = await handleTestWebhook(
        PaymentProvider.TOSS,
        rawTossWebhook(payload),
        realTossOptions(fetch.fetchFn),
      );

      expect(result).toMatchObject({ kind: "processed", status: 200 });
      await expect(orderCount(ctx.userId)).resolves.toBe(0);
      await expect(outboxCount(PaymentProvider.TOSS, requiredTossPaymentKey(payload))).resolves.toBe(1);
      await expect(db.checkoutSession.findUniqueOrThrow({
        where: { id: session.sessionId },
        select: { status: true },
      })).resolves.toEqual({ status: "FAILED" });
    },
  );

  it("Toss verified-vs-configured mode divergence is retryable after recording provenance", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(tossLookupResponse({
      paymentKey: requiredTossPaymentKey(payload),
      orderId: deriveTossOrderId(payment.id),
      amount: session.totalAmount,
      currency: session.currency,
    }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    const event = await eventSnapshot(payload.transmissionId);

    expect(result).toMatchObject({ kind: "retryable", status: 500 });
    expect(event.status).toBe(PaymentEventStatus.RETRYABLE_FAILED);
    expect(event.failureCode).toBe("COMPLETE.MODE_DIVERGENCE");
    await expect(eventProvenance(payload.transmissionId)).resolves.toEqual({
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("Toss retryable real duplicate replays lookup and completes after mode config is fixed", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    const session = await submitSessionWithOneLine(ctx);
    await initiateForSession(ctx, session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const payload = tossPayload(ctx);
    const fetch = recordingTossFetch(tossLookupResponse({
      paymentKey: requiredTossPaymentKey(payload),
      orderId: deriveTossOrderId(payment.id),
      amount: session.totalAmount,
      currency: session.currency,
    }));

    const first = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    process.env.PAYMENT_MODE = "SANDBOX";
    const second = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    const event = await eventSnapshot(payload.transmissionId);

    expect(first).toMatchObject({ kind: "retryable", status: 500 });
    expect(second.status).toBe(200);
    expect(fetch.calls).toHaveLength(3);
    expect(event.status).toBe(PaymentEventStatus.PROCESSED);
    expect(event.failureCode).toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("Toss real duplicate with persisted mode collision records VERIFY rejection without reprocessing", async () => {
    const payload = tossPayload(ctx);
    await createSyntheticTossEvent(payload, { verifiedMode: PaymentMode.LIVE, binding: "toss:sandbox:v1" });
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));

    expect(result).toMatchObject({ kind: "verifyFailed", status: 409 });
    const rejection = await onlyRejection(payload.transmissionId);
    expect(rejection.code).toBe("VERIFY.MODE_COLLISION");
    expect(fetch.calls).toHaveLength(2);
    await expect(eventStatus(payload.transmissionId)).resolves.toBe(PaymentEventStatus.RETRYABLE_FAILED);
  });

  it("Toss real duplicate with unavailable persisted credential binding defers retryably without replay lookup", async () => {
    const payload = tossPayload(ctx);
    await createSyntheticTossEvent(payload, { verifiedMode: PaymentMode.SANDBOX, binding: "toss:sandbox:v0" });
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    const event = await eventSnapshot(payload.transmissionId);

    expect(result).toMatchObject({ kind: "retryable", status: 500 });
    expect(fetch.calls).toHaveLength(1);
    expect(event.status).toBe(PaymentEventStatus.RETRYABLE_FAILED);
    expect(event.failureCode).toBe("COMPLETE.CREDENTIAL_BINDING_UNAVAILABLE");
  });

  it("Toss real duplicate with legacy null verifiedMode becomes terminal manual-review", async () => {
    const payload = tossPayload(ctx);
    await createSyntheticTossEvent(payload, { verifiedMode: null, binding: null });
    const fetch = recordingTossFetch(tossLookupResponse({ paymentKey: requiredTossPaymentKey(payload) }));

    const result = await handleTestWebhook(PaymentProvider.TOSS, rawTossWebhook(payload), realTossOptions(fetch.fetchFn));
    const event = await eventSnapshot(payload.transmissionId);

    expect(result).toMatchObject({ kind: "failed", status: 200 });
    expect(fetch.calls).toHaveLength(1);
    expect(event.status).toBe(PaymentEventStatus.FAILED);
    expect(event.failureCode).toBe("COMPLETE.LEGACY_UNVERIFIED_EVENT");
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
    adapterContext: {
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      market: MarketCode.KR,
      method: PaymentMethod.CARD,
      currency: "KRW",
      ruleId: "test.kr.card.toss",
      credentials: [],
      liveGuard: { kind: "blocked", liveEnabled: false, reason: "test sandbox" },
    },
    now: B4_RECEIVED_AT,
    contactBoundaryClock: () => new Date(B4_RECEIVED_AT.getTime() + 1),
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
      availableMarkets: { create: { marketCode: MarketCode.KR, isActive: true } },
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

function rawTossWebhook(payload: TossWebhookPayload) {
  return {
    body: JSON.stringify({
      eventType: payload.eventType,
      eventId: payload.eventId,
      createdAt: "2026-08-02T00:01:00.000Z",
      data: payload.paymentKey ? { paymentKey: payload.paymentKey } : {},
    }),
    headers: { "tosspayments-webhook-transmission-id": payload.transmissionId },
    receivedAt: B4_RECEIVED_AT,
  };
}

function tossPayload(
  context: TestContext,
  paymentKey = `toss_payment_${randomUUID()}`,
  overrides: Partial<TossWebhookPayload> = {},
): TossWebhookPayload {
  const payload = {
    transmissionId: `toss_tx_${randomUUID()}`,
    eventType: "PAYMENT_STATUS_CHANGED",
    eventId: `toss_evt_${randomUUID()}`,
    paymentKey,
    ...overrides,
  };
  context.transmissionIds.push(payload.transmissionId);
  if (payload.paymentKey) context.providerPaymentKeys.push(payload.paymentKey);
  return payload;
}

function realTossOptions(fetchFn: typeof fetch): WebhookHandleOptions {
  return {
    env: {
      PAYMENT_MODE: "SANDBOX",
      [TOSS_SANDBOX_EXTERNAL_ENABLED]: "ENABLED",
      [TOSS_SANDBOX_SECRET_KEY]: fakeTossSecret(),
    },
    fetchFn,
  };
}

function tossWebhookCodeRegistry(): readonly SandboxExternalCodeRegistryEntry[] {
  return [{
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.WEBHOOK_VERIFIER,
  }];
}

function fakeTossSecret(): string {
  return "test_sk_d1d_webhook_sentinel";
}

function requiredTossPaymentKey(payload: TossWebhookPayload): string {
  if (!payload.paymentKey) throw new Error("Missing Toss paymentKey");
  return payload.paymentKey;
}

function recordingTossFetch(response: Response): { calls: TossFetchCall[]; fetchFn: typeof fetch } {
  const calls: TossFetchCall[] = [];
  return {
    calls,
    fetchFn: (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(response.clone());
    },
  };
}

function tossLookupResponse(options: {
  paymentKey: string;
  orderId?: string;
  amount?: number;
  currency?: string;
}): Response {
  return new Response(JSON.stringify({
    paymentKey: options.paymentKey,
    orderId: options.orderId ?? deriveTossOrderId("synthetic_payment_id"),
    status: "DONE",
    totalAmount: options.amount ?? 12_000,
    currency: options.currency ?? "KRW",
    approvedAt: "2026-08-02T00:01:30.000Z",
  }), { status: 200 });
}

function onlyTossFetchCall(calls: readonly TossFetchCall[]): TossFetchCall {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error("Expected one Toss lookup fetch call.");
  return call;
}

function publicRouteRequest(provider: PaymentProvider, payload: MockWebhookPayload): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (provider === PaymentProvider.TOSS) {
    headers.set("tosspayments-webhook-transmission-id", payload.transmissionId);
  }
  return new Request(`http://localhost/api/payments/${provider.toLowerCase()}/webhook`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      eventType: "PAYMENT_STATUS_CHANGED",
      eventId: `public_attack_${payload.transmissionId}`,
      data: { paymentKey: payload.providerPaymentKey },
    }),
  });
}

function oversizedPublicRouteRequest(payload: MockWebhookPayload): {
  request: Request;
  probe: PublicStreamProbe;
} {
  const probe: PublicStreamProbe = {
    pullCount: 0,
    cancelCount: 0,
    pullsAfterCancellation: 0,
    cancelled: false,
  };
  const firstChunk = new Uint8Array(WEBHOOK_MAX_CONTENT_LENGTH_BYTES).fill("a".charCodeAt(0));
  firstChunk[0] = 0;
  const chunks = [
    firstChunk,
    Uint8Array.of("b".charCodeAt(0)),
    Uint8Array.of("c".charCodeAt(0)),
  ];
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      probe.pullCount += 1;
      if (probe.cancelled) {
        probe.pullsAfterCancellation += 1;
        return;
      }
      const chunk = chunks[index];
      if (!chunk) {
        controller.close();
        return;
      }
      index += 1;
      controller.enqueue(chunk);
    },
    cancel() {
      probe.cancelled = true;
      probe.cancelCount += 1;
    },
  }, { highWaterMark: 0 });
  const headers = new Headers({
    "content-type": "application/json",
    "tosspayments-webhook-transmission-id": payload.transmissionId,
    "x-mira-event-type": "PAYMENT_STATUS_CHANGED",
    "x-mira-transmission-id": payload.transmissionId,
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
  };
  return {
    request: new Request("http://localhost/api/payments/toss/webhook", init),
    probe,
  };
}

function declaredLengthPublicRouteRequest(
  payload: MockWebhookPayload,
  contentLength: string,
): { request: Request; probe: PublicStreamProbe } {
  const probe: PublicStreamProbe = {
    pullCount: 0,
    cancelCount: 0,
    pullsAfterCancellation: 0,
    cancelled: false,
  };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      probe.pullCount += 1;
      if (probe.cancelled) {
        probe.pullsAfterCancellation += 1;
        return;
      }
      controller.enqueue(new TextEncoder().encode("must-not-be-read"));
      controller.close();
    },
    cancel() {
      probe.cancelled = true;
      probe.cancelCount += 1;
    },
  }, { highWaterMark: 0 });
  const headers = new Headers({
    "content-length": contentLength,
    "content-type": "application/json",
    "x-mira-event-type": "PAYMENT_STATUS_CHANGED",
    "x-mira-transmission-id": payload.transmissionId,
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
  };
  return {
    request: new Request("http://localhost/api/payments/toss/webhook", init),
    probe,
  };
}

function completePublicRouteRequest(payload: MockWebhookPayload, body: string): Request {
  return new Request("http://localhost/api/payments/toss/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": payload.transmissionId,
      "x-mira-event-type": payload.eventType,
      "x-mira-transmission-id": payload.transmissionId,
    },
    body,
  });
}

function completePublicRouteByteRequest(
  payload: MockWebhookPayload,
  chunks: readonly Uint8Array[],
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      if (!chunk) {
        controller.close();
        return;
      }
      index += 1;
      controller.enqueue(chunk);
      if (index === chunks.length) controller.close();
    },
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": payload.transmissionId,
      "x-mira-event-type": payload.eventType,
      "x-mira-transmission-id": payload.transmissionId,
    },
    body,
    duplex: "half",
  };
  return new Request("http://localhost/api/payments/toss/webhook", init);
}

function failingPublicRouteRequest(payload: MockWebhookPayload): Request {
  let pullCount = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      if (pullCount === 1) {
        controller.enqueue(new TextEncoder().encode("partial"));
        return;
      }
      controller.error(new Error("stream read sentinel"));
    },
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": payload.transmissionId,
      "x-mira-event-type": payload.eventType,
      "x-mira-transmission-id": payload.transmissionId,
    },
    body,
    duplex: "half",
  };
  return new Request("http://localhost/api/payments/toss/webhook", init);
}

function independentByteHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function handleTestWebhook(
  provider: PaymentProvider,
  raw: Parameters<typeof handleWebhook>[2],
  options?: WebhookHandleOptions,
) {
  return handleWebhook(db, provider, raw, options ?? {
    testOnlyPipeline: createMockWebhookPipeline(provider),
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
  const dedupKeys = context.providerPaymentKeys.flatMap((key) => [
    `void:${PaymentProvider.TOSS}:${key}`,
    `payment-remediation:${PaymentProvider.TOSS}:${key}`,
  ]);
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
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: session.totalAmount,
      currency: session.currency,
      providerPaymentKey,
      financialSucceededAt: B4_NOW,
      blockingEndedAt: B4_NOW,
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

async function eventProvenance(transmissionId: string) {
  const event = await db.paymentEvent.findFirst({
    where: { transmissionId },
    select: { verifiedMode: true, verifiedCredentialBinding: true },
  });
  if (!event) throw new Error(`Missing event provenance ${transmissionId}`);
  return event;
}

async function createSyntheticTossEvent(
  payload: TossWebhookPayload,
  provenance: { verifiedMode: PaymentMode | null; binding: string | null },
): Promise<void> {
  await db.paymentEvent.create({
    data: {
      provider: PaymentProvider.TOSS,
      source: PaymentEventSource.WEBHOOK,
      transmissionId: payload.transmissionId,
      eventType: payload.eventType,
      verifiedMode: provenance.verifiedMode,
      verifiedCredentialBinding: provenance.binding,
      raw: rawTossWebhook(payload).body,
      status: PaymentEventStatus.RETRYABLE_FAILED,
      receivedAt: B4_RECEIVED_AT,
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      lastError: "Synthetic nonterminal event",
    },
    select: { id: true },
  });
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
  return db.paymentOutbox.count({
    where: { dedupKey: `payment-remediation:${provider}:${providerPaymentKey}` },
  });
}

async function expectZeroPublicIngressWrites(
  context: TestContext,
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  payload: MockWebhookPayload,
  provider: PaymentProvider = PaymentProvider.TOSS,
): Promise<void> {
  const providerPaymentKey = requiredProviderKey(payload);
  const sessionState = await db.checkoutSession.findUniqueOrThrow({
    where: { id: session.sessionId },
    select: { status: true },
  });
  const variantId = context.variantIds[0];
  if (!variantId) throw new Error("Missing test variant.");
  const variant = await db.wigVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stock: true },
  });

  await expect(db.payment.count({
    where: { checkoutSessionId: session.sessionId, status: PaymentAttemptStatus.SUCCEEDED },
  })).resolves.toBe(0);
  await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  await expect(orderCount(context.userId)).resolves.toBe(0);
  await expect(db.orderItem.count({ where: { order: { userId: context.userId } } })).resolves.toBe(0);
  await expect(db.orderShipping.count({ where: { order: { userId: context.userId } } })).resolves.toBe(0);
  await expect(db.manufacturingRequest.count({
    where: { orderItem: { order: { userId: context.userId } } },
  })).resolves.toBe(0);
  await expect(db.cartItem.count({ where: { userId: context.userId } })).resolves.toBe(1);
  await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
  await expect(outboxCount(provider, providerPaymentKey)).resolves.toBe(0);
  expect(sessionState.status).toBe("SUBMITTED");
  expect(variant.stock).toBe(5);
}

async function expectRejectedTossWithoutCompletion(
  context: TestContext,
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  payload: TossWebhookPayload,
): Promise<void> {
  const payment = await onlyPayment(session.sessionId);
  expect(payment).toMatchObject({
    provider: PaymentProvider.TOSS,
    status: PaymentAttemptStatus.INITIATED,
    providerPaymentKey: null,
  });
  await expect(db.payment.count({
    where: { checkoutSessionId: session.sessionId, status: PaymentAttemptStatus.SUCCEEDED },
  })).resolves.toBe(0);
  await expect(orderCount(context.userId)).resolves.toBe(0);
  await expect(db.orderItem.count({ where: { order: { userId: context.userId } } })).resolves.toBe(0);
  await expect(db.orderShipping.count({ where: { order: { userId: context.userId } } })).resolves.toBe(0);
  await expect(db.manufacturingRequest.count({
    where: { orderItem: { order: { userId: context.userId } } },
  })).resolves.toBe(0);
  await expect(db.cartItem.count({ where: { userId: context.userId } })).resolves.toBe(1);
  await expect(eventCount(payload.transmissionId)).resolves.toBe(0);
  if (payload.paymentKey) {
    await expect(outboxCount(PaymentProvider.TOSS, payload.paymentKey)).resolves.toBe(0);
  }
  await expect(db.checkoutSession.findUniqueOrThrow({
    where: { id: session.sessionId },
    select: { status: true },
  })).resolves.toEqual({ status: "SUBMITTED" });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setOptionalEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function restoreWebhookEnvironment(): void {
  setOptionalEnv("PAYMENT_MODE", ORIGINAL_PAYMENT_MODE);
  setOptionalEnv(TOSS_SANDBOX_EXTERNAL_ENABLED, ORIGINAL_TOSS_EXTERNAL_ENABLED);
  setOptionalEnv(TOSS_SANDBOX_SECRET_KEY, ORIGINAL_TOSS_SECRET);
  setOptionalEnv("PAYPAL_CLIENT_ID", ORIGINAL_PAYPAL_CLIENT_ID);
  setOptionalEnv("PAYPAL_CLIENT_SECRET", ORIGINAL_PAYPAL_CLIENT_SECRET);
  setOptionalEnv("PAYPAL_WEBHOOK_ID", ORIGINAL_PAYPAL_WEBHOOK_ID);
  setOptionalEnv("NODE_ENV", ORIGINAL_NODE_ENV);
}
