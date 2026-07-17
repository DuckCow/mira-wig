import {
  isRefundExecutionObservationApplicationEnabled,
  isRefundExecutionTossRecoveryLookupEnabled,
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
  recoveryFailure,
  type TossRefundRecoveryFailure,
} from "./refund-recovery-contract";

export type TossRecoveryEnv = Readonly<Record<string, string | undefined>>;

export function tossRecoveryPrerequisites(
  env: TossRecoveryEnv,
): ConfiguredTossRefundCredential | TossRefundRecoveryFailure {
  const lookupGate = validateGate(() => isRefundExecutionTossRecoveryLookupEnabled(env));
  if (lookupGate) return lookupGate;
  const applicationGate = validateGate(
    () => isRefundExecutionObservationApplicationEnabled(env),
  );
  if (applicationGate) return applicationGate;
  const state = parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  });
  if (state.status === "CONFIGURED") return state.configuration;
  return state.status === "ABSENT"
    ? recoveryFailure(
      "RECOVERY_CREDENTIAL_UNAVAILABLE",
      "Toss refund recovery credential is unavailable.",
    )
    : recoveryFailure("CONFIG_INVALID", "Toss refund recovery configuration is invalid.");
}

export function isConfiguredRecoveryCredential(
  value: ConfiguredTossRefundCredential | TossRefundRecoveryFailure,
): value is ConfiguredTossRefundCredential {
  return "readSecretKey" in value;
}

function validateGate(enabled: () => boolean): TossRefundRecoveryFailure | null {
  try {
    return enabled()
      ? null
      : recoveryFailure("FEATURE_DISABLED", "Toss refund recovery is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return recoveryFailure("CONFIG_INVALID", "Toss refund recovery configuration is invalid.");
    }
    throw error;
  }
}
