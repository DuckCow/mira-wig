import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PaymentMode } from "../routing";
import { ProviderResolveException, resolveProvider } from "../resolve";
import type { PaymentConfirmInput, PaymentInitiateInput } from "../types";

describe("payment provider adapter resolution", () => {
  it.each([
    PaymentProvider.MOCK,
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("resolves %s to the explicit SANDBOX mock scaffold", async (provider) => {
    const resolved = resolveProvider({ provider, mode: PaymentMode.SANDBOX });

    expect(resolved.code).toBe(provider);
    await expect(resolved.initiate(initiateInput(provider))).resolves.toEqual({ kind: "ready" });
    await expect(resolved.confirm(confirmInput(provider))).resolves.toMatchObject({
      providerPaymentKey: "mock:checkout_123",
      amount: 12_000,
      currency: "KRW",
    });
  });

  it("fails closed for MOCK in LIVE mode", () => {
    expectLiveResolutionFailure(PaymentProvider.MOCK, "MOCK_PROVIDER_LIVE");
  });

  it.each([
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("fails closed for %s in LIVE mode until a real adapter exists", (provider) => {
    expectLiveResolutionFailure(provider, "LIVE_ADAPTER_UNAVAILABLE");
  });
});

function expectLiveResolutionFailure(provider: PaymentProvider, code: string): void {
  expect(() => resolveProvider({ provider, mode: PaymentMode.LIVE })).toThrow(ProviderResolveException);
  try {
    resolveProvider({ provider, mode: PaymentMode.LIVE });
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderResolveException);
    if (e instanceof ProviderResolveException) {
      expect(e.code).toBe(code);
      expect(e.provider).toBe(provider);
      expect(e.mode).toBe(PaymentMode.LIVE);
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
