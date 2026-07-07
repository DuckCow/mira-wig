import { PaymentProvider } from "@prisma/client";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderConfirmSucceeded,
} from "@/lib/payment/providers/contract";
import { buildTossConfirmFailure } from "./errors";
import { deriveTossOrderId } from "./order-id";
import { tossProviderDiagnostics } from "./redaction";

export const TOSS_CONFIRM_PATH = "/v1/payments/confirm";

export interface TossConfirmRequestBuildInput {
  paymentId: string;
  providerRef: string | null | undefined;
  amount: number;
  currency: string;
  providerConfirmIdempotencyKey: string | null | undefined;
}

export type TossConfirmRequestBuildResult =
  | { ok: true; request: TossConfirmRequest }
  | { ok: false; failure: ProviderConfirmFailed };

export interface TossConfirmRequest {
  method: "POST";
  path: typeof TOSS_CONFIRM_PATH;
  headers: { "Idempotency-Key": string };
  body: {
    paymentKey: string;
    orderId: string;
    amount: number;
  };
}

export interface TossConfirmNormalizeInput {
  paymentId: string;
  providerRef: string;
  providerConfirmIdempotencyKey: string;
  amount: number;
  currency: string;
  receivedAt: Date;
  tossPayment: unknown;
}

interface TossPaymentObject {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  currency?: string;
  approvedAt?: string | null;
}

export function buildTossConfirmRequest(
  input: TossConfirmRequestBuildInput,
): TossConfirmRequestBuildResult {
  const localFailure = validateLocalInput(input);
  if (localFailure) return { ok: false, failure: localFailure };
  const providerRef = input.providerRef?.trim();
  const idempotencyKey = input.providerConfirmIdempotencyKey?.trim();
  if (!providerRef || !idempotencyKey) {
    return { ok: false, failure: localProgrammerFailure("Toss confirm request is missing local identity.") };
  }

  try {
    return {
      ok: true,
      request: {
        method: "POST",
        path: TOSS_CONFIRM_PATH,
        headers: { "Idempotency-Key": idempotencyKey },
        body: {
          paymentKey: providerRef,
          orderId: deriveTossOrderId(input.paymentId),
          amount: input.amount,
        },
      },
    };
  } catch {
    return { ok: false, failure: localProgrammerFailure("Toss orderId cannot be derived.") };
  }
}

export function normalizeTossConfirmResponse(
  input: TossConfirmNormalizeInput,
): NormalizedProviderConfirmResult {
  const localFailure = validateLocalInput(input);
  if (localFailure) return localFailure;

  const tossPayment = parseTossPayment(input.tossPayment);
  if (!tossPayment) return manualReview("TOSS_PAYMENT_MALFORMED", "Toss confirm response was malformed.", input);

  const mismatch = validateTossPayment(tossPayment, input);
  if (mismatch) return mismatch;

  const capturedAt = approvedAtOrFallback(tossPayment.approvedAt, input);
  if (!capturedAt) return manualReview("TOSS_APPROVED_AT_INVALID", "Toss approvedAt was invalid.", input, tossPayment);

  return success(input, tossPayment, capturedAt);
}

function validateLocalInput(
  input: TossConfirmRequestBuildInput,
): ProviderConfirmFailed | null {
  const providerRef = input.providerRef?.trim();
  const idempotencyKey = input.providerConfirmIdempotencyKey?.trim();
  if (!providerRef) return localProgrammerFailure("Toss providerRef is required before confirm.");
  if (!idempotencyKey) return localProgrammerFailure("Toss confirm idempotency key is required.");
  if (input.currency !== "KRW") return localStopFailure("Toss D1 confirm only supports KRW.");
  if (!Number.isSafeInteger(input.amount) || input.amount < 0) {
    return localProgrammerFailure("Toss confirm amount must be a non-negative integer.");
  }
  return null;
}

function parseTossPayment(value: unknown): TossPaymentObject | null {
  if (!isRecord(value)) return null;
  const payment = requiredTossPaymentFields(value);
  if (!payment) return null;
  return withOptionalTossPaymentFields(payment, value);
}

function requiredTossPaymentFields(record: Record<string, unknown>): TossPaymentObject | null {
  const paymentKey = stringField(record, "paymentKey");
  if (!paymentKey) return null;
  const orderId = stringField(record, "orderId");
  if (!orderId) return null;
  const status = stringField(record, "status");
  if (!status) return null;
  const totalAmount = numberField(record, "totalAmount");
  if (totalAmount === null) return null;
  return { paymentKey, orderId, status, totalAmount };
}

