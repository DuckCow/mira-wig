import {
  FulfillmentType,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import type { PaymentInitiationProvider } from "@/lib/payment/providers/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { EXIMBAY_READY_TOTAL_DEADLINE_MS, type EximbayReadyFetch } from "../ready-http";

const provider = vi.hoisted<PaymentInitiationProvider>(() => ({
  code: "EXIMBAY",
  adapterExecutionKind: "EXTERNAL",
  initiate: () => Promise.reject(new Error("generic Eximbay provider seam must remain unused")),
}));

vi.mock("@/lib/payment/providers/initiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/initiation")>()),
  resolveInitiationProvider: () => provider,
}));

const API_KEY = "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG";
const BUYER_NAME = "SYNTHETIC_BUYER_NAME_DO_NOT_LOG";
const BUYER_EMAIL = "SYNTHETIC_BUYER_EMAIL_DO_NOT_LOG@example.test";

interface TestContext {
  readonly userId: string;
  readonly styleIds: string[];
  readonly variantIds: string[];
}

describe("EX2B2-S2 READY contact lifecycle integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const suffix = randomUUID().replaceAll("-", "");
    ctx = {
      userId: `ex2b2_contact_user_${suffix}`,
      styleIds: [],
      variantIds: [],
    };
    await ensureUsMarket();
    await db.user.create({ data: { id: ctx.userId, name: BUYER_NAME, email: BUYER_EMAIL } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup(ctx);
  });

  it("builds the complete plan before CONTACTED, commits CONTACTED before fetch, and persists READY only", async () => {
    const session = await createUsSession(ctx);
    const outboxBefore = await db.paymentOutbox.count();
    const observedBodies: string[] = [];
    const fetchImpl: EximbayReadyFetch = async (_input, init) => {
      const payment = await onlyPayment(session.sessionId);
      expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACTED);
      expect(payment.contactStartedAt).toBeInstanceOf(Date);
      observedBodies.push(requireBody(init));
      return successResponse();
    };
    const afterPrepared = vi.fn(async () => {
      const payment = await onlyPayment(session.sessionId);
      expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
      expect(payment.contactStartedAt).toBeNull();
      expect(observedBodies).toHaveLength(0);
    });

    const result = await initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl, afterPrepared);

    const payment = await onlyPayment(session.sessionId);
    expect(result).toMatchObject({
      paymentId: payment.id,
      provider: PaymentProvider.EXIMBAY,
      initiateResult: { kind: "ready" },
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain(BUYER_NAME);
    expect(JSON.stringify(result)).not.toContain("synthetic-ready-fgkey");
    expect(afterPrepared).toHaveBeenCalledTimes(1);
    expect(observedBodies).toHaveLength(1);
    expect(observedBodies[0]).toContain(`"name":"${BUYER_NAME}"`);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      providerRef: null,
      providerPaymentKey: null,
      financialSucceededAt: null,
      blockingEndedAt: null,
    });
    expect(payment.initiationCompletedAt?.getTime()).toBe(payment.contactStartedAt?.getTime());
    expect(JSON.stringify(payment)).not.toContain(API_KEY);
    expect(JSON.stringify(payment)).not.toContain(BUYER_NAME);
    expect(JSON.stringify(payment)).not.toContain(BUYER_EMAIL);
    expect(JSON.stringify(payment)).not.toContain("synthetic-ready-fgkey");
    await expect(db.order.count({ where: { paymentId: payment.id } })).resolves.toBe(0);
    await expect(db.paymentOutbox.count()).resolves.toBe(outboxBefore);
  });

  it.each([
    ["missing API key", { EXIMBAY_SANDBOX_API_KEY: undefined }],
    ["missing MID", { EXIMBAY_SANDBOX_MID: undefined }],
  ])("rejects %s before CONTACTED with zero fetch", async (_label, override) => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl, undefined, override))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const payment = await onlyPayment(session.sessionId);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
    expect(payment.contactStartedAt).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects missing canonical User.name without shipping-recipient fallback or contact", async () => {
    const session = await createUsSession(ctx, "SHIPPING_RECIPIENT_MUST_NOT_BECOME_BUYER");
    await db.user.update({ where: { id: ctx.userId }, data: { name: null } });
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    expect(fetchImpl).not.toHaveBeenCalled();
    const payment = await onlyPayment(session.sessionId);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
  });

  it.each(["", " ", " leading@example.test", "trailing@example.test ", "control\u007f@example.test"])(
    "rejects invalid persisted canonical User.email before CONTACTED with zero fetch: %s",
    async (email) => {
      const session = await createUsSession(ctx);
      await db.user.update({ where: { id: ctx.userId }, data: { email } });
      const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

      await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl))
        .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

      expect(fetchImpl).not.toHaveBeenCalled();
      const payment = await onlyPayment(session.sessionId);
      expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
      expect(payment.contactStartedAt).toBeNull();
    },
  );

  it("preserves the trusted generic method and rejects non-CARD before contact", async () => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    await expect(initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      adapterContext: { ...adapterContext(PaymentMode.SANDBOX), method: PaymentMethod.PAYPAL_WALLET },
      eximbayReady: { env: syntheticEnv(PaymentMode.SANDBOX), fetchImpl },
    })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    expect(fetchImpl).not.toHaveBeenCalled();
    const payment = await onlyPayment(session.sessionId);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
  });

  it.each([
    ["User.name", async (_paymentId: string) => db.user.update({ where: { id: ctx.userId }, data: { name: "Changed Buyer" } }), "ATTEMPT_STATE_CONFLICT"],
    ["User.email", async (paymentId: string) => db.user.update({ where: { id: ctx.userId }, data: { email: `changed-${paymentId}@example.test` } }), "ATTEMPT_STATE_CONFLICT"],
    ["CheckoutSession market", async (paymentId: string) => updateSessionForPayment(paymentId, { marketCode: "JP" }), "SESSION_TERMS_STALE"],
    ["CheckoutSession currency", async (paymentId: string) => updateSessionForPayment(paymentId, { currency: "JPY" }), "SESSION_TERMS_STALE"],
    ["CheckoutSession amount", async (paymentId: string) => updateSessionForPayment(paymentId, { totalAmount: 101 }), "SESSION_TERMS_STALE"],
    ["Payment mode", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { mode: PaymentMode.LIVE } }), "ATTEMPT_STATE_CONFLICT"],
    ["Payment providerOrderId", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { providerOrderId: syntheticEximbayProviderOrderId() } }), null],
    ["Payment provider", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { provider: PaymentProvider.TOSS } }), null],
    ["Payment amount", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { amount: 101 } }), "ATTEMPT_STATE_CONFLICT"],
    ["Payment currency", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { currency: "JPY" } }), "ATTEMPT_STATE_CONFLICT"],
    ["Payment routing rule", async (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { routingRuleId: "changed.rule" } }), "ATTEMPT_STATE_CONFLICT"],
  ])("rejects stale prepared authority after %s drift with zero fetch", async (_label, mutate, expectedCode) => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    const pending = initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl, async () => {
      const payment = await onlyPayment(session.sessionId);
      await mutate(payment.id);
    });
    if (expectedCode) await expect(pending).rejects.toMatchObject({ code: expectedCode });
    else await expect(pending).rejects.toBeDefined();

    expect(fetchImpl).not.toHaveBeenCalled();
    const payment = await onlyPayment(session.sessionId);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.CONTACT_AUTHORIZED);
    expect(payment.contactStartedAt).toBeNull();
  });

  it.each([
    [PaymentMode.SANDBOX, PaymentMode.LIVE],
    [PaymentMode.LIVE, PaymentMode.SANDBOX],
  ])("preserves existing %s Payment identity when incoming mode is %s", async (persistedMode, incomingMode) => {
    const session = await createUsSession(ctx);
    const existing = await createExistingAuthorizedPayment(session, persistedMode);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    await expect(initiate(session.sessionId, incomingMode, fetchImpl))
      .rejects.toMatchObject({ code: "ATTEMPT_STATE_CONFLICT" });

    const rows = await db.payment.findMany({ where: { checkoutSessionId: session.sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: existing.id,
      providerOrderId: existing.providerOrderId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      contactStartedAt: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["transport throw", () => Promise.reject(new Error("synthetic transport failure"))],
    ["non-2xx", () => Promise.resolve(new Response("{}", { status: 503, headers: jsonHeaders() }))],
    ["invalid content type", () => Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "text/plain" } }))],
    ["oversized body", () => Promise.resolve(new Response("x".repeat(65_537), { status: 200, headers: jsonHeaders() }))],
    ["too many chunks", () => Promise.resolve(tooManyChunksResponse())],
    ["invalid response chunk", () => Promise.resolve(invalidChunkResponse())],
    ["response stream failure", () => Promise.resolve(failingStreamResponse())],
    ["invalid UTF-8", () => Promise.resolve(new Response(Uint8Array.of(0xff), { status: 200, headers: jsonHeaders() }))],
    ["invalid JSON", () => Promise.resolve(new Response("{", { status: 200, headers: jsonHeaders() }))],
    ["invalid root", () => Promise.resolve(new Response("[]", { status: 200, headers: jsonHeaders() }))],
    ["duplicate protected key", () => Promise.resolve(new Response('{"rescode":"0000","rescode":"0000","resmsg":"x","fgkey":"y"}', { status: 200, headers: jsonHeaders() }))],
    ["invalid rescode", () => Promise.resolve(new Response('{"resmsg":"x","fgkey":"y"}', { status: 200, headers: jsonHeaders() }))],
    ["invalid resmsg", () => Promise.resolve(new Response('{"rescode":"0000","resmsg":1,"fgkey":"y"}', { status: 200, headers: jsonHeaders() }))],
    ["invalid fgkey", () => Promise.resolve(new Response('{"rescode":"0000","resmsg":"x","fgkey":""}', { status: 200, headers: jsonHeaders() }))],
    ["provider non-success", () => Promise.resolve(new Response('{"rescode":"9999","resmsg":"x","fgkey":"y"}', { status: 200, headers: jsonHeaders() }))],
  ])("maps post-contact %s to OUTCOME_UNKNOWN without a second fetch", async (_label, response) => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(response);

    await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    const payment = await onlyPayment(session.sessionId);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.OUTCOME_UNKNOWN);
    expect(payment.initiationOutputKind).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the Eximbay OUTCOME_UNKNOWN transition guarded when durable output appears first", async () => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(async () => {
      const payment = await onlyPayment(session.sessionId);
      await db.payment.update({
        where: { id: payment.id },
        data: {
          initiationOutputKind: PaymentInitiationOutputKind.READY,
          initiationCompletedAt: new Date(),
        },
      });
      return new Response("{}", { status: 503, headers: jsonHeaders() });
    });

    await expect(initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
    });
  });

  it.each([
    ["CONTACTED without output", null, "inProgress"],
    ["durable READY", PaymentInitiationOutputKind.READY, "ready"],
  ])("does not recontact an existing %s attempt", async (_label, output, expectedKind) => {
    const session = await createUsSession(ctx);
    const existing = await createExistingAuthorizedPayment(session, PaymentMode.SANDBOX);
    await db.payment.update({
      where: { id: existing.id },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        contactStartedAt: output
          ? new Date()
          : new Date(Date.now() - EXIMBAY_READY_TOTAL_DEADLINE_MS - 1_000),
        initiationOutputKind: output,
        initiationCompletedAt: output ? new Date() : null,
      },
    });
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));

    const result = await initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl);

    expect(result.initiateResult.kind).toBe(expectedKind);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("concurrent same-checkout callers commit at most one fetch and reuse durable READY", async () => {
    const session = await createUsSession(ctx);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));
    const bothPrepared = rendezvous(2);

    const results = await Promise.all([
      initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl, bothPrepared),
      initiate(session.sessionId, PaymentMode.SANDBOX, fetchImpl, bothPrepared),
    ]);

    expect(results[0]?.paymentId).toBe(results[1]?.paymentId);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.initiateResult.kind)).toEqual(["ready", "ready"]);
  });

  async function initiate(
    sessionId: string,
    mode: PaymentMode,
    fetchImpl: EximbayReadyFetch,
    afterPrepared?: () => void | Promise<void>,
    override: Record<string, string | undefined> = {},
  ) {
    return initiatePaymentAttempt(db, {
      sessionId,
      userId: ctx.userId,
      adapterContext: adapterContext(mode),
      eximbayReady: {
        env: { ...syntheticEnv(mode), ...override },
        fetchImpl,
        afterPrepared,
      },
    });
  }
});

