import { RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isGuardedRefundAttemptStatus,
  isSucceededRefundAttemptStatus,
  isTerminalRefundAttemptStatus,
} from "../invariants";
import {
  allowedNextRefundAttemptStatuses,
  canTransitionRefundAttemptStatus,
  validateRefundAttemptStatusTransition,
} from "../transitions";

const ALLOWED_TRANSITIONS = [
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.PROCESSING],
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.CANCELLED],
  [RefundAttemptStatus.PROCESSING, RefundAttemptStatus.SUCCEEDED],
  [RefundAttemptStatus.PROCESSING, RefundAttemptStatus.FAILED_RETRYABLE],
  [RefundAttemptStatus.PROCESSING, RefundAttemptStatus.FAILED_TERMINAL],
  [RefundAttemptStatus.PROCESSING, RefundAttemptStatus.MANUAL_REVIEW],
  [RefundAttemptStatus.FAILED_RETRYABLE, RefundAttemptStatus.PROCESSING],
  [RefundAttemptStatus.FAILED_RETRYABLE, RefundAttemptStatus.FAILED_TERMINAL],
  [RefundAttemptStatus.FAILED_RETRYABLE, RefundAttemptStatus.CANCELLED],
  [RefundAttemptStatus.MANUAL_REVIEW, RefundAttemptStatus.PROCESSING],
  [RefundAttemptStatus.MANUAL_REVIEW, RefundAttemptStatus.SUCCEEDED],
  [RefundAttemptStatus.MANUAL_REVIEW, RefundAttemptStatus.FAILED_TERMINAL],
  [RefundAttemptStatus.MANUAL_REVIEW, RefundAttemptStatus.CANCELLED],
] as const;

const FORBIDDEN_TRANSITIONS = [
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.SUCCEEDED],
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.FAILED_RETRYABLE],
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.FAILED_TERMINAL],
  [RefundAttemptStatus.REQUESTED, RefundAttemptStatus.MANUAL_REVIEW],
  [RefundAttemptStatus.SUCCEEDED, RefundAttemptStatus.PROCESSING],
  [RefundAttemptStatus.FAILED_TERMINAL, RefundAttemptStatus.PROCESSING],
  [RefundAttemptStatus.CANCELLED, RefundAttemptStatus.PROCESSING],
] as const;

describe("RefundAttemptStatus transitions", () => {
  it.each(ALLOWED_TRANSITIONS)("allows %s -> %s", (from, to) => {
    expect(canTransitionRefundAttemptStatus(from, to)).toBe(true);
    expect(validateRefundAttemptStatusTransition(from, to)).toEqual({ ok: true });
  });

  it.each(FORBIDDEN_TRANSITIONS)("forbids %s -> %s", (from, to) => {
    expect(canTransitionRefundAttemptStatus(from, to)).toBe(false);
    expect(validateRefundAttemptStatusTransition(from, to)).toEqual({
      ok: false,
      code: "INVALID_REFUND_ATTEMPT_TRANSITION",
      message: "Refund attempt status transition is not allowed.",
    });
  });

  it.each(Object.values(RefundAttemptStatus))("forbids same-status transition for %s", (status) => {
    expect(canTransitionRefundAttemptStatus(status, status)).toBe(false);
    expect(validateRefundAttemptStatusTransition(status, status)).toMatchObject({
      ok: false,
      code: "INVALID_REFUND_ATTEMPT_TRANSITION",
    });
  });

  it.each([
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ])("gives terminal status %s no outgoing transitions", (status) => {
    expect(isTerminalRefundAttemptStatus(status)).toBe(true);
    expect(allowedNextRefundAttemptStatuses(status)).toEqual([]);
  });

  it("returns stable declaration-order next statuses", () => {
    expect(allowedNextRefundAttemptStatuses(RefundAttemptStatus.REQUESTED)).toEqual([
      RefundAttemptStatus.PROCESSING,
      RefundAttemptStatus.CANCELLED,
    ]);
    expect(allowedNextRefundAttemptStatuses(RefundAttemptStatus.PROCESSING)).toEqual([
      RefundAttemptStatus.SUCCEEDED,
      RefundAttemptStatus.FAILED_RETRYABLE,
      RefundAttemptStatus.FAILED_TERMINAL,
      RefundAttemptStatus.MANUAL_REVIEW,
    ]);
    expect(allowedNextRefundAttemptStatuses(RefundAttemptStatus.FAILED_RETRYABLE)).toEqual([
      RefundAttemptStatus.PROCESSING,
      RefundAttemptStatus.FAILED_TERMINAL,
      RefundAttemptStatus.CANCELLED,
    ]);
    expect(allowedNextRefundAttemptStatuses(RefundAttemptStatus.MANUAL_REVIEW)).toEqual([
      RefundAttemptStatus.PROCESSING,
      RefundAttemptStatus.SUCCEEDED,
      RefundAttemptStatus.FAILED_TERMINAL,
      RefundAttemptStatus.CANCELLED,
    ]);
  });

  it("keeps SUCCEEDED lifecycle-terminal while guarded as succeeded money", () => {
    expect(isTerminalRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
    expect(isGuardedRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
    expect(isSucceededRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
  });

  it("keeps FAILED_RETRYABLE guarded and retryable through PROCESSING", () => {
    expect(isTerminalRefundAttemptStatus(RefundAttemptStatus.FAILED_RETRYABLE)).toBe(false);
    expect(isGuardedRefundAttemptStatus(RefundAttemptStatus.FAILED_RETRYABLE)).toBe(true);
    expect(canTransitionRefundAttemptStatus(
      RefundAttemptStatus.FAILED_RETRYABLE,
      RefundAttemptStatus.PROCESSING,
    )).toBe(true);
  });

  it.each([
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ])("keeps %s terminal and non-guarding", (status) => {
    expect(isTerminalRefundAttemptStatus(status)).toBe(true);
    expect(isGuardedRefundAttemptStatus(status)).toBe(false);
  });
});
