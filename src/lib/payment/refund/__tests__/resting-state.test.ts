import { OrderStatus, RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { deriveRefundRestingOrderStatus } from "../resting-state";

describe("deriveRefundRestingOrderStatus", () => {
  it("returns PAID when no refund has succeeded", () => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: [attempt(400, RefundAttemptStatus.CANCELLED)],
    })).toEqual({ ok: true, orderStatus: OrderStatus.PAID, succeededAmount: 0 });
  });

  it("returns PARTIALLY_REFUNDED for a positive succeeded amount below total", () => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: [attempt(250, RefundAttemptStatus.SUCCEEDED)],
    })).toEqual({
      ok: true,
      orderStatus: OrderStatus.PARTIALLY_REFUNDED,
      succeededAmount: 250,
    });
  });

  it("does not count non-SUCCEEDED attempts", () => {
    const result = deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: [
        attempt(200, RefundAttemptStatus.SUCCEEDED),
        attempt(700, RefundAttemptStatus.REQUESTED),
        attempt(100, RefundAttemptStatus.FAILED_TERMINAL),
      ],
    });

    expect(result).toEqual({
      ok: true,
      orderStatus: OrderStatus.PARTIALLY_REFUNDED,
      succeededAmount: 200,
    });
  });

  it.each([
    { amounts: [400, 600], label: "equal" },
    { amounts: [700, 400], label: "over" },
  ])("rejects a succeeded sum $label to the total", ({ amounts }) => {
    const result = deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: amounts.map((amount) => attempt(amount, RefundAttemptStatus.SUCCEEDED)),
    });

    expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid total %s", (totalAmount) => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount,
      currency: "KRW",
      attempts: [],
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid attempt amount %s", (amount) => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: [attempt(amount, RefundAttemptStatus.CANCELLED)],
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it("rejects mixed currencies", () => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount: 1_000,
      currency: "KRW",
      attempts: [{ ...attempt(100, RefundAttemptStatus.SUCCEEDED), currency: "USD" }],
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it("rejects safe-integer overflow while summing succeeded attempts", () => {
    expect(deriveRefundRestingOrderStatus({
      totalAmount: Number.MAX_SAFE_INTEGER,
      currency: "KRW",
      attempts: [
        attempt(Number.MAX_SAFE_INTEGER - 1, RefundAttemptStatus.SUCCEEDED),
        attempt(2, RefundAttemptStatus.SUCCEEDED),
      ],
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it("does not mutate its input", () => {
    const attempts = [attempt(200, RefundAttemptStatus.SUCCEEDED)];
    const input = { totalAmount: 1_000, currency: "KRW", attempts };
    const before = structuredClone(input);

    deriveRefundRestingOrderStatus(input);

    expect(input).toEqual(before);
  });
});

function attempt(amount: number, status: RefundAttemptStatus) {
  return { amount, currency: "KRW", status };
}
