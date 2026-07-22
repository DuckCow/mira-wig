import { describe, expect, it } from "vitest";
import {
  REFUND_RECONCILIATION_HARD_DEADLINE_SECONDS,
  refundReconciliationDeadlineClassification,
  refundReconciliationHardDeadlineSeconds,
  refundReconciliationHardDeadlineReached,
} from "../refund-operations-reconciliation";
import { TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS } from "../providers/toss/refund-recovery-policy";

const SECOND = 1_000;
const DAY_SECONDS = 24 * 60 * 60;
const CAPTURED_AT = new Date("2026-07-22T00:00:00.000Z");

describe("refund operations reconciliation deadline mathematics", () => {
  it("derives the exact hard deadline from the Toss recovery policy authority", () => {
    expect(REFUND_RECONCILIATION_HARD_DEADLINE_SECONDS).toBe(1_123_200);
    expect(REFUND_RECONCILIATION_HARD_DEADLINE_SECONDS).toBe(
      TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS / SECOND,
    );
    expect(refundReconciliationHardDeadlineSeconds(42_000)).toBe(42);
    for (const invalid of [-1, 1.5, 1_001, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      expect(() => refundReconciliationHardDeadlineSeconds(invalid))
        .toThrow("INVALID_REFUND_RECONCILIATION_HARD_DEADLINE");
    }
  });

  it.each([
    [10 * DAY_SECONDS - 1, "BELOW_WARNING", false],
    [10 * DAY_SECONDS, "WARNING", false],
    [12 * DAY_SECONDS - 1, "WARNING", false],
    [12 * DAY_SECONDS, "CRITICAL", false],
    [13 * DAY_SECONDS - 1, "CRITICAL", false],
    [13 * DAY_SECONDS, "CRITICAL", true],
  ] as const)("classifies exact age %s seconds", (ageSeconds, classification, hardDeadline) => {
    const contactAt = new Date(CAPTURED_AT.getTime() - ageSeconds * SECOND);
    expect(refundReconciliationDeadlineClassification(CAPTURED_AT, contactAt))
      .toBe(classification);
    expect(refundReconciliationHardDeadlineReached(CAPTURED_AT, contactAt))
      .toBe(hardDeadline);
  });

  it("clamps a future contact timestamp to age zero", () => {
    const future = new Date(CAPTURED_AT.getTime() + 60 * SECOND);
    expect(refundReconciliationDeadlineClassification(CAPTURED_AT, future))
      .toBe("BELOW_WARNING");
    expect(refundReconciliationHardDeadlineReached(CAPTURED_AT, future)).toBe(false);
  });
});
