import { PaymentProvider as ProviderCode } from "@prisma/client";
import type { ProviderCredentialCheck } from "./contract";
import { ProviderCapability, type ProviderCapability as ProviderCapabilityValue } from "./capabilities";
import { PaymentMode, type PaymentMode as PaymentModeValue } from "./routing";

export const TOSS_SANDBOX_SECRET_KEY = "TOSS_SANDBOX_SECRET_KEY";
export const TOSS_LIVE_SECRET_KEY = "TOSS_LIVE_SECRET_KEY";

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

interface ProviderCredentialRequirement {
  provider: ProviderCode;
  mode: PaymentModeValue;
  capability: ProviderCapabilityValue;
  name: string;
}

const ACTION_ADAPTER_CREDENTIALS: readonly ProviderCredentialRequirement[] = [
  {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: TOSS_SANDBOX_SECRET_KEY,
  },
  {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.LIVE,
    capability: ProviderCapability.ACTION_ADAPTER,
    name: TOSS_LIVE_SECRET_KEY,
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
  return ACTION_ADAPTER_CREDENTIALS
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
