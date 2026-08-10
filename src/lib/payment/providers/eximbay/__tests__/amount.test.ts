import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXIMBAY_MAX_AMOUNT_MINOR,
  EximbayProtocolError,
  decodeEximbayAmount,
  encodeEximbayAmount,
} from "../index";

describe("Eximbay minor-unit amount codec", () => {
  it.each([
    ["USD", 1, "0.01"],
    ["USD", 10, "0.10"],
    ["USD", 100, "1.00"],
    ["USD", 2_999, "29.99"],
    ["JPY", 1, "1"],
    ["JPY", 1_500, "1500"],
    ["USD", EXIMBAY_MAX_AMOUNT_MINOR, "21474836.47"],
    ["JPY", EXIMBAY_MAX_AMOUNT_MINOR, "2147483647"],
  ])("encodes %s %s as the canonical wire value", (currency, minor, wire) => {
    expect(encodeEximbayAmount(currency, minor)).toBe(wire);
    expect(decodeEximbayAmount(currency, wire)).toBe(minor);
  });

  it.each([
    0,
    -0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    EXIMBAY_MAX_AMOUNT_MINOR + 1,
    "100",
    true,
  ])("rejects invalid minor-unit input without coercion: %s", (value) => {
    expect(() => encodeEximbayAmount("USD", value)).toThrow(EximbayProtocolError);
  });

  it("rejects unsupported currencies", () => {
    expect(() => encodeEximbayAmount("KRW", 1)).toThrowError("UNSUPPORTED_CURRENCY");
    expect(() => decodeEximbayAmount("EUR", "1.00")).toThrowError("UNSUPPORTED_CURRENCY");
  });

  it.each([
    ["USD", "0.00"],
    ["USD", "00.01"],
    ["USD", "1"],
    ["USD", "1.0"],
    ["USD", "1.000"],
    ["USD", "+1.00"],
    ["USD", " 1.00"],
    ["USD", "1e2"],
    ["USD", "21,474,836.47"],
    ["USD", "21474836.48"],
    ["JPY", "0"],
    ["JPY", "01"],
    ["JPY", "+1"],
    ["JPY", "1.0"],
    ["JPY", "2147483648"],
    ["JPY", 1],
  ])("fails closed on noncanonical inverse input %s %s", (currency, wire) => {
    expect(() => decodeEximbayAmount(currency, wire)).toThrow(EximbayProtocolError);
  });

  it("guards the source against floating major-unit conversion", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/payment/providers/eximbay/amount.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/Math\.floor|toFixed|parseFloat|Intl/u);
    expect(source).not.toMatch(/minor\s*\/\s*100/u);
  });
});
