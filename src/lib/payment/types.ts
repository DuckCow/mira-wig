// ============================================================
// lib/payment/types.ts
// 결제 추상화 계층 — "계약(contract)"
// ------------------------------------------------------------
// 규칙: API Route는 토스 SDK/엔드포인트를 직접 호출하지 않고
//       이 PaymentProvider 인터페이스만 사용한다.
//       나중에 토스 → 다른 PG로 바꿔도 구현체 1파일만 교체.
// ------------------------------------------------------------
// 토스페이먼츠 결제 흐름 요약:
//   1) 클라이언트가 결제창 호출 → 성공 시 paymentKey/orderId/amount 수신
//   2) 서버가 confirm(승인) API 호출로 결제를 최종 확정  ← 이 계층의 핵심
//   3) 위변조 방지를 위해 금액을 서버가 다시 검증한다
// ============================================================

/** 결제 승인 요청 (클라이언트 결제창 → 서버 확정 단계) */
export interface ConfirmPaymentInput {
  /** PG가 발급한 결제 키 */
  paymentKey: string;
  /** 우리 시스템의 주문 ID (Order.id) */
  orderId: string;
  /** 클라이언트가 보고한 결제 금액 — 서버가 DB와 대조 검증할 것 */
  amount: number;
}

export type PaymentStatus =
  | "PENDING" // 승인 대기
  | "PAID" // 승인 완료
  | "FAILED" // 실패
  | "CANCELLED"; // 취소

/** 결제 승인 결과 */
export interface PaymentResult {
  status: PaymentStatus;
  /** PG 거래 고유 ID — Order.paymentId에 저장 */
  paymentId: string;
  /** 실제 승인된 금액 */
  approvedAmount: number;
  /** 결제 수단 (예: "카드", "간편결제") */
  method?: string;
  /** 승인 시각 (ISO) */
  approvedAt?: string;
  /** 실패 시 메시지 */
  errorMessage?: string;
}

/** 환불 요청 */
export interface RefundInput {
  paymentId: string;
  /** 부분 환불 금액. 미지정 시 전액 환불 */
  amount?: number;
  reason: string;
}

export interface PaymentProvider {
  /** 공급자 식별자 (Order.paymentMethod 등에 활용, 예: "toss") */
  readonly name: string;

  /**
   * 클라이언트 결제 성공 후, 서버에서 결제를 최종 승인한다.
   * 반드시 amount를 DB의 주문 금액과 대조 검증한 뒤 호출할 것.
   */
  confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult>;

  /** 결제 취소/환불 */
  refund(input: RefundInput): Promise<PaymentResult>;
}
