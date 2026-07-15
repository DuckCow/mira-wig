import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";
import type {
  SubmitCustomerRefundIntakeActionResult,
  WithdrawCustomerRefundIntakeActionResult,
} from "@/app/actions/customer-refund-intake";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";

export const CUSTOMER_REFUND_INTAKE_REASON_OPTIONS = [
  { value: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND, label: "단순 변심" },
  { value: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT, label: "상품 하자" },
  { value: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE, label: "배송 문제·지연" },
  { value: CustomerRefundIntakeReasonCode.OTHER, label: "기타" },
] as const;

export type CustomerRefundIntakeControlMode = "submit" | "withdraw" | null;
export type CustomerRefundIntakeControlProps = {
  orderId: string;
  mode: Exclude<CustomerRefundIntakeControlMode, null>;
};
export type CustomerRefundIntakeResultField = "reasonCode" | "reasonDetail" | null;

export interface CustomerRefundIntakeResultPresentation {
  message: string;
  variant: "success" | "error" | "warning";
  field: CustomerRefundIntakeResultField;
  clearInputs: boolean;
  refresh: boolean;
}

const SUBMIT_REFRESH_CODES = new Set(["FEATURE_DISABLED", "NOT_FOUND", "NOT_AVAILABLE", "CONFLICT"]);
const WITHDRAW_REFRESH_CODES = new Set(["NOT_FOUND", "NOT_WITHDRAWABLE"]);

export function customerRefundIntakeReasonLabel(
  reasonCode: CustomerRefundIntakeReasonCode,
): string {
  return CUSTOMER_REFUND_INTAKE_REASON_OPTIONS.find((option) => option.value === reasonCode)?.label
    ?? "사유 확인 필요";
}

export function customerRefundIntakeStatusLabel(
  status: CustomerRefundIntakeStatus,
): string {
  if (status === CustomerRefundIntakeStatus.SUBMITTED) return "접수됨";
  if (status === CustomerRefundIntakeStatus.WITHDRAWN) return "철회됨";
  if (status === CustomerRefundIntakeStatus.REJECTED) return "온라인 진행 불가";
  if (status === CustomerRefundIntakeStatus.APPROVED) return "승인됨";
  return "상태 확인 필요";
}

export function customerRefundIntakeLifecycleCopy(
  status: CustomerRefundIntakeStatus,
): readonly string[] {
  if (status === CustomerRefundIntakeStatus.SUBMITTED) {
    return ["환불 검토 요청이 접수되었습니다.", "환불 가능 여부 확인 후 안내드립니다."];
  }
  if (status === CustomerRefundIntakeStatus.WITHDRAWN) {
    return ["환불 검토 요청이 철회되었습니다."];
  }
  if (status === CustomerRefundIntakeStatus.REJECTED) {
    return ["온라인 환불 요청을 진행할 수 없습니다.", "자세한 내용은 고객센터로 문의해주세요."];
  }
  if (status === CustomerRefundIntakeStatus.APPROVED) {
    return [
      "환불 검토 요청이 승인되었습니다.",
      "진행 상황은 위 주문 상태에서 확인할 수 있습니다.",
    ];
  }
  return ["환불 검토 요청 상태를 확인하고 있습니다."];
}

export function customerRefundIntakeAvailabilityCopy(
  reason: CustomerRefundIntakeReadModel["submissionUnavailableReason"],
): readonly string[] | null {
  if (reason === "FEATURE_DISABLED") {
    return ["온라인 환불 검토 요청은 현재 제공되지 않습니다.", "고객센터로 문의해주세요."];
  }
  if (reason === "ORDER_STATE_UNAVAILABLE") {
    return [
      "현재 주문 상태에서는 환불 검토 요청을 접수할 수 없습니다.",
      "자세한 내용은 고객센터로 문의해주세요.",
    ];
  }
  if (reason === "UNAVAILABLE") {
    return [
      "현재 이 주문에서는 온라인 환불 검토 요청을 이용할 수 없습니다.",
      "고객센터로 문의해주세요.",
    ];
  }
  return null;
}

export function customerRefundIntakeControlMode(
  model: Pick<CustomerRefundIntakeReadModel, "latestIntake" | "canSubmit" | "canWithdraw">,
): CustomerRefundIntakeControlMode {
  if (
    model.canWithdraw
    && model.latestIntake?.status === CustomerRefundIntakeStatus.SUBMITTED
  ) {
    return "withdraw";
  }
  return model.canSubmit ? "submit" : null;
}

export function customerRefundIntakeControlProps(
  model: Pick<CustomerRefundIntakeReadModel, "orderId" | "latestIntake" | "canSubmit" | "canWithdraw">,
): CustomerRefundIntakeControlProps | null {
  const mode = customerRefundIntakeControlMode(model);
  return mode ? { orderId: model.orderId, mode } : null;
}

