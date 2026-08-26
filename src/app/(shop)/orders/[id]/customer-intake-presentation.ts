import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";
import type {
  SubmitCustomerRefundIntakeActionResult,
  WithdrawCustomerRefundIntakeActionResult,
} from "@/app/actions/customer-refund-intake";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";

export function customerRefundIntakeReasonOptions(locale: Locale = "ko") {
  const reasons = messagesFor(locale).order.intake.reasons;
  return [
    { value: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND, label: reasons.changeOfMind },
    { value: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT, label: reasons.productDefect },
    { value: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE, label: reasons.deliveryIssue },
    { value: CustomerRefundIntakeReasonCode.OTHER, label: reasons.other },
  ] as const;
}

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
  locale: Locale = "ko",
): string {
  return customerRefundIntakeReasonOptions(locale).find((option) => option.value === reasonCode)?.label
    ?? messagesFor(locale).order.intake.reasons.unknown;
}

export function customerRefundIntakeStatusLabel(
  status: CustomerRefundIntakeStatus,
  locale: Locale = "ko",
): string {
  const statuses = messagesFor(locale).order.intake.statuses;
  if (status === CustomerRefundIntakeStatus.SUBMITTED) return statuses.submitted;
  if (status === CustomerRefundIntakeStatus.WITHDRAWN) return statuses.withdrawn;
  if (status === CustomerRefundIntakeStatus.REJECTED) return statuses.rejected;
  if (status === CustomerRefundIntakeStatus.APPROVED) return statuses.approved;
  return statuses.unknown;
}

export function customerRefundIntakeLifecycleCopy(
  status: CustomerRefundIntakeStatus,
  locale: Locale = "ko",
): readonly string[] {
  const lifecycle = messagesFor(locale).order.intake.lifecycle;
  if (status === CustomerRefundIntakeStatus.SUBMITTED) {
    return lifecycle.submitted;
  }
  if (status === CustomerRefundIntakeStatus.WITHDRAWN) {
    return lifecycle.withdrawn;
  }
  if (status === CustomerRefundIntakeStatus.REJECTED) {
    return lifecycle.rejected;
  }
  if (status === CustomerRefundIntakeStatus.APPROVED) {
    return lifecycle.approved;
  }
  return lifecycle.unknown;
}

export function customerRefundIntakeAvailabilityCopy(
  reason: CustomerRefundIntakeReadModel["submissionUnavailableReason"],
  locale: Locale = "ko",
): readonly string[] | null {
  const messages = messagesFor(locale).order.intake;
  if (reason === "FEATURE_DISABLED") {
    return messages.featureDisabled;
  }
  if (reason === "ORDER_STATE_UNAVAILABLE") {
    return messages.orderUnavailable;
  }
  if (reason === "UNAVAILABLE") {
    return messages.unavailable;
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
  return Object.values(CustomerRefundIntakeReasonCode).some((option) => option === value);
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
  locale: Locale = "ko",
): CustomerRefundIntakeResultPresentation {
  if (result.success) {
    if (result.outcome === "CREATED") {
      return successPresentation(messagesFor(locale).order.intake.lifecycle.submitted[0]);
    }
    if (result.outcome === "REPLAYED_SAME_PAYLOAD") {
      return successPresentation(messagesFor(locale).order.intake.replayedSame);
    }
    return {
      ...successPresentation(messagesFor(locale).order.intake.replayedDifferent),
      variant: "warning",
    };
  }

  const field = result.errorCode === "REASON_DETAIL_INVALID"
    || result.errorCode === "REASON_DETAIL_TOO_LONG"
    ? "reasonDetail"
    : null;
  return {
    message: submitFailureMessage(result.errorCode, locale),
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
  locale: Locale = "ko",
): CustomerRefundIntakeResultPresentation {
  if (result.success) {
    return successPresentation(
      result.outcome === "WITHDRAWN"
        ? messagesFor(locale).order.intake.lifecycle.withdrawn[0]
        : messagesFor(locale).order.intake.alreadyWithdrawn,
    );
  }
  return {
    message: withdrawFailureMessage(result.errorCode, locale),
    variant: result.errorCode === "UNAUTHENTICATED" ? "warning" : "error",
    field: null,
    clearInputs: false,
    refresh: WITHDRAW_REFRESH_CODES.has(result.errorCode),
  };
}

export function unexpectedCustomerRefundIntakeFailurePresentation(locale: Locale = "ko"): CustomerRefundIntakeResultPresentation {
  return {
    message: messagesFor(locale).order.intake.unexpected,
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
  locale: Locale,
): string {
  const messages = messagesFor(locale).order.intake;
  if (errorCode === "UNAUTHENTICATED") return messages.unauthenticated;
  if (errorCode === "FEATURE_DISABLED") return messagesFor(locale).order.intake.featureDisabled[0];
  if (errorCode === "INVALID_INPUT") return messages.invalidInput;
  if (errorCode === "REASON_DETAIL_INVALID") {
    return messages.invalidDetail;
  }
  if (errorCode === "REASON_DETAIL_TOO_LONG") return messages.detailTooLong;
  if (errorCode === "NOT_FOUND") return messages.notFound;
  if (errorCode === "NOT_AVAILABLE") return messages.orderUnavailable[0];
  return messages.submitUnavailable;
}

function withdrawFailureMessage(
  errorCode: Exclude<WithdrawCustomerRefundIntakeActionResult, { success: true }>["errorCode"],
  locale: Locale,
): string {
  const messages = messagesFor(locale).order.intake;
  if (errorCode === "UNAUTHENTICATED") return messages.unauthenticated;
  if (errorCode === "INVALID_INPUT") return messages.invalidRequest;
  if (errorCode === "NOT_FOUND") return messages.notFound;
  return messages.withdrawUnavailable;
}
