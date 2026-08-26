import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode as PersistedPaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { createMockPaymentProvider } from "@/lib/payment/providers/mock";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  PAYMENT_PUBLIC_ORIGIN,
  credentialChecksForProvider,
} from "@/lib/payment/providers/credentials";
import { TOSS_SANDBOX_EXTERNAL_ENABLED } from "@/lib/payment/providers/factory";
import { EXIMBAY_CHECKOUT_SANDBOX_ENABLED } from "@/lib/payment/eximbay/checkout-activation";
import { ProviderResolveException } from "@/lib/payment/providers/resolve";
import { createTossSandboxPaymentProvider, type TossConfirmHttpRequest } from "@/lib/payment/providers/toss/adapter";
import { deriveTossOrderId } from "@/lib/payment/providers/toss/order-id";
import {
  NoEligibleProviderError,
  PROVIDER_REGISTRY,
  PaymentMethod,
  PaymentMode,
  liveGuardForProviderContext,
  providerForMarket,
} from "@/lib/payment/providers/routing";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderErrorCode,
  ProviderFailureClass,
  ProviderFactoryContext,
} from "@/lib/payment/providers/contract";
import type {
  PaymentConfirmFacts,
  PaymentConfirmInput,
  PaymentConfirmResult,
  PaymentInitiateResult,
  PaymentProvider as PaymentProviderPort,
} from "@/lib/payment/providers/types";

type TestProviderResolver = (input: ProviderFactoryContext) => PaymentProviderPort;
interface StorefrontBoundary {
  marketCookie: string | undefined;
  headers: Headers;
}
interface S3ActionTestControl {
  attempt: ((...args: unknown[]) => Promise<unknown>) | null;
  materialize: ((...args: unknown[]) => Promise<unknown>) | null;
}
const providerResolver = vi.hoisted(() => vi.fn<TestProviderResolver>());
const storefrontBoundary = vi.hoisted<StorefrontBoundary>(() => ({
  marketCookie: "KR",
  headers: new Headers(),
}));
const s3ActionControl = vi.hoisted<S3ActionTestControl>(() => ({
  attempt: null,
  materialize: null,
}));

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: (name: string) => name === "mira-market" && storefrontBoundary.marketCookie
      ? { name, value: storefrontBoundary.marketCookie }
      : undefined,
  })),
  headers: vi.fn(() => Promise.resolve(storefrontBoundary.headers)),
}));
vi.mock("@/lib/market/active-market", () => ({
  NoActiveMarketException: class NoActiveMarketException extends Error {},
  getActiveMarketCodes: vi.fn().mockResolvedValue(["KR", "US", "JP"]),
}));
vi.mock("@/lib/payment/providers/resolve", async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import("@/lib/payment/providers/resolve")>()),
    resolveConfirmationProvider: providerResolver,
  };
});
vi.mock("@/lib/payment/providers/initiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/initiation")>()),
  resolveInitiationProvider: providerResolver,
}));
vi.mock("@/lib/payment/attempt/initiate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/attempt/initiate")>();
  return {
    ...actual,
    initiatePaymentAttemptWithTransientAuthority: (
      client: Parameters<typeof actual.initiatePaymentAttemptWithTransientAuthority>[0],
      input: Parameters<typeof actual.initiatePaymentAttemptWithTransientAuthority>[1],
    ) => s3ActionControl.attempt
      ? s3ActionControl.attempt(client, input)
      : actual.initiatePaymentAttemptWithTransientAuthority(client, input),
  };
});
vi.mock("@/lib/payment/eximbay/sdk-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/eximbay/sdk-handoff")>();
  return {
    ...actual,
    materializeFreshEximbayReadyHandoff: (
      paymentId: Parameters<typeof actual.materializeFreshEximbayReadyHandoff>[0],
      authority: Parameters<typeof actual.materializeFreshEximbayReadyHandoff>[1],
    ) => s3ActionControl.materialize
      ? s3ActionControl.materialize(paymentId, authority)
      : actual.materializeFreshEximbayReadyHandoff(paymentId, authority),
  };
});
vi.mock("@/lib/payment/complete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/complete")>();
  return { ...actual, completeFromCapture: vi.fn(actual.completeFromCapture) };
});

import { completeFromCapture } from "@/lib/payment/complete";
import { getSession } from "@/lib/session";
import {
  confirmPayment as confirmPaymentAction,
  initiatePayment as initiatePaymentAction,
  type ConfirmPaymentInput,
  type InitiatePaymentInput,
  type PaymentActionResult,
} from "../payment";

const mockGetSession = vi.mocked(getSession);
const mockResolveProvider = providerResolver;
const mockCompleteFromCapture = vi.mocked(completeFromCapture);
const ORIGINAL_MOCK_MODE = process.env.PAYMENT_MOCK_MODE;
const ORIGINAL_MOCK_FORCE_FAIL = process.env.PAYMENT_MOCK_FORCE_FAIL;
const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;
const ORIGINAL_TOSS_SANDBOX_SECRET_KEY = process.env.TOSS_SANDBOX_SECRET_KEY;
const ORIGINAL_TOSS_LIVE_SECRET_KEY = process.env.TOSS_LIVE_SECRET_KEY;
const ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED = process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
const ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED = process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
const ORIGINAL_EXIMBAY_SANDBOX_API_KEY = process.env.EXIMBAY_SANDBOX_API_KEY;
const ORIGINAL_EXIMBAY_SANDBOX_MID = process.env.EXIMBAY_SANDBOX_MID;
const ORIGINAL_PAYMENT_PUBLIC_ORIGIN = process.env.PAYMENT_PUBLIC_ORIGIN;
const ORIGINAL_TOSS_LIVE_ENABLED = PROVIDER_REGISTRY.TOSS.liveEnabled;

function confirmPayment(
  checkoutSessionId: string,
  _ignoredLegacyProvider: PaymentProvider,
  input: ConfirmPaymentInput = {},
) {
  return confirmPaymentAction(checkoutSessionId, input);
}

async function initiatePayment(
  checkoutSessionId: string,
  input: InitiatePaymentInput = {},
): Promise<PaymentActionResult> {
  const execution = await initiatePaymentAction(checkoutSessionId, input);
  expect(execution.channel).toBe("DURABLE_ONLY");
  if (execution.channel !== "DURABLE_ONLY") {
    throw new Error("Unexpected fresh Eximbay handoff in durable action regression");
  }
  return execution.durable;
}

function expectProviderNeutralNonSuccess(result: PaymentActionResult): void {
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected a non-success payment action result");
  expect("provider" in result).toBe(false);
  expect(result).not.toHaveProperty("redirectTo");
  const nestedValues = collectStringValues(result);
  for (const providerName of ["TOSS", "PAYPAL", "MOCK", "EXIMBAY"]) {
    for (const value of nestedValues) {
      expect(value.toLowerCase()).not.toContain(providerName.toLowerCase());
    }
  }
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
}

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
  marketCode?: MarketCode;
}

interface PendingPaymentOptions {
  adapterExecutionKind?: PaymentAdapterExecutionKind | null;
  mode?: PersistedPaymentMode;
  provider?: PaymentProvider;
  providerRef?: string;
  status?: PaymentAttemptStatus;
  persistedOutput?: boolean;
}

interface FakeConfirmOptions {
  inputs?: PaymentConfirmInput[];
  beforeConfirm?: (input: PaymentConfirmInput) => Promise<void>;
  error?: Error;
  facts?: PaymentConfirmFacts;
  result?: PaymentConfirmResult;
  resultForInput?: (input: PaymentConfirmInput) => PaymentConfirmResult;
}

