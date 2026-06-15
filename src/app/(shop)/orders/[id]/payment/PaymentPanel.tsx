"use client";

// ============================================================
// 결제 인터랙션 패널 — mock 전용 성공/실패 버튼
// 실제 PG 연동 시 이 컴포넌트 전체를 PG SDK 호출로 교체한다.
// ============================================================

import { useState, useTransition } from "react";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { payOrderAction } from "@/app/actions/payment";

interface PaymentPanelProps {
  orderId: string;
  totalAmount: number;
  currency: string;
  isFailed: boolean; // PAYMENT_FAILED 상태 여부
}

export function PaymentPanel({ orderId, totalAmount, currency, isFailed }: PaymentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currencyMeta = CURRENCY_META[currency];
  const formattedAmount = currencyMeta ? formatPrice(totalAmount, currencyMeta) : `${totalAmount}`;

  function handlePay(shouldSucceed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await payOrderAction(orderId, shouldSucceed);
      // 성공 시 redirect가 발생해 여기에 도달하지 않는다.
      setError(result.error);
    });
  }

  return (
    <section className="border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">결제</h2>

      <div className="flex justify-between text-base font-semibold text-gray-900">
        <span>결제 금액</span>
        <span>{formattedAmount}</span>
      </div>

      {isFailed && (
        <p className="text-sm text-red-500">이전 결제가 실패했습니다. 다시 시도해 주세요.</p>
      )}

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {/* mock 전용 — 실제 PG 연동 시 이 블록을 PG 결제창 호출로 교체한다 */}
      <div className="space-y-2">
        <button
          onClick={() => handlePay(true)}
          disabled={isPending}
          aria-busy={isPending}
          className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "결제 처리 중…" : "결제하기"}
        </button>
        <button
          onClick={() => handlePay(false)}
          disabled={isPending}
          className="w-full py-3 border border-gray-300 text-gray-600 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          결제 실패 시뮬레이션 (mock)
        </button>
      </div>
    </section>
  );
}
