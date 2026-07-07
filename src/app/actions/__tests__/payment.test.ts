import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { createMockPaymentProvider } from "@/lib/payment/providers/mock";
import { ProviderResolveException, resolveProvider } from "@/lib/payment/providers/resolve";
import {
  NoEligibleProviderError,
  PROVIDER_REGISTRY,
  PaymentMethod,
  PaymentMode,
  providerForMarket,
} from "@/lib/payment/providers/routing";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderErrorCode,
  ProviderFailureClass,
} from "@/lib/payment/providers/contract";
import type {
  PaymentConfirmFacts,
  PaymentConfirmInput,
  PaymentConfirmResult,
  PaymentInitiateResult,
  PaymentProvider as PaymentProviderPort,
} from "@/lib/payment/providers/types";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/market/resolve", () => ({ getCurrentMarketCode: vi.fn() }));
vi.mock("@/lib/payment/providers/resolve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/resolve")>()),
  resolveProvider: vi.fn(),
}));

import { getCurrentMarketCode } from "@/lib/market/resolve";
import { getSession } from "@/lib/session";
import { confirmPayment, initiatePayment } from "../payment";

const mockGetSession = vi.mocked(getSession);
const mockGetCurrentMarketCode = vi.mocked(getCurrentMarketCode);
const mockResolveProvider = vi.mocked(resolveProvider);
const ORIGINAL_MOCK_MODE = process.env.PAYMENT_MOCK_MODE;
const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;
const ORIGINAL_TOSS_LIVE_ENABLED = PROVIDER_REGISTRY.TOSS.liveEnabled;

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
}

