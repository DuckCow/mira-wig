import { OrderStatus } from "@prisma/client";
import {
  isSucceededRefundAttemptStatus,
  type RefundAmountStateInput,
} from "./invariants";

export interface DeriveRefundRestingOrderStatusInput {
  totalAmount: number;
  currency: string;
  attempts: readonly RefundAmountStateInput[];
}

export type RefundRestingOrderStatus =
  | typeof OrderStatus.PAID
  | typeof OrderStatus.PARTIALLY_REFUNDED;

export type DeriveRefundRestingOrderStatusResult =
  | {
      ok: true;
      orderStatus: RefundRestingOrderStatus;
      succeededAmount: number;
    }
  | {
      ok: false;
      code: "REFUND_LEDGER_INCONSISTENT";
      message: string;
    };

export function deriveRefundRestingOrderStatus(
  input: DeriveRefundRestingOrderStatusInput,
): DeriveRefundRestingOrderStatusResult {
  if (!isPositiveSafeInteger(input.totalAmount)) {
    return inconsistent("Order total must be a positive safe integer.");
  }
  if (!input.currency.trim()) return inconsistent("Order currency is required.");

  const succeededAmount = sumSucceededAmount(input.currency, input.attempts);
  if (succeededAmount === null) {
    return inconsistent("Refund attempt amounts or currencies are inconsistent.");
  }
  if (succeededAmount >= input.totalAmount) {
    return inconsistent("Succeeded refund amount does not permit a resting non-terminal order state.");
  }
  return {
    ok: true,
    orderStatus: succeededAmount === 0 ? OrderStatus.PAID : OrderStatus.PARTIALLY_REFUNDED,
    succeededAmount,
  };
}

function sumSucceededAmount(
  currency: string,
  attempts: readonly RefundAmountStateInput[],
): number | null {
  let total = 0;
  for (const attempt of attempts) {
    if (!isValidAttempt(attempt.amount, attempt.currency, currency)) return null;
    if (!isSucceededRefundAttemptStatus(attempt.status)) continue;
    if (total > Number.MAX_SAFE_INTEGER - attempt.amount) return null;
    total += attempt.amount;
  }
  return total;
}

function isValidAttempt(amount: number, attemptCurrency: string, currency: string): boolean {
  return isPositiveSafeInteger(amount) && attemptCurrency === currency;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function inconsistent(message: string): DeriveRefundRestingOrderStatusResult {
  return { ok: false, code: "REFUND_LEDGER_INCONSISTENT", message };
}
