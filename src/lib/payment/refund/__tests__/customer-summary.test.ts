import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  deriveCustomerRefundSummary,
  type CustomerRefundAttemptFact,
} from "../customer-summary";

describe("customer refund summary", () => {
  const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`);
  const order = { id: "order_1", currency: "KRW" };
  const payment = {
    id: "payment_1",
    amount: 10_000,
    currency: "KRW",
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
  };
  const attempt = (
    status: RefundAttemptStatus,
    overrides: Partial<CustomerRefundAttemptFact> = {},
  ): CustomerRefundAttemptFact => ({
    orderId: order.id,
    paymentId: payment.id,
    amount: 2_000,
    currency: payment.currency,
    provider: payment.provider,
    mode: payment.mode,
    status,
    processedAt: status === RefundAttemptStatus.SUCCEEDED ? at(20) : null,
    ...overrides,
  });
  const derive = (attempts: readonly CustomerRefundAttemptFact[]) => (
    deriveCustomerRefundSummary(order, payment, attempts)
  );

  it("classifies no refund and a coherent pending-only ledger", () => {
    expect(derive([])).toMatchObject({
      completion: "NONE", totalSucceededRefundAmount: 0, hasPendingRefund: false,
    });
    expect(derive([attempt(RefundAttemptStatus.MANUAL_REVIEW)]))
      .toMatchObject({ completion: "NONE", totalSucceededRefundAmount: 0, hasPendingRefund: true });
  });

  it("keeps a coherent PROCESSING attempt as pending", () => {
    expect(derive([attempt(RefundAttemptStatus.PROCESSING)])).toEqual({
      completion: "NONE",
      totalSucceededRefundAmount: 0,
      latestSucceededRefundAt: null,
      hasPendingRefund: true,
      invariantFailure: false,
    });
  });

  it("preserves coherent succeeded amount and timestamp semantics", () => {
    expect(derive([attempt(RefundAttemptStatus.SUCCEEDED, {
      amount: 3_000,
      processedAt: at(22),
    })])).toEqual({
      completion: "PARTIAL",
      totalSucceededRefundAmount: 3_000,
      latestSucceededRefundAt: at(22),
      hasPendingRefund: false,
      invariantFailure: false,
    });
  });

  it("aggregates multiple coherent attempts for the designated Payment", () => {
    const result = derive([
      attempt(RefundAttemptStatus.SUCCEEDED, { amount: 2_000, processedAt: at(20) }),
      attempt(RefundAttemptStatus.SUCCEEDED, { amount: 3_000, processedAt: at(22) }),
      attempt(RefundAttemptStatus.PROCESSING, { amount: 5_000 }),
      attempt(RefundAttemptStatus.FAILED_TERMINAL, { amount: 1_000 }),
    ]);
    expect(result).toEqual({
      completion: "PARTIAL",
      totalSucceededRefundAmount: 5_000,
      latestSucceededRefundAt: at(22),
      hasPendingRefund: true,
      invariantFailure: false,
    });
  });

  it("classifies a coherent full refund", () => {
    expect(derive([attempt(RefundAttemptStatus.SUCCEEDED, { amount: 10_000 })]))
      .toMatchObject({ completion: "FULL", totalSucceededRefundAmount: 10_000 });
  });

  it.each([
    ["foreign paymentId on SUCCEEDED", RefundAttemptStatus.SUCCEEDED, { paymentId: "payment_foreign" }],
    ["foreign paymentId on PROCESSING", RefundAttemptStatus.PROCESSING, { paymentId: "payment_foreign" }],
    ["foreign orderId", RefundAttemptStatus.PROCESSING, { orderId: "order_foreign" }],
    ["wrong currency on PROCESSING", RefundAttemptStatus.PROCESSING, { currency: "USD" }],
    ["wrong provider on PROCESSING", RefundAttemptStatus.PROCESSING, { provider: PaymentProvider.TOSS }],
    ["wrong mode on PROCESSING", RefundAttemptStatus.PROCESSING, { mode: PaymentMode.LIVE }],
    ["unsafe amount on PROCESSING", RefundAttemptStatus.PROCESSING, { amount: Number.MAX_SAFE_INTEGER + 1 }],
    ["zero amount on PROCESSING", RefundAttemptStatus.PROCESSING, { amount: 0 }],
  ] as const)("fails closed for %s", (_label, status, overrides) => {
    expect(derive([attempt(status, overrides)])).toMatchObject({
      invariantFailure: true,
      totalSucceededRefundAmount: null,
      latestSucceededRefundAt: null,
    });
  });

  it.each([
    ["aggregate above paid", [attempt(RefundAttemptStatus.SUCCEEDED, { amount: 7_000 }), attempt(RefundAttemptStatus.SUCCEEDED, { amount: 4_000 })]],
    ["missing success timestamp", [attempt(RefundAttemptStatus.SUCCEEDED, { amount: 1_000, processedAt: null })]],
  ])("fails closed for %s", (_label, attempts) => {
    expect(derive(attempts)).toMatchObject({
      invariantFailure: true,
      totalSucceededRefundAmount: null,
      latestSucceededRefundAt: null,
    });
  });

  it("fails closed when designated Payment and Order currency identity diverge", () => {
    expect(deriveCustomerRefundSummary(
      { ...order, currency: "USD" },
      payment,
      [],
    )).toMatchObject({ invariantFailure: true });
  });
});
