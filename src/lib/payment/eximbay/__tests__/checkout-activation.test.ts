import { describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";
import {
  EXIMBAY_CHECKOUT_SANDBOX_ENABLED,
  isEximbayCheckoutSandboxAvailable,
  parseEximbayCheckoutSandboxActivation,
} from "../checkout-activation";

describe("Eximbay customer checkout SANDBOX activation", () => {
  it.each([
    [undefined, "DISABLED"],
    ["", "DISABLED"],
    ["ENABLED", "ENABLED"],
    [" ENABLED", "INVALID"],
    ["ENABLED ", "INVALID"],
    ["enabled", "INVALID"],
    [" enabled ", "INVALID"],
    [" ", "INVALID"],
    ["TRUE", "INVALID"],
    ["1", "INVALID"],
  ] as const)("parses raw value %j as %s without normalization", (rawValue, expected) => {
    expect(parseEximbayCheckoutSandboxActivation(rawValue)).toBe(expected);
  });

  it("admits only the exact authorized customer context", () => {
    expect(available()).toBe(true);
    expect(available({ market: MarketCode.JP })).toBe(false);
    expect(available({ method: PaymentMethod.PAYPAL_WALLET })).toBe(false);
    expect(available({ currency: "JPY" })).toBe(false);
    expect(available({ mode: PaymentMode.LIVE })).toBe(false);
  });

  it.each([null, "", "enabled", " ENABLED", "ENABLED "])(
    "keeps customer availability false for non-admitted activation %j",
    (value) => {
      expect(available({}, value)).toBe(false);
    },
  );
});

function available(
  overrides: Partial<Parameters<typeof isEximbayCheckoutSandboxAvailable>[0]> = {},
  activation: string | null = "ENABLED",
): boolean {
  return isEximbayCheckoutSandboxAvailable({
    mode: PaymentMode.SANDBOX,
    market: MarketCode.US,
    method: PaymentMethod.CARD,
    currency: "USD",
    env: activation === null ? {} : { [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: activation },
    ...overrides,
  });
}
