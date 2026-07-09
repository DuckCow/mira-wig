import { RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildRefundAttemptIdempotencyKey,
  isGuardedRefundAttemptStatus,
  isSucceededRefundAttemptStatus,
  isTerminalRefundAttemptStatus,
  remainingRefundableAmount,
  remainingRequestableRefundAmount,
  sumGuardedRefundAmount,
  sumSucceededRefundAmount,
  validateRefundRequest,
  type RefundAmountStateInput,
  type ValidateRefundRequestInput,
} from "../invariants";

const ALL_STATUSES = Object.values(RefundAttemptStatus);

describe("refund attempt status classification", () => {
  it.each(ALL_STATUSES)("classifies succeeded money movement for %s", (status) => {
    expect(isSucceededRefundAttemptStatus(status)).toBe(status === RefundAttemptStatus.SUCCEEDED);
  });

  it.each([
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.REQUESTED,
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.MANUAL_REVIEW,
    RefundAttemptStatus.FAILED_RETRYABLE,
  ])("guards reserved money for %s", (status) => {
    expect(isGuardedRefundAttemptStatus(status)).toBe(true);
  });

  it.each([
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ])("classifies lifecycle terminal status %s", (status) => {
    expect(isTerminalRefundAttemptStatus(status)).toBe(true);
  });

  it.each([
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ])("does not guard terminal status %s without succeeded money", (status) => {
    expect(isGuardedRefundAttemptStatus(status)).toBe(false);
    expect(isSucceededRefundAttemptStatus(status)).toBe(false);
  });

  it("keeps FAILED_RETRYABLE guarded until explicitly closed", () => {
    expect(isGuardedRefundAttemptStatus(RefundAttemptStatus.FAILED_RETRYABLE)).toBe(true);
    expect(isTerminalRefundAttemptStatus(RefundAttemptStatus.FAILED_RETRYABLE)).toBe(false);
  });

  it("keeps SUCCEEDED terminal, guarded, and counted as succeeded money", () => {
    expect(isTerminalRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
    expect(isGuardedRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
    expect(isSucceededRefundAttemptStatus(RefundAttemptStatus.SUCCEEDED)).toBe(true);
    expect(sumSucceededRefundAmount([attempt(200, RefundAttemptStatus.SUCCEEDED)])).toBe(200);
  });
});

describe("refund amount calculations", () => {
  const attempts = [
    attempt(200, RefundAttemptStatus.SUCCEEDED),
    attempt(100, RefundAttemptStatus.REQUESTED),
    attempt(50, RefundAttemptStatus.FAILED_RETRYABLE),
    attempt(900, RefundAttemptStatus.FAILED_TERMINAL),
    attempt(900, RefundAttemptStatus.CANCELLED),
  ];

  it("sums only succeeded refund amounts", () => {
    expect(sumSucceededRefundAmount(attempts)).toBe(200);
  });

  it("sums succeeded and in-flight guarded refund amounts", () => {
    expect(sumGuardedRefundAmount(attempts)).toBe(350);
  });

  it("calculates display remaining from succeeded amounts only", () => {
    expect(remainingRefundableAmount(1_000, attempts)).toBe(800);
  });

  it("calculates requestable remaining from all guarded amounts", () => {
    expect(remainingRequestableRefundAmount(1_000, attempts)).toBe(650);
  });

  it("uses stored minor units without currency conversion", () => {
    const jpyAttempts = [attempt(1_500, RefundAttemptStatus.SUCCEEDED, "JPY")];
    expect(remainingRefundableAmount(5_000, jpyAttempts)).toBe(3_500);
  });

  it("rejects invalid included amounts and unsafe sums", () => {
    expect(() => sumSucceededRefundAmount([attempt(0, RefundAttemptStatus.SUCCEEDED)]))
      .toThrow("positive safe integer");
    expect(() => sumSucceededRefundAmount([
      attempt(Number.MAX_SAFE_INTEGER, RefundAttemptStatus.SUCCEEDED),
      attempt(1, RefundAttemptStatus.SUCCEEDED),
    ])).toThrow("safe integer");
  });
});

describe("refund request validation", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    "rejects invalid requested amount %s",
    (requestedAmount) => {
      expect(validateRefundRequest(request({ requestedAmount }))).toMatchObject({
        ok: false,
        code: "INVALID_REQUEST_AMOUNT",
      });
    },
  );

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid total amount %s", (totalAmount) => {
    expect(validateRefundRequest(request({ totalAmount }))).toMatchObject({
      ok: false,
      code: "INVALID_TOTAL_AMOUNT",
    });
  });

  it("rejects requested currency mismatch", () => {
    expect(validateRefundRequest(request({ requestedCurrency: "USD" }))).toMatchObject({
      ok: false,
      code: "CURRENCY_MISMATCH",
    });
  });

  it("rejects an existing attempt currency mismatch", () => {
    expect(validateRefundRequest(request({
      attempts: [attempt(100, RefundAttemptStatus.SUCCEEDED, "USD")],
    }))).toMatchObject({
      ok: false,
      code: "EXISTING_ATTEMPT_CURRENCY_MISMATCH",
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid existing attempt amount %s",
    (amount) => {
      expect(validateRefundRequest(request({
        attempts: [attempt(amount, RefundAttemptStatus.SUCCEEDED)],
      }))).toMatchObject({
        ok: false,
        code: "INVALID_EXISTING_ATTEMPT_AMOUNT",
      });
    },
  );

  it("blocks over-refund when succeeded amount reaches total", () => {
    expect(validateRefundRequest(request({
      attempts: [attempt(1_000, RefundAttemptStatus.SUCCEEDED)],
    }))).toMatchObject({ ok: false, code: "OVER_REFUND" });
  });

  it("blocks over-refund when guarded amount reaches total", () => {
    expect(validateRefundRequest(request({
      attempts: [
        attempt(700, RefundAttemptStatus.PROCESSING),
        attempt(300, RefundAttemptStatus.FAILED_RETRYABLE),
      ],
    }))).toMatchObject({ ok: false, code: "OVER_REFUND" });
  });

  it("returns the available amount before the accepted request is reserved", () => {
    expect(validateRefundRequest(request({
      requestedAmount: 600,
      attempts: [
        attempt(200, RefundAttemptStatus.SUCCEEDED),
        attempt(100, RefundAttemptStatus.REQUESTED),
      ],
    }))).toEqual({ ok: true, remainingRequestableAmount: 700 });
  });

  it("does not reserve failed-terminal or cancelled attempts", () => {
    expect(validateRefundRequest(request({
      requestedAmount: 1_000,
      attempts: [
        attempt(1_000, RefundAttemptStatus.FAILED_TERMINAL),
        attempt(1_000, RefundAttemptStatus.CANCELLED),
      ],
    }))).toEqual({ ok: true, remainingRequestableAmount: 1_000 });
  });
});

describe("refund attempt idempotency key", () => {
  it("uses the exact locked payment and attempt identity format", () => {
    expect(buildRefundAttemptIdempotencyKey("payment_123", "refund_456"))
      .toBe("refund:payment_123:refund_456");
  });

  it("normalizes surrounding whitespace without generating identity", () => {
    expect(buildRefundAttemptIdempotencyKey(" payment_123 ", " refund_456 "))
      .toBe("refund:payment_123:refund_456");
  });

  it.each([
    ["", "refund_456"],
    ["   ", "refund_456"],
    ["payment_123", ""],
    ["payment_123", "\t"],
  ])("rejects blank stable ids", (paymentId, refundAttemptId) => {
    expect(() => buildRefundAttemptIdempotencyKey(paymentId, refundAttemptId)).toThrow();
  });
});

function attempt(
  amount: number,
  status: RefundAttemptStatus,
  currency = "KRW",
): RefundAmountStateInput {
  return { amount, currency, status };
}

function request(overrides: Partial<ValidateRefundRequestInput> = {}): ValidateRefundRequestInput {
  return {
    totalAmount: 1_000,
    currency: "KRW",
    requestedAmount: 100,
    requestedCurrency: "KRW",
    attempts: [],
    ...overrides,
  };
}
