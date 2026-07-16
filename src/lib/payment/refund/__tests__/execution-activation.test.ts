import { describe, expect, it } from "vitest";
import {
  isRefundExecutionClaimEnabled,
  isRefundExecutionLeaseEnabled,
  REFUND_EXECUTION_CLAIM_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  RefundExecutionActivationConfigError,
} from "../execution-activation";

describe(REFUND_EXECUTION_CLAIM_ENABLED, () => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(isRefundExecutionClaimEnabled({ [REFUND_EXECUTION_CLAIM_ENABLED]: value })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(isRefundExecutionClaimEnabled({ [REFUND_EXECUTION_CLAIM_ENABLED]: value })).toBe(true);
  });

  it.each(["enabled", "true", "DISABLED", "unexpected-secret-value"])(
    "rejects malformed nonblank value %j without retaining it",
    (value) => {
      let thrown: unknown;
      try {
        isRefundExecutionClaimEnabled({ [REFUND_EXECUTION_CLAIM_ENABLED]: value });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RefundExecutionActivationConfigError);
      if (!(thrown instanceof Error)) throw new Error("Expected a refund execution configuration error.");
      expect(thrown.message).toContain(REFUND_EXECUTION_CLAIM_ENABLED);
      expect(thrown.message).not.toContain(value);
      expect(JSON.stringify(thrown)).not.toContain(value);
      expect(Object.values(thrown)).not.toContain(value);
    },
  );

  it.each(["SANDBOX", "LIVE"])("does not derive activation from PAYMENT_MODE=%s", (mode) => {
    expect(isRefundExecutionClaimEnabled({ PAYMENT_MODE: mode })).toBe(false);
  });

  it("does not inherit customer intake activation", () => {
    expect(isRefundExecutionClaimEnabled({
      CUSTOMER_REFUND_INTAKE_SUBMIT_ENABLED: "ENABLED",
      CUSTOMER_REFUND_INTAKE_APPROVE_ENABLED: "ENABLED",
    })).toBe(false);
  });
});

describe(REFUND_EXECUTION_LEASE_ENABLED, () => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(isRefundExecutionLeaseEnabled({ [REFUND_EXECUTION_LEASE_ENABLED]: value })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(isRefundExecutionLeaseEnabled({ [REFUND_EXECUTION_LEASE_ENABLED]: value })).toBe(true);
  });

  it.each(["enabled", "true", "DISABLED", "unexpected-secret-value"])(
    "rejects malformed nonblank value %j without retaining it",
    (value) => {
      let thrown: unknown;
      try {
        isRefundExecutionLeaseEnabled({ [REFUND_EXECUTION_LEASE_ENABLED]: value });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RefundExecutionActivationConfigError);
      if (!(thrown instanceof Error)) throw new Error("Expected a refund execution configuration error.");
      expect(thrown.message).toContain(REFUND_EXECUTION_LEASE_ENABLED);
      expect(thrown.message).not.toContain(value);
      expect(JSON.stringify(thrown)).not.toContain(value);
      expect(Object.values(thrown)).not.toContain(value);
    },
  );
});
