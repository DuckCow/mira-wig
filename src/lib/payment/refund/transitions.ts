import { RefundAttemptStatus } from "@prisma/client";
import { isTerminalRefundAttemptStatus } from "./invariants";

const ALLOWED_NEXT_STATUSES: Record<
  RefundAttemptStatus,
  readonly RefundAttemptStatus[]
> = {
  [RefundAttemptStatus.REQUESTED]: [
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.CANCELLED,
  ],
  [RefundAttemptStatus.PROCESSING]: [
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.FAILED_RETRYABLE,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.MANUAL_REVIEW,
  ],
  [RefundAttemptStatus.SUCCEEDED]: [],
  [RefundAttemptStatus.FAILED_RETRYABLE]: [
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ],
  [RefundAttemptStatus.FAILED_TERMINAL]: [],
  [RefundAttemptStatus.MANUAL_REVIEW]: [
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ],
  [RefundAttemptStatus.CANCELLED]: [],
};

export type RefundAttemptTransitionResult =
  | { ok: true }
  | {
      ok: false;
      code: "INVALID_REFUND_ATTEMPT_TRANSITION";
      message: string;
    };

export function canTransitionRefundAttemptStatus(
  from: RefundAttemptStatus,
  to: RefundAttemptStatus,
): boolean {
  if (from === to || isTerminalRefundAttemptStatus(from)) return false;
  return ALLOWED_NEXT_STATUSES[from].includes(to);
}

export function allowedNextRefundAttemptStatuses(
  from: RefundAttemptStatus,
): readonly RefundAttemptStatus[] {
  if (isTerminalRefundAttemptStatus(from)) return [];
  return [...ALLOWED_NEXT_STATUSES[from]];
}

export function validateRefundAttemptStatusTransition(
  from: RefundAttemptStatus,
  to: RefundAttemptStatus,
): RefundAttemptTransitionResult {
  if (canTransitionRefundAttemptStatus(from, to)) return { ok: true };
  return {
    ok: false,
    code: "INVALID_REFUND_ATTEMPT_TRANSITION",
    message: "Refund attempt status transition is not allowed.",
  };
}
