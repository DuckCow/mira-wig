import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import {
  NoEligibleProviderError,
  PROVIDER_REGISTRY,
  PaymentMethod,
  PaymentMode,
  providerForMarket,
  resolveProviderForPayment,
  type PaymentContext,
  type ProviderRegistryEntry,
  type RoutingRule,
} from "../routing";

describe("provider routing", () => {
  it("returns ordered candidates and audit metadata for a multi-provider market rule", () => {
    const resolution = resolveProviderForPayment(baseContext());

    expect(resolution.selectedProvider).toBe(PaymentProvider.TOSS);
    expect(resolution.candidates).toEqual([PaymentProvider.TOSS, PaymentProvider.PAYPAL]);
    expect(resolution.ruleId).toBe("d1a.kr.card.krw");
    expect(resolution.mode).toBe(PaymentMode.SANDBOX);
    expect(resolution.filteredOut).toEqual([
      { provider: PaymentProvider.PAYPAL, reason: "currency KRW is not supported" },
    ]);
  });

  it("uses payment method as a routing dimension", () => {
    const card = resolveProviderForPayment(baseContext({ method: PaymentMethod.CARD }));
    const mock = resolveProviderForPayment(baseContext({ method: PaymentMethod.MOCK }));

    expect(card.selectedProvider).toBe(PaymentProvider.TOSS);
    expect(mock.selectedProvider).toBe(PaymentProvider.MOCK);
  });

  it("can select a later candidate after currency filtering", () => {
    const resolution = resolveProviderForPayment(baseContext({ currency: "USD" }), {
      rules: [testRule({ currency: "USD", candidates: [PaymentProvider.TOSS, PaymentProvider.PAYPAL] })],
    });

    expect(resolution.selectedProvider).toBe(PaymentProvider.PAYPAL);
    expect(resolution.filteredOut).toEqual([
      { provider: PaymentProvider.TOSS, reason: "currency USD is not supported" },
    ]);
  });

  it("filters disabled providers with an explicit reason", () => {
    const error = expectNoEligible(() => resolveProviderForPayment(baseContext(), {
      registry: {
        ...PROVIDER_REGISTRY,
        [PaymentProvider.TOSS]: { ...PROVIDER_REGISTRY.TOSS, enabled: false },
      },
    }));

    expect(error.filteredOut).toContainEqual({ provider: PaymentProvider.TOSS, reason: "provider is disabled" });
  });

  it("filters unsupported methods and currencies with explicit reasons", () => {
    const methodError = expectNoEligible(() => resolveProviderForPayment(
      baseContext({ method: PaymentMethod.PAYPAL_WALLET }),
      { rules: [testRule({ method: PaymentMethod.PAYPAL_WALLET, candidates: [PaymentProvider.TOSS] })] },
    ));
    const currencyError = expectNoEligible(() => resolveProviderForPayment(
      baseContext({ currency: "USD" }),
      { rules: [testRule({ currency: "USD", candidates: [PaymentProvider.TOSS] })] },
    ));

    expect(methodError.filteredOut).toEqual([
      { provider: PaymentProvider.TOSS, reason: "method PAYPAL_WALLET is not supported" },
    ]);
    expect(currencyError.filteredOut).toEqual([
      { provider: PaymentProvider.TOSS, reason: "currency USD is not supported" },
    ]);
  });

  it("allows configured sandbox providers", () => {
    const resolution = resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
    }));

    expect(resolution.selectedProvider).toBe(PaymentProvider.PAYPAL);
  });

  it("fails LIVE resolution without explicit provider allowlist", () => {
    const error = expectNoEligible(() => resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
      mode: PaymentMode.LIVE,
    })));

    expect(error.filteredOut).toEqual([
      { provider: PaymentProvider.PAYPAL, reason: "provider is not live-enabled for context" },
    ]);
  });

  it("can select LIVE only when the provider is explicitly enabled for the context", () => {
    const paypal = liveEnabled(PROVIDER_REGISTRY.PAYPAL, {
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
    });
    const resolution = resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
      mode: PaymentMode.LIVE,
    }), {
      registry: { ...PROVIDER_REGISTRY, [PaymentProvider.PAYPAL]: paypal },
    });

    expect(resolution.selectedProvider).toBe(PaymentProvider.PAYPAL);
  });

  it("blocks MOCK in LIVE", () => {
    const error = expectNoEligible(() => resolveProviderForPayment(baseContext({
      method: PaymentMethod.MOCK,
      mode: PaymentMode.LIVE,
    })));

    expect(error.filteredOut).toEqual([
      { provider: PaymentProvider.MOCK, reason: "mock provider cannot run in LIVE" },
    ]);
  });

  it("does not silently fall back to MOCK for an unknown market", () => {
    const error = expectNoEligible(() => resolveProviderForPayment(baseContext({
      market: "ZZ",
      method: PaymentMethod.MOCK,
      mode: PaymentMode.LIVE,
    })));

    expect(error.candidates).toEqual([]);
    expect(error.filteredOut).toEqual([]);
    expect(error.message).toBe("No payment routing rule matched.");
  });

  it("keeps the legacy market wrapper on configured sandbox defaults", () => {
    expect(providerForMarket(MarketCode.KR)).toBe(PaymentProvider.TOSS);
    expect(providerForMarket(MarketCode.US)).toBe(PaymentProvider.PAYPAL);
    expect(providerForMarket(MarketCode.JP)).toBe(PaymentProvider.PAYPAL);
    expect(() => providerForMarket("ZZ")).toThrow(NoEligibleProviderError);
  });
});

function baseContext(overrides: Partial<PaymentContext> = {}): PaymentContext {
  return {
    market: MarketCode.KR,
    method: PaymentMethod.CARD,
    currency: "KRW",
    amountMinor: 12_000,
    mode: PaymentMode.SANDBOX,
    ...overrides,
  };
}

function testRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: "test.rule",
    market: MarketCode.KR,
    method: PaymentMethod.CARD,
    currency: "KRW",
    candidates: [PaymentProvider.TOSS],
    ...overrides,
  };
}

function liveEnabled(
  entry: ProviderRegistryEntry,
  context: Pick<PaymentContext, "market" | "method" | "currency">,
): ProviderRegistryEntry {
  return { ...entry, liveEnabled: [context] };
}

function expectNoEligible(run: () => unknown): NoEligibleProviderError {
  try {
    run();
  } catch (e) {
    if (e instanceof NoEligibleProviderError) return e;
    throw e;
  }
  throw new Error("Expected NoEligibleProviderError.");
}
