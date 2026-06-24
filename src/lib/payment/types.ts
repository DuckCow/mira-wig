// ============================================================
// lib/payment/types.ts — 결제 추상화 계층 계약(contract)
// client-safe: server-only import 없음
// ------------------------------------------------------------
// 규칙: API Route / Server Action은 이 인터페이스만 사용한다.
//       공급자 교체 시 구현체 1파일만 바꾼다.
// ============================================================

/** 결제 시도의 결과 상태 */
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/** 결제 시작 요청 */
export interface InitiateInput {
  orderId: string;
  amount: number;     // 최소단위 정수
  currency: string;   // "KRW" | "USD" | "JPY"
  idempotencyKey: string;
  /** 공급자별 추가 데이터 (Toss: paymentKey 등) */
  providerData?: Record<string, unknown>;
}

/** 결제 시작 결과 */
export interface InitiateResult {
  providerTransactionId: string | null;
  status: PaymentStatus;
  /** 실제 PG: 결제창 URL. mock: undefined */
  redirectUrl?: string;
}

/** 결제 확정 요청 (실제 PG의 콜백/웹훅 후 호출) */
export interface ConfirmInput {
  orderId: string;
  amount: number;
  providerTransactionId: string | null;
  idempotencyKey: string;
}

/** 결제 최종 결과 */
export interface PaymentResult {
  providerTransactionId: string | null;
  status: PaymentStatus;
  providerWebhookSecret?: string;
  errorMessage?: string;
}

export type RefundInput = {
  orderId: string;
  providerTransactionId: string;   // Toss paymentKey, PayPal captureId
  amount?: number;                 // 없으면 전액(최소단위 정수, zero-decimal 그대로)
  currency: string;
  reason: string;
  idempotencyKey: string;
};

export type RefundResult = {
  providerTransactionId: string;
  providerRefundId?: string;       // Toss transactionKey, PayPal refund id
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  amount?: number;
  currency?: string;
  refundableAmount?: number;
  raw?: unknown;
  errorMessage?: string;
};

export type WebhookResult =
  | { verified: false; reason: string }
  | { verified: true; eventId?: string; eventType: string; orderId?: string;
      providerTransactionId?: string; status?: string; occurredAt?: Date;
      amount?: number; currency?: string; providerWebhookSecret?: string; raw: unknown };

/** 결제 공급자 인터페이스 */
export interface PaymentProvider {
  readonly name: string;

  /**
   * 결제를 시작한다.
   * - mock: 즉시 SUCCEEDED 또는 FAILED 반환
   * - 실제 PG: redirect URL 반환 후 웹훅/콜백으로 결과 수신
   */
  initiate(input: InitiateInput): Promise<InitiateResult>;

  /**
   * 클라이언트 결제 완료 후 서버에서 결제를 최종 확정한다.
   * (실제 PG 전용 — mock은 initiate에서 이미 완료)
   */
  confirm(input: ConfirmInput): Promise<PaymentResult>;

  /**
   * 승인된 결제를 전액 또는 부분 취소/환불한다.
   * amount가 없으면 공급자 전액 취소 API를 사용한다.
   */
  refund?(input: RefundInput): Promise<RefundResult>;

  /**
   * PG 웹훅 처리 슬롯. 실제 공급자가 필요 시 구현한다.
   * @see PaymentProvider 구현체별 문서
   */
  handleWebhook?(input: { headers: Headers | Record<string, string>; rawBody: string }): Promise<WebhookResult>;
}
