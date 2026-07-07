import { describe, expect, it } from "vitest";
import { deriveTossOrderId, parseTossOrderId } from "../order-id";

describe("Toss orderId helper", () => {
  it("derives the locked provider-prefixed orderId from payment id", () => {
    expect(deriveTossOrderId("pay_123")).toBe("mira_toss_pay_123");
  });

  it("parses a valid orderId back to payment id", () => {
    expect(parseTossOrderId("mira_toss_payment123")).toEqual({ ok: true, paymentId: "payment123" });
  });

  it("does not append mode or random suffix data", () => {
    const first = deriveTossOrderId("pay_123");
    const second = deriveTossOrderId("pay_123");

    expect(first).toBe("mira_toss_pay_123");
    expect(second).toBe(first);
  });

  it("rejects the wrong prefix", () => {
    expect(parseTossOrderId("other_payment123")).toEqual({ ok: false, reason: "INVALID_PREFIX" });
  });

  it("rejects an empty payment id", () => {
    expect(parseTossOrderId("mira_toss_")).toEqual({ ok: false, reason: "EMPTY_PAYMENT_ID" });
    expect(() => deriveTossOrderId("")).toThrow("EMPTY_PAYMENT_ID");
  });

  it("rejects unsupported characters", () => {
    expect(parseTossOrderId("mira_toss_pay:123")).toEqual({ ok: false, reason: "INVALID_CHARACTERS" });
    expect(() => deriveTossOrderId("pay:123")).toThrow("INVALID_CHARACTERS");
  });

  it("enforces Toss orderId length", () => {
    const tooLong = "a".repeat(55);

    expect(parseTossOrderId(`mira_toss_${tooLong}`)).toEqual({ ok: false, reason: "INVALID_LENGTH" });
    expect(() => deriveTossOrderId(tooLong)).toThrow("INVALID_LENGTH");
  });
});
