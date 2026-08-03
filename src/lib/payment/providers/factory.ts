import { PaymentProvider as ProviderCode } from "@prisma/client";
import type { ProviderFactoryContext } from "./contract";
import { ProviderCapability, type ProviderCapability as ProviderCapabilityValue } from "./capabilities";
import {
  createMockPaymentConfirmationProvider,
  createMockPaymentInitiationProvider,
} from "./mock";
import { PaymentMode, PROVIDER_REGISTRY, type PaymentMode as PaymentModeValue } from "./routing";
import type {
  PaymentConfirmationProvider,
  PaymentInitiationProvider,
} from "./types";

export type ProviderResolveErrorCode =
  | "MOCK_PROVIDER_LIVE"
  | "LIVE_NOT_ENABLED"
  | "LIVE_CREDENTIALS_MISSING"
  | "LIVE_ADAPTER_UNAVAILABLE"
  | "SANDBOX_EXTERNAL_CONFIG_INVALID"
  | "SANDBOX_EXTERNAL_MISCONFIGURED"
  | "SANDBOX_EXTERNAL_CREDENTIALS_MISSING"
  | "SANDBOX_EXTERNAL_ADAPTER_UNAVAILABLE"
  | "PROVIDER_MODE_UNSUPPORTED"
  | "PROVIDER_NOT_ENABLED"
  | "PROVIDER_NOT_REGISTERED";

export const TOSS_SANDBOX_EXTERNAL_ENABLED = "TOSS_SANDBOX_EXTERNAL_ENABLED";

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export interface SandboxExternalCodeRegistryEntry {
  provider: ProviderCode;
  mode: typeof PaymentMode.SANDBOX;
  capability: ProviderCapabilityValue;
}

export interface SandboxExternalCapabilityInput {
  provider: ProviderCode;
  mode: PaymentModeValue;
  capability: ProviderCapabilityValue;
}

interface CreateProviderOptionsBase {
  env?: ProviderEnv;
  sandboxExternalCodeRegistry?: readonly SandboxExternalCodeRegistryEntry[];
}

export interface CreateInitiationProviderOptions extends CreateProviderOptionsBase {
  sandboxExternalInitiationAdapters?: Partial<
    Record<ProviderCode, (context: ProviderFactoryContext) => PaymentInitiationProvider>
  >;
  liveInitiationAdapters?: Partial<
    Record<ProviderCode, (context: ProviderFactoryContext) => PaymentInitiationProvider>
  >;
}

