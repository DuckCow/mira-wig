import { PaymentProvider } from "@prisma/client";
import { isMarketCode, MarketCode } from "@/lib/market/types";

export const PaymentMethod = {
  CARD: "CARD",
  PAYPAL_WALLET: "PAYPAL_WALLET",
  MOCK: "MOCK",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentMode = {
  SANDBOX: "SANDBOX",
  LIVE: "LIVE",
} as const;

export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];

export interface PaymentContext {
  market: string;
  method: PaymentMethod;
  currency: string;
  amountMinor: number;
  mode: PaymentMode;
}

export interface FilteredProvider {
  provider: PaymentProvider;
  reason: string;
}

export interface ProviderResolution {
  selectedProvider: PaymentProvider;
  candidates: PaymentProvider[];
  ruleId: string;
  mode: PaymentMode;
  filteredOut: FilteredProvider[];
}

export interface ProviderRegistryEntry {
  provider: PaymentProvider;
  enabled: boolean;
  allowedModes: readonly PaymentMode[];
  supportedMethods: readonly PaymentMethod[];
  supportedCurrencies: readonly string[];
  mockOnly: boolean;
  liveEnabled?: readonly LiveProviderEnablement[];
  minAmountMinor?: number;
  maxAmountMinor?: number;
  notes?: string;
}

export interface LiveProviderEnablement {
  market: string;
  method: PaymentMethod;
  currency: string;
}

export interface RoutingRule {
  id: string;
  market: string;
  method: PaymentMethod;
  currency: string;
  candidates: readonly PaymentProvider[];
}

export interface ProviderSelectionConfig {
  registry?: Partial<Record<PaymentProvider, ProviderRegistryEntry>>;
  rules?: readonly RoutingRule[];
}

export class NoEligibleProviderError extends Error {
  readonly code = "NO_ELIGIBLE_PROVIDER";

  constructor(
    readonly context: PaymentContext,
    readonly candidates: readonly PaymentProvider[],
    readonly filteredOut: readonly FilteredProvider[],
    message = "No eligible payment provider.",
  ) {
    super(message);
    this.name = "NoEligibleProviderError";
  }
}

export const PROVIDER_REGISTRY: Record<PaymentProvider, ProviderRegistryEntry> = {
  [PaymentProvider.MOCK]: {
    provider: PaymentProvider.MOCK,
    enabled: true,
    allowedModes: [PaymentMode.SANDBOX],
    supportedMethods: [PaymentMethod.MOCK],
    supportedCurrencies: ["KRW", "USD", "JPY"],
    mockOnly: true,
    notes: "Local/test provider only. Never eligible in LIVE.",
  },
  [PaymentProvider.TOSS]: {
    provider: PaymentProvider.TOSS,
    enabled: true,
    allowedModes: [PaymentMode.SANDBOX, PaymentMode.LIVE],
    supportedMethods: [PaymentMethod.CARD],
    supportedCurrencies: ["KRW"],
    mockOnly: false,
    liveEnabled: [],
  },
  [PaymentProvider.PAYPAL]: {
    provider: PaymentProvider.PAYPAL,
    enabled: true,
    allowedModes: [PaymentMode.SANDBOX, PaymentMode.LIVE],
    supportedMethods: [PaymentMethod.CARD, PaymentMethod.PAYPAL_WALLET],
    supportedCurrencies: ["USD", "JPY"],
    mockOnly: false,
    liveEnabled: [],
  },
};

export const ROUTING_RULES: readonly RoutingRule[] = [
  {
    id: "d1a.kr.card.krw",
    market: MarketCode.KR,
    method: PaymentMethod.CARD,
    currency: "KRW",
    candidates: [PaymentProvider.TOSS, PaymentProvider.PAYPAL],
  },
  {
    id: "d1a.us.paypal_wallet.usd",
    market: MarketCode.US,
    method: PaymentMethod.PAYPAL_WALLET,
    currency: "USD",
    candidates: [PaymentProvider.PAYPAL],
  },
  {
    id: "d1a.jp.paypal_wallet.jpy",
    market: MarketCode.JP,
    method: PaymentMethod.PAYPAL_WALLET,
    currency: "JPY",
    candidates: [PaymentProvider.PAYPAL],
  },
  {
    id: "d1a.kr.mock.krw",
    market: MarketCode.KR,
    method: PaymentMethod.MOCK,
    currency: "KRW",
    candidates: [PaymentProvider.MOCK],
  },
  {
    id: "d1a.us.mock.usd",
    market: MarketCode.US,
    method: PaymentMethod.MOCK,
    currency: "USD",
    candidates: [PaymentProvider.MOCK],
  },
  {
    id: "d1a.jp.mock.jpy",
    market: MarketCode.JP,
    method: PaymentMethod.MOCK,
    currency: "JPY",
    candidates: [PaymentProvider.MOCK],
  },
];

