import { OrderStatus, RefundAttemptStatus } from "@prisma/client";

export interface RefundSuccessStateAttempt {
  id: string;
  amount: number;
  currency: string;
  status: RefundAttemptStatus;
}

export interface DeriveOrderStatusAfterSucceededRefundInput {
  capturedAmount: number;
  currency: string;
  succeedingAttemptId: string;
  attempts: readonly RefundSuccessStateAttempt[];
}

export type DeriveOrderStatusAfterSucceededRefundResult =
  | {
      ok: true;
      orderStatus: typeof OrderStatus.PARTIALLY_REFUNDED | typeof OrderStatus.REFUNDED;
      succeededAmount: number;
    }
  | {
      ok: false;
      code: "REFUND_LEDGER_INCONSISTENT";
      message: string;
    };

export function deriveOrderStatusAfterSucceededRefund(
  input: DeriveOrderStatusAfterSucceededRefundInput,
): DeriveOrderStatusAfterSucceededRefundResult {
  if (!isPositiveSafeInteger(input.capturedAmount) || !input.currency.trim()) {
    return inconsistent("Captured refund identity is invalid.");
  }
  const succeededAmount = projectedSucceededAmount(input);
  if (succeededAmount === null || succeededAmount <= 0 || succeededAmount > input.capturedAmount) {
    return inconsistent("Succeeded refund ledger is inconsistent with the captured amount.");
  }
  return {
    ok: true,
    orderStatus: succeededAmount === input.capturedAmount
      ? OrderStatus.REFUNDED
      : OrderStatus.PARTIALLY_REFUNDED,
    succeededAmount,
  };
}

function projectedSucceededAmount(input: DeriveOrderStatusAfterSucceededRefundInput): number | null {
  let total = 0;
  let targetCount = 0;
  for (const attempt of input.attempts) {
    if (!isValidAttempt(attempt, input.currency)) return null;
    const projectedSucceeded = attempt.status === RefundAttemptStatus.SUCCEEDED
      || attempt.id === input.succeedingAttemptId;
    if (attempt.id === input.succeedingAttemptId) targetCount += 1;
    if (!projectedSucceeded) continue;
    if (total > Number.MAX_SAFE_INTEGER - attempt.amount) return null;
    total += attempt.amount;
  }
  return targetCount === 1 ? total : null;
}

function isValidAttempt(attempt: RefundSuccessStateAttempt, currency: string): boolean {
  return Boolean(attempt.id.trim())
    && isPositiveSafeInteger(attempt.amount)
    && attempt.currency === currency;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function inconsistent(message: string): DeriveOrderStatusAfterSucceededRefundResult {
  return { ok: false, code: "REFUND_LEDGER_INCONSISTENT", message };
}
