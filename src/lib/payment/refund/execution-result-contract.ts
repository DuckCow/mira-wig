import {
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type RefundExecutionEvidence,
} from "@prisma/client";

const SOURCE_DEDUP_KEY_MAX = 512;
const PROVIDER_REFUND_ID_MAX = 512;
const SAFE_CODE_MAX = 128;
const SAFE_MESSAGE_MAX = 500;
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

export interface ResolveRefundAdapterResponseInput {
  commandId: string;
  dispatchAttempt: number;
  outcome: RefundExecutionEvidenceOutcome;
  observedProviderRefundId: string | null;
  reportedAmount: number | null;
  reportedCurrency: string | null;
  safeCode: string | null;
  safeMessage: string | null;
  observedAt: Date;
  now: Date;
}

export interface NormalizedRefundAdapterResponse {
  commandId: string;
  dispatchAttempt: number;
  sourceDedupKey: string;
  outcome: RefundExecutionEvidenceOutcome;
  observedProviderRefundId: string | null;
  reportedAmount: number | null;
  reportedCurrency: string | null;
  safeCode: string | null;
  safeMessage: string | null;
  observedAt: Date;
  now: Date;
}

export type ResolveRefundAdapterResponseFailureCode =
  | "INVALID_COMMAND_ID"
  | "INVALID_DISPATCH_ATTEMPT"
  | "INVALID_EVIDENCE"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_ATTEMPT_MISMATCH"
  | "COMMAND_STATE_CONFLICT"
  | "REFUND_LEDGER_INCONSISTENT"
  | "EVIDENCE_IDEMPOTENCY_CONFLICT"
  | "PERSISTENCE_CONFLICT";

export interface ResolveRefundAdapterResponseFailure {
  ok: false;
  code: ResolveRefundAdapterResponseFailureCode;
  message: string;
}

export type ResolveRefundAdapterResponseResult =
  | {
      ok: true;
      evidenceId: string;
      commandId: string;
      refundAttemptId: string;
      application: RefundExecutionEvidenceApplication;
      replayed: boolean;
    }
  | ResolveRefundAdapterResponseFailure;

export function normalizeRefundAdapterResponse(
  input: ResolveRefundAdapterResponseInput,
): { ok: true; input: NormalizedRefundAdapterResponse } | ResolveRefundAdapterResponseFailure {
  const commandId = input.commandId.trim();
  if (!commandId) return resolutionFailure("INVALID_COMMAND_ID", "Command id is required.");
  if (!isPositiveSafeInteger(input.dispatchAttempt)) {
    return resolutionFailure("INVALID_DISPATCH_ATTEMPT", "Dispatch attempt must be a positive safe integer.");
  }
  if (!isEvidenceOutcome(input.outcome)) {
    return resolutionFailure("INVALID_EVIDENCE", "Evidence outcome is invalid.");
  }
  const sourceDedupKey = buildRefundResultDedupKey(commandId, input.dispatchAttempt);
  if (!withinBound(sourceDedupKey, SOURCE_DEDUP_KEY_MAX)) {
    return resolutionFailure("INVALID_COMMAND_ID", "Command id is too long for result identity.");
  }
  return normalizeEvidenceFields(input, commandId, sourceDedupKey);
}

function normalizeEvidenceFields(
  input: ResolveRefundAdapterResponseInput,
  commandId: string,
  sourceDedupKey: string,
): { ok: true; input: NormalizedRefundAdapterResponse } | ResolveRefundAdapterResponseFailure {
  const providerId = normalizeOptional(input.observedProviderRefundId, PROVIDER_REFUND_ID_MAX);
  if (!providerId.ok) {
    return resolutionFailure("INVALID_EVIDENCE", "Evidence text exceeds its normalized storage bound.");
  }
  const diagnostics = normalizeDiagnostics(input.safeCode, input.safeMessage);
  if (!diagnostics.ok) return diagnostics;
  const money = normalizeMoney(input.reportedAmount, input.reportedCurrency);
  if (!money.ok) return money;
  if (!isValidDate(input.observedAt) || !isValidDate(input.now)) {
    return resolutionFailure("INVALID_EVIDENCE", "Evidence timestamps must be valid dates.");
  }
  return normalizedResult(
    input,
    commandId,
    sourceDedupKey,
    providerId.value,
    diagnostics.safeCode,
    diagnostics.safeMessage,
    money,
  );
}

function normalizeDiagnostics(
  code: string | null,
  message: string | null,
): { ok: true; safeCode: string | null; safeMessage: string | null } | ResolveRefundAdapterResponseFailure {
  const safeCode = normalizeOptional(code, SAFE_CODE_MAX);
  const safeMessage = normalizeOptional(message, SAFE_MESSAGE_MAX);
  if (!safeCode.ok || !safeMessage.ok) {
    return resolutionFailure("INVALID_EVIDENCE", "Evidence text exceeds its normalized storage bound.");
  }
  if (!isSafeCode(safeCode.value) || !isPrivacySafeMessage(safeMessage.value)) {
    return resolutionFailure("INVALID_EVIDENCE", "Evidence diagnostics are not safe for persistence.");
  }
  return { ok: true, safeCode: safeCode.value, safeMessage: safeMessage.value };
}

