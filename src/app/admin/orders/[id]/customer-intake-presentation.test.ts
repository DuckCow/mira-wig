import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  customerRefundIntakeReasonLabel,
  customerRefundIntakeStatusLabel,
  refundAttemptStatusLabel,
} from "@/app/admin/refunds/intake-labels";
import type { AdminCustomerRefundIntakeDetail } from "./admin-order-detail-data";
import {
  buildApproveCustomerRefundIntakePayload,
  buildCustomerRefundIntakeSectionViewModel,
  buildRejectCustomerRefundIntakePayload,
  canRenderCustomerRefundIntakeApproveControls,
  customerRefundIntakeApproveNotice,
  presentApproveCustomerRefundIntakeResult,
  presentRejectCustomerRefundIntakeResult,
  unexpectedReviewFailurePresentation,
} from "./customer-intake-presentation";

describe("customer refund intake labels and history presentation", () => {
  it("owns the exact operational status and reason labels", () => {
    expect(Object.values(CustomerRefundIntakeStatus).map(customerRefundIntakeStatusLabel)).toEqual([
      "접수됨",
      "승인됨",
      "거절됨",
      "철회됨",
    ]);
    expect(Object.values(CustomerRefundIntakeReasonCode).map(customerRefundIntakeReasonLabel)).toEqual([
      "단순 변심",
      "상품 하자",
      "배송 문제·지연",
      "기타",
    ]);
    expect(refundAttemptStatusLabel(RefundAttemptStatus.REQUESTED)).toBe("환불 요청됨");
  });

  it("finds the active target by status and preserves safe lifecycle history", () => {
    const approved = intake({
      id: "approved",
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: new Date("2026-07-15T01:00:00.000Z"),
      approvedRefundAttemptId: "attempt_1",
      approvedRefundAttempt: {
        id: "attempt_1",
        status: RefundAttemptStatus.REQUESTED,
        amount: 4000,
        currency: "KRW",
        requestedAt: new Date("2026-07-15T01:00:00.000Z"),
      },
    });
    const submitted = intake({ id: "submitted", ownershipConsistent: false });

    const result = buildCustomerRefundIntakeSectionViewModel([approved, submitted]);

    expect(result.activeIntake).toEqual({ intakeId: "submitted", ownershipConsistent: false });
    expect(result.rows[0]).toMatchObject({
      approvedRefundAttemptId: "attempt_1",
      approvedCopy: "승인됨 — 환불 요청이 생성되었습니다. 실제 환불 처리 여부는 환불 요청 내역에서 확인하세요.",
      approvedRefundAttempt: { statusLabel: "환불 요청됨", amount: "₩4,000" },
      missingApprovedAttemptWarning: null,
    });
    expect(result.rows[0]?.approvedCopy).not.toMatch(/완료|지급/);
    expect(result.rows[1]?.ownershipWarning).toContain("승인하지 말고");
  });

  it("warns when an approved Attempt cannot be resolved in the same Order", () => {
    const result = buildCustomerRefundIntakeSectionViewModel([intake({
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: new Date("2026-07-15T01:00:00.000Z"),
      approvedRefundAttemptId: "missing_attempt",
    })]);

    expect(result.rows[0]?.missingApprovedAttemptWarning).toContain("데이터 정합성 검토");
  });

  it("keeps terminal intake history free of mutation targets", () => {
    const result = buildCustomerRefundIntakeSectionViewModel([
      intake({ status: CustomerRefundIntakeStatus.WITHDRAWN, withdrawnAt: new Date() }),
      intake({ status: CustomerRefundIntakeStatus.REJECTED, reviewedAt: new Date() }),
      intake({ status: CustomerRefundIntakeStatus.APPROVED, reviewedAt: new Date() }),
    ]);

    expect(result.activeIntake).toBeNull();
    expect(result.rows).toHaveLength(3);
  });
});

