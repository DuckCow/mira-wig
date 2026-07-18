import {
  isRefundExecutionDispatchAuthorizationEnabled,
  isRefundExecutionLeaseEnabled,
  isRefundExecutionObservationApplicationEnabled,
  isRefundExecutionTossAuthorizationEnabled,
  isRefundExecutionTossContactEnabled,
  isRefundExecutionTossEligibilityLookupEnabled,
  isRefundExecutionTossRecoveryLookupEnabled,
  isRefundExecutionUncontactedRecoveryEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
} from "./providers/toss/refund-credential-config";
import { workerFailure, type RefundExecutionWorkerCycleFailure } from "./worker-contract";
import type { RefundExecutionWorkerCandidateQueues } from "./worker-allocation";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export type RefundExecutionWorkerPreflight = Readonly<{
  CONTACTED: boolean;
  UNCONTACTED: boolean;
  READY: boolean;
}>;

export type RefundExecutionWorkerPreflightResult =
  | Readonly<{ ok: true; readiness: RefundExecutionWorkerPreflight }>
  | RefundExecutionWorkerCycleFailure;

export function preflightRefundExecutionWorkerRoutes(
  queues: RefundExecutionWorkerCandidateQueues,
  env: ActivationEnv,
): RefundExecutionWorkerPreflightResult {
  try {
    const credential = selectedCredentialReadiness(queues, env);
    if (credential === "CONFIG_INVALID") return workerFailure("CONFIG_INVALID");
    const configured = credential === "CONFIGURED";
    const ready = queues.READY.length === 0 || readyRouteEnabled(env, configured);
    const uncontacted = queues.UNCONTACTED.length === 0
      || uncontactedRouteEnabled(env, configured);
    const contacted = queues.CONTACTED.length === 0
      || contactedRouteEnabled(env, configured);
    return Object.freeze({
      ok: true,
      readiness: Object.freeze({ CONTACTED: contacted, UNCONTACTED: uncontacted, READY: ready }),
    });
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return workerFailure("CONFIG_INVALID");
    }
    throw error;
  }
}

function selectedCredentialReadiness(
  queues: RefundExecutionWorkerCandidateQueues,
  env: ActivationEnv,
): "ABSENT" | "CONFIG_INVALID" | "CONFIGURED" {
  return Object.values(queues).some((queue) => queue.length > 0)
    ? credentialReadiness(env)
    : "ABSENT";
}

function readyRouteEnabled(env: ActivationEnv, credentialConfigured: boolean): boolean {
  return [
    isRefundExecutionLeaseEnabled(env),
    isRefundExecutionDispatchAuthorizationEnabled(env),
    isRefundExecutionTossAuthorizationEnabled(env),
    isRefundExecutionTossEligibilityLookupEnabled(env),
    isRefundExecutionTossContactEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialConfigured,
  ].every(Boolean);
}

function uncontactedRouteEnabled(env: ActivationEnv, credentialConfigured: boolean): boolean {
  return [
    isRefundExecutionUncontactedRecoveryEnabled(env),
    isRefundExecutionDispatchAuthorizationEnabled(env),
    isRefundExecutionTossAuthorizationEnabled(env),
    isRefundExecutionTossEligibilityLookupEnabled(env),
    isRefundExecutionTossContactEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialConfigured,
  ].every(Boolean);
}

function contactedRouteEnabled(env: ActivationEnv, credentialConfigured: boolean): boolean {
  return [
    isRefundExecutionTossRecoveryLookupEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialConfigured,
  ].every(Boolean);
}

function credentialReadiness(
  env: ActivationEnv,
): "ABSENT" | "CONFIG_INVALID" | "CONFIGURED" {
  return parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  }).status;
}
