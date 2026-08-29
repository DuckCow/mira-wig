import { RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  cumulativeDiscountReversal,
  expectedMerchandiseRefundAmount,
  incrementalDiscountReversal,
} from "../economic-allocation";
import {
  deriveRefundEconomicLines,
  validateRefundEconomicAllocation,
  type RefundEconomicOrder,
} from "../economic-validation";

describe("coupon refund economic allocation", () => {
  it("uses floor(D*k/Q) and makes odd three-way splits close exactly", () => {
    expect(cumulativeDiscountReversal(100, 3, 0)).toEqual({ ok: true, amount: 0 });
    expect(cumulativeDiscountReversal(100, 3, 1)).toEqual({ ok: true, amount: 33 });
    expect(cumulativeDiscountReversal(100, 3, 2)).toEqual({ ok: true, amount: 66 });
    expect(cumulativeDiscountReversal(100, 3, 3)).toEqual({ ok: true, amount: 100 });
    expect(incrementalDiscountReversal(100, 3, 0, 1)).toEqual({ ok: true, amount: 33 });
    expect(incrementalDiscountReversal(100, 3, 1, 1)).toEqual({ ok: true, amount: 33 });
    expect(incrementalDiscountReversal(100, 3, 2, 1)).toEqual({ ok: true, amount: 34 });
  });

  it("handles quantity one, zero-discount lines, and bounded integer overflow", () => {
    expect(incrementalDiscountReversal(375, 1, 0, 1)).toEqual({ ok: true, amount: 375 });
    expect(incrementalDiscountReversal(0, 7, 2, 3)).toEqual({ ok: true, amount: 0 });
    expect(expectedMerchandiseRefundAmount(1_000, 2, 125)).toEqual({ ok: true, amount: 1_875 });
    expect(expectedMerchandiseRefundAmount(2_147_483_647, 2, 0))
      .toEqual({ ok: false, code: "DISCOUNT_ALLOCATION_OVERFLOW" });
    expect(cumulativeDiscountReversal(1, 0, 0))
      .toEqual({ ok: false, code: "INVALID_DISCOUNT_ALLOCATION_INPUT" });
  });

  it("derives independent multi-line cancellation allocations and preserves non-coupon shape", () => {
    const coupon = orderFixture();
    const derived = deriveRefundEconomicLines(coupon, 1_667, [
      { orderItemId: "line-a", quantity: 1 },
      { orderItemId: "line-b", quantity: 2 },
    ]);
    expect(derived).toEqual({
      ok: true,
      lines: [
        { orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 967 },
        { orderItemId: "line-b", quantity: 2, merchandiseRefundAmount: 700 },
      ],
    });
    expect(deriveRefundEconomicLines(
      { ...coupon, promotionGrantId: null, discountAmount: 0 },
      1_000,
      [{ orderItemId: "line-a", quantity: 1 }],
    )).toEqual({ ok: true, lines: [{ orderItemId: "line-a", quantity: 1 }] });
  });

  it("requires bounded authoritative coupon allocation while rejecting it on non-coupon Orders", () => {
    const coupon = orderFixture();
    expect(validateRefundEconomicAllocation(coupon, 1_000, [
      { orderItemId: "line-a", quantity: 1 },
    ])).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_REQUIRED" });
    expect(validateRefundEconomicAllocation(coupon, 1_000, [
      { orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 966 },
    ])).toEqual({ ok: true });
    expect(validateRefundEconomicAllocation(coupon, 1_000, [
      { orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 0 },
    ])).toEqual({ ok: true });
    expect(validateRefundEconomicAllocation(coupon, 1_000, [
      { orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 968 },
    ])).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_MISMATCH" });
    expect(validateRefundEconomicAllocation(coupon, 1_000, [
      { orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 700 },
      { orderItemId: "line-b", quantity: 2, merchandiseRefundAmount: 700 },
    ])).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_MISMATCH" });
    expect(validateRefundEconomicAllocation(
      { ...coupon, promotionGrantId: null, discountAmount: 0 },
      1_000,
      [{ orderItemId: "line-a", quantity: 1, merchandiseRefundAmount: 1_000 }],
    )).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_UNEXPECTED" });
  });

  it("uses only prior successful quantity and fails closed for missing historical allocation", () => {
    const prior = historicalAttempt(RefundAttemptStatus.SUCCEEDED, 1, 967, "success");
    const failed = historicalAttempt(RefundAttemptStatus.FAILED_TERMINAL, 1, 10, "failed");
    const order = { ...orderFixture(), refundAttempts: [prior, failed] };
    expect(deriveRefundEconomicLines(order, 1_933, [{ orderItemId: "line-a", quantity: 2 }]))
      .toEqual({
        ok: true,
        lines: [{ orderItemId: "line-a", quantity: 2, merchandiseRefundAmount: 1_933 }],
      });
    const missing = {
      ...prior,
      lines: [{ ...prior.lines[0], economicAllocation: null }],
    };
    expect(validateRefundEconomicAllocation(
      { ...orderFixture(), refundAttempts: [missing] },
      1_000,
      [{ orderItemId: "line-b", quantity: 1, merchandiseRefundAmount: 400 }],
    )).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_HISTORY_INCONSISTENT" });
    const oversized = historicalAttempt(RefundAttemptStatus.SUCCEEDED, 1, 968, "oversized");
    expect(validateRefundEconomicAllocation(
      { ...orderFixture(), refundAttempts: [oversized] },
      1_000,
      [{ orderItemId: "line-b", quantity: 1, merchandiseRefundAmount: 1 }],
    )).toMatchObject({ ok: false, code: "REFUND_ECONOMIC_HISTORY_INCONSISTENT" });
  });
});

function orderFixture(): RefundEconomicOrder {
  return {
    promotionGrantId: "grant-1",
    discountAmount: 200,
    items: [
      { id: "line-a", quantity: 3, unitAmount: 1_000, discountAmount: 100 },
      { id: "line-b", quantity: 2, unitAmount: 400, discountAmount: 100 },
    ],
    refundAttempts: [],
  };
}

function historicalAttempt(
  status: RefundAttemptStatus,
  quantity: number,
  merchandiseRefundAmount: number,
  id: string,
) {
  return {
    id,
    amount: 1_000,
    status,
    processedAt: status === RefundAttemptStatus.SUCCEEDED
      ? new Date("2026-08-29T00:00:00.000Z")
      : null,
    lines: [{
      orderItemId: "line-a",
      quantity,
      economicAllocation: {
        refundAttemptId: id,
        orderItemId: "line-a",
        merchandiseRefundAmount,
        createdAt: new Date("2026-08-29T00:00:00.000Z"),
      },
    }],
  };
}
