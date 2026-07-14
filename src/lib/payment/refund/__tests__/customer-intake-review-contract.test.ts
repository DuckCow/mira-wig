import {
  CustomerRefundIntakeStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  approveCustomerIntakeReviewSuccess,
  normalizeApproveCustomerRefundIntakeInput,
  normalizeRejectCustomerRefundIntakeInput,
  rejectCustomerIntakeReviewSuccess,
  type ApproveCustomerRefundIntakeInput,
  type RejectCustomerRefundIntakeInput,
} from "../customer-intake-review-contract";

const NOW = new Date("2026-07-15T02:00:00.000Z");

describe("customer intake administrator review contract", () => {
  it.each([
    ["orderId", 7, "INVALID_ORDER_ID"],
    ["orderId", "   ", "INVALID_ORDER_ID"],
    ["intakeId", null, "INVALID_INTAKE_ID"],
    ["intakeId", "\n", "INVALID_INTAKE_ID"],
    ["reviewedByUserId", {}, "INVALID_REVIEWER_ID"],
    ["reviewedByUserId", "\t", "INVALID_REVIEWER_ID"],
  ] as const)("reject validates runtime %s=%j", (field, value, code) => {
    expect(normalizeRejectCustomerRefundIntakeInput(rejectWithRuntimeValue(field, value)))
      .toMatchObject({ ok: false, code });
  });

  it("trims identifiers and reviewer and clones the operation timestamp", () => {
    const now = new Date(NOW);
    const result = normalizeRejectCustomerRefundIntakeInput(rejectInput({
      orderId: "  order_1 ",
      intakeId: " intake_1\n",
      reviewedByUserId: " admin_1 ",
      now,
    }));
    if (!result.ok) throw new Error(`Expected normalization success, received ${result.code}.`);

    now.setUTCFullYear(2035);
    expect(result.input).toMatchObject({
      orderId: "order_1",
      intakeId: "intake_1",
      reviewedByUserId: "admin_1",
      reviewedAt: NOW,
    });
    expect(result.input.reviewedAt).not.toBe(now);
  });

  it.each([new Date(Number.NaN), "2026-07-15"])("reject rejects invalid review time %j", (value) => {
    expect(normalizeRejectCustomerRefundIntakeInput(rejectWithRuntimeValue("now", value)))
      .toMatchObject({ ok: false, code: "INVALID_REVIEWED_AT" });
  });

  it.each([null, 7, {}])("requires rejection rationale text: %j", (value) => {
    expect(normalizeRejectCustomerRefundIntakeInput(rejectWithRuntimeValue("adminRejectionReason", value)))
      .toMatchObject({ ok: false, code: "INVALID_REJECTION_REASON_TYPE" });
  });

  it.each(["", "   ", "\n\t"])("rejects blank rejection rationale %j", (adminRejectionReason) => {
    expect(normalizeRejectCustomerRefundIntakeInput(rejectInput({ adminRejectionReason })))
      .toMatchObject({ ok: false, code: "REJECTION_REASON_REQUIRED" });
  });

  it("trims only edges while preserving internal whitespace, CRLF, Cc, and Cf", () => {
    const rationale = "  first\r\nsecond\t\u0000\u200Bline  ";
    const result = normalizeRejectCustomerRefundIntakeInput(rejectInput({ adminRejectionReason: rationale }));

    expect(result).toMatchObject({
      ok: true,
      input: { adminRejectionReason: "first\r\nsecond\t\u0000\u200Bline" },
    });
  });

  it("accepts 500 astral code points without truncation and rejects 501", () => {
    const accepted = "😀".repeat(500);
    const rejected = "😀".repeat(501);

    expect(normalizeRejectCustomerRefundIntakeInput(rejectInput({ adminRejectionReason: accepted })))
      .toMatchObject({ ok: true, input: { adminRejectionReason: accepted } });
    expect(normalizeRejectCustomerRefundIntakeInput(rejectInput({ adminRejectionReason: rejected })))
      .toMatchObject({ ok: false, code: "REJECTION_REASON_TOO_LONG" });
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5, Number.NaN])("rejects approval amount %j", (amount) => {
    expect(normalizeApproveCustomerRefundIntakeInput(approveInput({ amount })))
      .toMatchObject({ ok: false, code: "INVALID_REQUEST_AMOUNT" });
  });

  it.each([null, 7, {}, "", " \n "])("rejects invalid merchant rationale %j", (value) => {
    const result = typeof value === "string"
      ? normalizeApproveCustomerRefundIntakeInput(approveInput({ merchantRationale: value }))
      : normalizeApproveCustomerRefundIntakeInput(approveWithRuntimeValue("merchantRationale", value));
    expect(result).toMatchObject({ ok: false, code: "INVALID_REASON" });
  });

  it("uses the existing trimmed 500-code-point merchant-rationale semantics", () => {
    const accepted = "🧠".repeat(500);
    const rejected = "🧠".repeat(501);
    const normalized = normalizeApproveCustomerRefundIntakeInput(approveInput({
      merchantRationale: `  ${accepted}\n`,
    }));

    expect(normalized).toMatchObject({ ok: true, input: { merchantRationale: accepted } });
    expect(normalizeApproveCustomerRefundIntakeInput(approveInput({ merchantRationale: rejected })))
      .toMatchObject({ ok: false, code: "REASON_TOO_LONG" });
  });

  it("builds narrow administrator-safe success projections", () => {
    const rejection = rejectCustomerIntakeReviewSuccess({
      id: "intake_1",
      orderId: "order_1",
      status: CustomerRefundIntakeStatus.REJECTED,
      reviewedAt: NOW,
      reviewedByUserId: "admin_1",
      adminRejectionReason: "Not approved",
    }, false);
    const approval = approveCustomerIntakeReviewSuccess({
      id: "intake_2",
      orderId: "order_2",
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: NOW,
      reviewedByUserId: "admin_2",
      approvedRefundAttemptId: "attempt_2",
    }, {
      id: "attempt_2",
      orderId: "order_2",
      status: RefundAttemptStatus.REQUESTED,
      amount: 500,
      currency: "KRW",
      requestedAt: NOW,
    }, false);

    expect(Object.keys(rejection.intake).sort()).toEqual([
      "adminRejectionReason",
      "id",
      "orderId",
      "reviewedAt",
      "reviewedByUserId",
      "status",
    ]);
    expect(Object.keys(approval.intake).sort()).toEqual([
      "approvedRefundAttemptId",
      "id",
      "orderId",
      "reviewedAt",
      "reviewedByUserId",
      "status",
    ]);
    expect(Object.keys(approval.attempt).sort()).toEqual([
      "amount",
      "currency",
      "id",
      "orderId",
      "requestedAt",
      "status",
    ]);
  });
});

function rejectInput(
  override: Partial<RejectCustomerRefundIntakeInput> = {},
): RejectCustomerRefundIntakeInput {
  return {
    orderId: "order_1",
    intakeId: "intake_1",
    reviewedByUserId: "admin_1",
    adminRejectionReason: "Administrator rejected the intake.",
    now: new Date(NOW),
    ...override,
  };
}

function approveInput(
  override: Partial<ApproveCustomerRefundIntakeInput> = {},
): ApproveCustomerRefundIntakeInput {
  return {
    orderId: "order_1",
    intakeId: "intake_1",
    reviewedByUserId: "admin_1",
    amount: 500,
    merchantRationale: "Administrator approved a refund request.",
    now: new Date(NOW),
    ...override,
  };
}

function rejectWithRuntimeValue(
  field: keyof RejectCustomerRefundIntakeInput,
  value: unknown,
): RejectCustomerRefundIntakeInput {
  const input = rejectInput();
  Object.defineProperty(input, field, { value });
  return input;
}

function approveWithRuntimeValue(
  field: keyof ApproveCustomerRefundIntakeInput,
  value: unknown,
): ApproveCustomerRefundIntakeInput {
  const input = approveInput();
  Object.defineProperty(input, field, { value });
  return input;
}