export function isCustomerRefundIntakeReasonCode(
  value: string,
): value is CustomerRefundIntakeReasonCode {
  return CUSTOMER_REFUND_INTAKE_REASON_OPTIONS.some((option) => option.value === value);
}

export function buildSubmitCustomerRefundIntakePayload(
  orderId: string,
  reasonCode: CustomerRefundIntakeReasonCode,
  reasonDetail: string,
) {
  return { orderId, reasonCode, reasonDetail };
}

export function buildWithdrawCustomerRefundIntakePayload(orderId: string) {
  return { orderId };
}

export function presentSubmitCustomerRefundIntakeResult(
  result: SubmitCustomerRefundIntakeActionResult,
): CustomerRefundIntakeResultPresentation {
  if (result.success) {
    if (result.outcome === "CREATED") {
      return successPresentation("환불 검토 요청이 접수되었습니다.");
    }
    if (result.outcome === "REPLAYED_SAME_PAYLOAD") {
      return successPresentation("동일한 환불 검토 요청이 이미 접수되어 있습니다.");
    }
    return {
      ...successPresentation("이미 접수된 요청이 유지됩니다. 새로 입력한 내용은 저장되지 않았습니다."),
      variant: "warning",
    };
  }

  const field = result.errorCode === "REASON_DETAIL_INVALID"
    || result.errorCode === "REASON_DETAIL_TOO_LONG"
    ? "reasonDetail"
    : null;
  return {
    message: submitFailureMessage(result.errorCode),
    variant: result.errorCode === "UNAUTHENTICATED" || result.errorCode === "FEATURE_DISABLED"
      ? "warning"
      : "error",
    field,
    clearInputs: false,
    refresh: SUBMIT_REFRESH_CODES.has(result.errorCode),
  };
}

export function presentWithdrawCustomerRefundIntakeResult(
  result: WithdrawCustomerRefundIntakeActionResult,
): CustomerRefundIntakeResultPresentation {
  if (result.success) {
    return successPresentation(
      result.outcome === "WITHDRAWN"
        ? "환불 검토 요청이 철회되었습니다."
        : "이미 철회된 요청입니다.",
    );
  }
  return {
    message: withdrawFailureMessage(result.errorCode),
    variant: result.errorCode === "UNAUTHENTICATED" ? "warning" : "error",
    field: null,
    clearInputs: false,
    refresh: WITHDRAW_REFRESH_CODES.has(result.errorCode),
  };
}

export function unexpectedCustomerRefundIntakeFailurePresentation(): CustomerRefundIntakeResultPresentation {
  return {
    message: "처리 결과를 확인하지 못했습니다. 잠시 후 새로고침된 상태를 확인해 주세요.",
    variant: "error",
    field: null,
    clearInputs: false,
    refresh: true,
  };
}

function successPresentation(message: string): CustomerRefundIntakeResultPresentation {
  return {
    message,
    variant: "success",
    field: null,
    clearInputs: true,
    refresh: false,
  };
}

function submitFailureMessage(
  errorCode: Exclude<SubmitCustomerRefundIntakeActionResult, { success: true }>["errorCode"],
): string {
  if (errorCode === "UNAUTHENTICATED") return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.";
  if (errorCode === "FEATURE_DISABLED") return "온라인 환불 검토 요청은 현재 제공되지 않습니다.";
  if (errorCode === "INVALID_INPUT") return "입력 내용을 확인해주세요.";
  if (errorCode === "REASON_DETAIL_INVALID") {
    return "요청 내용에 사용할 수 없는 문자가 포함되어 있습니다. 일반 텍스트와 줄바꿈만 입력해주세요.";
  }
  if (errorCode === "REASON_DETAIL_TOO_LONG") return "요청 내용은 500자 이내로 입력해주세요.";
  if (errorCode === "NOT_FOUND") return "주문 또는 요청 정보를 확인할 수 없습니다. 최신 상태를 확인해주세요.";
  if (errorCode === "NOT_AVAILABLE") return "현재 주문 상태에서는 환불 검토 요청을 접수할 수 없습니다.";
  return "현재 환불 검토 요청을 처리할 수 없습니다. 최신 상태를 확인해주세요.";
}

function withdrawFailureMessage(
  errorCode: Exclude<WithdrawCustomerRefundIntakeActionResult, { success: true }>["errorCode"],
): string {
  if (errorCode === "UNAUTHENTICATED") return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.";
  if (errorCode === "INVALID_INPUT") return "요청 정보를 확인해주세요.";
  if (errorCode === "NOT_FOUND") return "주문 또는 요청 정보를 확인할 수 없습니다. 최신 상태를 확인해주세요.";
  return "현재 요청은 철회할 수 없습니다. 최신 상태를 확인해주세요.";
}
