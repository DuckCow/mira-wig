import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import {
  materializeTrustedEximbaySdkWire,
  type EximbayReadyContactPlanCore,
  type TrustedEximbayReadySuccess,
} from "../ready-kernel";
import {
  consumeFreshEximbayReadyAuthority,
  executePreparedEximbayReadyContact,
  prepareEximbayReadyContact,
  type FreshEximbayReadyAuthority,
} from "../ready-contact";
import { EXIMBAY_READY_TOTAL_DEADLINE_MS, type EximbayReadyFetch } from "../ready-http";
import { PaymentMethod } from "@/lib/payment/providers/routing";

const API_KEY = "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG";
const LIVE_API_KEY = "SYNTHETIC_EXIMBAY_LIVE_API_KEY_DO_NOT_LOG";
const BUYER_NAME = "SYNTHETIC_BUYER_NAME_DO_NOT_LOG";
const BUYER_EMAIL = "SYNTHETIC_BUYER_EMAIL_DO_NOT_LOG@example.test";

interface TestContext {
  readonly userId: string;
  readonly sessionIds: string[];
}

describe("EX2B2-S2 one-attempt READY HTTP boundary", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    vi.useRealTimers();
    const suffix = randomUUID().replaceAll("-", "");
    ctx = { userId: `ex2b2_http_user_${suffix}`, sessionIds: [] };
    await ensureUsMarket();
    await db.user.create({
      data: { id: ctx.userId, name: BUYER_NAME, email: BUYER_EMAIL },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db.payment.deleteMany({ where: { checkoutSessionId: { in: ctx.sessionIds } } });
    await db.checkoutSession.deleteMany({ where: { id: { in: ctx.sessionIds } } });
    await db.user.deleteMany({ where: { id: ctx.userId } });
  });

  it("performs one exact POST with same-mode Basic auth and streams success into fresh authority", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.SANDBOX);
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const consoleSpies = spyOnConsole();
    const fetchImpl: EximbayReadyFetch = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(jsonResponse("0000", "synthetic-ready-fgkey"));
    };
    const prepared = await prepare(payment, fetchImpl, sandboxEnv());
    expect(Object.keys(prepared)).toEqual([]);
    expect(JSON.stringify(prepared)).toBe("{}");
    expect(JSON.stringify(prepared)).not.toContain(API_KEY);

    const result = await executePreparedEximbayReadyContact(prepared);

    expect(result.kind).toBe("admittedSuccess");
    if (result.kind !== "admittedSuccess") throw new Error("Expected admitted READY success");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://api-test.eximbay.com/v1/payments/ready");
    expect(calls[0]?.init).toMatchObject({ method: "POST", redirect: "error" });
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`${API_KEY}:`, "utf8").toString("base64")}`,
      "Content-Type": "application/json",
    });
    expect(calls[0]?.init?.body).toEqual(expect.stringContaining(`"order_id":"${payment.providerOrderId}"`));
    const sdk = consumeFreshEximbayReadyAuthority(
      result.freshAuthority,
      materializeTrustedEximbaySdkWire,
    );
    expect(sdk).toMatchObject({
      fgkey: "synthetic-ready-fgkey",
      payment: { order_id: payment.providerOrderId, payment_method: "P000" },
    });
    expect(Object.keys(result.freshAuthority)).toEqual([]);
    expect(JSON.stringify(result.freshAuthority)).toBe("{}");
    expect(JSON.stringify(result)).not.toContain("synthetic-ready-fgkey");
    expect(JSON.stringify(result)).not.toContain(BUYER_NAME);
    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    await expect(executePreparedEximbayReadyContact(prepared)).rejects.toMatchObject({
      code: "PREPARED_CONTACT_ALREADY_EXECUTED",
    });
    expect(calls).toHaveLength(1);
    consoleSpies.forEach((spy) => spy.mockRestore());
  });

  it("consumes the exact prepared authority before a transport failure and never fetches again", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.SANDBOX);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.reject(new Error("synthetic failure")));
    const prepared = await prepare(payment, fetchImpl, sandboxEnv());

    await expect(executePreparedEximbayReadyContact(prepared)).resolves.toEqual({ kind: "notAdmitted" });
    await expect(executePreparedEximbayReadyContact(prepared)).rejects.toMatchObject({
      code: "PREPARED_CONTACT_ALREADY_EXECUTED",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a structural copy of prepared authority before transport", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.SANDBOX);
    const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(jsonResponse("0000", "unused")));
    const prepared = await prepare(payment, fetchImpl, sandboxEnv());

    await expect(Reflect.apply(executePreparedEximbayReadyContact, undefined, [{ ...prepared }]))
      .rejects.toMatchObject({ code: "UNTRUSTED_PREPARED_CONTACT" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects copied authority and cross-plan success substitution", async () => {
    const first = await executeSuccess(await createAuthorizedPayment(ctx, PaymentMode.SANDBOX));
    const second = await executeSuccess(await createAuthorizedPayment(ctx, PaymentMode.SANDBOX));
    const firstPair = exactPair(first);
    const secondPair = exactPair(second);

    expect(() => Reflect.apply(consumeFreshEximbayReadyAuthority, undefined, [
      { ...first },
      materializeTrustedEximbaySdkWire,
    ])).toThrowError("UNTRUSTED_FRESH_AUTHORITY");
    expect(() => Reflect.apply(materializeTrustedEximbaySdkWire, undefined, [
      { ...firstPair.plan },
      firstPair.success,
    ])).toThrowError("UNTRUSTED_READY_CONTACT_PLAN");
    expect(() => materializeTrustedEximbaySdkWire(firstPair.plan, secondPair.success))
      .toThrowError("READY_SUCCESS_PLAN_MISMATCH");
  });

  it("uses only the LIVE endpoint and LIVE credential pair for a LIVE persisted attempt", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.LIVE);
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl: EximbayReadyFetch = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(jsonResponse("0000", "synthetic-live-ready-fgkey"));
    };
    const prepared = await prepare(payment, fetchImpl, {
      EXIMBAY_LIVE_API_KEY: LIVE_API_KEY,
      EXIMBAY_LIVE_MID: "synthetic-live-mid",
      EXIMBAY_SANDBOX_API_KEY: "wrong-mode-key-must-not-be-used",
      EXIMBAY_SANDBOX_MID: "wrong-mode-mid-must-not-be-used",
      PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
    });

    await expect(executePreparedEximbayReadyContact(prepared)).resolves.toMatchObject({
      kind: "admittedSuccess",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://api.eximbay.com/v1/payments/ready");
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`${LIVE_API_KEY}:`, "utf8").toString("base64")}`,
      "Content-Type": "application/json",
    });
    const body = requireRequestBody(calls[0]?.init);
    expect(body).toContain('"mid":"synthetic-live-mid"');
    expect(body).not.toContain("wrong-mode-mid-must-not-be-used");
  });

  it("aborts at the total 15-second deadline without retry", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.SANDBOX);
    const fetchImpl = vi.fn<EximbayReadyFetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true });
    }));
    const prepared = await prepare(payment, fetchImpl, sandboxEnv());
    vi.useFakeTimers();

    const pending = executePreparedEximbayReadyContact(prepared);
    await vi.advanceTimersByTimeAsync(EXIMBAY_READY_TOTAL_DEADLINE_MS);

    await expect(pending).resolves.toEqual({ kind: "notAdmitted" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const signal = fetchImpl.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the unread response stream on early S1 non-2xx admission failure", async () => {
    const payment = await createAuthorizedPayment(ctx, PaymentMode.SANDBOX);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull: () => undefined,
      cancel,
    });
    const fetchImpl: EximbayReadyFetch = () => Promise.resolve(new Response(body, {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));
    const prepared = await prepare(payment, fetchImpl, sandboxEnv());

    await expect(executePreparedEximbayReadyContact(prepared)).resolves.toEqual({ kind: "notAdmitted" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  function prepare(
    payment: Awaited<ReturnType<typeof createAuthorizedPayment>>,
    fetchImpl: EximbayReadyFetch,
    env: Record<string, string>,
  ) {
    return prepareEximbayReadyContact(db, {
      paymentId: payment.id,
      checkoutSessionId: payment.checkoutSessionId,
      userId: ctx.userId,
      mode: payment.mode,
      method: PaymentMethod.CARD,
      env,
      fetchImpl,
    });
  }

  async function executeSuccess(payment: Awaited<ReturnType<typeof createAuthorizedPayment>>) {
    const prepared = await prepare(payment, () => Promise.resolve(jsonResponse("0000", randomUUID())), sandboxEnv());
    const result = await executePreparedEximbayReadyContact(prepared);
    if (result.kind !== "admittedSuccess") throw new Error("Expected admitted READY success");
    return result.freshAuthority;
  }
});

function exactPair(authority: FreshEximbayReadyAuthority): {
  plan: EximbayReadyContactPlanCore;
  success: TrustedEximbayReadySuccess;
} {
  return consumeFreshEximbayReadyAuthority(authority, (plan, success) => ({ plan, success }));
}

async function createAuthorizedPayment(ctx: TestContext, mode: PaymentMode) {
  const session = await db.checkoutSession.create({
    data: {
      userId: ctx.userId,
      marketCode: "US",
      currency: "USD",
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: 100,
      totalAmount: 100,
      expiresAt: new Date(Date.now() + 60_000),
      submittedAt: new Date(),
    },
  });
  ctx.sessionIds.push(session.id);
  return db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.EXIMBAY,
      mode,
      routingRuleId: "synthetic.eximbay.ready-http",
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: 100,
      currency: "USD",
      providerOrderId: syntheticEximbayProviderOrderId(),
      idempotencyKey: `synthetic:${randomUUID()}`,
      contactIntentAt: new Date(),
    },
  });
}

function sandboxEnv(): Record<string, string> {
  return {
    EXIMBAY_SANDBOX_API_KEY: API_KEY,
    EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
    PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
  };
}

function jsonResponse(rescode: string, fgkey: string): Response {
  return new Response(JSON.stringify({ rescode, resmsg: "synthetic", fgkey }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requireRequestBody(init: RequestInit | undefined): string {
  if (typeof init?.body === "string") return init.body;
  throw new Error("Expected serialized READY request body");
}

async function ensureUsMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", isActive: true },
    create: {
      code: "US",
      currency: "USD",
      shippableCountries: ["US"],
      defaultLocale: "en",
      isActive: true,
    },
  });
}

function spyOnConsole() {
  return [
    vi.spyOn(console, "log").mockImplementation(() => undefined),
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
  ];
}
