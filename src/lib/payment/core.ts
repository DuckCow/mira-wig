// ============================================================
// lib/payment/core.ts — 결제 처리 순수 함수
// server-only 없음 — 테스트·클라이언트 모두 import 가능
// ============================================================

/** 결제 가능 상태 검증 결과 */
export interface OrderPaymentValidation {
  valid: boolean;
  reason?: string;
}

/**
 * 주문 상태가 결제 처리 가능한지 확인한다.
 * PENDING_PAYMENT 이외의 상태는 모두 거부한다.
 */
export function validateOrderForPayment(status: string): OrderPaymentValidation {
  if (status === "PENDING_PAYMENT") return { valid: true };
  if (status === "PAID") {
    return { valid: false, reason: "이미 결제 완료된 주문입니다." };
  }
  if (status === "PAYMENT_FAILED") {
    return { valid: false, reason: "결제에 실패한 주문입니다. 새 주문을 생성해 주세요." };
  }
  return { valid: false, reason: `결제 불가 상태입니다: ${status}` };
}

/**
 * 재고 차감이 가능한지 확인한다 (경계 포함).
 * currentStock >= requestedQty 이면 true.
 */
export function canDecrementStock(currentStock: number, requestedQty: number): boolean {
  return currentStock >= requestedQty;
}

/**
 * 같은 idempotencyKey로 이미 성공 처리된 결제가 있는지 확인한다.
 * 성공 기록이 있으면 재처리 없이 그 결과를 그대로 반환해야 한다.
 */
export function isAlreadyProcessed(
  existingPayment: { status: string } | null,
): boolean {
  return existingPayment !== null && existingPayment.status === "SUCCEEDED";
}

/**
 * 재고 차감 결과를 반환한다.
 * canDecrementStock이 true인 경우에만 호출할 것.
 */
export function computeRemainingStock(currentStock: number, requestedQty: number): number {
  return currentStock - requestedQty;
}
