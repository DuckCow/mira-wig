import type {
  ApproveCustomerRefundIntakeActionResult,
  RejectCustomerRefundIntakeActionResult,
} from "@/app/actions/admin/customer-refund-intake";
import {
  customerRefundIntakeReasonLabel,
  customerRefundIntakeStatusLabel,
  refundAttemptStatusLabel,
} from "@/app/admin/refunds/intake-labels";
import { getAdminCustomerRefundIntakeErrorMessage } from "@/lib/admin-messages";
import { formatPersistedMoney } from "@/lib/market/persisted-money";
import type { AdminCustomerRefundIntakeDetail } from "./admin-order-detail-data";
import type { RefundLineInput } from "@/lib/payment/refund/lines";

export type CustomerRefundIntakeApproveState = "enabled" | "disabled" | "misconfigured";

export interface CustomerRefundIntakeSectionViewModel {
  activeIntake: null | {
    intakeId: string;
    ownershipConsistent: boolean;
  };
  rows: readonly CustomerRefundIntakeHistoryRowViewModel[];
}

interface CustomerRefundIntakeHistoryRowViewModel {
  renderKey: string;
  statusLabel: string;
  reasonLabel: string;
  reasonDetail: string | null;
  submittedAt: string;
  withdrawnAt: string | null;
  reviewedAt: string | null;
  adminRejectionReason: string | null;
  approvedRefundAttemptId: string | null;
  approvedCopy: string | null;
  approvedRefundAttempt: null | {
    statusLabel: string;
    amount: string;
    requestedAt: string;
  };
  missingApprovedAttemptWarning: string | null;
  ownershipWarning: string | null;
}

export type ReviewResultField = "rejectionReason" | "amount" | "merchantRationale" | "lines" | null;

export interface ReviewResultPresentation {
  message: string;
  variant: "success" | "error" | "warning";
  field: ReviewResultField;
  clearInputs: boolean;
  refresh: boolean;
}

export function canRenderCustomerRefundIntakeApproveControls(
  ownershipConsistent: boolean,
  approveState: CustomerRefundIntakeApproveState,
): boolean {
  return ownershipConsistent && approveState === "enabled";
}

export function customerRefundIntakeApproveNotice(
  ownershipConsistent: boolean,
  approveState: CustomerRefundIntakeApproveState,
): string | null {
  if (!ownershipConsistent) {
    return "소유권 변경 이력이 있는 요청은 승인할 수 없습니다. 검토 후 거절로 종결해 주세요.";
  }
  if (approveState === "disabled") return "환불 승인 기능이 현재 비활성화되어 있습니다.";
  if (approveState === "misconfigured") {
    return "환불 승인 활성화 설정이 올바르지 않습니다. 설정을 확인할 때까지 승인 기능을 사용할 수 없습니다.";
  }
  return null;
}

const REJECT_REFRESH_CODES = new Set([
  "ORDER_NOT_FOUND",
  "INTAKE_NOT_FOUND",
  "NOT_REJECTABLE",
]);

const APPROVE_REFRESH_CODES = new Set([
  "FEATURE_DISABLED",
  "ORDER_NOT_FOUND",
  "INTAKE_NOT_FOUND",
  "INTAKE_INCONSISTENT",
  "NOT_APPROVABLE",
  "INSUFFICIENT_REFUNDABLE",
  "REFUND_IN_PROGRESS",
  "INVALID_TRANSITION",
  "MANUAL_REVIEW_REQUIRED",
]);

