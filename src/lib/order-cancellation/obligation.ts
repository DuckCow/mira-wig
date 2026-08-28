import {
  RefundAttemptStatus,
  type PaymentMode,
  type PaymentProvider,
} from "@prisma/client";

export interface CancellationObligationOrderFact {
  id: string;
  currency: string;
}

export interface CancellationObligationPaymentFact {
  id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

export interface CancellationObligationRefundFact {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  status: RefundAttemptStatus;
  processedAt: Date | null;
}

export type CancellationObligation = Readonly<{
  state: "OUTSTANDING";
  succeededAmount: number;
  outstandingAmount: number;
}> | Readonly<{
  state: "SATISFIED";
  succeededAmount: number;
  outstandingAmount: 0;
}> | Readonly<{
  state: "INCONSISTENT";
  succeededAmount: null;
  outstandingAmount: null;
}>;

export function deriveCancellationObligation(
  order: CancellationObligationOrderFact,
  payment: CancellationObligationPaymentFact,
  attempts: readonly CancellationObligationRefundFact[],
): CancellationObligation {
  if (!hasValidAuthority(order, payment)
    || attempts.some((attempt) => !hasValidAttempt(order, payment, attempt))) {
    return inconsistent();
  }

  let succeededAmount = 0;
  for (const attempt of attempts) {
    if (attempt.status !== RefundAttemptStatus.SUCCEEDED) continue;
    if (!hasValidSucceededAt(attempt.processedAt)
      || succeededAmount > Number.MAX_SAFE_INTEGER - attempt.amount) {
      return inconsistent();
    }
    succeededAmount += attempt.amount;
  }

  if (succeededAmount > payment.amount) return inconsistent();
  if (succeededAmount === payment.amount) {
    return Object.freeze({ state: "SATISFIED", succeededAmount, outstandingAmount: 0 });
  }
  return Object.freeze({
    state: "OUTSTANDING",
    succeededAmount,
    outstandingAmount: payment.amount - succeededAmount,
  });
}

function hasValidAuthority(
  order: CancellationObligationOrderFact,
  payment: CancellationObligationPaymentFact,
): boolean {
  return isCanonicalIdentifier(order.id)
    && isCanonicalIdentifier(payment.id)
    && isCanonicalIdentifier(order.currency)
    && order.currency === payment.currency
    && isPositiveSafeInteger(payment.amount);
}

function hasValidAttempt(
  order: CancellationObligationOrderFact,
  payment: CancellationObligationPaymentFact,
  attempt: CancellationObligationRefundFact,
): boolean {
  return attempt.orderId === order.id
    && attempt.paymentId === payment.id
    && attempt.currency === order.currency
    && attempt.currency === payment.currency
    && attempt.provider === payment.provider
    && attempt.mode === payment.mode
    && isPositiveSafeInteger(attempt.amount)
    && attempt.amount <= payment.amount;
}

function hasValidSucceededAt(value: Date | null): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isCanonicalIdentifier(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function inconsistent(): CancellationObligation {
  return Object.freeze({ state: "INCONSISTENT", succeededAmount: null, outstandingAmount: null });
}
