import { describe, expect, it, afterEach } from "vitest";
import { configuredPaymentMode, PaymentModeConfigException } from "../mode";
import { PaymentMode } from "../providers/routing";

const ORIGINAL_PAYMENT_MODE = process.env.PAYMENT_MODE;

describe("configuredPaymentMode", () => {
  afterEach(() => {
    restorePaymentMode();
  });

  it("defaults to SANDBOX when PAYMENT_MODE is unset", () => {
    delete process.env.PAYMENT_MODE;

    expect(configuredPaymentMode()).toBe(PaymentMode.SANDBOX);
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace-only"],
    ["SANDBOX", "explicit SANDBOX"],
  ])("returns SANDBOX for %s (%s)", (value) => {
    process.env.PAYMENT_MODE = value;

    expect(configuredPaymentMode()).toBe(PaymentMode.SANDBOX);
  });

  it("returns LIVE for exact LIVE", () => {
    process.env.PAYMENT_MODE = "LIVE";

    expect(configuredPaymentMode()).toBe(PaymentMode.LIVE);
  });

  it.each(["live", "live ", "prod", "true", "0"])("rejects invalid value %s", (value) => {
    process.env.PAYMENT_MODE = value;

    try {
      configuredPaymentMode();
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentModeConfigException);
      if (e instanceof PaymentModeConfigException) {
        expect(e.rawValue).toBe(value);
        expect(e.message).not.toContain(value);
      }
      return;
    }
    throw new Error("Expected PaymentModeConfigException.");
  });
});

function restorePaymentMode(): void {
  if (ORIGINAL_PAYMENT_MODE === undefined) {
    delete process.env.PAYMENT_MODE;
    return;
  }
  process.env.PAYMENT_MODE = ORIGINAL_PAYMENT_MODE;
}
