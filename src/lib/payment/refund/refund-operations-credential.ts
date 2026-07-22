import { inspectRefundExecutionActivationInventory } from "./execution-activation";
import {
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
} from "./providers/toss/refund-credential-config";
import {
  credentialLifecycleCheck,
  refundOperationsFailure,
  type CredentialLifecycleCheckResult,
  type RefundOperationsFailure,
} from "./refund-operations-contract";

type OperationsEnv = Readonly<Record<string, string | undefined>>;

export function inspectRefundCredentialLifecycle(
  env: OperationsEnv,
): CredentialLifecycleCheckResult | RefundOperationsFailure {
  try {
    inspectRefundExecutionActivationInventory(env);
    const state = parseTossRefundCredentialConfig({
      secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
      merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
      credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
    });
    return state.status === "CONFIG_INVALID"
      ? refundOperationsFailure("CONFIG_INVALID")
      : credentialLifecycleCheck(state.status);
  } catch {
    return refundOperationsFailure("CONFIG_INVALID");
  }
}
