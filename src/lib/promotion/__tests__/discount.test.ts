import { describe, expect, it } from "vitest";
import { calculatePercentageDiscount } from "../discount";

const minor = BigInt;

describe("calculatePercentageDiscount", () => {
  it("calculates exact and fractional-floor percentage discounts", () => {
    expect(calculate([minor(10_000)], 2_500, minor(9_999)).actualDiscountMinor).toBe(minor(2_500));
    expect(calculate([minor(101)], 333, minor(9_999)).rawDiscountMinor).toBe(minor(3));
  });

  it("applies the cap and never exceeds the subtotal", () => {
    expect(calculate([minor(10_000)], 5_000, minor(2_000)).actualDiscountMinor).toBe(minor(2_000));
    expect(calculate([minor(100)], 10_000, minor(1_000)).actualDiscountMinor).toBe(minor(100));
    expect(calculate([minor(100)], 1_000, minor(1_000)).actualDiscountMinor).toBe(minor(10));
  });

  it("returns bounded zero dispositions", () => {
    const zero = calculate([], 1_000, minor(100));
    expect(zero).toMatchObject({
      eligibleSubtotalMinor: minor(0),
      actualDiscountMinor: minor(0),
      disposition: "ZERO_SUBTOTAL",
    });
    const below = calculate([minor(999)], 1_000, minor(100), minor(1_000));
    expect(below).toMatchObject({ actualDiscountMinor: minor(0), disposition: "MINIMUM_NOT_MET" });
    expect(calculate([minor(1_000)], 1_000, minor(100), minor(1_000)).disposition).toBe("APPLIED");
  });

  it("allocates one line and multiple lines with exact conservation", () => {
    const single = calculate([minor(199)], 3_333, minor(500));
    expect(single.allocations).toEqual([{
      lineId: "line-0",
      lineEligibleMinor: minor(199),
      lineDiscountMinor: single.actualDiscountMinor,
    }]);
    const multiple = calculate([minor(100), minor(200), minor(300)], 1_111, minor(500));
    expect(sumAllocations(multiple.allocations)).toBe(multiple.actualDiscountMinor);
    for (const line of multiple.allocations) {
      expect(line.lineDiscountMinor).toBeGreaterThanOrEqual(minor(0));
      expect(line.lineDiscountMinor).toBeLessThanOrEqual(line.lineEligibleMinor);
    }
  });

  it("uses largest remainder and stable identity tie-breaking", () => {
    const result = calculate([minor(1), minor(1), minor(1)], 10_000, minor(2));
    expect(result.allocations).toEqual([
      { lineId: "line-0", lineEligibleMinor: minor(1), lineDiscountMinor: minor(1) },
      { lineId: "line-1", lineEligibleMinor: minor(1), lineDiscountMinor: minor(1) },
      { lineId: "line-2", lineEligibleMinor: minor(1), lineDiscountMinor: minor(0) },
    ]);
  });

  it("is invariant to input ordering by line identity", () => {
    const input = [
      { lineId: "c", eligibleMinor: minor(7) },
      { lineId: "a", eligibleMinor: minor(11) },
      { lineId: "b", eligibleMinor: minor(13) },
    ];
    const first = calculatePercentageDiscount({
      currency: "USD",
      lines: input,
      rateBps: 3_333,
      maximumDiscountMinor: minor(999),
    });
    const second = calculatePercentageDiscount({
      currency: "USD",
      lines: [...input].reverse(),
      rateBps: 3_333,
      maximumDiscountMinor: minor(999),
    });
    expect(second.allocations).toEqual(first.allocations);
  });

  it("keeps precision for huge BigInt inputs", () => {
    const huge = minor("900719925474099312345678901234567890");
    const result = calculate([huge], 1_234, huge);
    expect(result.rawDiscountMinor).toBe(huge * minor(1_234) / minor(10_000));
    expect(result.allocations[0]?.lineDiscountMinor).toBe(result.actualDiscountMinor);
  });

  it.each([
    ["negative line", () => calculate([minor(-1)], 100, minor(10))],
    ["invalid rate zero", () => calculate([minor(1)], 0, minor(10))],
    ["invalid rate high", () => calculate([minor(1)], 10_001, minor(10))],
    ["non-positive cap", () => calculate([minor(1)], 100, minor(0))],
    ["negative minimum", () => calculate([minor(1)], 100, minor(10), minor(-1))],
    ["duplicate identity", () => calculatePercentageDiscount({
      currency: "USD",
      lines: [
        { lineId: "same", eligibleMinor: minor(1) },
        { lineId: "same", eligibleMinor: minor(1) },
      ],
      rateBps: 100,
      maximumDiscountMinor: minor(10),
    })],
    ["floating amount", () => {
      Reflect.apply(calculatePercentageDiscount, undefined, [{
        currency: "USD",
        lines: [{ lineId: "float", eligibleMinor: 1.5 }],
        rateBps: 100,
        maximumDiscountMinor: minor(10),
      }]);
    }],
  ])("rejects %s", (_name, run) => {
    expect(run).toThrow();
  });
});

function calculate(
  amounts: readonly bigint[],
  rateBps: number,
  maximumDiscountMinor: bigint,
  minimumEligibleSubtotalMinor?: bigint,
) {
  return calculatePercentageDiscount({
    currency: "USD",
    lines: amounts.map((eligibleMinor, index) => ({ lineId: `line-${index}`, eligibleMinor })),
    rateBps,
    maximumDiscountMinor,
    minimumEligibleSubtotalMinor,
  });
}

function sumAllocations(
  allocations: readonly { readonly lineDiscountMinor: bigint }[],
): bigint {
  return allocations.reduce((sum, line) => sum + line.lineDiscountMinor, minor(0));
}
