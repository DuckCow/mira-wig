import { RefundExecutionEvidenceOutcome } from "@prisma/client";

export const REFUND_EVIDENCE_PROVIDER_ID_MAX_CODE_POINTS = 512;
export const REFUND_EVIDENCE_SAFE_CODE_MAX_CODE_POINTS = 128;
export const REFUND_EVIDENCE_SAFE_MESSAGE_MAX_CODE_POINTS = 500;

const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");
const OBSERVATION_FIELDS = [
  "outcome",
  "observedProviderRefundId",
  "reportedAmount",
  "reportedCurrency",
  "safeCode",
  "safeMessage",
  "observedAt",
] as const;

export type NormalizedRefundObservation = Readonly<{
  outcome: RefundExecutionEvidenceOutcome;
  observedProviderRefundId: string | null;
  reportedAmount: number | null;
  reportedCurrency: string | null;
  safeCode: string | null;
  safeMessage: string | null;
  observedAt: Date;
}>;

export type NormalizeRefundObservationResult =
  | Readonly<{ ok: true; observation: NormalizedRefundObservation }>
  | Readonly<{ ok: false }>;

export function normalizeRefundObservation(input: unknown): NormalizeRefundObservationResult {
  if (!hasExactOwnFields(input, OBSERVATION_FIELDS)) return Object.freeze({ ok: false });
  if (!isRefundEvidenceOutcome(input.outcome)) return Object.freeze({ ok: false });
  const fields = normalizeObservationFields(input);
  if (!fields) return Object.freeze({ ok: false });
  return Object.freeze({
    ok: true,
    observation: Object.freeze({
      outcome: input.outcome,
      ...fields,
    }),
  });
}

function normalizeObservationFields(input: Record<(typeof OBSERVATION_FIELDS)[number], unknown>): Omit<
  NormalizedRefundObservation,
  "outcome"
> | null {
  const providerRefundId = normalizeBoundedOptionalEvidenceText(
    input.observedProviderRefundId,
    REFUND_EVIDENCE_PROVIDER_ID_MAX_CODE_POINTS,
  );
  const safeCode = normalizeBoundedOptionalEvidenceText(
    input.safeCode,
    REFUND_EVIDENCE_SAFE_CODE_MAX_CODE_POINTS,
  );
  const safeMessage = normalizeBoundedOptionalEvidenceText(
    input.safeMessage,
    REFUND_EVIDENCE_SAFE_MESSAGE_MAX_CODE_POINTS,
  );
  const money = normalizeReportedMoney(input.reportedAmount, input.reportedCurrency);
  if (!providerRefundId.ok) return null;
  if (!safeCode.ok) return null;
  if (!safeMessage.ok) return null;
  if (!money) return null;
  if (!hasSafeDiagnostics(safeCode.value, safeMessage.value)) return null;
  if (!isPostgresSafeDate(input.observedAt)) return null;
  return {
    observedProviderRefundId: providerRefundId.value,
    reportedAmount: money.amount,
    reportedCurrency: money.currency,
    safeCode: safeCode.value,
    safeMessage: safeMessage.value,
    observedAt: new Date(input.observedAt.getTime()),
  };
}

function hasSafeDiagnostics(
  safeCode: string | null,
  safeMessage: string | null,
): boolean {
  return [
    isRefundEvidenceSafeCode(safeCode),
    isRefundEvidencePrivacySafeMessage(safeMessage),
  ].every(Boolean);
}

export function normalizeBoundedOptionalEvidenceText(
  value: unknown,
  maximum: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const normalized = value.trim();
  if (!normalized) return { ok: true, value: null };
  if (Array.from(normalized).length > maximum) return { ok: false };
  return { ok: true, value: normalized };
}

export function isRefundEvidenceSafeCode(value: string | null): boolean {
  return value === null || /^[A-Z0-9_.:-]+$/.test(value);
}

export function isRefundEvidencePrivacySafeMessage(value: string | null): boolean {
  if (value === null) return true;
  if (/[\r\n\t]/.test(value)) return false;
  if (/https?:\/\/[^/\s@]+@/i.test(value)) return false;
  if (/\b(?:authorization|password|secret|api[_-]?key|token)\b\s*[:=]/i.test(value)) return false;
  return !/\b(?:payment|order|refund|command|attempt|request)_[A-Za-z0-9-]{4,}\b/i.test(value);
}

export function normalizeRefundEvidenceCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function isRefundEvidenceOutcome(value: unknown): value is RefundExecutionEvidenceOutcome {
  return value === RefundExecutionEvidenceOutcome.SUCCEEDED
    || value === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL
    || value === RefundExecutionEvidenceOutcome.UNKNOWN;
}

function normalizeReportedMoney(
  amount: unknown,
  currency: unknown,
): { amount: number | null; currency: string | null } | null {
  if (amount === null && currency === null) return { amount: null, currency: null };
  if (!isPositiveSafeInteger(amount)) return null;
  const normalizedCurrency = normalizeRefundEvidenceCurrency(currency);
  return normalizedCurrency ? { amount, currency: normalizedCurrency } : null;
}

function hasExactOwnFields(
  value: unknown,
  fields: readonly string[],
): value is Record<(typeof OBSERVATION_FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1;
}

function isPostgresSafeDate(value: unknown): value is Date {
  return value instanceof Date
    && Number.isFinite(value.getTime())
    && value.getTime() >= POSTGRES_SAFE_MINIMUM_MS;
}