export interface CreateConfirmationProviderOptions extends CreateProviderOptionsBase {
  sandboxExternalConfirmationAdapters?: Partial<
    Record<ProviderCode, (context: ProviderFactoryContext) => PaymentConfirmationProvider>
  >;
  liveConfirmationAdapters?: Partial<
    Record<ProviderCode, (context: ProviderFactoryContext) => PaymentConfirmationProvider>
  >;
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

export function createInitiationProvider(
  context: ProviderFactoryContext,
  options: CreateInitiationProviderOptions = {},
): PaymentInitiationProvider {
  assertSupportedMode(context);
  assertRegistryAllowsMode(context);
  if (context.mode === PaymentMode.SANDBOX) return sandboxInitiationProvider(context, options);
  assertLiveEnabled(context);
  assertLiveCredentialsPresent(context);
  const adapter = options.liveInitiationAdapters?.[context.provider];
  if (adapter) return adapter(context);
  throw providerError(context, "LIVE_ADAPTER_UNAVAILABLE", "Live payment provider adapter is not wired.");
}

export function createConfirmationProvider(
  context: ProviderFactoryContext,
  options: CreateConfirmationProviderOptions = {},
): PaymentConfirmationProvider {
  assertSupportedMode(context);
  assertRegistryAllowsMode(context);
  if (context.mode === PaymentMode.SANDBOX) return sandboxConfirmationProvider(context, options);
  assertLiveEnabled(context);
  assertLiveCredentialsPresent(context);
  const adapter = options.liveConfirmationAdapters?.[context.provider];
  if (adapter) return adapter(context);
  throw providerError(context, "LIVE_ADAPTER_UNAVAILABLE", "Live payment provider adapter is not wired.");
}

function sandboxInitiationProvider(
  context: ProviderFactoryContext,
  options: CreateInitiationProviderOptions,
): PaymentInitiationProvider {
  if (!assertSandboxExternalReady(context, options)) return createMockPaymentInitiationProvider(context.provider);
  const adapter = options.sandboxExternalInitiationAdapters?.[context.provider];
  if (adapter) return adapter(context);
  throw providerError(context, "SANDBOX_EXTERNAL_ADAPTER_UNAVAILABLE", "Sandbox external provider adapter is not wired.");
}

function sandboxConfirmationProvider(
  context: ProviderFactoryContext,
  options: CreateConfirmationProviderOptions,
): PaymentConfirmationProvider {
  if (!assertSandboxExternalReady(context, options)) return createMockPaymentConfirmationProvider(context.provider);
  const adapter = options.sandboxExternalConfirmationAdapters?.[context.provider];
  if (adapter) return adapter(context);
  throw providerError(context, "SANDBOX_EXTERNAL_ADAPTER_UNAVAILABLE", "Sandbox external provider adapter is not wired.");
}

function assertSandboxExternalReady(
  context: ProviderFactoryContext,
  options: CreateProviderOptionsBase,
): boolean {
  const capability = sandboxCapabilityInput(context, ProviderCapability.ACTION_ADAPTER);
  const codeKeyEnabled = sandboxExternalCodeKeyEnabled(capability, options.sandboxExternalCodeRegistry);
  const deploymentKeyEnabled = sandboxExternalDeploymentKeyEnabled(capability, options.env ?? process.env);
  if (!codeKeyEnabled && !deploymentKeyEnabled) return false;
  if (codeKeyEnabled !== deploymentKeyEnabled) {
    throw providerError(context, "SANDBOX_EXTERNAL_MISCONFIGURED", "Sandbox external provider opt-in is incomplete.");
  }
  assertSandboxCredentialsPresent(context);
  return true;
}

export function sandboxExternalCodeKeyEnabled(
  input: SandboxExternalCapabilityInput,
  registry: readonly SandboxExternalCodeRegistryEntry[] = [],
): boolean {
  return registry.some((entry) => (
    entry.provider === input.provider
    && entry.mode === PaymentMode.SANDBOX
    && input.mode === PaymentMode.SANDBOX
    && entry.capability === input.capability
  ));
}

export function sandboxExternalDeploymentKeyEnabled(input: SandboxExternalCapabilityInput, env: ProviderEnv): boolean {
  const key = sandboxDeploymentKeyName(input.provider);
  if (!key) return false;
  const value = env[key]?.trim() ?? "";
  if (value.length === 0) return false;
  if (value === "ENABLED") return true;
  throw new ProviderResolveException(
    "SANDBOX_EXTERNAL_CONFIG_INVALID",
    input.provider,
    String(input.mode),
    "Sandbox external provider opt-in config is invalid.",
  );
}

function sandboxDeploymentKeyName(provider: ProviderCode): string | null {
  switch (provider) {
    case ProviderCode.TOSS:
      return TOSS_SANDBOX_EXTERNAL_ENABLED;
    case ProviderCode.MOCK:
    case ProviderCode.PAYPAL:
    case ProviderCode.EXIMBAY:
    default:
      return null;
  }
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

function assertSandboxCredentialsPresent(context: ProviderFactoryContext): void {
  const requiredCredentials = context.credentials.filter((credential) => credential.required);
  if (requiredCredentials.length > 0 && requiredCredentials.every((credential) => credential.present)) return;
  throw providerError(context, "SANDBOX_EXTERNAL_CREDENTIALS_MISSING", "Sandbox external provider credentials are missing.");
}

function sandboxCapabilityInput(
  context: ProviderFactoryContext,
  capability: ProviderCapabilityValue,
): SandboxExternalCapabilityInput {
  return { provider: context.provider, mode: context.mode, capability };
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
