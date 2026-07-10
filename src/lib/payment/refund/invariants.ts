import {
  RefundAttemptStatus,
  type PaymentMode,
  type PaymentProvider,
} from "@prisma/client";

export interface RefundPaymentIdentityInput {
  id: string;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

export interface RefundAttemptIdentityInput {
  paymentId: string;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

export interface RefundAmountStateInput {
  amount: number;
  currency: string;
  status: RefundAttemptStatus;
}

export interface ValidateRefundRequestInput {
  totalAmount: number;
  currency: string;
  requestedAmount: number;
  requestedCurrency: string;
  attempts: readonly RefundAmountStateInput[];
}

export type RefundInvariantViolationCode =
  | "INVALID_TOTAL_AMOUNT"
  | "INVALID_REQUEST_AMOUNT"
  | "CURRENCY_MISMATCH"
  | "EXISTING_ATTEMPT_CURRENCY_MISMATCH"
  | "INVALID_EXISTING_ATTEMPT_AMOUNT"
  | "OVER_REFUND";

export type RefundInvariantResult =
  | { ok: true; remainingRequestableAmount: number }
  | { ok: false; code: RefundInvariantViolationCode; message: string };

export function hasConsistentRefundAttemptLedgerIdentity(
  designatedPayment: RefundPaymentIdentityInput,
  attempts: readonly RefundAttemptIdentityInput[],
): boolean {
  return attempts.every((attempt) => (
    attempt.paymentId === designatedPayment.id
      && attempt.currency === designatedPayment.currency
      && attempt.provider === designatedPayment.provider
      && attempt.mode === designatedPayment.mode
  ));
}

export function isSucceededRefundAttemptStatus(status: RefundAttemptStatus): boolean {
  return status === RefundAttemptStatus.SUCCEEDED;
}

export function isGuardedRefundAttemptStatus(status: RefundAttemptStatus): boolean {
  return status === RefundAttemptStatus.SUCCEEDED
    || status === RefundAttemptStatus.REQUESTED
    || status === RefundAttemptStatus.PROCESSING
    || status === RefundAttemptStatus.MANUAL_REVIEW
    || status === RefundAttemptStatus.FAILED_RETRYABLE;
}

export function isTerminalRefundAttemptStatus(status: RefundAttemptStatus): boolean {
  return status === RefundAttemptStatus.SUCCEEDED
    || status === RefundAttemptStatus.FAILED_TERMINAL
    || status === RefundAttemptStatus.CANCELLED;
}

export function sumSucceededRefundAmount(attempts: readonly RefundAmountStateInput[]): number {
  return sumRefundAmount(attempts, isSucceededRefundAttemptStatus);
}

export function sumGuardedRefundAmount(attempts: readonly RefundAmountStateInput[]): number {
  return sumRefundAmount(attempts, isGuardedRefundAttemptStatus);
}

export function remainingRefundableAmount(
  totalAmount: number,
  attempts: readonly RefundAmountStateInput[],
): number {
  assertNonNegativeSafeInteger(totalAmount, "Total amount");
  return Math.max(0, totalAmount - sumSucceededRefundAmount(attempts));
}

export function remainingRequestableRefundAmount(
  totalAmount: number,
  attempts: readonly RefundAmountStateInput[],
): number {
  assertNonNegativeSafeInteger(totalAmount, "Total amount");
  return Math.max(0, totalAmount - sumGuardedRefundAmount(attempts));
}

export function validateRefundRequest(input: ValidateRefundRequestInput): RefundInvariantResult {
  const requestFailure = validateRequestFields(input);
  if (requestFailure) return requestFailure;

  const attemptFailure = validateExistingAttempts(input.currency, input.attempts);
  if (attemptFailure) return attemptFailure;

  const guardedAmount = safeGuardedAmount(input.attempts);
  if (guardedAmount === null) {
    return violation("INVALID_EXISTING_ATTEMPT_AMOUNT", "Existing refund amounts exceed the safe integer range.");
  }
  const remainingRequestableAmount = Math.max(0, input.totalAmount - guardedAmount);
  if (input.requestedAmount > remainingRequestableAmount) {
    return violation("OVER_REFUND", "Requested refund amount exceeds the remaining requestable amount.");
  }
  return { ok: true, remainingRequestableAmount };
}

export function buildRefundAttemptIdempotencyKey(
  paymentId: string,
  refundAttemptId: string,
): string {
  const normalizedPaymentId = paymentId.trim();
  if (!normalizedPaymentId) throw new Error("Refund idempotency key requires a payment id.");

  const normalizedAttemptId = refundAttemptId.trim();
  if (!normalizedAttemptId) throw new Error("Refund idempotency key requires a refund attempt id.");
  return `refund:${normalizedPaymentId}:${normalizedAttemptId}`;
}

function validateRequestFields(input: ValidateRefundRequestInput): RefundInvariantResult | null {
  if (!isNonNegativeSafeInteger(input.totalAmount)) {
    return violation("INVALID_TOTAL_AMOUNT", "Total amount must be a non-negative safe integer.");
  }
  if (!isPositiveSafeInteger(input.requestedAmount)) {
    return violation("INVALID_REQUEST_AMOUNT", "Requested refund amount must be a positive safe integer.");
  }
  if (!input.currency.trim() || input.requestedCurrency !== input.currency) {
    return violation("CURRENCY_MISMATCH", "Requested currency must exactly match the payment currency.");
  }
  return null;
}

function validateExistingAttempts(
  currency: string,
  attempts: readonly RefundAmountStateInput[],
): RefundInvariantResult | null {
  for (const attempt of attempts) {
    if (attempt.currency !== currency) {
      return violation("EXISTING_ATTEMPT_CURRENCY_MISMATCH", "Existing refund currency must match the payment currency.");
    }
    if (!isPositiveSafeInteger(attempt.amount)) {
      return violation("INVALID_EXISTING_ATTEMPT_AMOUNT", "Existing refund amount must be a positive safe integer.");
    }
  }
  return null;
}

function safeGuardedAmount(attempts: readonly RefundAmountStateInput[]): number | null {
  let total = 0;
  for (const attempt of attempts) {
    if (!isGuardedRefundAttemptStatus(attempt.status)) continue;
    if (total > Number.MAX_SAFE_INTEGER - attempt.amount) return null;
    total += attempt.amount;
  }
  return total;
}

function sumRefundAmount(
  attempts: readonly RefundAmountStateInput[],
  includes: (status: RefundAttemptStatus) => boolean,
): number {
  let total = 0;
  for (const attempt of attempts) {
    if (!includes(attempt.status)) continue;
    assertPositiveSafeInteger(attempt.amount, "Refund attempt amount");
    const next = total + attempt.amount;
    if (!Number.isSafeInteger(next)) throw new RangeError("Refund amount sum must remain a safe integer.");
    total = next;
  }
  return total;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!isNonNegativeSafeInteger(value)) throw new RangeError(`${label} must be a non-negative safe integer.`);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!isPositiveSafeInteger(value)) throw new RangeError(`${label} must be a positive safe integer.`);
}

function violation(code: RefundInvariantViolationCode, message: string): RefundInvariantResult {
  return { ok: false, code, message };
}
