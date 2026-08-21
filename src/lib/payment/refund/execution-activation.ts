type ActivationEnv = Readonly<Record<string, string | undefined>>;

export const REFUND_EXECUTION_CLAIM_ENABLED = "REFUND_EXECUTION_CLAIM_ENABLED";
export const REFUND_EXECUTION_LEASE_ENABLED = "REFUND_EXECUTION_LEASE_ENABLED";
export const REFUND_EXECUTION_LEASE_RELEASE_ENABLED = "REFUND_EXECUTION_LEASE_RELEASE_ENABLED";
export const REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED =
  "REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED";
export const REFUND_EXECUTION_WORKER_ENABLED = "REFUND_EXECUTION_WORKER_ENABLED";
export const REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED =
  "REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED";
export const REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED =
  "REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED";
export const REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED =
  "REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED";
export const REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED =
  "REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED";
export const REFUND_EXECUTION_TOSS_CONTACT_ENABLED =
  "REFUND_EXECUTION_TOSS_CONTACT_ENABLED";
export const REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED =
  "REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED";
export const REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED =
  "REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED";
export const REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED =
  "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED";

export const REFUND_EXECUTION_ACTIVATION_KEYS = Object.freeze([
  REFUND_EXECUTION_CLAIM_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
] as const);

export type RefundExecutionActivationInventory = Readonly<{
  workerEnabled: boolean;
}>;

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

export function isRefundExecutionUncontactedRecoveryEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
    env,
  );
}

export function isRefundExecutionWorkerEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(REFUND_EXECUTION_WORKER_ENABLED, env);
}

export function isRefundExecutionEximbayRoutingEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
    env,
  );
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

export function isRefundExecutionTossContactEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(REFUND_EXECUTION_TOSS_CONTACT_ENABLED, env);
}

export function isRefundExecutionTossRecoveryLookupEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
    env,
  );
}

export function isRefundExecutionTossRecoveryRecontactEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return isRefundExecutionCapabilityEnabled(
    REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
    env,
  );
}

export function inspectRefundExecutionActivationInventory(
  env: ActivationEnv = process.env,
): RefundExecutionActivationInventory {
  let workerEnabled = false;
  for (const key of REFUND_EXECUTION_ACTIVATION_KEYS) {
    const enabled = parseRefundExecutionCapabilityValue(key, env[key]);
    if (key === REFUND_EXECUTION_WORKER_ENABLED) workerEnabled = enabled;
  }
  return Object.freeze({ workerEnabled });
}

function isRefundExecutionCapabilityEnabled(key: string, env: ActivationEnv): boolean {
  return parseRefundExecutionCapabilityValue(key, env[key]);
}

function parseRefundExecutionCapabilityValue(
  key: string,
  rawValue: string | undefined,
): boolean {
  const value = rawValue?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new RefundExecutionActivationConfigError(key);
}