function withOptionalTossPaymentFields(
  payment: TossPaymentObject,
  record: Record<string, unknown>,
): TossPaymentObject {
  const currency = optionalString(record, "currency");
  const approvedAt = optionalString(record, "approvedAt");
  if (currency !== undefined && currency !== null) payment.currency = currency;
  if (approvedAt !== undefined) payment.approvedAt = approvedAt;
  return payment;
}

function validateTossPayment(
  tossPayment: TossPaymentObject,
  input: TossConfirmNormalizeInput,
): ProviderConfirmFailed | null {
  if (tossPayment.status !== "DONE") return nonDoneFailure(tossPayment, input);
  if (tossPayment.paymentKey !== input.providerRef) return manualReview("TOSS_PAYMENT_KEY_MISMATCH", "Toss paymentKey mismatch.", input, tossPayment);
  if (tossPayment.orderId !== deriveTossOrderId(input.paymentId)) return manualReview("TOSS_ORDER_ID_MISMATCH", "Toss orderId mismatch.", input, tossPayment);
  if (tossPayment.totalAmount !== input.amount) return manualReview("TOSS_AMOUNT_MISMATCH", "Toss totalAmount mismatch.", input, tossPayment);
  if (tossPayment.currency !== undefined && tossPayment.currency !== input.currency) {
    return manualReview("TOSS_CURRENCY_MISMATCH", "Toss currency mismatch.", input, tossPayment);
  }
  return null;
}

function success(
  input: TossConfirmNormalizeInput,
  tossPayment: TossPaymentObject,
  capturedAt: Date,
): ProviderConfirmSucceeded {
  const usedFallback = tossPayment.approvedAt === undefined || tossPayment.approvedAt === null;
  const diagnosticsInput = {
    localPaymentId: input.paymentId,
    providerStatus: tossPayment.status,
    paymentKey: tossPayment.paymentKey,
    idempotencyKey: input.providerConfirmIdempotencyKey,
  };
  const result: ProviderConfirmSucceeded = {
    kind: "succeeded",
    provider: PaymentProvider.TOSS,
    providerPaymentKey: tossPayment.paymentKey,
    amountMinor: tossPayment.totalAmount,
    currency: input.currency,
    capturedAt,
    providerTimestamp: capturedAt,
    providerRef: input.providerRef,
    providerOrderId: tossPayment.orderId,
    idempotencyKey: input.providerConfirmIdempotencyKey,
    rawProviderStatus: tossPayment.status,
    diagnostics: usedFallback
      ? tossProviderDiagnostics({ ...diagnosticsInput, safeMessage: "Toss approvedAt missing; receivedAt fallback used." })
      : tossProviderDiagnostics(diagnosticsInput),
  };
  if (!usedFallback) result.approvedAt = capturedAt;
  return result;
}

function nonDoneFailure(
  tossPayment: TossPaymentObject,
  input: TossConfirmNormalizeInput,
): ProviderConfirmFailed {
  if (tossPayment.status === "CANCELED" || tossPayment.status === "ABORTED" || tossPayment.status === "EXPIRED") {
    return terminalFailure(`TOSS_STATUS_${tossPayment.status}`, "Toss payment is terminal before local completion.", input, tossPayment);
  }
  return manualReview(`TOSS_STATUS_${tossPayment.status}`, "Toss payment is not DONE.", input, tossPayment);
}

function approvedAtOrFallback(
  approvedAt: string | null | undefined,
  input: TossConfirmNormalizeInput,
): Date | null {
  if (approvedAt === undefined || approvedAt === null) return input.receivedAt;
  const parsed = new Date(approvedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function manualReview(
  code: string,
  safeMessage: string,
  input: TossConfirmNormalizeInput,
  _tossPayment?: TossPaymentObject,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "MANUAL_REVIEW",
    normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
    providerErrorCode: code,
    safeMessage,
    ambiguousProviderState: true,
    providerLookupRequired: true,
    idempotencyKey: input.providerConfirmIdempotencyKey,
  });
}

function terminalFailure(
  code: string,
  safeMessage: string,
  input: TossConfirmNormalizeInput,
  _tossPayment: TossPaymentObject,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "TERMINAL",
    normalizedCode: "PROVIDER_CANCELED",
    providerErrorCode: code,
    safeMessage,
    idempotencyKey: input.providerConfirmIdempotencyKey,
  });
}

function localProgrammerFailure(safeMessage: string): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "PROGRAMMER_ERROR",
    normalizedCode: "PROVIDER_PROGRAMMER_ERROR",
    safeMessage,
  });
}

function localStopFailure(safeMessage: string): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "STOP",
    normalizedCode: "PROVIDER_UNSUPPORTED_CONTEXT",
    safeMessage,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value;
}
