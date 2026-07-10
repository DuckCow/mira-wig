import { OrderStatus, RefundAttemptStatus } from "@prisma/client";

interface RefundCloseAdvisoryInput {
  orderStatus: OrderStatus;
  attemptStatus: RefundAttemptStatus;
  hasProviderRefundId: boolean;
}

interface RefundCloseAdvisory {
  canCloseRequest: boolean;
  closeWarning: string | null;
}

export function buildRefundCloseAdvisory(
  input: RefundCloseAdvisoryInput,
): RefundCloseAdvisory {
  if (input.attemptStatus !== RefundAttemptStatus.REQUESTED) {
    return { canCloseRequest: false, closeWarning: null };
  }
  const orderMismatch = input.orderStatus !== OrderStatus.REFUND_PENDING;
  if (input.hasProviderRefundId && orderMismatch) {
    return {
      canCloseRequest: false,
      closeWarning: "제공자 처리 정보가 있고 주문 상태와 환불 요청 상태도 일치하지 않아 철회를 제공하지 않습니다. 수동 확인이 필요합니다.",
    };
  }
  if (input.hasProviderRefundId) {
    return {
      canCloseRequest: false,
      closeWarning: "제공자 처리 정보가 있어 현재 요청의 철회를 제공하지 않습니다. 수동 확인이 필요합니다.",
    };
  }
  if (orderMismatch) {
    return {
      canCloseRequest: false,
      closeWarning: "주문 상태와 환불 요청 상태가 일치하지 않아 철회를 제공하지 않습니다. 수동 확인이 필요합니다.",
    };
  }
  return { canCloseRequest: true, closeWarning: null };
}
