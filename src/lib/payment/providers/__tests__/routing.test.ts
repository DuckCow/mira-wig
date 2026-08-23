import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import {
  NoEligibleProviderError,
  PROVIDER_REGISTRY,
  ROUTING_RULES,
  PaymentMethod,
  PaymentMode,
  liveGuardForProviderContext,
  providerForMarket,
  resolveProviderForPayment,
  type PaymentContext,
  type ProviderLiveGuardContext,
  type ProviderRegistryEntry,
  type RoutingRule,
} from "../routing";

const INVALID_PROVIDER_REASON = "provider identity is invalid";
const INVALID_RUNTIME_PROVIDER_IDENTITIES: readonly unknown[] = [
  "UNKNOWN",
  "EXIMBAY_",
  "EXIMBAY ",
  "eximbay",
  "__proto__",
  "constructor",
  null,
  7,
  {},
];

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

  it("snapshots getter-backed routing candidates once for selection and diagnostics", () => {
    const probe = getterBackedCandidateRule();
    const resolution = resolveProviderForPayment(baseContext(), { rules: [probe.rule] });

    expect(resolution.selectedProvider).toBe(PaymentProvider.TOSS);
    expect(resolution.candidates).toEqual([PaymentProvider.TOSS]);
    expect(resolution.candidates).not.toContain(PaymentProvider.EXIMBAY);
    expect(probe.getCandidatesReadCount()).toBe(1);
    expect(probe.getFirstCandidatePositionReadCount()).toBe(1);
    expect(probe.getSecondCandidatePositionReadCount()).toBe(0);
    expect(probe.getReturnedCandidates()).toEqual([PaymentProvider.TOSS]);
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

  it("selects Eximbay only for the bounded US CARD USD SANDBOX source context", () => {
    expect(PROVIDER_REGISTRY.EXIMBAY).toMatchObject({
      provider: PaymentProvider.EXIMBAY,
      enabled: true,
      allowedModes: [PaymentMode.SANDBOX],
      supportedMethods: [PaymentMethod.CARD],
      supportedCurrencies: ["USD"],
      liveEnabled: [],
    });
    expect(ROUTING_RULES.filter((rule) => rule.candidates.includes(PaymentProvider.EXIMBAY))).toEqual([{
      id: "cfa.us.card.usd",
      market: MarketCode.US,
      method: PaymentMethod.CARD,
      currency: "USD",
      candidates: [PaymentProvider.EXIMBAY],
    }]);

    expect(resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.CARD,
      currency: "USD",
    })).selectedProvider).toBe(PaymentProvider.EXIMBAY);
  });

  it("does not broaden Eximbay to other markets, currencies, methods, or LIVE", () => {
    expect(resolveProviderForPayment(baseContext()).selectedProvider).toBe(PaymentProvider.TOSS);
    expect(resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "USD",
    })).selectedProvider).toBe(PaymentProvider.PAYPAL);
    expect(resolveProviderForPayment(baseContext({
      market: MarketCode.JP,
      method: PaymentMethod.PAYPAL_WALLET,
      currency: "JPY",
    })).selectedProvider).toBe(PaymentProvider.PAYPAL);

    for (const context of [
      baseContext({ market: MarketCode.JP, method: PaymentMethod.CARD, currency: "JPY" }),
      baseContext({ market: MarketCode.US, method: PaymentMethod.CARD, currency: "JPY" }),
    ]) {
      const error = expectNoEligible(() => resolveProviderForPayment(context));
      expect(error.candidates).toEqual([]);
    }

    const liveError = expectNoEligible(() => resolveProviderForPayment(baseContext({
      market: MarketCode.US,
      method: PaymentMethod.CARD,
      currency: "USD",
      mode: PaymentMode.LIVE,
    })));
    expect(liveError.filteredOut).toEqual([{
      provider: PaymentProvider.EXIMBAY,
      reason: "provider is unavailable in LIVE by customer SANDBOX activation authority",
    }]);
  });

  it("hard-denies Eximbay LIVE in the live guard despite an injected allow-all registry", () => {
    const context = baseContext({ market: MarketCode.US, method: PaymentMethod.CARD, currency: "USD" });
    const registryProbe = accessCountingRegistry(maliciousEximbayRegistryEntry(context));

    expect(liveGuardForProviderContext({
      provider: PaymentProvider.EXIMBAY,
      market: context.market,
      method: context.method,
      currency: context.currency,
      ruleId: "malicious.eximbay.live",
    }, registryProbe.registry)).toEqual({
      kind: "blocked",
      liveEnabled: false,
      reason: "provider is unavailable in LIVE by customer SANDBOX activation authority",
    });
    expect(registryProbe.getAccessCount()).toBe(0);
  });

  it("rejects malformed runtime provider identities before routing registry access", () => {
    for (const identity of INVALID_RUNTIME_PROVIDER_IDENTITIES) {
      const registryProbe = accessCountingRegistry(PROVIDER_REGISTRY.TOSS);
      const error = expectNoEligible(() => resolveProviderForPayment(baseContext(), {
        registry: registryProbe.registry,
        rules: [runtimeRuleWithCandidate(identity)],
      }));

      expect(error.filteredOut).toEqual([{
        provider: identity,
        reason: INVALID_PROVIDER_REASON,
      }]);
      expect(error.candidates).toEqual([identity]);
      expect(registryProbe.getAccessCount()).toBe(0);
    }
  });

  it("blocks malformed runtime provider identities in the live guard before registry access", () => {
    const context = baseContext();
    const liveEntry = liveEnabled(PROVIDER_REGISTRY.TOSS, context);

    for (const identity of INVALID_RUNTIME_PROVIDER_IDENTITIES) {
      const registryProbe = accessCountingRegistry(liveEntry);

      expect(liveGuardForProviderContext(
        runtimeLiveGuardContext(identity, context),
        registryProbe.registry,
      )).toEqual({
        kind: "blocked",
        liveEnabled: false,
        reason: INVALID_PROVIDER_REASON,
      });
      expect(registryProbe.getAccessCount()).toBe(0);
    }
  });

  it("preserves injected routing and live-guard behavior for canonical active providers", () => {
    for (const { provider, context, entry } of canonicalActiveProviderCases()) {
      const routingRegistryProbe = accessCountingRegistry(entry);
      const resolution = resolveProviderForPayment(context, {
        registry: routingRegistryProbe.registry,
        rules: [testRule({
          market: context.market,
          method: context.method,
          currency: context.currency,
          candidates: [provider],
        })],
      });

      expect(resolution.selectedProvider).toBe(provider);
      expect(routingRegistryProbe.getAccessCount()).toBe(1);

      const liveRegistryProbe = accessCountingRegistry(liveEnabled(entry, context));
      expect(liveGuardForProviderContext({
        provider,
        market: context.market,
        method: context.method,
        currency: context.currency,
        ruleId: "injected.canonical-provider.live",
      }, liveRegistryProbe.registry)).toEqual({
        kind: "allowed",
        liveEnabled: true,
      });
      expect(liveRegistryProbe.getAccessCount()).toBe(1);
    }
  });

  it("binds a valid live-guard provider identity before a disabled rebinding value", () => {
    const paymentContext = baseContext();
    const contextProbe = getterBackedLiveGuardContext(
      [PaymentProvider.TOSS, PaymentProvider.EXIMBAY],
      paymentContext,
    );
    const registryProbe = accessCountingRegistry(liveEnabled(PROVIDER_REGISTRY.TOSS, paymentContext));

    expect(liveGuardForProviderContext(contextProbe.context, registryProbe.registry)).toEqual({
      kind: "allowed",
      liveEnabled: true,
    });
    expect(contextProbe.getProviderReadCount()).toBe(1);
    expect(contextProbe.getReturnedProviders()).toEqual([PaymentProvider.TOSS]);
    expect(registryProbe.getAccessKeys()).toEqual([PaymentProvider.TOSS]);
  });

  it("binds a disabled live-guard provider identity before a valid rebinding value", () => {
    const contextProbe = getterBackedLiveGuardContext(
      [PaymentProvider.EXIMBAY, PaymentProvider.TOSS],
      baseContext(),
    );
    const registryProbe = accessCountingRegistry(PROVIDER_REGISTRY.TOSS);

    expect(liveGuardForProviderContext(contextProbe.context, registryProbe.registry)).toEqual({
      kind: "blocked",
      liveEnabled: false,
      reason: "provider is unavailable in LIVE by customer SANDBOX activation authority",
    });
    expect(contextProbe.getProviderReadCount()).toBe(1);
    expect(contextProbe.getReturnedProviders()).toEqual([PaymentProvider.EXIMBAY]);
    expect(registryProbe.getAccessCount()).toBe(0);
  });

  it("binds an invalid live-guard provider identity before a valid rebinding value", () => {
    const contextProbe = getterBackedLiveGuardContext(["UNKNOWN", PaymentProvider.TOSS], baseContext());
    const registryProbe = accessCountingRegistry(PROVIDER_REGISTRY.TOSS);

    expect(liveGuardForProviderContext(contextProbe.context, registryProbe.registry)).toEqual({
      kind: "blocked",
      liveEnabled: false,
      reason: INVALID_PROVIDER_REASON,
    });
    expect(contextProbe.getProviderReadCount()).toBe(1);
    expect(contextProbe.getReturnedProviders()).toEqual(["UNKNOWN"]);
    expect(registryProbe.getAccessCount()).toBe(0);
  });

  it("binds a special-property live-guard identity before a valid rebinding value", () => {
    const contextProbe = getterBackedLiveGuardContext(["__proto__", PaymentProvider.TOSS], baseContext());
    const registryProbe = accessCountingRegistry(PROVIDER_REGISTRY.TOSS);

    expect(liveGuardForProviderContext(contextProbe.context, registryProbe.registry)).toEqual({
      kind: "blocked",
      liveEnabled: false,
      reason: INVALID_PROVIDER_REASON,
    });
    expect(contextProbe.getProviderReadCount()).toBe(1);
    expect(contextProbe.getReturnedProviders()).toEqual(["__proto__"]);
    expect(registryProbe.getAccessCount()).toBe(0);
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

function getterBackedCandidateRule(): {
  rule: RoutingRule;
  getCandidatesReadCount: () => number;
  getFirstCandidatePositionReadCount: () => number;
  getSecondCandidatePositionReadCount: () => number;
  getReturnedCandidates: () => readonly PaymentProvider[];
} {
  let candidatesReadCount = 0;
  let firstCandidatePositionReadCount = 0;
  let secondCandidatePositionReadCount = 0;
  const returnedCandidates: PaymentProvider[] = [];
  const firstCandidates = [PaymentProvider.TOSS];
  const secondCandidates = [PaymentProvider.EXIMBAY];
  Object.defineProperty(firstCandidates, 0, {
    configurable: true,
    enumerable: true,
    get() {
      firstCandidatePositionReadCount += 1;
      return PaymentProvider.TOSS;
    },
  });
  Object.defineProperty(secondCandidates, 0, {
    configurable: true,
    enumerable: true,
    get() {
      secondCandidatePositionReadCount += 1;
      return PaymentProvider.EXIMBAY;
    },
  });
  const rule: RoutingRule = {
    id: "hostile.rebinding-candidates",
    market: MarketCode.KR,
    method: PaymentMethod.CARD,
    currency: "KRW",
    get candidates() {
      const firstRead = candidatesReadCount === 0;
      const candidates = firstRead ? firstCandidates : secondCandidates;
      candidatesReadCount += 1;
      returnedCandidates.push(firstRead ? PaymentProvider.TOSS : PaymentProvider.EXIMBAY);
      return candidates;
    },
  };
  return {
    rule,
    getCandidatesReadCount: () => candidatesReadCount,
    getFirstCandidatePositionReadCount: () => firstCandidatePositionReadCount,
    getSecondCandidatePositionReadCount: () => secondCandidatePositionReadCount,
    getReturnedCandidates: () => returnedCandidates,
  };
}

function maliciousEximbayRegistryEntry(context: PaymentContext): ProviderRegistryEntry {
  return {
    provider: PaymentProvider.EXIMBAY,
    enabled: true,
    allowedModes: [PaymentMode.SANDBOX, PaymentMode.LIVE],
    supportedMethods: Object.values(PaymentMethod),
    supportedCurrencies: ["KRW", "USD", "JPY"],
    mockOnly: false,
    liveEnabled: [{
      market: context.market,
      method: context.method,
      currency: context.currency,
    }],
  };
}

function canonicalActiveProviderCases(): readonly {
  provider: PaymentProvider;
  context: PaymentContext;
  entry: ProviderRegistryEntry;
}[] {
  return [
    {
      provider: PaymentProvider.MOCK,
      context: baseContext({ method: PaymentMethod.MOCK }),
      entry: PROVIDER_REGISTRY.MOCK,
    },
    {
      provider: PaymentProvider.TOSS,
      context: baseContext(),
      entry: PROVIDER_REGISTRY.TOSS,
    },
    {
      provider: PaymentProvider.PAYPAL,
      context: baseContext({
        market: MarketCode.US,
        method: PaymentMethod.PAYPAL_WALLET,
        currency: "USD",
      }),
      entry: PROVIDER_REGISTRY.PAYPAL,
    },
  ];
}

function accessCountingRegistry(entry: ProviderRegistryEntry): {
  registry: Partial<Record<PaymentProvider, ProviderRegistryEntry>>;
  getAccessCount: () => number;
  getAccessKeys: () => readonly PropertyKey[];
} {
  let accessCount = 0;
  const accessKeys: PropertyKey[] = [];
  const target: Partial<Record<PaymentProvider, ProviderRegistryEntry>> = {};
  return {
    registry: new Proxy(target, {
      get(_current, property) {
        accessCount += 1;
        accessKeys.push(property);
        return entry;
      },
    }),
    getAccessCount: () => accessCount,
    getAccessKeys: () => accessKeys,
  };
}

function runtimeRuleWithCandidate(provider: unknown): RoutingRule {
  const target = testRule();
  return new Proxy(target, {
    get(current, property, receiver): unknown {
      if (property === "candidates") return [provider];
      const value: unknown = Reflect.get(current, property, receiver);
      return value;
    },
  });
}

function runtimeLiveGuardContext(
  provider: unknown,
  context: PaymentContext,
): ProviderLiveGuardContext {
  const target: ProviderLiveGuardContext = {
    provider: PaymentProvider.TOSS,
    market: context.market,
    method: context.method,
    currency: context.currency,
    ruleId: "malicious.invalid-provider.live",
  };
  return new Proxy(target, {
    get(current, property, receiver): unknown {
      if (property === "provider") return provider;
      const value: unknown = Reflect.get(current, property, receiver);
      return value;
    },
  });
}

function getterBackedLiveGuardContext(
  providers: readonly unknown[],
  context: PaymentContext,
): {
  context: ProviderLiveGuardContext;
  getProviderReadCount: () => number;
  getReturnedProviders: () => readonly unknown[];
} {
  if (providers.length < 1) throw new Error("At least one runtime provider identity is required.");
  let providerReadCount = 0;
  const returnedProviders: unknown[] = [];
  const target: ProviderLiveGuardContext = {
    provider: PaymentProvider.TOSS,
    market: context.market,
    method: context.method,
    currency: context.currency,
    ruleId: "malicious.rebinding-provider.live",
  };
  return {
    context: new Proxy(target, {
      get(current, property, receiver): unknown {
        if (property !== "provider") return Reflect.get(current, property, receiver);
        const provider = providers[Math.min(providerReadCount, providers.length - 1)];
        providerReadCount += 1;
        returnedProviders.push(provider);
        return provider;
      },
    }),
    getProviderReadCount: () => providerReadCount,
    getReturnedProviders: () => returnedProviders,
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