describe("customer refund intake review controls presentation", () => {
  it("renders approval only for enabled, ownership-consistent targets", () => {
    expect(canRenderCustomerRefundIntakeApproveControls(true, "enabled")).toBe(true);
    expect(canRenderCustomerRefundIntakeApproveControls(true, "disabled")).toBe(false);
    expect(canRenderCustomerRefundIntakeApproveControls(true, "misconfigured")).toBe(false);
    expect(canRenderCustomerRefundIntakeApproveControls(false, "enabled")).toBe(false);
    expect(customerRefundIntakeApproveNotice(true, "misconfigured")).toContain("설정이 올바르지 않습니다");
    expect(customerRefundIntakeApproveNotice(false, "enabled")).toContain("거절로 종결");
    expect(customerRefundIntakeApproveNotice(true, "enabled")).toBeNull();
  });

  it("builds exact browser payloads without actor, currency, provider, Payment, or operation keys", () => {
    const reject = buildRejectCustomerRefundIntakePayload("order_1", "intake_1", "reason");
    const approve = buildApproveCustomerRefundIntakePayload("order_1", "intake_1", "4000", "rationale");

    expect(reject).toEqual({ orderId: "order_1", intakeId: "intake_1", adminRejectionReason: "reason" });
    expect(approve).toEqual({ orderId: "order_1", intakeId: "intake_1", amountMinor: "4000", merchantRationale: "rationale" });
    expect(Object.keys(reject).sort()).toEqual(["adminRejectionReason", "intakeId", "orderId"]);
    expect(Object.keys(approve).sort()).toEqual(["amountMinor", "intakeId", "merchantRationale", "orderId"]);
  });

  it.each([
    ["INVALID_INPUT", "rejectionReason", false],
    ["REJECTION_REASON_REQUIRED", "rejectionReason", false],
    ["REJECTION_REASON_TOO_LONG", "rejectionReason", false],
    ["ORDER_NOT_FOUND", null, true],
    ["INTAKE_NOT_FOUND", null, true],
    ["NOT_REJECTABLE", null, true],
    ["UNAUTHENTICATED", null, false],
    ["FORBIDDEN", null, false],
  ] as const)("maps reject failure %s", (errorCode, field, refresh) => {
    expect(presentRejectCustomerRefundIntakeResult({ success: false, errorCode })).toMatchObject({
      field,
      clearInputs: false,
      refresh,
    });
  });

  it.each([
    ["INVALID_INPUT", null, false],
    ["INVALID_AMOUNT", "amount", false],
    ["REASON_REQUIRED", "merchantRationale", false],
    ["REASON_TOO_LONG", "merchantRationale", false],
    ["FEATURE_DISABLED", null, true],
    ["ORDER_NOT_FOUND", null, true],
    ["INTAKE_NOT_FOUND", null, true],
    ["INTAKE_INCONSISTENT", null, true],
    ["NOT_APPROVABLE", null, true],
    ["INSUFFICIENT_REFUNDABLE", null, true],
    ["REFUND_IN_PROGRESS", null, true],
    ["INVALID_TRANSITION", null, true],
    ["MANUAL_REVIEW_REQUIRED", null, true],
    ["UNAUTHENTICATED", null, false],
    ["FORBIDDEN", null, false],
  ] as const)("maps approve failure %s", (errorCode, field, refresh) => {
    expect(presentApproveCustomerRefundIntakeResult({ success: false, errorCode })).toMatchObject({
      field,
      clearInputs: false,
      refresh,
    });
  });

  it("clears successful results without a client refresh and safely labels replay", () => {
    expect(presentRejectCustomerRefundIntakeResult({
      success: true,
      outcome: "REJECTED",
      intake: {
        id: "intake_1",
        orderId: "order_1",
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: "2026-07-15T01:00:00.000Z",
        adminRejectionReason: "reason",
      },
    })).toMatchObject({ clearInputs: true, refresh: false, message: "요청을 거절했습니다." });
    expect(presentApproveCustomerRefundIntakeResult(approvedResult("ALREADY_APPROVED"))).toMatchObject({
      clearInputs: true,
      refresh: false,
      message: "이미 승인된 요청입니다. 연결된 환불 요청 상태: 환불 요청됨",
    });
    expect(unexpectedReviewFailurePresentation()).toMatchObject({
      clearInputs: false,
      refresh: true,
    });
  });
});

function intake(
  overrides: Partial<AdminCustomerRefundIntakeDetail> = {},
): AdminCustomerRefundIntakeDetail {
  return {
    id: "intake_1",
    status: CustomerRefundIntakeStatus.SUBMITTED,
    reasonCode: CustomerRefundIntakeReasonCode.OTHER,
    reasonDetail: "customer detail",
    submittedAt: new Date("2026-07-15T00:00:00.000Z"),
    withdrawnAt: null,
    reviewedAt: null,
    adminRejectionReason: null,
    approvedRefundAttemptId: null,
    ownershipConsistent: true,
    approvedRefundAttempt: null,
    ...overrides,
  };
}

function approvedResult(outcome: "APPROVED" | "ALREADY_APPROVED") {
  return {
    success: true,
    outcome,
    intake: {
      id: "intake_1",
      orderId: "order_1",
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: "2026-07-15T01:00:00.000Z",
      approvedRefundAttemptId: "attempt_1",
    },
    attempt: {
      id: "attempt_1",
      orderId: "order_1",
      status: RefundAttemptStatus.REQUESTED,
      amount: 4000,
      currency: "KRW",
      requestedAt: "2026-07-15T01:00:00.000Z",
    },
  } as const;
}
