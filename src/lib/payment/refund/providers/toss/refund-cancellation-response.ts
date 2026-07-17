import { isTossRefundPaymentKey } from "./refund-eligibility";
import { TOSS_REFUND_CANCEL_REASON } from "./refund-wire-request";
import { rejectDuplicateTossCancellationKeys } from "./refund-cancellation-json-scanner";

export const TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES = 64 * 1024;
export const TOSS_REFUND_TRANSACTION_KEY_MAX_CODE_POINTS = 512;

const POSTGRES_INT_MAX = 2_147_483_647;
const FAILURE_CODE = "INVALID_TOSS_REFUND_CANCELLATION_SUCCESS";

export type TossRefundCancellationSuccessCandidate = Readonly<{
  paymentKey: string;
  currency: "KRW";
  paymentStatus: "CANCELED";
  totalAmount: number;
  balanceAmount: 0;
  transactionKey: string;
  cancelStatus: "DONE";
  cancelAmount: number;
  cancelReason: typeof TOSS_REFUND_CANCEL_REASON;
}>;

export type TossRefundCancellationExpectation = Readonly<{
  paymentKey: string;
  fullAmount: number;
}>;

export type NormalizeTossRefundCancellationSuccessResult =
  | Readonly<{ ok: true; candidate: TossRefundCancellationSuccessCandidate }>
  | Readonly<{ ok: false; code: typeof FAILURE_CODE }>;

/** Pure candidate parsing only; this function establishes no provider provenance. */
export function normalizeTossRefundCancellationSuccess(
  rawBody: string,
  expectation: TossRefundCancellationExpectation,
): NormalizeTossRefundCancellationSuccessResult {
  if (!validRequest(rawBody, expectation)) return failure();
  const parsed = parseBody(rawBody);
  if (!isRecord(parsed) || !rootMatches(parsed, expectation)) return failure();
  const cancellation = soleCancellation(parsed.cancels);
  if (!cancellation) return failure();
  const transactionKey = validTransactionKey(cancellation.transactionKey);
  if (!transactionKey) return failure();
  if (!cancellationMatches(cancellation, expectation.fullAmount)) return failure();
  const candidate = Object.freeze({
    paymentKey: expectation.paymentKey,
    currency: "KRW" as const,
    paymentStatus: "CANCELED" as const,
    totalAmount: expectation.fullAmount,
    balanceAmount: 0 as const,
    transactionKey,
    cancelStatus: "DONE" as const,
    cancelAmount: expectation.fullAmount,
    cancelReason: TOSS_REFUND_CANCEL_REASON,
  });
  return Object.freeze({ ok: true, candidate });
}

function validRequest(
  rawBody: unknown,
  expectation: TossRefundCancellationExpectation,
): rawBody is string {
  return typeof rawBody === "string"
    && validExpectation(expectation)
    && new TextEncoder().encode(rawBody).byteLength
      <= TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES;
}

function soleCancellation(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  return isRecord(value[0]) ? value[0] : null;
}

function parseBody(rawBody: string): unknown {
  try {
    rejectDuplicateTossCancellationKeys(rawBody);
    const parsed: unknown = JSON.parse(rawBody);
    return parsed;
  } catch {
    return undefined;
  }
}

function rootMatches(
  parsed: Record<string, unknown>,
  expectation: TossRefundCancellationExpectation,
): boolean {
  return parsed.paymentKey === expectation.paymentKey
    && parsed.currency === "KRW"
    && parsed.status === "CANCELED"
    && parsed.totalAmount === expectation.fullAmount
    && parsed.balanceAmount === 0;
}

function cancellationMatches(cancellation: Record<string, unknown>, fullAmount: number): boolean {
  return cancellation.cancelStatus === "DONE"
    && cancellation.cancelAmount === fullAmount
    && cancellation.cancelReason === TOSS_REFUND_CANCEL_REASON;
}

function validExpectation(value: TossRefundCancellationExpectation): boolean {
  return isTossRefundPaymentKey(value.paymentKey)
    && isPositivePostgresInteger(value.fullAmount);
}

function validTransactionKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || /\p{Cc}/u.test(value)) return null;
  return Array.from(value).length <= TOSS_REFUND_TRANSACTION_KEY_MAX_CODE_POINTS ? value : null;
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(): NormalizeTossRefundCancellationSuccessResult {
  return Object.freeze({ ok: false, code: FAILURE_CODE });
}