function rendezvous(expected: number): () => Promise<void> {
  let arrived = 0;
  let release: () => void = () => { throw new Error("Rendezvous was not initialized"); };
  const released = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === expected) release();
    await released;
  };
}

function adapterContext(mode: PaymentMode): ProviderFactoryContext {
  return {
    provider: PaymentProvider.EXIMBAY,
    mode,
    market: "US",
    method: PaymentMethod.CARD,
    currency: "USD",
    ruleId: "synthetic.eximbay.s2",
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "test-only dormant direct seam" },
  };
}

function syntheticEnv(mode: PaymentMode): Record<string, string | undefined> {
  const pair = mode === PaymentMode.SANDBOX
    ? { EXIMBAY_SANDBOX_API_KEY: API_KEY, EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid" }
    : { EXIMBAY_LIVE_API_KEY: API_KEY, EXIMBAY_LIVE_MID: "synthetic-live-mid" };
  return { ...pair, PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/" };
}

async function createExistingAuthorizedPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
  mode: PaymentMode,
) {
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode,
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
      routingRuleId: "synthetic.eximbay.s2",
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId: syntheticEximbayProviderOrderId(),
      idempotencyKey: `synthetic-existing:${randomUUID()}`,
      contactIntentAt: new Date(),
    },
  });
}

