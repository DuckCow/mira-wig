import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
} from "@prisma/client";

const UNRESOLVED_REFUND_STATUSES = new Set<RefundAttemptStatus>([
  RefundAttemptStatus.REQUESTED,
  RefundAttemptStatus.PROCESSING,
  RefundAttemptStatus.FAILED_RETRYABLE,
  RefundAttemptStatus.MANUAL_REVIEW,
]);

export interface CustomerRefundAttemptFact {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  status: RefundAttemptStatus;
  processedAt: Date | null;
}

export interface CustomerRefundOrderFact {
  id: string;
  currency: string;
}

export interface CustomerRefundPaymentFact {
  id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

export type CustomerRefundSummary = Readonly<{
  completion: "NONE" | "PARTIAL" | "FULL";
  totalSucceededRefundAmount: number;
  latestSucceededRefundAt: Date | null;
  hasPendingRefund: boolean;
  invariantFailure: false;
}> | Readonly<{
  completion: "NONE";
  totalSucceededRefundAmount: null;
  latestSucceededRefundAt: null;
  hasPendingRefund: boolean;
  invariantFailure: true;
}>;

export function deriveCustomerRefundSummary(
  order: CustomerRefundOrderFact,
  payment: CustomerRefundPaymentFact,
  attempts: readonly CustomerRefundAttemptFact[],
): CustomerRefundSummary {
  const hasPendingRefund = attempts.some((attempt) => UNRESOLVED_REFUND_STATUSES.has(attempt.status));
  if (!validLedgerAuthority(order, payment)
    || attempts.some((attempt) => !admittedAttempt(order, payment, attempt))) {
    return invariantFailure(hasPendingRefund);
  }
  const aggregate = aggregateSucceededRefunds(attempts);
  if (!aggregate || aggregate.total > payment.amount) return invariantFailure(hasPendingRefund);
  return Object.freeze({
    completion: completionClass(aggregate.total, payment.amount),
    totalSucceededRefundAmount: aggregate.total,
    latestSucceededRefundAt: aggregate.latest,
    hasPendingRefund,
    invariantFailure: false,
  });
}

function aggregateSucceededRefunds(
  attempts: readonly CustomerRefundAttemptFact[],
): Readonly<{ total: number; latest: Date | null }> | null {
  let aggregate: Readonly<{ total: number; latest: Date | null }> = { total: 0, latest: null };
  for (const attempt of attempts) {
    if (attempt.status !== RefundAttemptStatus.SUCCEEDED) continue;
    const next = appendSucceededRefund(aggregate, attempt);
    if (!next) return null;
    aggregate = next;
  }
  return aggregate;
}

function appendSucceededRefund(
  aggregate: Readonly<{ total: number; latest: Date | null }>,
  attempt: CustomerRefundAttemptFact,
): Readonly<{ total: number; latest: Date }> | null {
  if (!validSucceededAttempt(attempt)
    || aggregate.total > Number.MAX_SAFE_INTEGER - attempt.amount) return null;
  const processedAt = attempt.processedAt;
  if (!processedAt) return null;
  return {
    total: aggregate.total + attempt.amount,
    latest: !aggregate.latest || processedAt > aggregate.latest ? processedAt : aggregate.latest,
  };
}

function validLedgerAuthority(
  order: CustomerRefundOrderFact,
  payment: CustomerRefundPaymentFact,
): boolean {
  return Boolean(order.id.trim())
    && Boolean(payment.id.trim())
    && Boolean(order.currency.trim())
    && order.currency === payment.currency
    && isNonnegativeSafeInteger(payment.amount);
}

function admittedAttempt(
  order: CustomerRefundOrderFact,
  payment: CustomerRefundPaymentFact,
  attempt: CustomerRefundAttemptFact,
): boolean {
  return attempt.orderId === order.id
    && attempt.paymentId === payment.id
    && attempt.provider === payment.provider
    && attempt.mode === payment.mode
    && attempt.currency === order.currency
    && attempt.currency === payment.currency
    && isPositiveSafeInteger(attempt.amount)
    && attempt.amount <= payment.amount;
}

function validSucceededAttempt(attempt: CustomerRefundAttemptFact): boolean {
  const processedAt = attempt.processedAt;
  return processedAt instanceof Date
    && !Number.isNaN(processedAt.getTime());
}

function completionClass(total: number, paidAmount: number): "NONE" | "PARTIAL" | "FULL" {
  if (total === 0) return "NONE";
  return total === paidAmount ? "FULL" : "PARTIAL";
}

function invariantFailure(hasPendingRefund: boolean): CustomerRefundSummary {
  return Object.freeze({
    completion: "NONE",
    totalSucceededRefundAmount: null,
    latestSucceededRefundAt: null,
    hasPendingRefund,
    invariantFailure: true,
  });
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
