import {
  exactRehearsalArray,
  exactRehearsalRecord,
} from "./refund-deployment-rehearsal-exact";

export const REFUND_DEPLOYMENT_REHEARSAL_FORMAT_VERSION =
  "mira-refund-deployment-rehearsal/v1";

export const REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS = Object.freeze([
  "SCHEDULER_DEPLOYMENT_NOT_PROVEN",
  "OVERLAP_SKIP_NOT_PROVEN",
  "EXTERNAL_HARD_DEADLINE_NOT_PROVEN",
  "MONITORING_INGESTION_NOT_PROVEN",
  "ALERT_DESTINATION_NOT_PROVEN",
  "OPERATIONS_OWNERSHIP_NOT_PROVEN",
  "MANUAL_RESOLUTION_AUTHORITY_NOT_PROVEN",
  "PROVIDER_RECONCILIATION_AUTHORITY_NOT_PROVEN",
  "HISTORICAL_CREDENTIAL_RESOLUTION_UNSUPPORTED",
  "P3E_SANDBOX_CANARY_NOT_AUTHORIZED",
] as const);

export const REFUND_DEPLOYMENT_REHEARSAL_STAGES = Object.freeze([
  "READINESS",
  "HEALTH",
  "MANUAL_REVIEW",
  "RECONCILIATION",
  "CREDENTIAL",
  "DISABLED_RUN_ONCE",
  "EXIT_POLICY",
  "OVERLAP_POLICY",
  "HARD_DEADLINE_POLICY",
] as const);

export const REFUND_DEPLOYMENT_REHEARSAL_FAILURE_REASONS = Object.freeze([
  "SPAWN_FAILED",
  "CHILD_TIMEOUT",
  "OUTPUT_OVERFLOW",
  "WRONG_CHANNEL",
  "MALFORMED_OUTPUT",
  "UNEXPECTED_EXIT",
  "UNEXPECTED_CODE",
  "UNSAFE_BACKLOG",
  "SIGNAL_TERMINATION",
  "NO_OUTPUT",
  "SYSTEMIC_FAILURE",
] as const);

const EXPECTED_REHEARSAL_CHECKS = Object.freeze({
  readiness: "PASS",
  health: "PASS",
  manualReview: "PASS",
  reconciliation: "PASS",
  credentialLifecycle: "PASS",
  disabledRunOnce: "PASS",
  exitPolicy: "PASS",
  overlapPolicy: "SIMULATED_ONLY",
  hardDeadlinePolicy: "SIMULATED_ONLY",
} as const);

export type RefundDeploymentRehearsalStage =
  (typeof REFUND_DEPLOYMENT_REHEARSAL_STAGES)[number];
export type RefundDeploymentRehearsalFailureReason =
  (typeof REFUND_DEPLOYMENT_REHEARSAL_FAILURE_REASONS)[number];

export type RefundDeploymentRehearsalHostResult =
  | Readonly<{
    ok: true;
    code: "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE";
    activation: "BLOCKED";
    providerExecution: "NOT_PERFORMED";
    checks: Readonly<{
      readiness: "PASS";
      health: "PASS";
      manualReview: "PASS";
      reconciliation: "PASS";
      credentialLifecycle: "PASS";
      disabledRunOnce: "PASS";
      exitPolicy: "PASS";
      overlapPolicy: "SIMULATED_ONLY";
      hardDeadlinePolicy: "SIMULATED_ONLY";
    }>;
    blockers: typeof REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS;
  }>
  | Readonly<{ ok: false; code: "INVALID_HOST_INPUT" }>
  | Readonly<{ ok: false; code: "UNSAFE_REHEARSAL_ENVIRONMENT" }>
  | Readonly<{
    ok: false;
    code: "REHEARSAL_CHECK_FAILED";
    stage: RefundDeploymentRehearsalStage;
    reason: RefundDeploymentRehearsalFailureReason;
  }>
  | Readonly<{ ok: false; code: "SYSTEMIC_FAILURE" }>;

export type RefundDeploymentRehearsalProcessCommand = "REHEARSE" | "INVALID";
export type RefundDeploymentRehearsalObservedResult = RefundDeploymentRehearsalHostResult & Readonly<{
  process: Readonly<{
    formatVersion: typeof REFUND_DEPLOYMENT_REHEARSAL_FORMAT_VERSION;
    command: RefundDeploymentRehearsalProcessCommand;
    operationDurationMs: number;
  }>;
}>;

