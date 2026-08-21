import {
  type NormalizedRefundObservation,
  normalizeRefundObservation,
  normalizeRefundEvidenceCurrency,
} from "./refund-observation-contract";

const REQUEST_FIELDS = [
  "providerPaymentReference",
  "amount",
  "currency",
  "providerOperationKey",
] as const;

export type RefundProviderRequest = Readonly<{
  providerPaymentReference: string;
  amount: number;
  currency: string;
  providerOperationKey: string;
}>;

export type RefundProviderObservation = NormalizedRefundObservation;

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
  const providerOperationKey = normalizeRequiredText(input.providerOperationKey);
  const currency = normalizeCurrency(input.currency);
  if (!providerPaymentReference || !providerOperationKey
    || !currency || !isPositiveSafeInteger(input.amount)) {
    throw invalidRequest();
  }
  return Object.freeze({
    providerPaymentReference,
    amount: input.amount,
    currency,
    providerOperationKey,
  });
}

export function normalizeRefundProviderObservation(
  input: RefundProviderObservation,
): RefundProviderObservation {
  const normalized = normalizeRefundObservation(input);
  if (!normalized.ok) throw invalidObservation();
  return normalized.observation;
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

function hasExactFields(value: object, fields: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
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
