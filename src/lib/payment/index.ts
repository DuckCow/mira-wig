// ============================================================
// lib/payment/index.ts
// 결제 공급자 팩토리
// ------------------------------------------------------------
// 사용처 (주문 확정 API):
//   import { paymentProvider } from "@/lib/payment";
//   // 1) DB에서 주문 금액 조회 후 input.amount와 대조 검증
//   // 2) 검증 통과 시에만 승인 호출
//   const result = await paymentProvider.confirmPayment({ ... });
// ============================================================

import type { PaymentProvider } from "./types";
import { TossPaymentProvider } from "./toss";

// 현재는 토스 단일 구현. 향후 PG 추가 시 PAYMENT_PROVIDER env로 분기.
export const paymentProvider: PaymentProvider = new TossPaymentProvider();

export type {
  PaymentProvider,
  ConfirmPaymentInput,
  PaymentResult,
  PaymentStatus,
  RefundInput,
} from "./types";
