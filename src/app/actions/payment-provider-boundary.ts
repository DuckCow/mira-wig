import { PaymentProvider } from "@prisma/client";
import { PaymentModeConfigException, configuredPaymentMode } from "@/lib/payment/mode";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { ProviderResolveException, resolveProvider } from "@/lib/payment/providers/resolve";
import {
  NoEligibleProviderError,
  defaultPaymentMethodForMarket,
  liveGuardForProviderContext,
  resolveProviderForPayment,
  type PaymentMethod,
  type PaymentMode,
  type ProviderRegistryEntry,
} from "@/lib/payment/providers/routing";
import type { PaymentProvider as PaymentProviderPort } from "@/lib/payment/providers/types";

type ProviderUnavailableFailure = {
  success: false;
  errorCode: "PROVIDER_UNAVAILABLE";
  error: "No payment provider is available.";
  retryable: false;
};

export interface ProviderBoundarySession {
  totalAmount: number;
  currency: string;
}

export interface ActionProviderSuccess {
  success: true;
  provider: PaymentProvider;
  mode: PaymentMode;
  adapterContext: ProviderFactoryContext;
}

export type ActionProviderResolution = ActionProviderSuccess | ProviderUnavailableFailure;
export type AdapterResolutionResult =
  | { success: true; provider: PaymentProviderPort }
  | ProviderUnavailableFailure;

interface ProviderFactoryContextOptions {
  registry?: Partial<Record<PaymentProvider, ProviderRegistryEntry>>;
}

export function resolveActionProvider(
  session: ProviderBoundarySession,
  marketCode: string,
  method: PaymentMethod | undefined,
): ActionProviderResolution {
  try {
    const selectedMethod = method ?? defaultPaymentMethodForMarket(marketCode);
    const mode = configuredPaymentMode();
    const resolution = resolveProviderForPayment({
      market: marketCode,
      method: selectedMethod,
      currency: session.currency,
      amountMinor: session.totalAmount,
      mode,
    });
    return {
      success: true,
      provider: resolution.selectedProvider,
      mode: resolution.mode,
      adapterContext: createProviderFactoryContext(session, marketCode, selectedMethod, resolution),
    };
  } catch (e) {
    if (e instanceof NoEligibleProviderError || e instanceof PaymentModeConfigException) {
      return providerUnavailable();
    }
    throw e;
  }
}

export function resolveActionAdapter(context: ProviderFactoryContext): AdapterResolutionResult {
  try {
    return { success: true, provider: resolveProvider(context) };
  } catch (e) {
    if (e instanceof ProviderResolveException) return providerUnavailable();
    throw e;
  }
}

export function createProviderFactoryContext(
  session: ProviderBoundarySession,
  marketCode: string,
  method: PaymentMethod,
  resolution: ActionProviderSuccessLike,
  options: ProviderFactoryContextOptions = {},
): ProviderFactoryContext {
  return {
    provider: resolution.selectedProvider,
    mode: resolution.mode,
    market: marketCode,
    method,
    currency: session.currency,
    ruleId: resolution.ruleId,
    credentials: credentialChecksForProvider(),
    liveGuard: liveGuardForProviderContext({
      provider: resolution.selectedProvider,
      market: marketCode,
      method,
      currency: session.currency,
      ruleId: resolution.ruleId,
    }, options.registry),
  };
}

interface ActionProviderSuccessLike {
  selectedProvider: PaymentProvider;
  mode: PaymentMode;
  ruleId: string;
}

function credentialChecksForProvider(): readonly [] {
  // TODO(real providers): define presence-only credential requirement names only after
  // official Toss/PayPal docs review. This must later come from a provider/mode
  // credential requirement table or equivalent, without reading secret values.
  return [];
}

function providerUnavailable(): ProviderUnavailableFailure {
  return {
    success: false,
    errorCode: "PROVIDER_UNAVAILABLE",
    error: "No payment provider is available.",
    retryable: false,
  };
}