function normalizedResult(
  input: ResolveRefundAdapterResponseInput,
  commandId: string,
  sourceDedupKey: string,
  providerRefundId: string | null,
  safeCode: string | null,
  safeMessage: string | null,
  money: { ok: true; amount: number | null; currency: string | null },
): { ok: true; input: NormalizedRefundAdapterResponse } {
  return {
    ok: true,
    input: {
      commandId,
      dispatchAttempt: input.dispatchAttempt,
      sourceDedupKey,
      outcome: input.outcome,
      observedProviderRefundId: providerRefundId,
      reportedAmount: money.amount,
      reportedCurrency: money.currency,
      safeCode: safeCode ?? canonicalCode(input.outcome),
      safeMessage,
      observedAt: input.observedAt,
      now: input.now,
    },
  };
}

function normalizeMoney(
  amount: number | null,
  currency: string | null,
): { ok: true; amount: number | null; currency: string | null } | ResolveRefundAdapterResponseFailure {
  if (amount === null && currency === null) return { ok: true, amount: null, currency: null };
  if (amount === null || currency === null || !isPositiveSafeInteger(amount)) {
    return resolutionFailure("INVALID_EVIDENCE", "Reported amount and currency must be a valid pair.");
  }
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return resolutionFailure("INVALID_EVIDENCE", "Reported currency must be a three-letter code.");
  }
  return { ok: true, amount, currency: normalizedCurrency };
}

function normalizeOptional(
  value: string | null,
  maximum: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  const normalized = value.trim();
  if (!normalized) return { ok: true, value: null };
  if (!withinBound(normalized, maximum)) return { ok: false };
  return { ok: true, value: normalized };
}

function isSafeCode(value: string | null): boolean {
  return value === null || /^[A-Z0-9_.:-]+$/.test(value);
}

function isPrivacySafeMessage(value: string | null): boolean {
  if (value === null) return true;
  if (/[\r\n\t]/.test(value)) return false;
  if (/https?:\/\/[^/\s@]+@/i.test(value)) return false;
  if (/\b(?:authorization|password|secret|api[_-]?key|token)\b\s*[:=]/i.test(value)) return false;
  return !/\b(?:payment|order|refund|command|attempt|request)_[A-Za-z0-9-]{4,}\b/i.test(value);
}

function canonicalCode(outcome: RefundExecutionEvidenceOutcome): string | null {
  if (outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) return null;
  return CANONICAL_SAFE_CODES[outcome];
}

function isEvidenceOutcome(value: RefundExecutionEvidenceOutcome): boolean {
  return value === RefundExecutionEvidenceOutcome.SUCCEEDED
    || value === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL
    || value === RefundExecutionEvidenceOutcome.UNKNOWN;
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
  candidate: NormalizedRefundAdapterResponse,
  safeCode: string | null = candidate.safeCode,
  safeMessage: string | null = candidate.safeMessage,
): boolean {
  return sameEvidenceIdentity(evidence, candidate)
    && sameEvidencePayload(evidence, candidate, safeCode, safeMessage);
}

function sameEvidenceIdentity(
  evidence: RefundExecutionEvidence,
  candidate: NormalizedRefundAdapterResponse,
): boolean {
  return evidence.commandId === candidate.commandId
    && evidence.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE
    && evidence.outcome === candidate.outcome
    && evidence.observedProviderRefundId === candidate.observedProviderRefundId
    && evidence.reportedAmount === candidate.reportedAmount
    && evidence.reportedCurrency === candidate.reportedCurrency;
}

function sameEvidencePayload(
  evidence: RefundExecutionEvidence,
  candidate: NormalizedRefundAdapterResponse,
  safeCode: string | null,
  safeMessage: string | null,
): boolean {
  return evidence.safeCode === safeCode
    && evidence.safeMessage === safeMessage
    && evidence.observedAt.getTime() === candidate.observedAt.getTime();
}

export function resolutionSuccess(
  evidence: RefundExecutionEvidence,
  refundAttemptId: string,
  replayed: boolean,
): Extract<ResolveRefundAdapterResponseResult, { ok: true }> {
  return {
    ok: true,
    evidenceId: evidence.id,
    commandId: evidence.commandId,
    refundAttemptId,
    application: evidence.application,
    replayed,
  };
}

export function resolutionFailure(
  code: ResolveRefundAdapterResponseFailureCode,
  message: string,
): ResolveRefundAdapterResponseFailure {
  return { ok: false, code, message };
}

function withinBound(value: string, maximum: number): boolean {
  return Array.from(value).length <= maximum;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
