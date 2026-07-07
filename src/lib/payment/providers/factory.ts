import { PaymentProvider as ProviderCode } from "@prisma/client";
import type { ProviderFactoryContext } from "./contract";
import { createMockPaymentProvider } from "./mock";
import { PaymentMode, PROVIDER_REGISTRY, type PaymentMode as PaymentModeValue } from "./routing";
import type { PaymentProvider } from "./types";

export type ProviderResolveErrorCode =
  | "MOCK_PROVIDER_LIVE"
  | "LIVE_NOT_ENABLED"
  | "LIVE_CREDENTIALS_MISSING"
  | "LIVE_ADAPTER_UNAVAILABLE"
  | "PROVIDER_MODE_UNSUPPORTED"
  | "PROVIDER_NOT_ENABLED"
  | "PROVIDER_NOT_REGISTERED";

export interface CreateProviderAdapterOptions {
  sandboxAdapter?: (context: ProviderFactoryContext) => PaymentProvider;
  liveAdapters?: Partial<Record<ProviderCode, (context: ProviderFactoryContext) => PaymentProvider>>;
}

export class ProviderResolveException extends Error {
  constructor(
    readonly code: ProviderResolveErrorCode,
    readonly provider: ProviderCode,
    readonly mode: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderResolveException";
  }
}

export function createProviderAdapter(
  context: ProviderFactoryContext,
  options: CreateProviderAdapterOptions = {},
): PaymentProvider {
  assertSupportedMode(context);
  assertRegistryAllowsMode(context);
  if (context.mode === PaymentMode.SANDBOX) {
    return options.sandboxAdapter?.(context) ?? createMockPaymentProvider(context.provider);
  }

  assertLiveEnabled(context);
  assertLiveCredentialsPresent(context);
  const liveAdapter = options.liveAdapters?.[context.provider];
  if (liveAdapter) return liveAdapter(context);
  throw providerError(context, "LIVE_ADAPTER_UNAVAILABLE", "Live payment provider adapter is not wired.");
}

function assertSupportedMode(context: ProviderFactoryContext): asserts context is ProviderFactoryContext {
  if (context.mode === PaymentMode.SANDBOX || context.mode === PaymentMode.LIVE) return;
  throw providerError(context, "PROVIDER_MODE_UNSUPPORTED", "Payment provider mode is unsupported.");
}

function assertRegistryAllowsMode(context: ProviderFactoryContext): void {
  const entry = PROVIDER_REGISTRY[context.provider];
  if (!entry) throw providerError(context, "PROVIDER_NOT_REGISTERED", "Payment provider is not registered.");
  if (!entry.enabled) throw providerError(context, "PROVIDER_NOT_ENABLED", "Payment provider is not enabled.");
  if (entry.mockOnly && context.mode === PaymentMode.LIVE) {
    throw providerError(context, "MOCK_PROVIDER_LIVE", "Mock payment provider cannot run in LIVE mode.");
  }
  if (!modeAllowed(entry.allowedModes, context.mode)) {
    throw providerError(context, "PROVIDER_MODE_UNSUPPORTED", "Payment provider mode is unsupported.");
  }
}

function assertLiveEnabled(context: ProviderFactoryContext): void {
  if (context.liveGuard.kind === "allowed" && context.liveGuard.liveEnabled) return;
  throw providerError(context, "LIVE_NOT_ENABLED", "Payment provider is not live-enabled for this context.");
}

function assertLiveCredentialsPresent(context: ProviderFactoryContext): void {
  if (!context.credentials.some((credential) => credential.required && !credential.present)) return;
  throw providerError(context, "LIVE_CREDENTIALS_MISSING", "Live payment provider credentials are missing.");
}

function modeAllowed(allowedModes: readonly PaymentModeValue[], mode: string): boolean {
  return allowedModes.some((allowedMode) => allowedMode === mode);
}

function providerError(
  context: ProviderFactoryContext,
  code: ProviderResolveErrorCode,
  message: string,
): ProviderResolveException {
  return new ProviderResolveException(code, context.provider, String(context.mode), message);
}