const MARKET_DEFAULTS: Record<MarketCode, { method: PaymentMethod; currency: string }> = {
  [MarketCode.KR]: { method: PaymentMethod.CARD, currency: "KRW" },
  [MarketCode.US]: { method: PaymentMethod.PAYPAL_WALLET, currency: "USD" },
  [MarketCode.JP]: { method: PaymentMethod.PAYPAL_WALLET, currency: "JPY" },
};

export function resolveProviderForPayment(
  context: PaymentContext,
  config: ProviderSelectionConfig = {},
): ProviderResolution {
  const rules = config.rules ?? ROUTING_RULES;
  const registry = config.registry ?? PROVIDER_REGISTRY;
  const rule = matchingRule(context, rules);
  if (!rule) throw noRuleError(context);

  const filteredOut: FilteredProvider[] = [];
  const eligible = eligibleProviders(rule.candidates, context, registry, filteredOut);
  if (eligible.length < 1) throw new NoEligibleProviderError(context, rule.candidates, filteredOut);
  return {
    selectedProvider: eligible[0],
    candidates: [...rule.candidates],
    ruleId: rule.id,
    mode: context.mode,
    filteredOut,
  };
}

export function defaultPaymentMethodForMarket(marketCode: string): PaymentMethod {
  return marketDefaults(marketCode).method;
}

export function providerForMarket(marketCode: string): PaymentProvider {
  const defaults = marketDefaults(marketCode);
  return resolveProviderForPayment({
    market: marketCode,
    method: defaults.method,
    currency: defaults.currency,
    amountMinor: 0,
    mode: PaymentMode.SANDBOX,
  }).selectedProvider;
}

function matchingRule(context: PaymentContext, rules: readonly RoutingRule[]): RoutingRule | undefined {
  return rules.find((rule) => (
    rule.market === context.market
    && rule.method === context.method
    && rule.currency === context.currency
  ));
}

function eligibleProviders(
  candidates: readonly PaymentProvider[],
  context: PaymentContext,
  registry: Partial<Record<PaymentProvider, ProviderRegistryEntry>>,
  filteredOut: FilteredProvider[],
): PaymentProvider[] {
  return candidates.filter((provider) => {
    const reason = ineligibleReason(registry[provider], context);
    if (!reason) return true;
    filteredOut.push({ provider, reason });
    return false;
  });
}

function ineligibleReason(entry: ProviderRegistryEntry | undefined, context: PaymentContext): string | null {
  const availability = availabilityReason(entry, context);
  if (availability || !entry) return availability;
  return capabilityReason(entry, context) ?? liveReason(entry, context);
}

function availabilityReason(entry: ProviderRegistryEntry | undefined, context: PaymentContext): string | null {
  if (!entry) return "provider is not registered";
  if (!entry.enabled) return "provider is disabled";
  if (entry.mockOnly && context.mode === PaymentMode.LIVE) return "mock provider cannot run in LIVE";
  if (!entry.allowedModes.includes(context.mode)) return `mode ${context.mode} is not supported`;
  return null;
}

function capabilityReason(entry: ProviderRegistryEntry, context: PaymentContext): string | null {
  if (!entry.supportedMethods.includes(context.method)) return `method ${context.method} is not supported`;
  if (!entry.supportedCurrencies.includes(context.currency)) return `currency ${context.currency} is not supported`;
  if (!amountAllowed(entry, context.amountMinor)) return amountReason(entry, context.amountMinor);
  return null;
}

function liveReason(entry: ProviderRegistryEntry, context: PaymentContext): string | null {
  if (context.mode !== PaymentMode.LIVE) return null;
  if (isLiveEnabled(entry, context)) return null;
  return "provider is not live-enabled for context";
}

function amountAllowed(entry: ProviderRegistryEntry, amountMinor: number): boolean {
  if (entry.minAmountMinor !== undefined && amountMinor < entry.minAmountMinor) return false;
  if (entry.maxAmountMinor !== undefined && amountMinor > entry.maxAmountMinor) return false;
  return true;
}

function amountReason(entry: ProviderRegistryEntry, amountMinor: number): string {
  if (entry.minAmountMinor !== undefined && amountMinor < entry.minAmountMinor) return "amount is below provider minimum";
  return "amount is above provider maximum";
}

function isLiveEnabled(entry: ProviderRegistryEntry, context: PaymentContext): boolean {
  return entry.liveEnabled?.some((item) => (
    item.market === context.market
    && item.method === context.method
    && item.currency === context.currency
  )) ?? false;
}

function marketDefaults(marketCode: string): { method: PaymentMethod; currency: string } {
  if (isMarketCode(marketCode)) return MARKET_DEFAULTS[marketCode];
  throw noRuleError({
    market: marketCode,
    method: PaymentMethod.MOCK,
    currency: "",
    amountMinor: 0,
    mode: PaymentMode.SANDBOX,
  });
}

function noRuleError(context: PaymentContext): NoEligibleProviderError {
  return new NoEligibleProviderError(context, [], [], "No payment routing rule matched.");
}
