import type { AcquireRefundExecutionLeaseFailureCode } from "./lease-contract";
import type { ReclaimUncontactedRefundExecutionFailureCode } from "./uncontacted-recovery-contract";
import type { TossRefundAuthorizationFailureCode } from "./providers/toss/refund-authorization-contract";
import type { TossRefundContactFailureCode } from "./providers/toss/refund-contact-contract";
import type { TossRefundRecoveryFailureCode } from "./providers/toss/refund-recovery-contract";

export type RefundExecutionWorkerOutcomeKind =
  | "SUCCEEDED"
  | "REPLAYED"
  | "TEMPORARY"
  | "MANUAL"
  | "CONFLICT"
  | "INCONSISTENT"
  | "SKIPPED"
  | "FAILED"
  | "CONFIG_INVALID";

export type RefundExecutionWorkerRouteOutcome = Readonly<{
  kind: RefundExecutionWorkerOutcomeKind;
  selectorRaceLoss: boolean;
}>;

const SUCCEEDED = outcome("SUCCEEDED");
const REPLAYED = outcome("REPLAYED");
const TEMPORARY = outcome("TEMPORARY");
const MANUAL = outcome("MANUAL");
const CONFLICT = outcome("CONFLICT");
const RACE_CONFLICT = outcome("CONFLICT", true);
const INCONSISTENT = outcome("INCONSISTENT");
const SKIPPED = outcome("SKIPPED");
const RACE_SKIPPED = outcome("SKIPPED", true);
const FAILED = outcome("FAILED");
const CONFIG_INVALID = outcome("CONFIG_INVALID");

const ACQUIRE_FAILURES = {
  FEATURE_DISABLED: SKIPPED,
  CONFIG_INVALID,
  INVALID_COMMAND_ID: FAILED,
  INVALID_LEASE_OWNER: FAILED,
  COMMAND_NOT_FOUND_OR_INELIGIBLE: RACE_SKIPPED,
  COMMAND_NOT_READY: RACE_SKIPPED,
  NOT_YET_AVAILABLE: RACE_SKIPPED,
  LEASE_CONFLICT: RACE_CONFLICT,
  PAYMENT_NOT_EXECUTABLE: INCONSISTENT,
  LEDGER_INCONSISTENT: INCONSISTENT,
} satisfies Readonly<Record<AcquireRefundExecutionLeaseFailureCode, RefundExecutionWorkerRouteOutcome>>;

const RECLAIM_FAILURES = {
  FEATURE_DISABLED: SKIPPED,
  CONFIG_INVALID,
  INVALID_COMMAND_ID: FAILED,
  INVALID_RECOVERY_OWNER: FAILED,
  COMMAND_NOT_FOUND_OR_INELIGIBLE: RACE_SKIPPED,
  LEASE_NOT_EXPIRED: RACE_CONFLICT,
  LEASE_CONFLICT: RACE_CONFLICT,
  AUTHORIZED_RECOVERY_UNSUPPORTED: MANUAL,
  CONTACTED_RECOVERY_REQUIRED: MANUAL,
  LEDGER_INCONSISTENT: INCONSISTENT,
  PERSISTENCE_CONFLICT: RACE_CONFLICT,
} satisfies Readonly<Record<
  ReclaimUncontactedRefundExecutionFailureCode,
  RefundExecutionWorkerRouteOutcome
>>;

const AUTHORIZATION_FAILURES = {
  FEATURE_DISABLED: SKIPPED,
  CONFIG_INVALID,
  INVALID_COMMAND_ID: FAILED,
  INVALID_LEASE_GENERATION: FAILED,
  INVALID_LEASE_TOKEN: FAILED,
  COMMAND_NOT_FOUND_OR_INELIGIBLE: RACE_SKIPPED,
  LEASE_EXPIRED: RACE_CONFLICT,
  LEASE_FENCE_MISMATCH: RACE_CONFLICT,
  CONTACT_RECOVERY_REQUIRED: MANUAL,
  TOSS_LOOKUP_UNAVAILABLE: TEMPORARY,
  TOSS_LOOKUP_REJECTED: TEMPORARY,
  TOSS_PAYMENT_NOT_ELIGIBLE: TEMPORARY,
  CREDENTIAL_BINDING_MISMATCH: CONFLICT,
  DISPATCH_AUTHORIZATION_CONFLICT: RACE_CONFLICT,
  REFUND_LEDGER_INCONSISTENT: INCONSISTENT,
  PERSISTENCE_CONFLICT: RACE_CONFLICT,
} satisfies Readonly<Record<
  TossRefundAuthorizationFailureCode,
  RefundExecutionWorkerRouteOutcome
>>;

