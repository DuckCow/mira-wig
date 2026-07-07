import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ProviderFactoryContext } from "../contract";
import { PaymentMethod, PaymentMode } from "../routing";
import { ProviderResolveException, resolveProvider } from "../resolve";
import type { PaymentConfirmInput, PaymentInitiateInput } from "../types";

describe("payment provider adapter resolution", () => {
  it.each([
    PaymentProvider.MOCK,
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("resolves %s to the explicit SANDBOX mock scaffold", async (provider) => {
    const resolved = resolveProvider(factoryContext({
      provider,
      mode: PaymentMode.SANDBOX,
      credentials: [{ name: "FAKE_SANDBOX_REQUIRED", required: true, present: false }],
      liveGuard: { kind: "blocked", liveEnabled: false, reason: "sandbox skips live guard" },
    }));

    expect(resolved.code).toBe(provider);
    await expect(resolved.initiate(initiateInput(provider))).resolves.toEqual({ kind: "ready" });
    await expect(resolved.confirm(confirmInput(provider))).resolves.toMatchObject({
      providerPaymentKey: "mock:checkout_123",
      amount: 12_000,
      currency: "KRW",
    });
  });

  it("fails closed for MOCK in LIVE mode", () => {
    expectResolutionFailure(
      factoryContext({ provider: PaymentProvider.MOCK, mode: PaymentMode.LIVE }),
      "MOCK_PROVIDER_LIVE",
    );
  });

  it("fails LIVE before credential checks when the provider is not live-enabled", () => {
    const sentinel = "fake_secret_do_not_leak";
    expectResolutionFailure(
      factoryContext({
        mode: PaymentMode.LIVE,
        credentials: [{ name: sentinel, required: true, present: true }],
        liveGuard: { kind: "blocked", liveEnabled: false, reason: "fake test live guard blocked" },
      }),
      "LIVE_NOT_ENABLED",
      sentinel,
    );
  });

  it("fails LIVE with missing credentials after the live guard allows the provider", () => {
    expectResolutionFailure(
      factoryContext({
        mode: PaymentMode.LIVE,
        credentials: [{ name: "FAKE_REQUIRED_CREDENTIAL", required: true, present: false }],
        liveGuard: { kind: "allowed", liveEnabled: true },
      }),
      "LIVE_CREDENTIALS_MISSING",
    );
  });

  it.each([
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("fails closed for %s after live guard and fake credentials pass", (provider) => {
    expectResolutionFailure(
      factoryContext({
        provider,
        mode: PaymentMode.LIVE,
        credentials: [{ name: "FAKE_REQUIRED_CREDENTIAL", required: true, present: true }],
        liveGuard: { kind: "allowed", liveEnabled: true },
      }),
      "LIVE_ADAPTER_UNAVAILABLE",
    );
  });

  it("fails closed for unsupported modes", () => {
    expectResolutionFailure(
      factoryContext({
        // @ts-expect-error test-only invalid mode exercises the runtime guard.
        mode: "STAGING",
      }),
      "PROVIDER_MODE_UNSUPPORTED",
    );
  });
});

function expectResolutionFailure(
  context: ProviderFactoryContext,
  code: string,
  absentText?: string,
): void {
  expect(() => resolveProvider(context)).toThrow(ProviderResolveException);
  try {
    resolveProvider(context);
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderResolveException);
    if (e instanceof ProviderResolveException) {
      expect(e.code).toBe(code);
      expect(e.provider).toBe(context.provider);
      expect(e.mode).toBe(String(context.mode));
      expect(String(e)).not.toContain(absentText ?? "__never__");
      expect(JSON.stringify(e)).not.toContain(absentText ?? "__never__");
    }
  }
}

function initiateInput(provider: PaymentProvider): PaymentInitiateInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider,
    amount: 12_000,
    currency: "KRW",
    idempotencyKey: "initiate:checkout_123:payment_123",
  };
}

function confirmInput(provider: PaymentProvider): PaymentConfirmInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider,
    providerConfirmIdempotencyKey: "confirm:TOSS:payment_123",
    amount: 12_000,
    currency: "KRW",
  };
}

function factoryContext(overrides: Partial<ProviderFactoryContext> = {}): ProviderFactoryContext {
  return {
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    market: "KR",
    method: PaymentMethod.CARD,
    currency: "KRW",
    ruleId: "d1a.kr.card.krw",
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "not live mode" },
    ...overrides,
  };
}