describe("payment actions", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    s3ActionControl.attempt = null;
    s3ActionControl.materialize = null;
    mockResolveProvider.mockReset();
    process.env.PAYMENT_MOCK_MODE = "success";
    delete process.env.PAYMENT_MOCK_FORCE_FAIL;
    delete process.env.PAYMENT_MODE;
    delete process.env.TOSS_SANDBOX_SECRET_KEY;
    delete process.env.TOSS_LIVE_SECRET_KEY;
    delete process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
    delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
    delete process.env.EXIMBAY_SANDBOX_API_KEY;
    delete process.env.EXIMBAY_SANDBOX_MID;
    delete process.env.PAYMENT_PUBLIC_ORIGIN;
    storefrontBoundary.marketCookie = "KR";
    storefrontBoundary.headers = new Headers({
      "x-mira-context-attested": "proxy-v1",
      "x-mira-pathname": "/checkout",
      "x-mira-request-target": "/checkout",
    });
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
    mockGetSession.mockResolvedValue(makeSession(ctx.userId));
    mockResolveProvider.mockImplementation((input) => createMockPaymentProvider(input.provider));
  });

  afterEach(async () => {
    s3ActionControl.attempt = null;
    s3ActionControl.materialize = null;
    mockResolveProvider.mockImplementation((input) => createMockPaymentProvider(input.provider));
    PROVIDER_REGISTRY.TOSS.liveEnabled = ORIGINAL_TOSS_LIVE_ENABLED;
    restoreEnv("TOSS_SANDBOX_SECRET_KEY", ORIGINAL_TOSS_SANDBOX_SECRET_KEY);
    restoreEnv("TOSS_LIVE_SECRET_KEY", ORIGINAL_TOSS_LIVE_SECRET_KEY);
    restoreEnv("TOSS_SANDBOX_EXTERNAL_ENABLED", ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED);
    restoreEnv(EXIMBAY_CHECKOUT_SANDBOX_ENABLED, ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED);
    restoreEnv(EXIMBAY_SANDBOX_API_KEY, ORIGINAL_EXIMBAY_SANDBOX_API_KEY);
    restoreEnv(EXIMBAY_SANDBOX_MID, ORIGINAL_EXIMBAY_SANDBOX_MID);
    restoreEnv(PAYMENT_PUBLIC_ORIGIN, ORIGINAL_PAYMENT_PUBLIC_ORIGIN);
    restorePaymentMode();
    restoreMockMode();
    restoreEnv("PAYMENT_MOCK_FORCE_FAIL", ORIGINAL_MOCK_FORCE_FAIL);
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
    expect(payment.mode).toBe(PersistedPaymentMode.SANDBOX);
    expect(payment.idempotencyKey).toMatch(`initiate:${session.sessionId}:`);
    expect(mockResolveProvider).toHaveBeenCalledWith(expectedResolverContext());
  });

  it("wraps ordinary initiation in DURABLE_ONLY without changing the durable result", async () => {
    const session = await submitSessionWithOneLine(ctx);

    const execution = await initiatePaymentAction(session.sessionId);

    expect(execution).toMatchObject({
      channel: "DURABLE_ONLY",
      durable: {
        kind: "READY",
        success: true,
        provider: PaymentProvider.TOSS,
      },
    });
  });

  it("returns only the exact fresh Eximbay package after the transient attempt owner", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const paymentId = `synthetic_s3_payment_${randomUUID()}`;
    const authority = Object.freeze({ secretAuthoritySentinel: "NEVER_SERIALIZE_AUTHORITY" });
    const handoff = syntheticS3Handoff(paymentId);
    s3ActionControl.attempt = () => Promise.resolve({
      channel: "FRESH_EXIMBAY_READY",
      durable: {
        paymentId,
        provider: PaymentProvider.EXIMBAY,
        status: PaymentAttemptStatus.INITIATED,
        initiateResult: { kind: "ready" },
      },
      freshAuthority: authority,
    });
    const materialize = vi.fn((..._args: unknown[]) => Promise.resolve(handoff));
    s3ActionControl.materialize = materialize;

    const execution = await initiatePaymentAction(session.sessionId);

    expect(execution).toEqual({
      channel: "FRESH_EXIMBAY_READY",
      durable: {
        kind: "READY",
        success: true,
        paymentId,
        provider: PaymentProvider.EXIMBAY,
      },
      transientHandoff: handoff,
    });
    expect(materialize).toHaveBeenCalledWith(paymentId, authority);
    const serialized = JSON.stringify(execution);
    expect(serialized).not.toContain("NEVER_SERIALIZE_AUTHORITY");
    expect(serialized).not.toMatch(/freshAuthority|prepared(?:Contact|Plan|Success)|Authorization|api[_-]?key|providerRef|providerPaymentKey|statusFgkey|callbackFgkey/iu);
  });

  it("keeps durable Eximbay READY re-entry durable-only and skips handoff materialization", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const paymentId = `synthetic_s3_reentry_${randomUUID()}`;
    s3ActionControl.attempt = () => Promise.resolve({
      channel: "DURABLE_ONLY",
      durable: {
        paymentId,
        provider: PaymentProvider.EXIMBAY,
        status: PaymentAttemptStatus.INITIATED,
        initiateResult: { kind: "ready" },
      },
    });
    const materialize = vi.fn((..._args: unknown[]) => Promise.resolve(syntheticS3Handoff(paymentId)));
    s3ActionControl.materialize = materialize;

    await expect(initiatePaymentAction(session.sessionId)).resolves.toEqual({
      channel: "DURABLE_ONLY",
      durable: {
        kind: "READY",
        success: true,
        paymentId,
        provider: PaymentProvider.EXIMBAY,
      },
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it("falls back to durable Eximbay READY without leaking materialization failure detail", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const paymentId = `synthetic_s3_failure_${randomUUID()}`;
    const authority = Object.freeze({ secretAuthoritySentinel: "NEVER_SERIALIZE_FAILURE_AUTHORITY" });
    const failureSentinel = `S3_INTERNAL_FAILURE_${randomUUID()}`;
    s3ActionControl.attempt = () => Promise.resolve({
      channel: "FRESH_EXIMBAY_READY",
      durable: {
        paymentId,
        provider: PaymentProvider.EXIMBAY,
        status: PaymentAttemptStatus.INITIATED,
        initiateResult: { kind: "ready" },
      },
      freshAuthority: authority,
    });
    s3ActionControl.materialize = () => Promise.reject(new Error(failureSentinel));

    const execution = await initiatePaymentAction(session.sessionId);

    expect(execution).toEqual({
      channel: "DURABLE_ONLY",
      durable: {
        kind: "READY",
        success: true,
        paymentId,
        provider: PaymentProvider.EXIMBAY,
      },
    });
    expect(JSON.stringify(execution)).not.toMatch(new RegExp(`${failureSentinel}|NEVER_SERIALIZE_FAILURE_AUTHORITY`, "u"));
  });

  it("keeps owned-session admission stable across remembered, absent, transient, and hostile storefront context", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const provider = createMockPaymentProvider(PaymentProvider.TOSS);
    const initiate = vi.fn((input: Parameters<typeof provider.initiate>[0]) => provider.initiate(input));
    mockResolveProvider.mockReturnValue({ ...provider, initiate });
    storefrontBoundary.marketCookie = "JP";
    storefrontBoundary.headers = new Headers({
      "x-mira-context-attested": "proxy-v1",
      "x-mira-context-source": "TRANSIENT_PUBLIC",
      "x-mira-transient-market": "US",
      "x-mira-transient-locale": "en",
      "x-mira-geo-country": "JP",
      "x-mira-route-market": "JP",
    });

    const first = await initiatePayment(session.sessionId);
    storefrontBoundary.marketCookie = undefined;
    storefrontBoundary.headers = new Headers({
      "x-mira-route-market": "US",
      "x-vercel-ip-country": "US",
    });
    const second = await initiatePayment(session.sessionId);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first).toMatchObject(second);
    expect(mockResolveProvider).toHaveBeenCalledTimes(2);
    expect(mockResolveProvider.mock.calls).toEqual([
      [expectedResolverContext()],
      [expectedResolverContext()],
    ]);
    expect(initiate).toHaveBeenCalledTimes(1);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("routes from the persisted session Market, currency, and amount instead of browser context", async () => {
    const session = await submitSessionForMarket(ctx, MarketCode.US);
    storefrontBoundary.marketCookie = "KR";
    storefrontBoundary.headers = new Headers({
      "x-mira-context-attested": "hostile",
      "x-mira-route-market": "KR",
      "x-vercel-ip-country": "JP",
    });

    const result = await initiatePayment(session.sessionId);

    expect(result).toMatchObject({ success: true, provider: PaymentProvider.PAYPAL });
    expect(mockResolveProvider).toHaveBeenCalledWith(expectedResolverContext({
      provider: PaymentProvider.PAYPAL,
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
      ruleId: "d1a.us.paypal_wallet.usd",
    }));
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      provider: PaymentProvider.PAYPAL,
      amount: 2_999,
      currency: "USD",
    });
  });

  it.each([
    ["activation absent", false],
    ["credentials present without activation", true],
  ])("fails direct US CARD before Payment creation when Eximbay %s", async (_label, credentialsPresent) => {
    const session = await submitSessionForMarket(ctx, MarketCode.US);
    if (credentialsPresent) {
      process.env[EXIMBAY_SANDBOX_API_KEY] = "synthetic-api-key";
      process.env[EXIMBAY_SANDBOX_MID] = "synthetic-mid";
      process.env[PAYMENT_PUBLIC_ORIGIN] = "https://payments.example.test";
    }
    mockResolveProvider.mockImplementation((input) => {
      expect(input).toMatchObject({
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        market: MarketCode.US,
        method: PaymentMethod.CARD,
        currency: "USD",
        ruleId: "cfa.us.card.usd",
      });
      throw new ProviderResolveException(
        "SANDBOX_EXTERNAL_MISCONFIGURED",
        PaymentProvider.EXIMBAY,
        PaymentMode.SANDBOX,
        "Synthetic default-off Eximbay resolution",
      );
    });

    const execution = await initiatePaymentAction(session.sessionId, { method: PaymentMethod.CARD });

    expect(execution).toEqual({
      channel: "DURABLE_ONLY",
      durable: {
        kind: "FAILED",
        success: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "No payment provider is available.",
        retryable: false,
      },
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("fails activated Eximbay with incomplete configuration before Payment creation", async () => {
    const session = await submitSessionForMarket(ctx, MarketCode.US);
    process.env[EXIMBAY_CHECKOUT_SANDBOX_ENABLED] = "ENABLED";
    mockResolveProvider.mockImplementation((input) => {
      expect(input.credentials).toEqual([
        { name: EXIMBAY_SANDBOX_API_KEY, required: true, present: false },
        { name: EXIMBAY_SANDBOX_MID, required: true, present: false },
        { name: PAYMENT_PUBLIC_ORIGIN, required: true, present: false },
      ]);
      throw new ProviderResolveException(
        "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
        PaymentProvider.EXIMBAY,
        PaymentMode.SANDBOX,
        "Synthetic missing Eximbay configuration",
      );
    });

    const execution = await initiatePaymentAction(session.sessionId, { method: PaymentMethod.CARD });

    expect(execution).toMatchObject({
      channel: "DURABLE_ONLY",
      durable: { kind: "FAILED", errorCode: "PROVIDER_UNAVAILABLE" },
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("reaches the installed fresh Eximbay special path from fully admitted US CARD routing without network", async () => {
    const session = await submitSessionForMarket(ctx, MarketCode.US);
    const paymentId = `synthetic_cfa_payment_${randomUUID()}`;
    const authority = Object.freeze({ authority: "SYNTHETIC_TEST_ONLY" });
    const handoff = syntheticS3Handoff(paymentId);
    s3ActionControl.attempt = (_client, input) => {
      expect(input).toMatchObject({
        sessionId: session.sessionId,
        userId: ctx.userId,
        adapterContext: {
          provider: PaymentProvider.EXIMBAY,
          mode: PaymentMode.SANDBOX,
          market: MarketCode.US,
          method: PaymentMethod.CARD,
          currency: "USD",
          ruleId: "cfa.us.card.usd",
        },
      });
      return Promise.resolve({
        channel: "FRESH_EXIMBAY_READY",
        durable: {
          paymentId,
          provider: PaymentProvider.EXIMBAY,
          status: PaymentAttemptStatus.INITIATED,
          initiateResult: { kind: "ready" },
        },
        freshAuthority: authority,
      });
    };
    s3ActionControl.materialize = () => Promise.resolve(handoff);

    await expect(initiatePaymentAction(session.sessionId, { method: PaymentMethod.CARD })).resolves.toEqual({
      channel: "FRESH_EXIMBAY_READY",
      durable: {
        kind: "READY",
        success: true,
        paymentId,
        provider: PaymentProvider.EXIMBAY,
      },
      transientHandoff: handoff,
    });
    expect(mockResolveProvider).not.toHaveBeenCalled();
  });

  it("keeps owned sessions in different Markets independently payable", async () => {
    const kr = await submitSessionForMarket(ctx, MarketCode.KR);
    await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
    const us = await submitSessionForMarket(ctx, MarketCode.US);
    storefrontBoundary.marketCookie = "JP";

    const [krResult, usResult] = await Promise.all([
      initiatePayment(kr.sessionId),
      initiatePayment(us.sessionId),
    ]);

    expect(krResult).toMatchObject({ success: true, provider: PaymentProvider.TOSS });
    expect(usResult).toMatchObject({ success: true, provider: PaymentProvider.PAYPAL });
    await expect(paymentCount(kr.sessionId)).resolves.toBe(1);
    await expect(paymentCount(us.sessionId)).resolves.toBe(1);
  });

  it("initiate action does not expose providerRef when provider returns one", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `action_pref_${randomUUID()}`;
    mockResolveProvider.mockReturnValueOnce(fakeActionProvider({ kind: "ready", providerRef }));

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result).not.toHaveProperty("providerRef");
      expect(result.provider).toBe(PaymentProvider.TOSS);
      expect(result.paymentId).toBeTruthy();
    }
    const payment = await onlyPayment(session.sessionId);
    expect(payment.providerRef).toBe(providerRef);
    expect(payment.providerPaymentKey).toBeNull();
  });

  it("returns a discriminated IN_PROGRESS result for output-less provider initiation", async () => {
    const session = await submitSessionWithOneLine(ctx);
    mockResolveProvider.mockReturnValueOnce(fakeActionProvider({ kind: "inProgress" }));

    const result = await initiatePayment(session.sessionId);
    const payment = await onlyPayment(session.sessionId);

    expect(result).toEqual({
      kind: "IN_PROGRESS",
      success: false,
      errorCode: "ATTEMPT_IN_PROGRESS",
      error: "Payment initiation is still being processed.",
      retryable: false,
      paymentId: payment.id,
    });
    expectProviderNeutralNonSuccess(result);
    expect(payment).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: null,
    });
  });

  it("contains a hostile initiation exception at the action and persistence boundaries", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const sentinel = `initiate-secret-${randomUUID()}?token=${randomUUID()}`;
    const initiate = vi.fn().mockRejectedValue(new Error(sentinel));
    mockResolveProvider.mockReturnValueOnce({
      ...createMockPaymentProvider(PaymentProvider.TOSS),
      initiate,
    });

    const result = await initiatePayment(session.sessionId);
    const payment = await onlyPayment(session.sessionId);
    const serialized = JSON.stringify({ result, payment });

    expect(result).toEqual({
      kind: "OUTCOME_UNKNOWN",
      success: false,
      errorCode: "ATTEMPT_OUTCOME_UNKNOWN",
      error: "The payment outcome is unresolved and requires review.",
      retryable: false,
    });
    expectProviderNeutralNonSuccess(result);
    expect(result).not.toHaveProperty("redirectTo");
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "PROVIDER_INITIATE_OUTCOME_UNKNOWN",
      errorMessage: "Provider initiation outcome is unresolved.",
    });
    expect(serialized).not.toContain(sentinel);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(0);
  });

  it("maps provider resolver failures to unavailable without leaking details", async () => {
    const session = await submitSessionWithOneLine(ctx);
    mockResolveProvider.mockImplementation((input) => {
      if (input.provider !== PaymentProvider.MOCK) return createMockPaymentProvider(input.provider);
      throw new ProviderResolveException(
        "MOCK_PROVIDER_LIVE",
        input.provider,
        input.mode,
        "internal live adapter detail",
      );
    });

    const result = await initiatePayment(session.sessionId, { method: PaymentMethod.MOCK });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
      expect(result.error).not.toContain("MOCK_PROVIDER_LIVE");
      expect(result.error).not.toContain("internal live adapter detail");
    }
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("maps half-configured SANDBOX external resolver failures to sanitized unavailable", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const internalDetail = `internal ${TOSS_SANDBOX_EXTERNAL_ENABLED} partial config detail`;
    mockResolveProvider.mockImplementation((input) => {
      throw new ProviderResolveException(
        "SANDBOX_EXTERNAL_MISCONFIGURED",
        input.provider,
        input.mode,
        internalDetail,
      );
    });

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
      expect(result.error).not.toContain("SANDBOX_EXTERNAL_MISCONFIGURED");
      expect(result.error).not.toContain(TOSS_SANDBOX_EXTERNAL_ENABLED);
      expect(result.error).not.toContain(internalDetail);
    }
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("maps invalid SANDBOX deployment opt-in resolver failures without leaking env details", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const invalidValue = "almost-enabled";
    process.env.TOSS_SANDBOX_EXTERNAL_ENABLED = invalidValue;
    mockResolveProvider.mockImplementation((input) => {
      throw new ProviderResolveException(
        "SANDBOX_EXTERNAL_CONFIG_INVALID",
        input.provider,
        input.mode,
        `invalid ${TOSS_SANDBOX_EXTERNAL_ENABLED}: ${invalidValue}`,
      );
    });

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
      expect(result.error).not.toContain("SANDBOX_EXTERNAL_CONFIG_INVALID");
      expect(result.error).not.toContain(TOSS_SANDBOX_EXTERNAL_ENABLED);
      expect(result.error).not.toContain(invalidValue);
    }
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("PAYMENT_MODE=LIVE with empty live allowlists fails closed before creating a payment", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    const session = await submitSessionWithOneLine(ctx);

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
    }
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("invalid PAYMENT_MODE fails closed without leaking config details", async () => {
    process.env.PAYMENT_MODE = "prod";
    const session = await submitSessionWithOneLine(ctx);

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
      expect(result.error).not.toContain("prod");
      expect(result.error).not.toContain("PAYMENT_MODE");
      expect(result.error).not.toContain("PaymentModeConfigException");
    }
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("LIVE routing allowlist still fails closed at adapter resolution without a real adapter", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    PROVIDER_REGISTRY.TOSS.liveEnabled = [{ market: MarketCode.KR, method: PaymentMethod.CARD, currency: "KRW" }];
    const session = await submitSessionWithOneLine(ctx);
    mockResolveProvider.mockImplementation((input) => {
      throw new ProviderResolveException(
        "LIVE_ADAPTER_UNAVAILABLE",
        input.provider,
        input.mode,
        "internal live adapter detail",
      );
    });

    const result = await initiatePayment(session.sessionId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("No payment provider is available.");
      expect(result.error).not.toContain("LIVE_ADAPTER_UNAVAILABLE");
      expect(result.error).not.toContain("internal live adapter detail");
    }
    expect(mockResolveProvider).toHaveBeenCalledWith(expectedResolverContext({ mode: PaymentMode.LIVE }));
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
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
    const missingResult = await initiatePayment(`missing_${randomUUID()}`);
    expect(missingResult).toEqual(otherResult);
    await expect(paymentCount(expired.sessionId)).resolves.toBe(0);
    await expect(paymentCount(owned.sessionId)).resolves.toBe(0);
    mockResolveProvider.mockClear();
    await initiatePayment(owned.sessionId);
    await initiatePayment(`missing_${randomUUID()}`);
    expect(mockResolveProvider).not.toHaveBeenCalled();
  });

  it("keeps C0 Market deactivation before contact provider-free and residue-free", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const initiate = vi.fn();
    mockResolveProvider.mockReturnValueOnce({
      ...createMockPaymentProvider(PaymentProvider.TOSS),
      initiate,
    });
    await db.market.update({ where: { code: MarketCode.KR }, data: { isActive: false } });

    const result = await initiatePayment(session.sessionId);

    expect(result).toMatchObject({ success: false, errorCode: "SESSION_TERMS_STALE" });
    expect(mockResolveProvider).toHaveBeenCalledTimes(1);
    expect(initiate).not.toHaveBeenCalled();
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
  });

  it("does not reroute or recreate a persisted contacted attempt after Market deactivation", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { provider: PaymentProvider.TOSS });
    await db.market.update({ where: { code: MarketCode.KR }, data: { isActive: false } });
    storefrontBoundary.marketCookie = "US";
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toMatchObject({ success: true, provider: PaymentProvider.TOSS, paymentId: payment.id });
    expect(inputs).toEqual([expect.objectContaining({
      paymentId: payment.id,
      amount: session.totalAmount,
      currency: session.currency,
      provider: PaymentProvider.TOSS,
    })]);
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("confirm fails closed before adapter resolution when current LIVE mode meets SANDBOX attempt", async () => {
    process.env.PAYMENT_MODE = "LIVE";
    PROVIDER_REGISTRY.TOSS.liveEnabled = [{ market: MarketCode.KR, method: PaymentMethod.CARD, currency: "KRW" }];
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PAYMENT_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("Pending payment attempt is unavailable.");
    }
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(confirmKeyOf(payment.id)).resolves.toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("confirm fails closed before adapter resolution when current SANDBOX mode meets LIVE attempt", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { mode: PersistedPaymentMode.LIVE });

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PAYMENT_UNAVAILABLE");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("Pending payment attempt is unavailable.");
    }
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(confirmKeyOf(payment.id)).resolves.toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
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
    expect(mockResolveProvider).toHaveBeenLastCalledWith(expectedResolverContext());
  });

  it.each([
    {
      name: "persisted EXTERNAL now resolves MOCK",
      persisted: PaymentAdapterExecutionKind.EXTERNAL,
      resolved: PaymentAdapterExecutionKind.MOCK,
    },
    {
      name: "persisted MOCK now resolves EXTERNAL",
      persisted: PaymentAdapterExecutionKind.MOCK,
      resolved: PaymentAdapterExecutionKind.EXTERNAL,
    },
  ])("fails confirmation closed before provider contact when $name", async ({ persisted, resolved }) => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { adapterExecutionKind: persisted });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce({
      ...fakeConfirmProvider(PaymentProvider.TOSS, { inputs }),
      adapterExecutionKind: resolved,
    });

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toMatchObject({ success: false, errorCode: "PAYMENT_UNAVAILABLE" });
    expect(inputs).toHaveLength(0);
    expect(mockCompleteFromCapture).not.toHaveBeenCalled();
    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      adapterExecutionKind: persisted,
      status: PaymentAttemptStatus.INITIATED,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("allows same-identity EXTERNAL confirmation through an injected provider-free seam", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, {
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce({
      ...fakeConfirmProvider(PaymentProvider.TOSS, { inputs }),
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    });

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toMatchObject({ success: true, paymentId: payment.id });
    expect(inputs).toHaveLength(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("fails a legacy NULL adapter identity before resolver, provider contact, or completion", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { adapterExecutionKind: null });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toMatchObject({ success: false, errorCode: "PAYMENT_UNAVAILABLE" });
    expect(mockResolveProvider).not.toHaveBeenCalled();
    expect(inputs).toHaveLength(0);
    expect(mockCompleteFromCapture).not.toHaveBeenCalled();
    await expect(confirmKeyOf(payment.id)).resolves.toBeNull();
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it.each([undefined, "ENABLED"])(
    "keeps direct Eximbay confirmation forbidden when checkout activation is %s",
    async (activation) => {
      if (activation === undefined) delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
      else process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED = activation;
      const session = await submitSessionWithOneLine(ctx);
      const payment = await createPendingPayment(session, {
        provider: PaymentProvider.EXIMBAY,
        adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
      });
      mockResolveProvider.mockImplementationOnce(() => {
        throw new ProviderResolveException(
          "EXIMBAY_CONFIRM_ACTION_FORBIDDEN",
          PaymentProvider.EXIMBAY,
          PaymentMode.SANDBOX,
          "synthetic forbidden confirmation",
        );
      });

      const result = await confirmPayment(session.sessionId, PaymentProvider.EXIMBAY, {
        providerPaymentKey: providerPaymentKey(ctx),
      });

      expect(result).toMatchObject({ success: false, errorCode: "PROVIDER_UNAVAILABLE" });
      expect(mockResolveProvider).toHaveBeenCalledTimes(1);
      expect(mockCompleteFromCapture).not.toHaveBeenCalled();
      await expect(loadPayment(payment.id)).resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        providerPaymentKey: null,
      });
      await expect(orderCount(ctx.userId)).resolves.toBe(0);
    },
  );

  it("infers confirmation provider from the exact Payment and ignores hostile extra client provenance", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { provider: PaymentProvider.TOSS });
    const providerPaymentKeyValue = providerPaymentKey(ctx);
    const hostileClientInput = {
      provider: PaymentProvider.PAYPAL,
      providerPaymentKey: providerPaymentKeyValue,
    };

    const result = await confirmPaymentAction(session.sessionId, hostileClientInput);

    expect(result.success).toBe(true);
    expect(mockResolveProvider).toHaveBeenLastCalledWith(expectedResolverContext({
      provider: PaymentProvider.TOSS,
    }));
    await expect(loadPayment(payment.id)).resolves.toMatchObject({
      provider: PaymentProvider.TOSS,
      providerPaymentKey: providerPaymentKeyValue,
    });
  });

  it("confirm persists and sends the canonical provider confirm idempotency key", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `action_confirm_pref_${randomUUID()}`;
    const payment = await createPendingPayment(session, { providerRef });
    const key = providerPaymentKey(ctx);
    const inputs: PaymentConfirmInput[] = [];
    let persistedBeforeProvider: string | null | undefined;
    let localAttemptKey: string | undefined;
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      beforeConfirm: async (input) => {
        const row = await db.payment.findUnique({
          where: { id: input.paymentId },
          select: { providerConfirmIdempotencyKey: true, idempotencyKey: true },
        });
        persistedBeforeProvider = row?.providerConfirmIdempotencyKey;
        localAttemptKey = row?.idempotencyKey;
      },
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await db.payment.findUnique({
      where: { id: payment.id },
      select: { providerConfirmIdempotencyKey: true, providerPaymentKey: true },
    });
    const expectedConfirmKey = `confirm:${PaymentProvider.TOSS}:${payment.id}`;

    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty("providerConfirmIdempotencyKey");
    expect(result).not.toHaveProperty("providerRef");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      paymentId: payment.id,
      providerRef,
      providerPaymentKey: key,
      providerConfirmIdempotencyKey: expectedConfirmKey,
    });
    expect(inputs[0]?.providerConfirmIdempotencyKey).not.toContain(key);
    expect(localAttemptKey).not.toBe(expectedConfirmKey);
    expect(persistedBeforeProvider).toBe(expectedConfirmKey);
    expect(persisted).toEqual({ providerConfirmIdempotencyKey: expectedConfirmKey, providerPaymentKey: key });
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("confirm without a pending local payment fails before provider.confirm", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PAYMENT_UNAVAILABLE");
      expect(result.retryable).toBe(false);
    }
    expect(inputs).toHaveLength(0);
    await expect(paymentCount(session.sessionId)).resolves.toBe(0);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
  });

  it("output-less CONTACTED returns IN_PROGRESS and never reaches provider.confirm", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session, { persistedOutput: false });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toEqual({
      kind: "IN_PROGRESS",
      success: false,
      errorCode: "ATTEMPT_IN_PROGRESS",
      error: "Payment initiation is still being processed.",
      retryable: false,
      paymentId: payment.id,
    });
    expectProviderNeutralNonSuccess(result);
    expect(inputs).toHaveLength(0);
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(confirmKeyOf(payment.id)).resolves.toBeNull();
  });

  it("session remediation exposure returns REMEDIATION_REQUIRED before provider confirmation", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const blocker = await createPendingPayment(session);
    await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.TOSS,
        mode: PersistedPaymentMode.SANDBOX,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        amount: session.totalAmount,
        currency: session.currency,
        providerPaymentKey: `exposed_${randomUUID()}`,
        idempotencyKey: `exposed:${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        financialSucceededAt: new Date(),
        blockingEndedAt: new Date(),
        suspendedByPaymentId: blocker.id,
      },
    });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toEqual({
      kind: "REMEDIATION_REQUIRED",
      success: false,
      errorCode: "SESSION_REMEDIATION_REQUIRED",
      error: "This checkout session has a payment issue that requires review.",
      retryable: false,
    });
    expectProviderNeutralNonSuccess(result);
    expect(inputs).toHaveLength(0);
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(confirmKeyOf(blocker.id)).resolves.toBeNull();
  });

  it("a same-session suspension cycle blocks confirmation without a provider call", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const blocker = await createPendingPayment(session);
    const [cycleA, cycleB] = await Promise.all([
      createSupersededPayment(session, "confirm-cycle-a"),
      createSupersededPayment(session, "confirm-cycle-b"),
    ]);
    await db.$executeRaw(Prisma.sql`
      UPDATE "Payment"
      SET "attemptLifecycle" = 'SUSPENDED',
          "suspendedByPaymentId" = CASE "id"
            WHEN ${cycleA.id} THEN ${cycleB.id}
            WHEN ${cycleB.id} THEN ${cycleA.id}
          END
      WHERE "id" IN (${cycleA.id}, ${cycleB.id})
    `);
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result).toMatchObject({ kind: "REMEDIATION_REQUIRED", success: false });
    expect(inputs).toHaveLength(0);
    expect(mockResolveProvider).not.toHaveBeenCalled();
    await expect(confirmKeyOf(blocker.id)).resolves.toBeNull();
  });

  it("unset mock mode preserves normal mock completion", async () => {
    delete process.env.PAYMENT_MOCK_MODE;
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(true);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(1);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("blank mock mode preserves normal mock completion", async () => {
    process.env.PAYMENT_MOCK_MODE = "";
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(true);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(1);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("explicit success mock mode preserves normal mock completion", async () => {
    process.env.PAYMENT_MOCK_MODE = "success";
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(true);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(1);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("obsolete PAYMENT_MOCK_FORCE_FAIL alone has no mock behavior authority", async () => {
    delete process.env.PAYMENT_MOCK_MODE;
    process.env.PAYMENT_MOCK_FORCE_FAIL = "1";
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(result.success).toBe(true);
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(1);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(1);
  });

  it("amount mismatch returns terminal failure without a completed order", async () => {
    process.env.PAYMENT_MOCK_MODE = "amount-mismatch";
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("FAILED");
      expect(result.errorCode).toBe("PAYMENT_FAILED");
      expect(result.retryable).toBe(false);
    }
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(0);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(1);
  });

  it("retryable mock failure is bounded, redacted, and creates no completed commerce records", async () => {
    process.env.PAYMENT_MOCK_MODE = "retryable-throw";
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await db.payment.findUnique({
      where: { id: payment.id },
      select: { providerConfirmIdempotencyKey: true, providerPaymentKey: true },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("OUTCOME_UNKNOWN");
      expect(result.errorCode).toBe("PROVIDER_RETRYABLE");
      expect(result.error).toBe("Payment provider is temporarily unavailable.");
      expect(result.retryable).toBe(true);
    }
    expectProviderNeutralNonSuccess(result);
    expect(JSON.stringify(result)).not.toContain("Mock provider retryable failure");
    expect(persisted).toEqual({
      providerConfirmIdempotencyKey: `confirm:${PaymentProvider.TOSS}:${payment.id}`,
      providerPaymentKey: null,
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(0);
    await expect(finalizedSuccessfulPaymentCount(session.sessionId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("contains a hostile confirmation exception at the action and persistence boundaries", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const sentinel = `confirm-secret-${randomUUID()}&debug=${randomUUID()}`;
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      error: new Error(sentinel),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: providerPaymentKey(ctx),
    });
    const persisted = await loadPayment(payment.id);
    const serialized = JSON.stringify({ result, persisted });

    expect(result).toMatchObject({
      kind: "OUTCOME_UNKNOWN",
      success: false,
      errorCode: "PROVIDER_RETRYABLE",
      error: "Payment provider is temporarily unavailable.",
    });
    expect(result).not.toHaveProperty("redirectTo");
    expect(inputs).toHaveLength(1);
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "PROVIDER_CONFIRM_OUTCOME_UNKNOWN",
      errorMessage: "Provider confirm outcome is unresolved.",
    });
    expect(serialized).not.toContain(sentinel);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(0);
  });

  it("contains a hostile completion exception without exposing redirect or query material", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    const sentinel = `completion-secret-${randomUUID()}?paymentKey=${key}`;
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));
    mockCompleteFromCapture.mockRejectedValueOnce(new Error(sentinel));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, {
      providerPaymentKey: key,
    });
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      kind: "FAILED",
      success: false,
      errorCode: "COMPLETION_RETRYABLE",
      error: "Payment completion is still being processed.",
      retryable: true,
    });
    expectProviderNeutralNonSuccess(result);
    expect(result).not.toHaveProperty("redirectTo");
    expect(inputs).toHaveLength(1);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain(key);
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(manufacturingRequestCount(ctx.userId)).resolves.toBe(0);
  });

  it("normalized success completes through local completion without direct providerPaymentKey write", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedSuccess(input, key),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await loadPayment(payment.id);

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentKey: key,
      errorCode: null,
      errorMessage: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
    fetchSpy.mockRestore();
  });

  it("Toss sandbox confirm adapter completes through local completion using fake HTTP", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `toss_action_${randomUUID()}`;
    const payment = await createPendingPayment(session, {
      providerRef,
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    });
    const calls: TossConfirmHttpRequest[] = [];
    mockResolveProvider.mockReturnValueOnce(createTossSandboxPaymentProvider({
      httpClient: (request) => {
        calls.push(request);
        return Promise.resolve({
          kind: "response",
          httpStatus: 200,
          receivedAt: new Date("2026-07-07T01:00:00.000Z"),
          body: tossDone(payment.id, providerRef, session.totalAmount),
        });
      },
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS);
    const persisted = await loadPayment(payment.id);

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls).toEqual([{
      method: "POST",
      path: "/v1/payments/confirm",
      headers: { "Idempotency-Key": `confirm:${PaymentProvider.TOSS}:${payment.id}` },
      body: {
        paymentKey: providerRef,
        orderId: deriveTossOrderId(payment.id),
        amount: session.totalAmount,
      },
    }]);
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentKey: providerRef,
      errorCode: null,
      errorMessage: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
    await expect(outboxCount(PaymentProvider.TOSS, providerRef)).resolves.toBe(0);
    fetchSpy.mockRestore();
  });

  it("normalized retryable result records OUTCOME_UNKNOWN and preserves the confirm key", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedFailure(input, "RETRYABLE", "PROVIDER_TIMEOUT"),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await loadPayment(payment.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_RETRYABLE");
      expect(result.retryable).toBe(true);
    }
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      providerConfirmIdempotencyKey: `confirm:${PaymentProvider.TOSS}:${payment.id}`,
      providerPaymentKey: null,
      errorCode: "PROVIDER_CONFIRM_RETRYABLE",
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("normalized terminal failure marks only the payment attempt failed and allows a new attempt", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const first = await createPendingPayment(session);
    const terminalKey = providerPaymentKey(ctx);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedFailure(input, "TERMINAL", "PROVIDER_DECLINED"),
    }));

    const terminal = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: terminalKey });
    const failedAttempt = await loadPayment(first.id);

    expect(terminal.success).toBe(false);
    if (!terminal.success) {
      expect(terminal.errorCode).toBe("PROVIDER_TERMINAL");
      expect(terminal.retryable).toBe(false);
    }
    expect(failedAttempt).toMatchObject({
      status: PaymentAttemptStatus.FAILED,
      errorCode: "PROVIDER_CONFIRM_TERMINAL",
      providerPaymentKey: null,
    });
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
    await expect(outboxCount(PaymentProvider.TOSS, terminalKey)).resolves.toBe(0);

    const second = await createPendingPayment(session);
    const successKey = providerPaymentKey(ctx);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedSuccess(input, successKey),
    }));
    const succeeded = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: successKey });

    expect(succeeded.success).toBe(true);
    await expect(loadPayment(second.id)).resolves.toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentKey: successKey,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(1);
  });

  it("normalized manual review stays pending with safe marker and redacted action result", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    const rawSecret = "test_sk_should_not_leak";
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedFailure(input, "MANUAL_REVIEW", "PROVIDER_STATE_AMBIGUOUS", rawSecret),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await loadPayment(payment.id);
    const rendered = JSON.stringify([result, persisted]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_MANUAL_REVIEW");
      expect(result.retryable).toBe(false);
    }
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      errorCode: "PROVIDER_CONFIRM_MANUAL_REVIEW",
      providerPaymentKey: null,
    });
    expect(rendered).not.toContain(rawSecret);
    expect(rendered).not.toContain("RAW_PROVIDER_CODE");
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("normalized stop failure stores operator marker without retry or completion", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      resultForInput: (input) => normalizedFailure(input, "STOP", "PROVIDER_AUTH_FAILED"),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await loadPayment(payment.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_STOP");
      expect(result.retryable).toBe(false);
    }
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      errorCode: "PROVIDER_CONFIRM_STOP",
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("normalized programmer error fails closed without provider retry or internal detail exposure", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const key = providerPaymentKey(ctx);
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      resultForInput: (input) => normalizedFailure(input, "PROGRAMMER_ERROR", "PROVIDER_PROGRAMMER_ERROR", "stack trace secret"),
    }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const persisted = await loadPayment(payment.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_PROGRAMMER_ERROR");
      expect(result.retryable).toBe(false);
      expect(result.error).toBe("Payment operation failed.");
      expect(result.error).not.toContain("stack trace secret");
    }
    expect(inputs).toHaveLength(1);
    expect(persisted).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      errorCode: null,
      providerPaymentKey: null,
    });
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
  });

  it("OUTCOME_UNKNOWN blocks a second provider confirmation", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const inputs: PaymentConfirmInput[] = [];
    const key = providerPaymentKey(ctx);
    mockResolveProvider.mockReturnValue(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      error: new Error("Fake retryable confirm"),
    }));

    const failed = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const succeeded = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const expectedConfirmKey = `confirm:${PaymentProvider.TOSS}:${payment.id}`;

    expect(failed.success).toBe(false);
    if (!failed.success) expect(failed.errorCode).toBe("PROVIDER_RETRYABLE");
    expect(succeeded.success).toBe(false);
    if (!succeeded.success) {
      expect(succeeded.kind).toBe("OUTCOME_UNKNOWN");
      expect(succeeded.errorCode).toBe("ATTEMPT_OUTCOME_UNKNOWN");
    }
    expect(inputs.map((input) => input.providerConfirmIdempotencyKey)).toEqual([expectedConfirmKey]);
    await expect(confirmKeyOf(payment.id)).resolves.toBe(expectedConfirmKey);
  });

  it("different attempts in the same checkout session receive different confirm keys", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const inputs: PaymentConfirmInput[] = [];
    const first = await createPendingPayment(session);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      resultForInput: (input) => normalizedFailure(input, "TERMINAL", "PROVIDER_DECLINED"),
    }));

    await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });
    const second = await createPendingPayment(session);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      resultForInput: (input) => normalizedFailure(input, "TERMINAL", "PROVIDER_DECLINED"),
    }));

    await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });

    expect(inputs.map((input) => input.providerConfirmIdempotencyKey)).toEqual([
      `confirm:${PaymentProvider.TOSS}:${first.id}`,
      `confirm:${PaymentProvider.TOSS}:${second.id}`,
    ]);
    expect(inputs[0]?.providerConfirmIdempotencyKey).not.toBe(inputs[1]?.providerConfirmIdempotencyKey);
  });

  it("different providers in the same checkout session receive provider-scoped confirm keys", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const toss = await createPendingPayment(session, { provider: PaymentProvider.TOSS });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockImplementation((input) => fakeConfirmProvider(input.provider, {
      inputs,
      resultForInput: (confirmInput) => normalizedFailure(confirmInput, "TERMINAL", "PROVIDER_DECLINED"),
    }));

    await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });
    const mock = await createPendingPayment(session, { provider: PaymentProvider.MOCK });
    await confirmPayment(session.sessionId, PaymentProvider.MOCK, {
      method: PaymentMethod.MOCK,
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(inputs.map((input) => input.providerConfirmIdempotencyKey)).toEqual([
      `confirm:${PaymentProvider.TOSS}:${toss.id}`,
      `confirm:${PaymentProvider.MOCK}:${mock.id}`,
    ]);
  });

  it("OUTCOME_UNKNOWN blocks confirmation and the DB rejects a duplicate blocker", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const first = await createPendingPayment(session);
    await db.payment.update({
      where: { id: first.id },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        errorCode: "TEST_OUTCOME_UNKNOWN",
      },
    });
    await expect(createPendingPayment(session)).rejects.toMatchObject({ code: "P2002" });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("OUTCOME_UNKNOWN");
      expect(result.errorCode).toBe("ATTEMPT_OUTCOME_UNKNOWN");
    }
    expect(inputs).toHaveLength(0);
    await expect(confirmKeyOf(first.id)).resolves.toBeNull();
  });

  it("keeps legacy market routing on configured sandbox defaults", () => {
    expect(providerForMarket(MarketCode.KR)).toBe(PaymentProvider.TOSS);
    expect(providerForMarket(MarketCode.US)).toBe(PaymentProvider.PAYPAL);
    expect(providerForMarket(MarketCode.JP)).toBe(PaymentProvider.PAYPAL);
    expect(() => providerForMarket("ZZ")).toThrow(NoEligibleProviderError);
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
  await upsertMarket(MarketCode.US, "USD", [ShippingCountry.US], "en");
  await upsertMarket(MarketCode.JP, "JPY", [ShippingCountry.JP], "ja");
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
  return submitSessionForMarket(context, MarketCode.KR, now);
}

async function submitSessionForMarket(
  context: TestContext,
  marketCode: MarketCode,
  now?: Date,
) {
  const amount = marketCode === MarketCode.KR ? 12_000 : marketCode === MarketCode.US ? 2_999 : 5_000;
  const variant = await createCatalogVariant(context, { amount, stock: 5, marketCode });
  await addCart(context, variant, 1);
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode,
    communicationLocale: marketCode === MarketCode.JP ? "ja" : marketCode === MarketCode.US ? "en" : "ko",
    shipping: validShipping(marketCode),
    now,
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const marketCode = options.marketCode ?? MarketCode.KR;
  const style = await db.wigStyle.create({
    data: {
      name: `B3 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b3-cover.png",
      availableMarkets: { create: { marketCode, isActive: true } },
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
    data: { variantId: variant.id, marketCode: options.marketCode ?? MarketCode.KR, amount: options.amount ?? 12_000 },
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

function validShipping(marketCode: MarketCode = MarketCode.KR): CheckoutShippingInput {
  if (marketCode === MarketCode.US) {
    return {
      recipientName: "Jane Doe",
      phone: "+1 415-555-0123",
      country: ShippingCountry.US,
      postalCode: "94105",
      administrativeArea: "CA",
      city: "San Francisco",
      addressLine1: "1 Market Street",
    };
  }
  if (marketCode === MarketCode.JP) {
    return {
      recipientName: "山田花子",
      phone: "090-1234-5678",
      country: ShippingCountry.JP,
      postalCode: "100-0001",
      administrativeArea: "東京都",
      city: "千代田区",
      addressLine1: "丸の内1-1",
    };
  }
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

function fakeActionProvider(initiateResult: PaymentInitiateResult): PaymentProviderPort {
  const provider = createMockPaymentProvider(PaymentProvider.TOSS);
  return { ...provider, initiate: () => Promise.resolve(initiateResult) };
}

function fakeConfirmProvider(
  providerCode: PaymentProvider,
  options: FakeConfirmOptions,
): PaymentProviderPort {
  const provider = createMockPaymentProvider(providerCode);
  return {
    ...provider,
    confirm: async (input) => {
      options.inputs?.push(input);
      await options.beforeConfirm?.(input);
      if (options.error) throw options.error;
      if (options.resultForInput) return options.resultForInput(input);
      if (options.result) return options.result;
      return options.facts ?? confirmFacts(input);
    },
  };
}

function confirmFacts(input: PaymentConfirmInput): PaymentConfirmFacts {
  return {
    providerPaymentKey: input.providerPaymentKey ?? `mock:${input.checkoutSessionId}`,
    amount: input.amount,
    currency: input.currency,
  };
}

function expectedResolverContext(overrides: Partial<ProviderFactoryContext> = {}): ProviderFactoryContext {
  const provider = overrides.provider ?? PaymentProvider.TOSS;
  const mode = overrides.mode ?? PaymentMode.SANDBOX;
  const market = overrides.market ?? MarketCode.KR;
  const method = overrides.method ?? PaymentMethod.CARD;
  const currency = overrides.currency ?? "KRW";
  const ruleId = overrides.ruleId ?? "d1a.kr.card.krw";
  return {
    provider,
    mode,
    market,
    method,
    currency,
    ruleId,
    credentials: credentialChecksForProvider({
      provider,
      mode,
      capability: ProviderCapability.ACTION_ADAPTER,
    }),
    liveGuard: liveGuardForProviderContext({ provider, market, method, currency, ruleId }),
    ...overrides,
  };
}

function normalizedSuccess(
  input: PaymentConfirmInput,
  providerPaymentKey: string,
): NormalizedProviderConfirmResult {
  return {
    kind: "succeeded",
    provider: input.provider,
    providerPaymentKey,
    amountMinor: input.amount,
    currency: input.currency,
    idempotencyKey: input.providerConfirmIdempotencyKey,
    rawProviderStatus: "FAKE_COMPLETED",
  };
}

function tossDone(paymentId: string, paymentKey: string, amount: number): Record<string, unknown> {
  return {
    paymentKey,
    orderId: deriveTossOrderId(paymentId),
    status: "DONE",
    totalAmount: amount,
    currency: "KRW",
    approvedAt: "2026-07-07T00:59:59.000Z",
  };
}

function normalizedFailure(
  input: PaymentConfirmInput,
  classification: ProviderFailureClass,
  normalizedCode: ProviderErrorCode,
  unsafeDetail = "redacted-provider-detail",
): ProviderConfirmFailed {
  return {
    kind: "failed",
    provider: input.provider,
    classification,
    normalizedCode,
    providerErrorCode: "RAW_PROVIDER_CODE",
    safeMessage: `Safe provider message ${unsafeDetail}`,
    ambiguousProviderState: classification === "MANUAL_REVIEW" || classification === "RETRYABLE",
    providerLookupRequired: classification === "MANUAL_REVIEW",
    idempotencyKey: input.providerConfirmIdempotencyKey,
    diagnostics: {
      providerCode: "RAW_PROVIDER_CODE",
      safeMessage: unsafeDetail,
      requestId: input.providerConfirmIdempotencyKey,
    },
  };
}

async function createPendingPayment(
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  options: PendingPaymentOptions = {},
) {
  const provider = options.provider ?? PaymentProvider.TOSS;
  return db.payment.create({
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      checkoutSessionId: session.sessionId,
      provider,
      mode: options.mode ?? PersistedPaymentMode.SANDBOX,
      adapterExecutionKind: options.adapterExecutionKind === undefined
        ? PaymentAdapterExecutionKind.MOCK
        : options.adapterExecutionKind,
      providerOrderId: provider === PaymentProvider.EXIMBAY
        ? syntheticEximbayProviderOrderId()
        : null,
      status: options.status ?? PaymentAttemptStatus.INITIATED,
      amount: session.totalAmount,
      currency: session.currency,
      providerRef: options.providerRef,
      contactIntentAt: new Date(),
      contactStartedAt: new Date(),
      initiationOutputKind: options.persistedOutput === false ? undefined : PaymentInitiationOutputKind.READY,
      initiationCompletedAt: options.persistedOutput === false ? undefined : new Date(),
      idempotencyKey: `initiate:${session.sessionId}:${provider}:${randomUUID()}`,
    },
    select: { id: true, idempotencyKey: true },
  });
}

async function createSupersededPayment(
  session: Awaited<ReturnType<typeof submitSessionWithOneLine>>,
  label: string,
) {
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PersistedPaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `${label}:${randomUUID()}`,
      contactIntentAt: new Date(),
      supersededAt: new Date(),
      blockingEndedAt: new Date(),
    },
    select: { id: true },
  });
}

