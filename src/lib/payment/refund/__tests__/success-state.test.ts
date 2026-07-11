import { OrderStatus, RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { deriveOrderStatusAfterSucceededRefund } from "../success-state";

describe("deriveOrderStatusAfterSucceededRefund", () => {
  it("derives partial and full verified success", () => {
    expect(derive(1_000, [attempt("prior", 300, RefundAttemptStatus.SUCCEEDED), attempt("target", 200)]))
      .toEqual({ ok: true, orderStatus: OrderStatus.PARTIALLY_REFUNDED, succeededAmount: 500 });
    expect(derive(1_000, [attempt("prior", 300, RefundAttemptStatus.SUCCEEDED), attempt("target", 700)]))
      .toEqual({ ok: true, orderStatus: OrderStatus.REFUNDED, succeededAmount: 1_000 });
  });

  it.each([
    { label: "zero target", total: 1_000, attempts: [attempt("target", 0)] },
    { label: "over total", total: 1_000, attempts: [attempt("target", 1_001)] },
    { label: "mixed currency", total: 1_000, attempts: [attempt("target", 500, RefundAttemptStatus.PROCESSING, "USD")] },
    { label: "unsafe sum", total: Number.MAX_SAFE_INTEGER, attempts: [
      attempt("prior", Number.MAX_SAFE_INTEGER, RefundAttemptStatus.SUCCEEDED),
      attempt("target", 1),
    ] },
    { label: "missing target", total: 1_000, attempts: [attempt("other", 500)] },
  ])("fails closed for $label", ({ total, attempts }) => {
    expect(derive(total, attempts)).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });
});

function derive(capturedAmount: number, attempts: ReturnType<typeof attempt>[]) {
  return deriveOrderStatusAfterSucceededRefund({
    capturedAmount,
    currency: "KRW",
    succeedingAttemptId: "target",
    attempts,
  });
}

function attempt(
  id: string,
  amount: number,
  status: RefundAttemptStatus = RefundAttemptStatus.PROCESSING,
  currency = "KRW",
) {
  return { id, amount, status, currency };
}
