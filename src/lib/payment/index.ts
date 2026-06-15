// ============================================================
// lib/payment/index.ts — 결제 공급자 팩토리
// ------------------------------------------------------------
// 사용처 (processPayment):
//   import { getPaymentProvider } from "@/lib/payment";
//   const provider = getPaymentProvider(marketCode);
//   const result = await provider.initiate({ ... });
// ------------------------------------------------------------
// 현재: mock 단일 구현.
// 향후: 마켓 코드 또는 PAYMENT_PROVIDER env로 공급자 분기.
// ============================================================

import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

/**
 * 현재 환경에 맞는 결제 공급자를 반환한다.
 * @param _marketCode 향후 마켓별 공급자 선택 슬롯 (현재 미사용)
 * @param shouldSucceed @mock-only mock 성공/실패 제어. 실제 PG 연동 시 제거.
 */
export function getPaymentProvider(
  _marketCode?: string,
  shouldSucceed?: boolean,
): PaymentProvider {
  return new MockPaymentProvider(shouldSucceed ?? true);
}

export type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  ConfirmInput,
  PaymentResult,
  PaymentStatus,
} from "./types";
