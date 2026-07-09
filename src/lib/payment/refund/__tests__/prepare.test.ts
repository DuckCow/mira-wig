import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { RefundAmountStateInput } from "../invariants";
import {
  prepareRefundAttempt,
  type PrepareRefundAttemptInput,
} from "../prepare";

const NOW = new Date("2026-07-10T03:00:00.000Z");

describe("prepareRefundAttempt", () => {
  it("prepares the complete REQUESTED payload without outcome fields", () => {
    const result = prepareRefundAttempt(input());

    expect(result).toEqual({
      ok: true,
      refundAttempt: {
        id: "refund_456",
        orderId: "order_123",
        paymentId: "payment_123",
        amount: 400,
        currency: "KRW",
        status: RefundAttemptStatus.REQUESTED,
        reason: "Customer service approved cancellation",
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "admin_123",
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        providerRefundId: null,
        idempotencyKey: "refund:payment_123:refund_456",
        requestedAt: NOW,
        processedAt: null,
        failedAt: null,
        failureCode: null,
        safeFailureMessage: null,
      },
      remainingRequestableAmount: 1_000,
    });
  });

  it("trims ids, reason, and actor user id", () => {
    const result = prepareRefundAttempt(input({
      refundAttemptId: " refund_456 ",
      orderId: " order_123 ",
      paymentId: " payment_123 ",
      reason: " Approved cancellation ",
      actorUserId: " admin_123 ",
    }));

    expect(success(result).refundAttempt).toMatchObject({
      id: "refund_456",
      orderId: "order_123",
      paymentId: "payment_123",
      reason: "Approved cancellation",
      actorUserId: "admin_123",
      idempotencyKey: "refund:payment_123:refund_456",
    });
  });

  it("uses the injected timestamp without reading current time", () => {
    const result = prepareRefundAttempt(input());
    expect(success(result).refundAttempt.requestedAt).toBe(NOW);
  });

  it("normalizes omitted SYSTEM actor user id to null", () => {
    const result = prepareRefundAttempt(input({
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: undefined,
    }));
    expect(success(result).refundAttempt.actorUserId).toBeNull();
  });

  it.each(["", "   ", "\t"])("rejects blank actor user id %j", (actorUserId) => {
    expect(prepareRefundAttempt(input({ actorUserId }))).toMatchObject({
      ok: false,
      code: "INVALID_ACTOR_USER_ID",
    });
  });

  it("requires actor user id for ADMIN provenance", () => {
    expect(prepareRefundAttempt(input({ actorUserId: null }))).toMatchObject({
      ok: false,
      code: "INVALID_ACTOR_USER_ID",
    });
  });

  it.each([
    ["refundAttemptId", "", "INVALID_REFUND_ATTEMPT_ID"],
    ["orderId", "   ", "INVALID_ORDER_ID"],
    ["paymentId", "\t", "INVALID_PAYMENT_ID"],
    ["reason", " ", "INVALID_REASON"],
  ] as const)("rejects blank %s", (field, value, code) => {
    expect(prepareRefundAttempt(input({ [field]: value }))).toMatchObject({ ok: false, code });
  });

  it("propagates invalid requested amount", () => {
    expect(prepareRefundAttempt(input({ requestedAmount: 0 }))).toMatchObject({
      ok: false,
      code: "INVALID_REQUEST_AMOUNT",
    });
  });

  it("propagates requested currency mismatch", () => {
    expect(prepareRefundAttempt(input({ requestedCurrency: "USD" }))).toMatchObject({
      ok: false,
      code: "CURRENCY_MISMATCH",
    });
  });

  it("blocks over-refund reserved by succeeded attempts", () => {
    expect(prepareRefundAttempt(input({
      existingAttempts: [attempt(700, RefundAttemptStatus.SUCCEEDED)],
      requestedAmount: 400,
    }))).toMatchObject({ ok: false, code: "OVER_REFUND" });
  });

  it("blocks over-refund reserved by guarded attempts", () => {
    expect(prepareRefundAttempt(input({
      existingAttempts: [attempt(700, RefundAttemptStatus.PROCESSING)],
      requestedAmount: 400,
    }))).toMatchObject({ ok: false, code: "OVER_REFUND" });
  });

  it("keeps FAILED_RETRYABLE amount reserved", () => {
    expect(prepareRefundAttempt(input({
      existingAttempts: [attempt(900, RefundAttemptStatus.FAILED_RETRYABLE)],
      requestedAmount: 101,
    }))).toMatchObject({ ok: false, code: "OVER_REFUND" });
  });

  it("does not reserve FAILED_TERMINAL amount", () => {
    const result = prepareRefundAttempt(input({
      existingAttempts: [attempt(1_000, RefundAttemptStatus.FAILED_TERMINAL)],
      requestedAmount: 1_000,
    }));
    expect(success(result).remainingRequestableAmount).toBe(1_000);
  });

  it("rejects an invalid injected timestamp", () => {
    expect(prepareRefundAttempt(input({ now: new Date(Number.NaN) }))).toMatchObject({
      ok: false,
      code: "INVALID_REQUESTED_AT",
    });
  });
});

function input(overrides: Partial<PrepareRefundAttemptInput> = {}): PrepareRefundAttemptInput {
  return {
    refundAttemptId: "refund_456",
    orderId: "order_123",
    paymentId: "payment_123",
    orderAmount: 1_000,
    currency: "KRW",
    requestedAmount: 400,
    requestedCurrency: "KRW",
    existingAttempts: [],
    reason: "Customer service approved cancellation",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    now: NOW,
    ...overrides,
  };
}

function attempt(amount: number, status: RefundAttemptStatus): RefundAmountStateInput {
  return { amount, currency: "KRW", status };
}

function success(result: ReturnType<typeof prepareRefundAttempt>) {
  if (!result.ok) throw new Error(`Expected successful preparation, received ${result.code}.`);
  return result;
}
