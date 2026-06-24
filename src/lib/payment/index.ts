// ============================================================
// lib/payment/index.ts — 결제 공급자 팩토리
// ------------------------------------------------------------
// marketCode → provider 매핑.
// PAYMENT_LIVE_MARKETS에 포함된 마켓만 실 provider를 사용한다.
//
// 사용처 (processPayment):
//   import { getPaymentProvider } from "@/lib/payment";
//   const provider = getPaymentProvider(marketCode);
//   const result = await provider.initiate({ ... });
// ============================================================

import { MockPaymentProvider } from "./mock";
import { PayPalPaymentProvider } from "./paypal";
import { TossPaymentProvider } from "./toss";
import type { PaymentProvider } from "./types";

const SUPPORTED_LIVE_MARKETS = new Set(["KR", "JP", "US"]);

function liveMarkets(): Set<string> {
  const raw = process.env.PAYMENT_LIVE_MARKETS ?? "";
  return new Set(raw.split(",").map((code) => code.trim().toUpperCase()).filter((code) => SUPPORTED_LIVE_MARKETS.has(code)));
}

function buildMockProvider(): PaymentProvider {
  // PAYMENT_MOCK_FORCE_FAIL=1 이면 항상 실패 시뮬레이션.
  const forceFail = process.env.PAYMENT_MOCK_FORCE_FAIL === "1";
  return new MockPaymentProvider(!forceFail);
}

/**
 * marketCode에 맞는 결제 공급자를 반환한다.
 * PAYMENT_LIVE_MARKETS에서 해당 마켓이 활성화되지 않은 경우 Mock으로 fallback.
 */
export function getPaymentProvider(marketCode?: string): PaymentProvider {
  // KR 마켓 — Toss 어댑터 연결 지점
  if (marketCode === "KR" && liveMarkets().has("KR")) {
    return new TossPaymentProvider();
  }
  if ((marketCode === "US" || marketCode === "JP") && liveMarkets().has(marketCode)) {
    return new PayPalPaymentProvider();
  }
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
