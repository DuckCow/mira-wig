import { PaymentProvider } from "@prisma/client";
import { PaymentModeConfigException, configuredPaymentMode } from "@/lib/payment/mode";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { credentialChecksForProvider, type ProviderEnv } from "@/lib/payment/providers/credentials";
import { ProviderResolveException, resolveConfirmationProvider } from "@/lib/payment/providers/resolve";
import {
  NoEligibleProviderError,
  defaultPaymentMethodForMarket,
  liveGuardForProviderContext,
  resolveProviderForPayment,
  type PaymentMethod,
  type PaymentMode,
  type ProviderRegistryEntry,
} from "@/lib/payment/providers/routing";
import type { PaymentConfirmationProvider } from "@/lib/payment/providers/types";

type ProviderUnavailableFailure = {
  success: false;
  errorCode: "PROVIDER_UNAVAILABLE";
  error: "No payment provider is available.";
  retryable: false;
};

type PaymentUnavailableFailure = {
  success: false;
  errorCode: "PAYMENT_UNAVAILABLE";
  error: "Pending payment attempt is unavailable.";
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
export type ActionModeResolution = { success: true; mode: PaymentMode } | ProviderUnavailableFailure;
export type AdapterResolutionResult =
  | { success: true; provider: PaymentConfirmationProvider }
  | ProviderUnavailableFailure
  | PaymentUnavailableFailure;

export interface ActionConfirmAdapterInput {
  session: ProviderBoundarySession;
  marketCode: string;
  method: PaymentMethod | undefined;
  payment: {
    provider: PaymentProvider;
    mode: PaymentMode;
    routingRuleId: string | null;
  };
}

interface ProviderFactoryContextOptions {
  registry?: Partial<Record<PaymentProvider, ProviderRegistryEntry>>;
  env?: ProviderEnv;
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

export function resolveActionMode(): ActionModeResolution {
  try {
    return { success: true, mode: configuredPaymentMode() };
  } catch (error) {
    if (error instanceof PaymentModeConfigException) return providerUnavailable();
    throw error;
  }
}

export function resolveActionConfirmAdapter(input: ActionConfirmAdapterInput): AdapterResolutionResult {
  try {
    const method = input.method ?? defaultPaymentMethodForMarket(input.marketCode);
    const configuredMode = configuredPaymentMode();
    if (configuredMode !== input.payment.mode) return paymentUnavailable();
    const routing = resolveProviderForPayment({
      market: input.marketCode,
      method,
      currency: input.session.currency,
      amountMinor: input.session.totalAmount,
      mode: configuredMode,
    });
    const context = createProviderFactoryContext(input.session, input.marketCode, method, {
      selectedProvider: input.payment.provider,
      mode: input.payment.mode,
      ruleId: input.payment.routingRuleId ?? routing.ruleId,
    });
    return { success: true, provider: resolveConfirmationProvider(context) };
  } catch (e) {
    if (e instanceof ProviderResolveException
      || e instanceof NoEligibleProviderError
      || e instanceof PaymentModeConfigException) return providerUnavailable();
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
    credentials: credentialChecksForProvider({
      provider: resolution.selectedProvider,
      mode: resolution.mode,
      capability: ProviderCapability.ACTION_ADAPTER,
    }, options.env),
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

function providerUnavailable(): ProviderUnavailableFailure {
  return {
    success: false,
    errorCode: "PROVIDER_UNAVAILABLE",
    error: "No payment provider is available.",
    retryable: false,
  };
}

function paymentUnavailable(): PaymentUnavailableFailure {
  return {
    success: false,
    errorCode: "PAYMENT_UNAVAILABLE",
    error: "Pending payment attempt is unavailable.",
    retryable: false,
  };
}
