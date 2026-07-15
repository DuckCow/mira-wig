import type {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  RefundAttemptStatus,
} from "@prisma/client";

export function customerRefundIntakeReasonLabel(
  reasonCode: CustomerRefundIntakeReasonCode,
): string {
  if (reasonCode === "CHANGE_OF_MIND") return "단순 변심";
  if (reasonCode === "PRODUCT_DEFECT") return "상품 하자";
  if (reasonCode === "DELIVERY_ISSUE") return "배송 문제·지연";
  if (reasonCode === "OTHER") return "기타";
  return "사유 확인 필요";
}

export function customerRefundIntakeStatusLabel(
  status: CustomerRefundIntakeStatus,
): string {
  if (status === "SUBMITTED") return "접수됨";
  if (status === "WITHDRAWN") return "철회됨";
  if (status === "REJECTED") return "거절됨";
  if (status === "APPROVED") return "승인됨";
  return "상태 확인 필요";
}

export function adminOrderStatusLabel(status: OrderStatus): string {
  if (status === "PAID") return "결제 완료";
  if (status === "CANCELLED") return "주문 취소";
  if (status === "REFUND_PENDING") return "환불 요청 접수";
  if (status === "PARTIALLY_REFUNDED") return "부분 환불";
  if (status === "REFUNDED") return "환불 완료";
  return "상태 확인 필요";
}

export function refundAttemptStatusLabel(status: RefundAttemptStatus): string {
  if (status === "REQUESTED") return "환불 요청됨";
  if (status === "PROCESSING") return "환불 처리 중";
  if (status === "SUCCEEDED") return "환불 완료";
  if (status === "FAILED_RETRYABLE") return "재시도 필요";
  if (status === "FAILED_TERMINAL") return "환불 실패";
  if (status === "MANUAL_REVIEW") return "수동 확인 필요";
  if (status === "CANCELLED") return "요청 철회";
  return "상태 확인 필요";
}
