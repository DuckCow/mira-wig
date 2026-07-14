import { describe, expect, it } from "vitest";
import {
  CustomerRefundIntakeActivationConfigError,
  isCustomerRefundIntakeApproveEnabled,
  isCustomerRefundIntakeSubmitEnabled,
} from "../customer-intake-activation";

const SUBMIT_KEY = "CUSTOMER_REFUND_INTAKE_SUBMIT_ENABLED";
const APPROVE_KEY = "CUSTOMER_REFUND_INTAKE_APPROVE_ENABLED";

describe.each([
  [SUBMIT_KEY, isCustomerRefundIntakeSubmitEnabled],
  [APPROVE_KEY, isCustomerRefundIntakeApproveEnabled],
] as const)("%s", (key, evaluate) => {
  it.each([undefined, "", "   "])("treats %j as disabled", (value) => {
    expect(evaluate({ [key]: value })).toBe(false);
  });

  it.each(["ENABLED", " ENABLED "])("treats %j as enabled", (value) => {
    expect(evaluate({ [key]: value })).toBe(true);
  });

  it.each(["enabled", "true", "false", "DISABLED", "0", "unexpected-secret-value"])(
    "rejects malformed nonblank value %j without retaining it",
    (value) => {
      let thrown: unknown;
      try {
        evaluate({ [key]: value });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(CustomerRefundIntakeActivationConfigError);
      expect(thrown).toBeInstanceOf(Error);
      if (!(thrown instanceof Error)) throw new Error("Expected an activation configuration error.");
      expect(thrown.message).toContain(key);
      expect(thrown.message).not.toContain(value);
      expect(JSON.stringify(thrown)).not.toContain(value);
      expect(Object.values(thrown)).not.toContain(value);
    },
  );

  it("does not mutate the injected environment", () => {
    const env = Object.freeze({ [key]: " ENABLED ", PAYMENT_MODE: "SANDBOX" });
    const before = { ...env };

    expect(evaluate(env)).toBe(true);
    expect(env).toEqual(before);
  });
});

it("keeps submit and approve activation independent", () => {
  const env = {
    [SUBMIT_KEY]: "ENABLED",
    [APPROVE_KEY]: "",
    PAYMENT_MODE: "LIVE",
  };

  expect(isCustomerRefundIntakeSubmitEnabled(env)).toBe(true);
  expect(isCustomerRefundIntakeApproveEnabled(env)).toBe(false);
});

it.each(["SANDBOX", "LIVE"])("does not derive activation from PAYMENT_MODE=%s", (mode) => {
  expect(isCustomerRefundIntakeSubmitEnabled({ PAYMENT_MODE: mode })).toBe(false);
  expect(isCustomerRefundIntakeApproveEnabled({ PAYMENT_MODE: mode })).toBe(false);
});
