import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { deriveCancellationObligation } from "../obligation";

const order = { id: "order_1", currency: "KRW" };
const payment = {
  id: "payment_1",
  amount: 10_000,
  currency: "KRW",
  provider: PaymentProvider.MOCK,
  mode: PaymentMode.SANDBOX,
};
const PROCESSED_AT = new Date("2026-08-28T00:00:00.000Z");

describe("strict cancellation refund obligation", () => {
  it("returns the exact outstanding difference", () => {
    expect(deriveCancellationObligation(order, payment, [succeeded(2_500)])).toEqual({
      state: "OUTSTANDING",
      succeededAmount: 2_500,
      outstandingAmount: 7_500,
    });
  });

  it("classifies multiple exact succeeded amounts as satisfied", () => {
    expect(deriveCancellationObligation(order, payment, [succeeded(4_000), succeeded(6_000)])).toEqual({
      state: "SATISFIED",
      succeededAmount: 10_000,
      outstandingAmount: 0,
    });
  });

  it("classifies an over-refund as inconsistent instead of satisfied", () => {
    expect(deriveCancellationObligation(order, payment, [succeeded(6_000), succeeded(5_000)]))
      .toEqual(inconsistent());
  });

  it.each([
    ["unsafe payment", { ...payment, amount: Number.MAX_SAFE_INTEGER + 1 }, [succeeded(1)]],
    ["invalid attempt", payment, [succeeded(0)]],
    ["attempt above captured amount", payment, [succeeded(10_001)]],
    ["currency mismatch", payment, [{ ...succeeded(1_000), currency: "USD" }]],
    ["payment identity mismatch", payment, [{ ...succeeded(1_000), paymentId: "payment_other" }]],
    ["order identity mismatch", payment, [{ ...succeeded(1_000), orderId: "order_other" }]],
    ["missing succeeded timestamp", payment, [{ ...succeeded(1_000), processedAt: null }]],
  ] as const)("classifies %s as inconsistent", (_label, paymentFact, attempts) => {
    expect(deriveCancellationObligation(order, paymentFact, attempts)).toEqual(inconsistent());
  });

  it("detects succeeded-sum overflow", () => {
    const maximumPayment = { ...payment, amount: Number.MAX_SAFE_INTEGER };
    expect(deriveCancellationObligation(order, maximumPayment, [
      succeeded(Number.MAX_SAFE_INTEGER),
      succeeded(1),
    ])).toEqual(inconsistent());
  });
});

function succeeded(amount: number) {
  return {
    orderId: order.id,
    paymentId: payment.id,
    amount,
    currency: payment.currency,
    provider: payment.provider,
    mode: payment.mode,
    status: RefundAttemptStatus.SUCCEEDED,
    processedAt: PROCESSED_AT,
  };
}

function inconsistent() {
  return { state: "INCONSISTENT", succeededAmount: null, outstandingAmount: null };
}
