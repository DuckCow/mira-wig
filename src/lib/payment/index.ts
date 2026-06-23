// ============================================================
// lib/payment/index.ts — 결제 공급자 팩토리
// ------------------------------------------------------------
// marketCode → provider 매핑.
// 현재 모든 마켓은 Mock 유지.
// 실 어댑터 준비 완료 시 LIVE_PROVIDER_MARKETS[code] = true 로 전환한다.
//
// 사용처 (processPayment):
//   import { getPaymentProvider } from "@/lib/payment";
//   const provider = getPaymentProvider(marketCode);
//   const result = await provider.initiate({ ... });
// ============================================================

import { MockPaymentProvider } from "./mock";
import { TossPaymentProvider } from "./toss";
import type { PaymentProvider } from "./types";

// 마켓별 실 PG 활성화 플래그.
// ⚠️ 어댑터·클라 SDK·콜백 라우트가 완성되기 전에 true로 바꾸지 마라.
const LIVE_PROVIDER_MARKETS: Readonly<Record<string, boolean>> = {
  KR: false, // ← Toss 연결 준비 완료 시 true 전환 (TossPaymentProvider)
  JP: false,
  US: false,
};

function buildMockProvider(): PaymentProvider {
  // PAYMENT_MOCK_FORCE_FAIL=1 이면 항상 실패 시뮬레이션.
  const forceFail = process.env.PAYMENT_MOCK_FORCE_FAIL === "1";
  return new MockPaymentProvider(!forceFail);
}

/**
 * marketCode에 맞는 결제 공급자를 반환한다.
 * LIVE_PROVIDER_MARKETS에서 해당 마켓이 활성화되지 않은 경우 Mock으로 fallback.
 */
export function getPaymentProvider(marketCode?: string): PaymentProvider {
  // KR 마켓 — Toss 어댑터 연결 지점
  if (marketCode === "KR" && LIVE_PROVIDER_MARKETS["KR"]) {
    return new TossPaymentProvider();
  }
  // JP, US, 기타: 각 어댑터 준비 완료 시 분기 추가
  return buildMockProvider();
}

export type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  ConfirmInput,
  PaymentResult,
  PaymentStatus,
} from "./types";
