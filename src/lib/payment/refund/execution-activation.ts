type ActivationEnv = Readonly<Record<string, string | undefined>>;

export const REFUND_EXECUTION_CLAIM_ENABLED = "REFUND_EXECUTION_CLAIM_ENABLED";
export const REFUND_EXECUTION_LEASE_ENABLED = "REFUND_EXECUTION_LEASE_ENABLED";
export const REFUND_EXECUTION_LEASE_RELEASE_ENABLED = "REFUND_EXECUTION_LEASE_RELEASE_ENABLED";
export const REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED =
  "REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED";
export const REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED =
  "REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED";
export const REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED =
  "REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED";
export const REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED =
  "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED";

export class RefundExecutionActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid refund execution activation configuration for ${key}.`);
    this.name = "RefundExecutionActivationConfigError";
  }
}

export function isRefundExecutionClaimEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(REFUND_EXECUTION_CLAIM_ENABLED, env);
}

export function isRefundExecutionLeaseEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(REFUND_EXECUTION_LEASE_ENABLED, env);
}

export function isRefundExecutionLeaseReleaseEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(REFUND_EXECUTION_LEASE_RELEASE_ENABLED, env);
}

export function isRefundExecutionDispatchAuthorizationEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
    env,
  );
}

export function isRefundExecutionObservationApplicationEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
    env,
  );
}

export function isRefundExecutionTossAuthorizationEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
    env,
  );
}

export function isRefundExecutionTossEligibilityLookupEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
    env,
  );
}

function isRefundExecutionCapabilityEnabled(key: string, env: ActivationEnv): boolean {
  const value = env[key]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new RefundExecutionActivationConfigError(key);
}
