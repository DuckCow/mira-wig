import { describe, expect, it } from "vitest";
import { extractTossRefundEligibilityResponse } from "../refund-lookup-response";

const EXPECTATION = {
  paymentKey: "payment_key_123",
  conservativeNoLaterThanLookupTimestamp: 1_768_435_200_123,
};
const ELIGIBLE = {
  paymentKey: EXPECTATION.paymentKey,
  method: "카드",
  easyPay: null,
  currency: "KRW",
  status: "DONE",
  totalAmount: 85_000,
  balanceAmount: 85_000,
  taxFreeAmount: 0,
  taxExemptionAmount: 0,
  cancels: null,
};

function extract(value: unknown) {
  return extractTossRefundEligibilityResponse(JSON.stringify(value), EXPECTATION);
}

describe("Toss refund lookup response extraction", () => {
  it("extracts eligible facts and carries the Phase-1 timestamp exactly", () => {
    const result = extract({ ...ELIGIBLE, ignored: { nested: [1, 2] } });
    expect(result.kind).toBe("eligible");
    if (result.kind !== "eligible") throw new Error("Expected eligible response.");
    expect(result.facts.localReceivedAt).toBe(EXPECTATION.conservativeNoLaterThanLookupTimestamp);
    expect(result.facts.totalAmount).toBe(85_000);
    expect(Object.isFrozen(result.facts)).toBe(true);
  });

  it.each([
    ["method", null], ["method", 1], ["currency", null], ["status", {}],
    ["totalAmount", 0], ["totalAmount", 2_147_483_648], ["balanceAmount", 1.5],
    ["taxFreeAmount", -1], ["taxExemptionAmount", null], ["easyPay", []], ["cancels", {}],
  ])("rejects malformed %s=%j", (field, value) => {
    expect(extract({ ...ELIGIBLE, [field]: value }).kind).toBe("rejected");
  });

  it.each([null, [], true, 1, "text"])('rejects root value %j', (value) => {
    expect(extract(value).kind).toBe("rejected");
  });

  it.each([
    { ...ELIGIBLE, method: "계좌이체" },
    { ...ELIGIBLE, easyPay: {} },
    { ...ELIGIBLE, currency: "USD" },
    { ...ELIGIBLE, status: "CANCELED" },
    { ...ELIGIBLE, taxFreeAmount: 1 },
    { ...ELIGIBLE, taxExemptionAmount: 1 },
    { ...ELIGIBLE, cancels: [{}] },
  ])("classifies known non-eligible facts without accepting them", (value) => {
    expect(extract(value).kind).toBe("ineligible");
  });

  it("rejects payment-key mismatch, invalid JSON, and duplicate extracted root keys", () => {
    expect(extract({ ...ELIGIBLE, paymentKey: "different" }).kind).toBe("rejected");
    expect(extractTossRefundEligibilityResponse("{", EXPECTATION).kind).toBe("rejected");
    const duplicate = `${JSON.stringify(ELIGIBLE).slice(0, -1)},"paymentKey":"other"}`;
    const escaped = `${JSON.stringify(ELIGIBLE).slice(0, -1)},"payment\\u004bey":"other"}`;
    expect(extractTossRefundEligibilityResponse(duplicate, EXPECTATION).kind).toBe("rejected");
    expect(extractTossRefundEligibilityResponse(escaped, EXPECTATION).kind).toBe("rejected");
  });

  it("allows duplicate target names only below the root and validates nested JSON", () => {
    const body = `${JSON.stringify(ELIGIBLE).slice(0, -1)},"extra":{"paymentKey":"nested"}}`;
    expect(extractTossRefundEligibilityResponse(body, EXPECTATION).kind).toBe("eligible");
  });
});
