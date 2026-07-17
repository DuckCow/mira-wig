import {
  isRefundExecutionDispatchAuthorizationEnabled,
  isRefundExecutionTossAuthorizationEnabled,
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
  tossRefundAuthorizationFailure as failure,
  type TossRefundAuthorizationFailure,
} from "./refund-authorization-contract";

export type TossAuthorizationEnv = Readonly<Record<string, string | undefined>>;

export function tossAuthorizationPrerequisites(
  env: TossAuthorizationEnv,
): ConfiguredTossRefundCredential | TossRefundAuthorizationFailure {
  const generic = validateGate(() => isRefundExecutionDispatchAuthorizationEnabled(env));
  if (generic) return generic;
  const toss = validateGate(() => isRefundExecutionTossAuthorizationEnabled(env));
  if (toss) return toss;
  return configuredTossRefundCredential(env);
}

export function configuredTossRefundCredential(
  env: TossAuthorizationEnv,
): ConfiguredTossRefundCredential | TossRefundAuthorizationFailure {
  const state = parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  });
  return state.status === "CONFIGURED"
    ? state.configuration
    : failure("CONFIG_INVALID", "Toss refund credential configuration is invalid.");
}

export function validateTossLookupGate(
  env: TossAuthorizationEnv,
): TossRefundAuthorizationFailure | null {
  return validateGate(() => isRefundExecutionTossEligibilityLookupEnabled(env));
}

function validateGate(enabled: () => boolean): TossRefundAuthorizationFailure | null {
  try {
    return enabled()
      ? null
      : failure("FEATURE_DISABLED", "Toss refund authorization is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return failure("CONFIG_INVALID", "Toss refund authorization configuration is invalid.");
    }
    throw error;
  }
}