export function buildCustomerRefundIntakeSectionViewModel(
  intakes: readonly AdminCustomerRefundIntakeDetail[],
): CustomerRefundIntakeSectionViewModel {
  const active = intakes.find((intake) => intake.status === "SUBMITTED") ?? null;
  return {
    activeIntake: active
      ? { intakeId: active.id, ownershipConsistent: active.ownershipConsistent }
      : null,
    rows: intakes.map((intake) => ({
      renderKey: intake.id,
      statusLabel: customerRefundIntakeStatusLabel(intake.status),
      reasonLabel: customerRefundIntakeReasonLabel(intake.reasonCode),
      reasonDetail: intake.reasonDetail,
      submittedAt: formatDateTime(intake.submittedAt),
      withdrawnAt: intake.withdrawnAt ? formatDateTime(intake.withdrawnAt) : null,
      reviewedAt: intake.reviewedAt ? formatDateTime(intake.reviewedAt) : null,
      adminRejectionReason: intake.adminRejectionReason,
      approvedRefundAttemptId: intake.approvedRefundAttemptId,
      approvedCopy: intake.status === "APPROVED"
        ? "승인됨 — 환불 요청이 생성되었습니다. 실제 환불 처리 여부는 환불 요청 내역에서 확인하세요."
        : null,
      approvedRefundAttempt: intake.approvedRefundAttempt
        ? {
            statusLabel: refundAttemptStatusLabel(intake.approvedRefundAttempt.status),
            amount: formatPersistedMoney(
              intake.approvedRefundAttempt.amount,
              intake.approvedRefundAttempt.currency,
            ),
            requestedAt: formatDateTime(intake.approvedRefundAttempt.requestedAt),
          }
        : null,
      missingApprovedAttemptWarning:
        intake.approvedRefundAttemptId && !intake.approvedRefundAttempt
          ? "연결된 환불 요청 정보를 이 주문에서 확인할 수 없습니다. 데이터 정합성 검토가 필요합니다."
          : null,
      ownershipWarning: intake.ownershipConsistent
        ? null
        : "소유권 변경 이력이 있는 요청입니다. 승인하지 말고 검토 후 거절로 종결해 주세요.",
    })),
  };
}

export function buildRejectCustomerRefundIntakePayload(
  orderId: string,
  intakeId: string,
  adminRejectionReason: string,
) {
  return { orderId, intakeId, adminRejectionReason };
}

export function buildApproveCustomerRefundIntakePayload(
  orderId: string,
  intakeId: string,
  amountMinor: string,
  merchantRationale: string,
  lines: readonly RefundLineInput[],
) {
  return { orderId, intakeId, amountMinor, merchantRationale, lines };
}

export function presentRejectCustomerRefundIntakeResult(
  result: RejectCustomerRefundIntakeActionResult,
): ReviewResultPresentation {
  if (result.success) {
    return {
      message: result.outcome === "REJECTED"
        ? "요청을 거절했습니다."
        : "이미 거절 처리된 요청입니다.",
      variant: "success",
      field: null,
      clearInputs: true,
      refresh: false,
    };
  }
  const field = result.errorCode === "INVALID_INPUT"
    || result.errorCode === "REJECTION_REASON_REQUIRED"
    || result.errorCode === "REJECTION_REASON_TOO_LONG"
    ? "rejectionReason"
    : null;
  return {
    message: getAdminCustomerRefundIntakeErrorMessage(result.errorCode),
    variant: result.errorCode === "UNAUTHENTICATED" || result.errorCode === "FORBIDDEN"
      ? "warning"
      : "error",
    field,
    clearInputs: false,
    refresh: REJECT_REFRESH_CODES.has(result.errorCode),
  };
}

export function presentApproveCustomerRefundIntakeResult(
  result: ApproveCustomerRefundIntakeActionResult,
): ReviewResultPresentation {
  if (result.success) {
    const message = result.outcome === "APPROVED"
      ? "환불 요청을 생성했습니다. 실제 환불 처리는 별도로 진행됩니다."
      : `이미 승인된 요청입니다. 연결된 환불 요청 상태: ${refundAttemptStatusLabel(result.attempt.status)}`;
    return {
      message,
      variant: "success",
      field: null,
      clearInputs: true,
      refresh: false,
    };
  }
  let field: ReviewResultField = null;
  if (result.errorCode === "INVALID_AMOUNT") field = "amount";
  if (result.errorCode === "REASON_REQUIRED" || result.errorCode === "REASON_TOO_LONG") {
    field = "merchantRationale";
  }
  if (result.errorCode === "INVALID_INPUT") field = "lines";
  return {
    message: getAdminCustomerRefundIntakeErrorMessage(result.errorCode),
    variant: result.errorCode === "UNAUTHENTICATED" || result.errorCode === "FORBIDDEN"
      ? "warning"
      : "error",
    field,
    clearInputs: false,
    refresh: APPROVE_REFRESH_CODES.has(result.errorCode),
  };
}

export function unexpectedReviewFailurePresentation(): ReviewResultPresentation {
  return {
    message: "처리 결과를 확인하지 못했습니다. 최신 상태를 확인해 주세요.",
    variant: "error",
    field: null,
    clearInputs: false,
    refresh: true,
  };
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
