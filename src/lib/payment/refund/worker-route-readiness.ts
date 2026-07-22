import {
  isRefundExecutionDispatchAuthorizationEnabled,
  isRefundExecutionLeaseEnabled,
  isRefundExecutionObservationApplicationEnabled,
  isRefundExecutionTossAuthorizationEnabled,
  isRefundExecutionTossContactEnabled,
  isRefundExecutionTossEligibilityLookupEnabled,
  isRefundExecutionTossRecoveryLookupEnabled,
  isRefundExecutionTossRecoveryRecontactEnabled,
  isRefundExecutionUncontactedRecoveryEnabled,
} from "./execution-activation";
type ActivationEnv = Readonly<Record<string, string | undefined>>;
type CredentialStatus = "ABSENT" | "CONFIGURED";

export type RefundExecutionWorkerRouteReadiness = Readonly<{
  READY: boolean;
  UNCONTACTED: boolean;
  CONTACTED_LOOKUP: boolean;
  CONTACTED_RECONTACT: boolean;
}>;

export function refundExecutionWorkerRouteReadiness(
  env: ActivationEnv,
  credentialStatus: CredentialStatus,
): RefundExecutionWorkerRouteReadiness {
  const ready = readyRefundExecutionWorkerRouteIsReady(env, credentialStatus);
  const uncontacted = uncontactedRefundExecutionWorkerRouteIsReady(env, credentialStatus);
  const contactedLookup = contactedRefundExecutionWorkerLookupRouteIsReady(env, credentialStatus);
  return Object.freeze({
    READY: ready,
    UNCONTACTED: uncontacted,
    CONTACTED_LOOKUP: contactedLookup,
    CONTACTED_RECONTACT: contactedLookup
      && isRefundExecutionTossRecoveryRecontactEnabled(env),
  });
}

export function readyRefundExecutionWorkerRouteIsReady(
  env: ActivationEnv,
  credentialStatus: CredentialStatus,
): boolean {
  return [
    isRefundExecutionLeaseEnabled(env),
    isRefundExecutionDispatchAuthorizationEnabled(env),
    isRefundExecutionTossAuthorizationEnabled(env),
    isRefundExecutionTossEligibilityLookupEnabled(env),
    isRefundExecutionTossContactEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialStatus === "CONFIGURED",
  ].every(Boolean);
}

export function uncontactedRefundExecutionWorkerRouteIsReady(
  env: ActivationEnv,
  credentialStatus: CredentialStatus,
): boolean {
  return [
    isRefundExecutionUncontactedRecoveryEnabled(env),
    isRefundExecutionDispatchAuthorizationEnabled(env),
    isRefundExecutionTossAuthorizationEnabled(env),
    isRefundExecutionTossEligibilityLookupEnabled(env),
    isRefundExecutionTossContactEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialStatus === "CONFIGURED",
  ].every(Boolean);
}

export function contactedRefundExecutionWorkerLookupRouteIsReady(
  env: ActivationEnv,
  credentialStatus: CredentialStatus,
): boolean {
  return [
    isRefundExecutionTossRecoveryLookupEnabled(env),
    isRefundExecutionObservationApplicationEnabled(env),
    credentialStatus === "CONFIGURED",
  ].every(Boolean);
}
