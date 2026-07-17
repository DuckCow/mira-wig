import { describe, expect, it } from "vitest";
import {
  isRefundExecutionClaimEnabled,
  isRefundExecutionLeaseEnabled,
  isRefundExecutionLeaseReleaseEnabled,
  isRefundExecutionUncontactedRecoveryEnabled,
  isRefundExecutionDispatchAuthorizationEnabled,
  isRefundExecutionObservationApplicationEnabled,
  isRefundExecutionTossAuthorizationEnabled,
  isRefundExecutionTossContactEnabled,
  isRefundExecutionTossEligibilityLookupEnabled,
  isRefundExecutionTossRecoveryLookupEnabled,
  isRefundExecutionTossRecoveryRecontactEnabled,
  REFUND_EXECUTION_CLAIM_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
  RefundExecutionActivationConfigError,
} from "../execution-activation";

describe.each([
  [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED, isRefundExecutionUncontactedRecoveryEnabled],
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED, isRefundExecutionTossAuthorizationEnabled],
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED, isRefundExecutionTossContactEnabled],
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED, isRefundExecutionTossEligibilityLookupEnabled],
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED, isRefundExecutionTossRecoveryLookupEnabled],
  [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED, isRefundExecutionTossRecoveryRecontactEnabled],
] as const)("%s", (key, enabled) => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(enabled({ [key]: value })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(enabled({ [key]: value })).toBe(true);
  });

  it("rejects malformed nonblank configuration without retaining it", () => {
    const malformed = "unexpected-secret-value";
    expect(() => enabled({ [key]: malformed })).toThrow(RefundExecutionActivationConfigError);
    try {
      enabled({ [key]: malformed });
    } catch (error) {
      expect(String(error)).not.toContain(malformed);
    }
  });
});

describe(REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED, () => {
  it("is independent of ordinary lease activation", () => {
    expect(isRefundExecutionUncontactedRecoveryEnabled({
      [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
    })).toBe(false);
  });
});

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

describe(REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED, () => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(isRefundExecutionObservationApplicationEnabled({
      [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: value,
    })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(isRefundExecutionObservationApplicationEnabled({
      [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: value,
    })).toBe(true);
  });

  it("rejects and does not retain malformed nonblank configuration", () => {
    const malformed = "unexpected-secret-value";
    let thrown: unknown;
    try {
      isRefundExecutionObservationApplicationEnabled({
        [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: malformed,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RefundExecutionActivationConfigError);
    if (!(thrown instanceof Error)) throw new Error("Expected a configuration error.");
    expect(thrown.message).not.toContain(malformed);
    expect(JSON.stringify(thrown)).not.toContain(malformed);
    expect(Object.values(thrown)).not.toContain(malformed);
  });
});

describe(REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED, () => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(isRefundExecutionDispatchAuthorizationEnabled({
      [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: value,
    })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(isRefundExecutionDispatchAuthorizationEnabled({
      [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: value,
    })).toBe(true);
  });

  it("rejects and does not retain a malformed nonblank value", () => {
    const malformed = "unexpected-secret-value";
    let thrown: unknown;
    try {
      isRefundExecutionDispatchAuthorizationEnabled({
        [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: malformed,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RefundExecutionActivationConfigError);
    if (!(thrown instanceof Error)) throw new Error("Expected a configuration error.");
    expect(thrown.message).toContain(REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED);
    expect(thrown.message).not.toContain(malformed);
    expect(JSON.stringify(thrown)).not.toContain(malformed);
    expect(Object.values(thrown)).not.toContain(malformed);
  });

  it("is independent of lease and release activation", () => {
    expect(isRefundExecutionDispatchAuthorizationEnabled({
      [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
      [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "ENABLED",
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

describe(REFUND_EXECUTION_LEASE_RELEASE_ENABLED, () => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(isRefundExecutionLeaseReleaseEnabled({
      [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: value,
    })).toBe(false);
  });

  it.each(["ENABLED", "  ENABLED  "])("treats %j as enabled", (value) => {
    expect(isRefundExecutionLeaseReleaseEnabled({
      [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: value,
    })).toBe(true);
  });

  it.each(["enabled", "true", "DISABLED", "unexpected-secret-value"])(
    "rejects malformed nonblank value %j without retaining it",
    (value) => {
      let thrown: unknown;
      try {
        isRefundExecutionLeaseReleaseEnabled({ [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: value });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RefundExecutionActivationConfigError);
      if (!(thrown instanceof Error)) throw new Error("Expected a refund execution configuration error.");
      expect(thrown.message).toContain(REFUND_EXECUTION_LEASE_RELEASE_ENABLED);
      expect(thrown.message).not.toContain(value);
      expect(JSON.stringify(thrown)).not.toContain(value);
      expect(Object.values(thrown)).not.toContain(value);
    },
  );
});
