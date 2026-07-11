import { RefundExecutionEvidenceOutcome } from "@prisma/client";
import {
  REFUND_EVIDENCE_PROVIDER_ID_MAX_CODE_POINTS,
  REFUND_EVIDENCE_SAFE_CODE_MAX_CODE_POINTS,
  REFUND_EVIDENCE_SAFE_MESSAGE_MAX_CODE_POINTS,
  isRefundEvidencePrivacySafeMessage,
  isRefundEvidenceSafeCode,
  normalizeBoundedOptionalEvidenceText,
  normalizeRefundEvidenceCurrency,
  type ResolveRefundAdapterResponseInput,
} from "./execution-result-contract";

const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");

const REQUEST_FIELDS = ["providerPaymentReference", "amount", "currency", "operationKey"] as const;
const OBSERVATION_FIELDS = [
  "outcome",
  "observedProviderRefundId",
  "reportedAmount",
  "reportedCurrency",
  "safeCode",
  "safeMessage",
  "observedAt",
] as const;

type ObservationField =
  | "outcome"
  | "observedProviderRefundId"
  | "reportedAmount"
  | "reportedCurrency"
  | "safeCode"
  | "safeMessage"
  | "observedAt";

export type RefundProviderRequest = Readonly<{
  providerPaymentReference: string;
  amount: number;
  currency: string;
  operationKey: string;
}>;

export type RefundProviderObservation = Readonly<
  Pick<ResolveRefundAdapterResponseInput, ObservationField>
>;

export interface RefundProviderPort {
  refund(request: RefundProviderRequest): Promise<RefundProviderObservation>;
}

export type RefundProviderContractErrorCode =
  | "INVALID_REFUND_PROVIDER_REQUEST"
  | "INVALID_REFUND_PROVIDER_OBSERVATION";

export class RefundProviderContractError extends Error {
  constructor(
    readonly code: RefundProviderContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RefundProviderContractError";
  }
}

export function normalizeRefundProviderRequest(input: RefundProviderRequest): RefundProviderRequest {
  if (!hasExactFields(input, REQUEST_FIELDS)) throw invalidRequest();
  const providerPaymentReference = normalizeRequiredText(input.providerPaymentReference);
  const operationKey = normalizeRequiredText(input.operationKey);
  const currency = normalizeCurrency(input.currency);
  if (!providerPaymentReference || !operationKey || !currency || !isPositiveSafeInteger(input.amount)) {
    throw invalidRequest();
  }
  return Object.freeze({ providerPaymentReference, amount: input.amount, currency, operationKey });
}

export function normalizeRefundProviderObservation(
  input: RefundProviderObservation,
): RefundProviderObservation {
  if (!hasExactFields(input, OBSERVATION_FIELDS)) throw invalidObservation();
  if (!isEvidenceOutcome(input.outcome)) throw invalidObservation();
  const text = normalizeObservationText(input);
  if (!text) throw invalidObservation();
  const money = normalizeReportedMoney(input.reportedAmount, input.reportedCurrency);
  if (!money) throw invalidObservation();
  if (!isPostgresSafeDate(input.observedAt)) throw invalidObservation();
  return Object.freeze({
    outcome: input.outcome,
    observedProviderRefundId: text.providerRefundId,
    reportedAmount: money.amount,
    reportedCurrency: money.currency,
    safeCode: text.safeCode,
    safeMessage: text.safeMessage,
    observedAt: new Date(input.observedAt.getTime()),
  });
}

function normalizeObservationText(input: RefundProviderObservation): {
  providerRefundId: string | null;
  safeCode: string | null;
  safeMessage: string | null;
} | null {
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
  if (!providerRefundId.ok || !safeCode.ok || !safeMessage.ok) return null;
  if (!isRefundEvidenceSafeCode(safeCode.value) || !isRefundEvidencePrivacySafeMessage(safeMessage.value)) return null;
  return { providerRefundId: providerRefundId.value, safeCode: safeCode.value, safeMessage: safeMessage.value };
}

function normalizeReportedMoney(
  amount: number | null,
  currency: string | null,
): { amount: number | null; currency: string | null } | null {
  if (amount === null && currency === null) return { amount: null, currency: null };
  if (amount === null || currency === null || !isPositiveSafeInteger(amount)) return null;
  const normalizedCurrency = normalizeCurrency(currency);
  return normalizedCurrency ? { amount, currency: normalizedCurrency } : null;
}

function normalizeRequiredText(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCurrency(value: string): string | null {
  if (typeof value !== "string") return null;
  return normalizeRefundEvidenceCurrency(value);
}

function isEvidenceOutcome(value: RefundExecutionEvidenceOutcome): boolean {
  return value === RefundExecutionEvidenceOutcome.SUCCEEDED
    || value === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE
    || value === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL
    || value === RefundExecutionEvidenceOutcome.UNKNOWN;
}

function hasExactFields(value: object, fields: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isPostgresSafeDate(value: Date): boolean {
  return value instanceof Date
    && Number.isFinite(value.getTime())
    && value.getTime() >= POSTGRES_SAFE_MINIMUM_MS;
}

function invalidRequest(): RefundProviderContractError {
  return new RefundProviderContractError(
    "INVALID_REFUND_PROVIDER_REQUEST",
    "Refund provider request is invalid.",
  );
}

function invalidObservation(): RefundProviderContractError {
  return new RefundProviderContractError(
    "INVALID_REFUND_PROVIDER_OBSERVATION",
    "Refund provider observation is invalid.",
  );
}