const CONTACT_FAILURES = {
  FEATURE_DISABLED: SKIPPED,
  CONFIG_INVALID,
  INVALID_COMMAND_ID: FAILED,
  INVALID_LEASE_GENERATION: FAILED,
  INVALID_LEASE_TOKEN: FAILED,
  COMMAND_NOT_FOUND_OR_INELIGIBLE: RACE_SKIPPED,
  LEASE_EXPIRED: RACE_CONFLICT,
  LEASE_FENCE_MISMATCH: RACE_CONFLICT,
  CONTACT_RECOVERY_REQUIRED: MANUAL,
  CONTACT_ELIGIBILITY_UNAVAILABLE: TEMPORARY,
  CONTACT_ELIGIBILITY_REJECTED: TEMPORARY,
  TOSS_PAYMENT_NOT_ELIGIBLE: TEMPORARY,
  CREDENTIAL_BINDING_MISMATCH: CONFLICT,
  REFUND_LEDGER_INCONSISTENT: INCONSISTENT,
  TOSS_CONTACT_OUTCOME_UNKNOWN: TEMPORARY,
  TOSS_CONTACT_RESPONSE_REJECTED: TEMPORARY,
  PERSISTENCE_CONFLICT: RACE_CONFLICT,
} satisfies Readonly<Record<TossRefundContactFailureCode, RefundExecutionWorkerRouteOutcome>>;

const RECOVERY_FAILURES = {
  INVALID_COMMAND_ID: FAILED,
  INVALID_RECOVERY_OWNER: FAILED,
  FEATURE_DISABLED: SKIPPED,
  CONFIG_INVALID,
  COMMAND_NOT_FOUND_OR_INELIGIBLE: RACE_SKIPPED,
  RECOVERY_LEASE_CONFLICT: RACE_CONFLICT,
  RECOVERY_CREDENTIAL_UNAVAILABLE: SKIPPED,
  RECOVERY_LOOKUP_UNAVAILABLE: TEMPORARY,
  RECOVERY_LOOKUP_REJECTED: TEMPORARY,
  RECOVERY_PROVIDER_PROCESSING: TEMPORARY,
  RECOVERY_RECONTACT_REQUIRED: TEMPORARY,
  RECOVERY_MANUAL_REVIEW_REQUIRED: MANUAL,
  RECOVERY_DEADLINE_EXPIRED: MANUAL,
  RECOVERY_ORDINAL_LIMIT_REACHED: MANUAL,
  RECOVERY_INTERVAL_NOT_ELAPSED: TEMPORARY,
  RECOVERY_CONTACT_OUTCOME_UNKNOWN: TEMPORARY,
  RECOVERY_CONTACT_RESPONSE_REJECTED: TEMPORARY,
  REFUND_LEDGER_INCONSISTENT: INCONSISTENT,
  PERSISTENCE_CONFLICT: RACE_CONFLICT,
} satisfies Readonly<Record<TossRefundRecoveryFailureCode, RefundExecutionWorkerRouteOutcome>>;

export function classifyAcquireWorkerFailure(
  code: AcquireRefundExecutionLeaseFailureCode,
): RefundExecutionWorkerRouteOutcome {
  return ACQUIRE_FAILURES[code];
}

export function classifyReclaimWorkerFailure(
  code: ReclaimUncontactedRefundExecutionFailureCode,
): RefundExecutionWorkerRouteOutcome {
  return RECLAIM_FAILURES[code];
}

export function classifyAuthorizationWorkerFailure(
  code: TossRefundAuthorizationFailureCode,
): RefundExecutionWorkerRouteOutcome {
  return AUTHORIZATION_FAILURES[code];
}

export function classifyContactWorkerFailure(
  code: TossRefundContactFailureCode,
): RefundExecutionWorkerRouteOutcome {
  return CONTACT_FAILURES[code];
}

export function classifyRecoveryWorkerFailure(
  code: TossRefundRecoveryFailureCode,
): RefundExecutionWorkerRouteOutcome {
  return RECOVERY_FAILURES[code];
}

export function classifyWorkerSuccess(replayed: boolean): RefundExecutionWorkerRouteOutcome {
  return replayed ? REPLAYED : SUCCEEDED;
}

export function isSelectorRaceLoss(outcomeValue: RefundExecutionWorkerRouteOutcome): boolean {
  return outcomeValue.selectorRaceLoss;
}

export function stopsRefundExecutionWorkerCycle(
  outcomeValue: RefundExecutionWorkerRouteOutcome,
): boolean {
  return outcomeValue.kind === "CONFIG_INVALID" || outcomeValue.kind === "FAILED";
}

function outcome(
  kind: RefundExecutionWorkerOutcomeKind,
  selectorRaceLoss = false,
): RefundExecutionWorkerRouteOutcome {
  return Object.freeze({ kind, selectorRaceLoss });
}
