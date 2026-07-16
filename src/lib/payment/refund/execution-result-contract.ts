import {
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type RefundExecutionEvidence,
} from "@prisma/client";
import {
  normalizeRefundObservation,
  type NormalizedRefundObservation,
} from "./refund-observation-contract";

const FRESH_INPUT_FIELDS = [
  "commandId",
  "dispatchAttempt",
  "leaseGeneration",
  "leaseToken",
  "observation",
] as const;
const REPLAY_INPUT_FIELDS = ["commandId", "dispatchAttempt", "observation"] as const;
const INTERNAL_ID_MAX_CODE_POINTS = 128;
const POSTGRES_INT_MAX = 2_147_483_647;
const RESULT_KEY_PREFIX = "refund-result:";
const APPLY_KEY_PREFIX = "refund-exec-apply:";

const CANONICAL_SAFE_CODES: Record<
  Exclude<RefundExecutionEvidenceOutcome, typeof RefundExecutionEvidenceOutcome.SUCCEEDED>,
  string
> = {
  [RefundExecutionEvidenceOutcome.ACCEPTED_PENDING]: "PROVIDER_ACCEPTED_PENDING",
  [RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE]: "PROVIDER_NOT_EXECUTED_RETRYABLE",
  [RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL]: "PROVIDER_NOT_EXECUTED_TERMINAL",
  [RefundExecutionEvidenceOutcome.UNKNOWN]: "PROVIDER_OUTCOME_UNKNOWN",
};

export const INSUFFICIENT_SUCCESS_CODE = "REFUND_SUCCESS_EVIDENCE_INCOMPLETE";
export const EVIDENCE_CONFLICT_CODE = "REFUND_EVIDENCE_IDENTITY_CONFLICT";

export type PersistFreshRefundExecutionObservationInput = Readonly<{
  commandId: string;
  dispatchAttempt: number;
  leaseGeneration: number;
  leaseToken: string;
  observation: NormalizedRefundObservation;
}>;

export type ReplayRefundExecutionResultInput = Readonly<{
  commandId: string;
  dispatchAttempt: number;
  observation: NormalizedRefundObservation;
}>;

export type NormalizedPersistFreshRefundExecutionObservationInput = Readonly<{
  commandId: string;
  dispatchAttempt: number;
  leaseGeneration: number;
  leaseToken: string;
  observation: NormalizedRefundObservation;
}>;

export type NormalizedReplayRefundExecutionResultInput = Readonly<{
  commandId: string;
  dispatchAttempt: number;
  observation: NormalizedRefundObservation;
}>;

export type NormalizedRefundResultInput =
  | NormalizedPersistFreshRefundExecutionObservationInput
  | NormalizedReplayRefundExecutionResultInput;

export type RefundExecutionResultFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_DISPATCH_ATTEMPT"
  | "INVALID_LEASE_GENERATION"
  | "INVALID_LEASE_TOKEN"
  | "INVALID_OBSERVATION"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "FRESH_FENCE_REQUIRED"
  | "FRESH_LEASE_FENCE_MISMATCH"
  | "DISPATCH_ATTEMPT_MISMATCH"
  | "CONTACT_NOT_AUTHORIZED"
  | "EVIDENCE_IDEMPOTENCY_CONFLICT"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type RefundExecutionResultFailure = Readonly<{
  ok: false;
  code: RefundExecutionResultFailureCode;
  message: string;
}>;

export type RefundExecutionResultSuccess = Readonly<{
  ok: true;
  evidenceId: string;
  commandId: string;
  refundAttemptId: string;
  application: RefundExecutionEvidenceApplication;
  replayed: boolean;
}>;

export type RefundExecutionResult = RefundExecutionResultSuccess | RefundExecutionResultFailure;