async function confirmKeyOf(paymentId: string): Promise<string | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { providerConfirmIdempotencyKey: true },
  });
  if (!payment) throw new Error(`Missing payment ${paymentId}`);
  return payment.providerConfirmIdempotencyKey;
}

async function loadPayment(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      provider: true,
      adapterExecutionKind: true,
      status: true,
      attemptLifecycle: true,
      providerConfirmIdempotencyKey: true,
      providerPaymentKey: true,
      errorCode: true,
      errorMessage: true,
    },
  });
  if (!payment) throw new Error(`Missing payment ${paymentId}`);
  return payment;
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

async function paymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({ where: { checkoutSessionId } });
}

async function finalizedSuccessfulPaymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({
    where: {
      checkoutSessionId,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    },
  });
}

async function onlyPayment(checkoutSessionId: string) {
  const payment = await db.payment.findFirst({ where: { checkoutSessionId } });
  if (!payment) throw new Error(`Missing payment for ${checkoutSessionId}`);
  return payment;
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

async function manufacturingRequestCount(userId: string): Promise<number> {
  return db.manufacturingRequest.count({ where: { orderItem: { order: { userId } } } });
}

async function outboxCount(provider: PaymentProvider, providerPaymentKey: string): Promise<number> {
  return db.paymentOutbox.count({
    where: { dedupKey: `payment-remediation:${provider}:${providerPaymentKey}` },
  });
}

async function statusOf(sessionId: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session.status;
}

function syntheticS3Handoff(paymentId: string) {
  return Object.freeze({
    kind: "EXIMBAY_READY_HANDOFF_V1",
    paymentId,
    mode: "SANDBOX",
    sdkGeneration: "v2",
    payload: Object.freeze({
      fgkey: "SYNTHETIC_ACTION_FGKEY",
      payment: Object.freeze({
        transaction_type: "PAYMENT",
        order_id: `synthetic-order-${paymentId}`,
        currency: "USD",
        amount: "1.00",
        lang: "EN",
        payment_method: "P000",
      }),
      merchant: Object.freeze({ mid: "SYNTHETIC_ACTION_MID" }),
      buyer: Object.freeze({ name: "Synthetic Buyer", email: "synthetic@example.test" }),
      url: Object.freeze({
        return_url: "https://payments.example.test/return",
        status_url: "https://payments.example.test/status",
      }),
    }),
  });
}

function restoreMockMode(): void {
  if (ORIGINAL_MOCK_MODE === undefined) {
    delete process.env.PAYMENT_MOCK_MODE;
    return;
  }
  process.env.PAYMENT_MOCK_MODE = ORIGINAL_MOCK_MODE;
}

function restorePaymentMode(): void {
  if (ORIGINAL_PAYMENT_MODE === undefined) {
    delete process.env.PAYMENT_MODE;
    return;
  }
  process.env.PAYMENT_MODE = ORIGINAL_PAYMENT_MODE;
}

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}