async function updateSessionForPayment(
  paymentId: string,
  data: { totalAmount?: number; marketCode?: string; currency?: string },
) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return db.checkoutSession.update({ where: { id: payment.checkoutSessionId }, data });
}

function requireBody(init: RequestInit | undefined): string {
  if (typeof init?.body === "string") return init.body;
  throw new Error("Expected serialized READY body");
}

function successResponse(): Response {
  return new Response(JSON.stringify({
    rescode: "0000",
    resmsg: "synthetic",
    fgkey: "synthetic-ready-fgkey",
  }), { status: 200, headers: jsonHeaders() });
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function tooManyChunksResponse(): Response {
  let count = 0;
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (count > 65_536) return controller.close();
      count += 1;
      controller.enqueue(Uint8Array.of(0x20));
    },
  });
  return new Response(body, { status: 200, headers: jsonHeaders() });
}

function invalidChunkResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      Reflect.apply(controller.enqueue.bind(controller), undefined, ["not-a-byte-chunk"]);
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: jsonHeaders() });
}

function failingStreamResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => controller.error(new Error("synthetic stream failure")),
  });
  return new Response(body, { status: 200, headers: jsonHeaders() });
}

async function ensureUsMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
    create: { code: "US", currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
  });
  await db.market.upsert({
    where: { code: "JP" },
    update: { currency: "JPY", shippableCountries: [ShippingCountry.JP], defaultLocale: "ja", isActive: true },
    create: { code: "JP", currency: "JPY", shippableCountries: [ShippingCountry.JP], defaultLocale: "ja", isActive: true },
  });
}

async function createUsSession(ctx: TestContext, recipientName = "Synthetic Shipping Recipient") {
  const style = await db.wigStyle.create({
    data: {
      name: `EX2B2 S2 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/ex2b2-s2.png",
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
    select: { id: true },
  });
  ctx.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: 100,
      stock: 5,
      sku: `EX2B2-S2-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "US", amount: 100 } },
    },
    select: { id: true },
  });
  ctx.variantIds.push(variant.id);
  await db.cartItem.create({
    data: { userId: ctx.userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: ctx.userId,
    marketCode: "US",
    shipping: shipping(recipientName),
  });
}

function shipping(recipientName: string): CheckoutShippingInput {
  return {
    recipientName,
    phone: "+1-202-555-0100",
    country: ShippingCountry.US,
    postalCode: "10001",
    administrativeArea: "NY",
    city: "New York",
    addressLine1: "1 Test Avenue",
  };
}

async function onlyPayment(sessionId: string) {
  return db.payment.findFirstOrThrow({ where: { checkoutSessionId: sessionId } });
}

async function cleanup(ctx: TestContext): Promise<void> {
  const sessions = await db.checkoutSession.findMany({ where: { userId: ctx.userId }, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: ctx.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: ctx.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: ctx.styleIds } } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}
