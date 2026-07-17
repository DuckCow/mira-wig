import {
  isRefundExecutionObservationApplicationEnabled,
  isRefundExecutionTossContactEnabled,
  isRefundExecutionTossEligibilityLookupEnabled,
  RefundExecutionActivationConfigError,
} from "../../execution-activation";
import {
  ConfiguredTossRefundCredential,
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
} from "./refund-credential-config";
import {
  contactFailure,
  type TossRefundContactFailure,
} from "./refund-contact-contract";

export type TossContactEnv = Readonly<Record<string, string | undefined>>;

export function tossContactPrerequisites(
  env: TossContactEnv,
): ConfiguredTossRefundCredential | TossRefundContactFailure {
  const gates = [
    () => isRefundExecutionTossContactEnabled(env),
    () => isRefundExecutionTossEligibilityLookupEnabled(env),
    () => isRefundExecutionObservationApplicationEnabled(env),
  ];
  for (const gate of gates) {
    const failure = validateGate(gate);
    if (failure) return failure;
  }
  return configuredContactCredential(env);
}

export function configuredContactCredential(
  env: TossContactEnv,
): ConfiguredTossRefundCredential | TossRefundContactFailure {
  const state = parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  });
  return state.status === "CONFIGURED"
    ? state.configuration
    : contactFailure("CONFIG_INVALID", "Toss refund contact configuration is invalid.");
}

export function isConfiguredContactCredential(
  value: ConfiguredTossRefundCredential | TossRefundContactFailure,
): value is ConfiguredTossRefundCredential {
  return "readSecretKey" in value;
}

function validateGate(enabled: () => boolean): TossRefundContactFailure | null {
  try {
    return enabled()
      ? null
      : contactFailure("FEATURE_DISABLED", "Toss refund contact is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return contactFailure("CONFIG_INVALID", "Toss refund contact configuration is invalid.");
    }
    throw error;
  }
}