interface PendingPaymentOptions {
  provider?: PaymentProvider;
  providerRef?: string;
  status?: PaymentAttemptStatus;
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
    process.env.PAYMENT_MOCK_MODE = "success";
    delete process.env.PAYMENT_MODE;
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
    mockGetSession.mockResolvedValue(makeSession(ctx.userId));
    mockGetCurrentMarketCode.mockResolvedValue(MarketCode.KR);
    mockResolveProvider.mockImplementation((input) => createMockPaymentProvider(input.provider));
  });

  afterEach(async () => {
    mockResolveProvider.mockImplementation((input) => createMockPaymentProvider(input.provider));
    PROVIDER_REGISTRY.TOSS.liveEnabled = ORIGINAL_TOSS_LIVE_ENABLED;
    restorePaymentMode();
    restoreMockMode();
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
    expect(payment.idempotencyKey).toMatch(`initiate:${session.sessionId}:`);
    expect(mockResolveProvider).toHaveBeenCalledWith({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    });
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
    expect(mockResolveProvider).toHaveBeenCalledWith({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.LIVE,
    });
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
    await expect(paymentCount(expired.sessionId)).resolves.toBe(0);
    await expect(paymentCount(owned.sessionId)).resolves.toBe(0);
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
    expect(mockResolveProvider).toHaveBeenLastCalledWith({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
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

  it("amount mismatch returns terminal failure and enqueues one void intent", async () => {
    process.env.PAYMENT_MOCK_MODE = "amount-mismatch";
    const session = await submitSessionWithOneLine(ctx);
    await createPendingPayment(session);
    const key = providerPaymentKey(ctx);

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PAYMENT_FAILED");
      expect(result.retryable).toBe(false);
    }
    await expect(orderCount(ctx.userId)).resolves.toBe(0);
    await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(1);
  });

  it("retryable provider failure returns retryable response and no void intent", async () => {
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
      expect(result.errorCode).toBe("PROVIDER_RETRYABLE");
      expect(result.retryable).toBe(true);
    }
    expect(persisted).toEqual({
      providerConfirmIdempotencyKey: `confirm:${PaymentProvider.TOSS}:${payment.id}`,
      providerPaymentKey: null,
    });
    await expect(paymentCount(session.sessionId)).resolves.toBe(1);
    await expect(outboxCount(PaymentProvider.TOSS, key)).resolves.toBe(0);
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

  it("normalized retryable failure preserves pending attempt and confirm key without void", async () => {
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
      providerConfirmIdempotencyKey: `confirm:${PaymentProvider.TOSS}:${payment.id}`,
      providerPaymentKey: null,
      errorCode: null,
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

  it("repeated confirm attempts reuse the persisted confirm idempotency key", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const payment = await createPendingPayment(session);
    const inputs: PaymentConfirmInput[] = [];
    const key = providerPaymentKey(ctx);
    mockResolveProvider
      .mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs, error: new Error("Fake retryable confirm") }))
      .mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const failed = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const succeeded = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: key });
    const expectedConfirmKey = `confirm:${PaymentProvider.TOSS}:${payment.id}`;

    expect(failed.success).toBe(false);
    if (!failed.success) expect(failed.errorCode).toBe("PROVIDER_RETRYABLE");
    expect(succeeded.success).toBe(true);
    expect(inputs.map((input) => input.providerConfirmIdempotencyKey)).toEqual([expectedConfirmKey, expectedConfirmKey]);
    await expect(confirmKeyOf(payment.id)).resolves.toBe(expectedConfirmKey);
  });

  it("different attempts in the same checkout session receive different confirm keys", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const inputs: PaymentConfirmInput[] = [];
    const first = await createPendingPayment(session);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      error: new Error("First attempt retryable"),
    }));

    await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });
    await db.payment.update({ where: { id: first.id }, data: { status: PaymentAttemptStatus.FAILED } });
    const second = await createPendingPayment(session);
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, {
      inputs,
      error: new Error("Second attempt retryable"),
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
    const mock = await createPendingPayment(session, { provider: PaymentProvider.MOCK });
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockImplementation((input) => fakeConfirmProvider(input.provider, {
      inputs,
      error: new Error("Provider-scoped retryable"),
    }));

    await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });
    await confirmPayment(session.sessionId, PaymentProvider.MOCK, {
      method: PaymentMethod.MOCK,
      providerPaymentKey: providerPaymentKey(ctx),
    });

    expect(inputs.map((input) => input.providerConfirmIdempotencyKey)).toEqual([
      `confirm:${PaymentProvider.TOSS}:${toss.id}`,
      `confirm:${PaymentProvider.MOCK}:${mock.id}`,
    ]);
  });

  it("ambiguous pending attempts fail closed before provider.confirm", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const first = await createPendingPayment(session);
    const second = await createPendingPayment(session);
    const inputs: PaymentConfirmInput[] = [];
    mockResolveProvider.mockReturnValueOnce(fakeConfirmProvider(PaymentProvider.TOSS, { inputs }));

    const result = await confirmPayment(session.sessionId, PaymentProvider.TOSS, { providerPaymentKey: providerPaymentKey(ctx) });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("PAYMENT_UNAVAILABLE");
    expect(inputs).toHaveLength(0);
    await expect(confirmKeyOf(first.id)).resolves.toBeNull();
    await expect(confirmKeyOf(second.id)).resolves.toBeNull();
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
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await addCart(context, variant, 1);
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(),
    now,
  });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `B3 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b3-cover.png",
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
      checkoutSessionId: session.sessionId,
      provider,
      status: options.status ?? PaymentAttemptStatus.INITIATED,
      amount: session.totalAmount,
      currency: session.currency,
      providerRef: options.providerRef,
      idempotencyKey: `initiate:${session.sessionId}:${provider}:${randomUUID()}`,
    },
    select: { id: true, idempotencyKey: true },
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
      status: true,
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
  const dedupKeys = context.providerPaymentKeys.map((key) => `void:${PaymentProvider.TOSS}:${key}`);
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

async function onlyPayment(checkoutSessionId: string) {
  const payment = await db.payment.findFirst({ where: { checkoutSessionId } });
  if (!payment) throw new Error(`Missing payment for ${checkoutSessionId}`);
  return payment;
}

async function orderCount(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

async function outboxCount(provider: PaymentProvider, providerPaymentKey: string): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: `void:${provider}:${providerPaymentKey}` } });
}

async function statusOf(sessionId: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session.status;
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
