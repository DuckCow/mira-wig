import { PaymentProvider as ProviderCode } from "@prisma/client";
import type { ProviderCredentialCheck } from "./contract";
import { ProviderCapability, type ProviderCapability as ProviderCapabilityValue } from "./capabilities";
import { PaymentMode, type PaymentMode as PaymentModeValue } from "./routing";

export const TOSS_SANDBOX_SECRET_KEY = "TOSS_SANDBOX_SECRET_KEY";
export const TOSS_LIVE_SECRET_KEY = "TOSS_LIVE_SECRET_KEY";
export const EXIMBAY_SANDBOX_API_KEY = "EXIMBAY_SANDBOX_API_KEY";
export const EXIMBAY_SANDBOX_MID = "EXIMBAY_SANDBOX_MID";
export const EXIMBAY_LIVE_API_KEY = "EXIMBAY_LIVE_API_KEY";
export const EXIMBAY_LIVE_MID = "EXIMBAY_LIVE_MID";
export const PAYMENT_PUBLIC_ORIGIN = "PAYMENT_PUBLIC_ORIGIN";

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

interface ProviderCredentialRequirement {
  provider: ProviderCode;
  mode: PaymentModeValue;
  capability: ProviderCapabilityValue;
  name: string;
}

const PROVIDER_CREDENTIALS: readonly ProviderCredentialRequirement[] = [
  {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: TOSS_SANDBOX_SECRET_KEY,
  },
  {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.WEBHOOK_VERIFIER,
    name: TOSS_SANDBOX_SECRET_KEY,
  },
  {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.LIVE,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: TOSS_LIVE_SECRET_KEY,
  },
  {
    provider: ProviderCode.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: EXIMBAY_SANDBOX_API_KEY,
  },
  {
    provider: ProviderCode.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: EXIMBAY_SANDBOX_MID,
  },
  {
    provider: ProviderCode.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: PAYMENT_PUBLIC_ORIGIN,
  },
];

export interface ProviderCredentialRequirementInput {
  provider: ProviderCode;
  mode: PaymentModeValue;
  capability: ProviderCapabilityValue;
}

export function credentialChecksForProvider(
  input: ProviderCredentialRequirementInput,
  env: ProviderEnv = process.env,
): readonly ProviderCredentialCheck[] {
  return PROVIDER_CREDENTIALS
    .filter((requirement) => matchesRequirement(requirement, input))
    .map((requirement) => ({
      name: requirement.name,
      required: true,
      present: envValuePresent(env[requirement.name]),
    }));
}

function matchesRequirement(
  requirement: ProviderCredentialRequirement,
  input: ProviderCredentialRequirementInput,
): boolean {
  return requirement.provider === input.provider
    && requirement.mode === input.mode
    && requirement.capability === input.capability;
}

function envValuePresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