export function parseRefundDeploymentRehearsalCliArgs(value: unknown): boolean {
  return exactRehearsalArray(value, 0) !== null;
}

export function refundDeploymentRehearsalComplete(): Extract<
  RefundDeploymentRehearsalHostResult,
  { readonly ok: true }
> {
  return Object.freeze({
    ok: true,
    code: "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE",
    activation: "BLOCKED",
    providerExecution: "NOT_PERFORMED",
    checks: EXPECTED_REHEARSAL_CHECKS,
    blockers: REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS,
  });
}

export function refundDeploymentRehearsalFailure(
  stage: RefundDeploymentRehearsalStage,
  reason: RefundDeploymentRehearsalFailureReason,
): RefundDeploymentRehearsalHostResult {
  return Object.freeze({ ok: false, code: "REHEARSAL_CHECK_FAILED", stage, reason });
}

export function refundDeploymentRehearsalExitCode(
  result: RefundDeploymentRehearsalHostResult,
): number {
  if (result.code === "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE") return 0;
  if (result.code === "INVALID_HOST_INPUT") return 64;
  if (result.code === "UNSAFE_REHEARSAL_ENVIRONMENT") return 78;
  return 1;
}

export function sanitizeRefundDeploymentRehearsalHostResult(
  value: unknown,
): RefundDeploymentRehearsalHostResult | null {
  const record = exactRecord(value);
  if (!record || typeof record.code !== "string") return null;
  return sanitizeSuccessRecord(record)
    ?? sanitizeSimpleFailureRecord(record)
    ?? sanitizeStageFailureRecord(record);
}

function sanitizeSuccessRecord(
  record: Record<string, unknown>,
): RefundDeploymentRehearsalHostResult | null {
  return record.code === "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE"
    && exactSuccess(record)
    ? refundDeploymentRehearsalComplete()
    : null;
}

function sanitizeSimpleFailureRecord(
  record: Record<string, unknown>,
): RefundDeploymentRehearsalHostResult | null {
  if (!simpleFailureCode(record.code) || !exactKeys(record, ["ok", "code"])
    || record.ok !== false) return null;
  return Object.freeze({ ok: false, code: record.code });
}

function sanitizeStageFailureRecord(
  record: Record<string, unknown>,
): RefundDeploymentRehearsalHostResult | null {
  if (record.code !== "REHEARSAL_CHECK_FAILED"
    || !exactKeys(record, ["ok", "code", "stage", "reason"]) || record.ok !== false) return null;
  if (!includesString(REFUND_DEPLOYMENT_REHEARSAL_STAGES, record.stage)
    || !includesString(REFUND_DEPLOYMENT_REHEARSAL_FAILURE_REASONS, record.reason)) return null;
  return refundDeploymentRehearsalFailure(record.stage, record.reason);
}

function simpleFailureCode(value: unknown): value is
"INVALID_HOST_INPUT" | "UNSAFE_REHEARSAL_ENVIRONMENT" | "SYSTEMIC_FAILURE" {
  return value === "INVALID_HOST_INPUT" || value === "UNSAFE_REHEARSAL_ENVIRONMENT"
    || value === "SYSTEMIC_FAILURE";
}

function exactSuccess(record: Record<string, unknown>): boolean {
  const exact = exactRehearsalRecord(record, [
    "ok", "code", "activation", "providerExecution", "checks", "blockers",
  ]);
  if (!exact
    || record.ok !== true || record.activation !== "BLOCKED"
    || record.providerExecution !== "NOT_PERFORMED") return false;
  const checks = exactRehearsalRecord(exact.checks, [
    ...Object.keys(EXPECTED_REHEARSAL_CHECKS),
  ]);
  if (!checks || !Object.entries(EXPECTED_REHEARSAL_CHECKS).every(
    ([key, value]) => checks[key] === value,
  )) return false;
  const blockers = exactRehearsalArray(
    exact.blockers,
    REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS.length,
  );
  return blockers !== null && blockers.every((value, index) => (
    value === REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS[index]
  ));
}

function exactRecord(value: unknown): Record<string, unknown> | null {
  return exactRehearsalRecord(value);
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function includesString<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}
