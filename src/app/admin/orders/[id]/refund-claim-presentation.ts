import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
} from "@prisma/client";
import type { AdminOrderDetailSource } from "./admin-order-detail-types";

export type RefundExecutionClaimActivationState = "enabled" | "disabled" | "misconfigured";

export interface RefundExecutionClaimTarget {
  refundAttemptId: string;
  shortAttemptId: string;
  amount: string;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

export interface RefundExecutionClaimPresentation {
  control: RefundExecutionClaimTarget | null;
  advisory: string | null;
}

interface RefundExecutionClaimPresentationInput {
  activationState: RefundExecutionClaimActivationState;
  orderStatus: OrderStatus;
  orderAmount: number;
  orderCurrency: string;
  paymentStatus: PaymentAttemptStatus;
  paymentAmount: number;
  paymentCurrency: string;
  paymentProvider: PaymentProvider;
  paymentMode: PaymentMode;
  providerPaymentKeyPresent: boolean;
  attemptStatus: RefundAttemptStatus;
  attemptId: string;
  attemptAmount: number;
  attemptCurrency: string;
  attemptProvider: PaymentProvider;
  attemptMode: PaymentMode;
  attemptPaymentIdentityMatches: boolean;
  singleOpenTarget: boolean;
  hasProviderRefundId: boolean;
  hasExecutionCommand: boolean;
  formattedAmount: string;
}

export function buildRefundExecutionClaimPresentation(
  input: RefundExecutionClaimPresentationInput,
): RefundExecutionClaimPresentation {
  const advisory = resolveAvailabilityAdvisory(input);
  if (advisory) return unavailable(advisory);
  if (!hasCoherentReadIdentity(input)) {
    return unavailable("주문·결제·환불 요청 정보가 일치하지 않아 실행 승인을 제공하지 않습니다. 수동 확인이 필요합니다.");
  }
  return {
    control: {
      refundAttemptId: input.attemptId,
      shortAttemptId: input.attemptId.slice(0, 8),
      amount: input.formattedAmount,
      currency: input.attemptCurrency,
      provider: input.attemptProvider,
      mode: input.attemptMode,
    },
    advisory: null,
  };
}

export function buildRefundExecutionClaimPresentationForOrder(input: {
  activationState: RefundExecutionClaimActivationState;
  order: AdminOrderDetailSource;
  attempt: AdminOrderDetailSource["refundAttempts"][number];
  singleOpenTarget: boolean;
  formattedAmount: string;
}): RefundExecutionClaimPresentation {
  const { order, attempt } = input;
  return buildRefundExecutionClaimPresentation({
    activationState: input.activationState,
    orderStatus: order.status,
    orderAmount: order.totalAmount,
    orderCurrency: order.currency,
    paymentStatus: order.payment.status,
    paymentAmount: order.payment.amount,
    paymentCurrency: order.payment.currency,
    paymentProvider: order.payment.provider,
    paymentMode: order.payment.mode,
    providerPaymentKeyPresent: order.payment.providerPaymentKeyPresent,
    attemptStatus: attempt.status,
    attemptId: attempt.id,
    attemptAmount: attempt.amount,
    attemptCurrency: attempt.currency,
    attemptProvider: attempt.provider,
    attemptMode: attempt.mode,
    attemptPaymentIdentityMatches: attempt.paymentIdentityMatches,
    singleOpenTarget: input.singleOpenTarget,
    hasProviderRefundId: attempt.hasProviderRefundId,
    hasExecutionCommand: attempt.hasExecutionCommand,
    formattedAmount: input.formattedAmount,
  });
}

function resolveAvailabilityAdvisory(input: RefundExecutionClaimPresentationInput): string | null {
  return activationAdvisory(input.activationState)
    ?? requestArtifactAdvisory(input)
    ?? requestStatusAdvisory(input)
    ?? capabilityAdvisory(input);
}

function activationAdvisory(state: RefundExecutionClaimActivationState): string | null {
  if (state === "misconfigured") {
    return "환불 실행 승인 설정을 확인해야 합니다. 설정이 수정될 때까지 실행 승인을 제공하지 않습니다.";
  }
  if (state === "disabled") return "환불 실행 승인은 현재 비활성화되어 있습니다.";
  return null;
}

function requestArtifactAdvisory(input: RefundExecutionClaimPresentationInput): string | null {
  if (input.attemptStatus !== RefundAttemptStatus.REQUESTED) return null;
  if (input.hasProviderRefundId) {
    return "요청 전 상태에 제공자 처리 정보가 있어 실행 승인을 제공하지 않습니다. 수동 확인이 필요합니다.";
  }
  if (input.hasExecutionCommand) {
    return "요청 전 상태에 실행 명령 기록이 있어 실행 승인을 제공하지 않습니다. 수동 확인이 필요합니다.";
  }
  return null;
}

function requestStatusAdvisory(input: RefundExecutionClaimPresentationInput): string | null {
  if (input.attemptStatus === RefundAttemptStatus.REQUESTED) return null;
  return input.hasExecutionCommand
    ? "환불 실행 승인이 이미 기록되어 있습니다. 현재 상태를 실행 현황에서 확인해 주세요."
    : "현재 환불 요청 상태에서는 실행 승인을 제공하지 않습니다.";
}

function capabilityAdvisory(input: RefundExecutionClaimPresentationInput): string | null {
  if (input.paymentProvider !== PaymentProvider.MOCK) return "수동 실행 승인은 MOCK 결제에만 제공됩니다.";
  if (input.paymentMode !== PaymentMode.SANDBOX) return "수동 실행 승인은 SANDBOX 결제에만 제공됩니다.";
  return null;
}

function hasCoherentReadIdentity(input: RefundExecutionClaimPresentationInput): boolean {
  return [
    input.orderStatus === OrderStatus.REFUND_PENDING,
    input.paymentStatus === PaymentAttemptStatus.SUCCEEDED,
    input.providerPaymentKeyPresent,
    input.orderAmount === input.paymentAmount,
    input.orderCurrency === input.paymentCurrency,
    input.attemptPaymentIdentityMatches,
    Number.isSafeInteger(input.attemptAmount),
    input.attemptAmount > 0,
    input.attemptCurrency === input.paymentCurrency,
    input.attemptProvider === input.paymentProvider,
    input.attemptMode === input.paymentMode,
    input.singleOpenTarget,
  ].every(Boolean);
}

function unavailable(advisory: string): RefundExecutionClaimPresentation {
  return { control: null, advisory };
}
