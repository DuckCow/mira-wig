import { describe, expect, it } from "vitest";
import {
  calculateRefundableAmount,
  calculateRefundableAmountFromAllAdjustments,
} from "../refundable";

describe("refundable helpers", () => {
  it("SUCCEEDED adjustment 합산액을 결제액에서 뺀다", () => {
    expect(calculateRefundableAmount(85000, [{ amount: 10000 }, { amount: 5000 }])).toBe(70000);
  });

  it("전체 adjustment 목록에서는 SUCCEEDED만 환불 차감액으로 본다", () => {
    expect(calculateRefundableAmountFromAllAdjustments(85000, [
      { amount: 10000, status: "SUCCEEDED" },
      { amount: 20000, status: "FAILED" },
      { amount: 30000, status: "PENDING" },
    ])).toBe(75000);
  });
});