export function normalizePersistFreshRefundExecutionObservationInput(
  input: unknown,
): { ok: true; input: NormalizedPersistFreshRefundExecutionObservationInput } | RefundExecutionResultFailure {
  if (!hasExactEnumerableFields(input, FRESH_INPUT_FIELDS)) return invalidObservationInput();
  const common = normalizeCommonInput(input);
  if (!common.ok) return common;
  if (!isPositivePostgresInteger(input.leaseGeneration)) {
    return resultFailure("INVALID_LEASE_GENERATION", "Lease generation is invalid.");
  }
  const leaseToken = normalizeRequiredText(input.leaseToken);
  if (!leaseToken || !/^[0-9a-f]{64}$/.test(leaseToken)) {
    return resultFailure("INVALID_LEASE_TOKEN", "Lease token is invalid.");
  }
  return Object.freeze({
    ok: true,
    input: Object.freeze({
      ...common.input,
      leaseGeneration: input.leaseGeneration,
      leaseToken,
    }),
  });
}

export function normalizeReplayRefundExecutionResultInput(
  input: unknown,
): { ok: true; input: NormalizedReplayRefundExecutionResultInput } | RefundExecutionResultFailure {
  if (!hasExactEnumerableFields(input, REPLAY_INPUT_FIELDS)) return invalidObservationInput();
  return normalizeCommonInput(input);
}

function normalizeCommonInput(
  input: Record<string, unknown>,
): { ok: true; input: NormalizedReplayRefundExecutionResultInput } | RefundExecutionResultFailure {
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId || Array.from(commandId).length > INTERNAL_ID_MAX_CODE_POINTS) {
    return resultFailure("INVALID_COMMAND_ID", "Command id is invalid.");
  }
  if (!isPositivePostgresInteger(input.dispatchAttempt)) {
    return resultFailure("INVALID_DISPATCH_ATTEMPT", "Dispatch attempt is invalid.");
  }
  const normalizedObservation = normalizeRefundObservation(input.observation);
  if (!normalizedObservation.ok) return invalidObservationInput();
  const observation = withCanonicalSafeCode(normalizedObservation.observation);
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, dispatchAttempt: input.dispatchAttempt, observation }),
  });
}

function withCanonicalSafeCode(observation: NormalizedRefundObservation): NormalizedRefundObservation {
  const safeCode = observation.safeCode ?? canonicalCode(observation.outcome);
  return Object.freeze({ ...observation, safeCode, observedAt: new Date(observation.observedAt.getTime()) });
}

function canonicalCode(outcome: RefundExecutionEvidenceOutcome): string | null {
  return outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? null : CANONICAL_SAFE_CODES[outcome];
}

export function buildRefundResultDedupKey(commandId: string, dispatchAttempt: number): string {
  return `${RESULT_KEY_PREFIX}${commandId}:${dispatchAttempt}`;
}

export function buildRefundExecutionApplyOperationKey(evidenceId: string): string {
  const normalized = evidenceId.trim();
  if (!normalized) throw new Error("Refund execution application key requires an evidence id.");
  return `${APPLY_KEY_PREFIX}${normalized}`;
}

export function sameRefundEvidenceObservation(
  evidence: RefundExecutionEvidence,
  candidate: NormalizedRefundObservation,
  safeCode: string | null = candidate.safeCode,
  safeMessage: string | null = candidate.safeMessage,
): boolean {
  return [
    evidence.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    evidence.outcome === candidate.outcome,
    evidence.observedProviderRefundId === candidate.observedProviderRefundId,
    evidence.reportedAmount === candidate.reportedAmount,
    evidence.reportedCurrency === candidate.reportedCurrency,
    evidence.safeCode === safeCode,
    evidence.safeMessage === safeMessage,
    evidence.observedAt.getTime() === candidate.observedAt.getTime(),
  ].every(Boolean);
}

export function resultSuccess(
  evidence: RefundExecutionEvidence,
  refundAttemptId: string,
  replayed: boolean,
): RefundExecutionResultSuccess {
  return Object.freeze({
    ok: true,
    evidenceId: evidence.id,
    commandId: evidence.commandId,
    refundAttemptId,
    application: evidence.application,
    replayed,
  });
}

export function resultFailure(
  code: RefundExecutionResultFailureCode,
  message: string,
): RefundExecutionResultFailure {
  return Object.freeze({ ok: false, code, message });
}

function invalidObservationInput(): RefundExecutionResultFailure {
  return resultFailure("INVALID_OBSERVATION", "Refund observation input is invalid.");
}

function hasExactEnumerableFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value).filter((key) => (
    Object.prototype.propertyIsEnumerable.call(value, key)
  ));
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}
