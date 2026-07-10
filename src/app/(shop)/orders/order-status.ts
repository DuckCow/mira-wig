export function orderStatusLabel(status: string): string {
  if (status === "PAID") return "결제 완료";
  if (status === "CANCELLED") return "주문 취소";
  if (status === "REFUND_PENDING") return "환불 요청 처리 중";
  if (status === "PARTIALLY_REFUNDED") return "부분 환불";
  if (status === "REFUNDED") return "환불 완료";
  return "상태 확인 중";
}
