import { describe, expect, it } from "vitest";
import { REFUND_EXECUTION_LEASE_DURATION_MS } from "../../../acquire-lease";
import {
  planTossRefundRecoveryWindow,
  TOSS_REFUND_RECOVERY_MAX_PHYSICAL_CONTACTS,
  TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS,
  TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS,
} from "../refund-recovery-policy";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-07-01T00:00:00.000Z");

describe("fixed Toss recovery policy", () => {
  it("locks the adjudicated source constants and reuses lease cadence", () => {
    expect(TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS).toBe(13 * DAY);
    expect(TOSS_REFUND_RECOVERY_MAX_PHYSICAL_CONTACTS).toBe(2);
    expect(TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS).toBe(15 * 60 * 1000);
    expect(REFUND_EXECUTION_LEASE_DURATION_MS).toBe(5 * 60 * 1000);
  });

  it.each([
    [13 * DAY - 1, true, ""],
    [13 * DAY, false, "RECOVERY_DEADLINE_EXPIRED"],
    [13 * DAY + 1, false, "RECOVERY_DEADLINE_EXPIRED"],
  ] as const)("enforces the strict deadline at offset %s", (offset, ok, code) => {
    const result = planTossRefundRecoveryWindow([{ ordinal: 1, contactMarkedAt: START }], START + offset);
    expect(result.ok).toBe(ok);
    expect(result.ok ? "" : result.code).toBe(code);
  });

  it("uses earliest deadline and latest interval without resetting either", () => {
    const result = planTossRefundRecoveryWindow([
      { ordinal: 1, contactMarkedAt: START },
      { ordinal: 2, contactMarkedAt: START + DAY },
    ], START + DAY + 15 * 60 * 1000);
    expect(!result.ok && result.code === "RECOVERY_ORDINAL_LIMIT_REACHED").toBe(true);
  });

  it.each([
    [15 * 60 * 1000 - 1, "RECOVERY_INTERVAL_NOT_ELAPSED"],
    [15 * 60 * 1000, ""],
  ] as const)("enforces the interval at %s ms", (offset, code) => {
    const result = planTossRefundRecoveryWindow([{ ordinal: 1, contactMarkedAt: START }], START + offset);
    expect(result.ok ? "" : result.code).toBe(code);
  });

  it.each([
    [[], START],
    [[{ ordinal: 1, contactMarkedAt: START + 1 }], START],
    [[{ ordinal: 1, contactMarkedAt: 1.5 }], START],
    [[{ ordinal: 1, contactMarkedAt: Number.MAX_SAFE_INTEGER }], Number.MAX_SAFE_INTEGER],
    [[
      { ordinal: 1, contactMarkedAt: START },
      { ordinal: 2, contactMarkedAt: START + 1 },
      { ordinal: 3, contactMarkedAt: START + 2 },
    ], START + 15 * 60 * 1000],
  ])("fails closed for invalid recovery timing", (contacts, now) => {
    const result = planTossRefundRecoveryWindow(contacts, now);
    expect(!result.ok && result.code === "REFUND_LEDGER_INCONSISTENT").toBe(true);
  });
});
