"use client";

// ============================================================
// 결제 인터랙션 패널 — 현재 Mock 모드 (단일 "결제하기" 버튼)
// 실제 PG 연동 시 이 컴포넌트 전체를 PG SDK 호출로 교체한다.
// 실패 시뮬레이션은 env PAYMENT_MOCK_FORCE_FAIL=1 로 제어한다.
// ============================================================

import { useState, useTransition } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { payOrderAction, type PayOrderResult } from "@/app/actions/payment";

type PendingPayOrderResult = Extract<PayOrderResult, { status: "pending" }>;

interface PaymentPanelProps {
  orderId: string;
  totalAmount: number;
  currency: string;
  isFailed: boolean;
}

export function PaymentPanel({ orderId, totalAmount, currency, isFailed }: PaymentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currencyMeta = CURRENCY_META[currency];
  const formattedAmount = currencyMeta ? formatPrice(totalAmount, currencyMeta) : `${totalAmount}`;

  async function openTossPayment(result: PendingPayOrderResult): Promise<void> {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!clientKey) throw new Error("토스페이먼츠 클라이언트 키가 설정되지 않았습니다.");
    if (result.currency !== "KRW") throw new Error("현재 토스 결제창은 KRW 주문만 지원합니다.");
    const tossPayments = await loadTossPayments(clientKey);
    const payment = tossPayments.payment({ customerKey: result.orderId });
    const successUrl = new URL(`/orders/${result.orderId}/payment/callback`, window.location.origin);
    const failUrl = new URL(`/orders/${result.orderId}/payment`, window.location.origin);
    failUrl.searchParams.set("error", "결제가 취소되었거나 실패했습니다.");
    try {
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: result.currency, value: result.amount },
        orderId: result.orderId,
        orderName: result.orderName,
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
        card: { flowMode: "DEFAULT" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "결제가 취소되었거나 실패했습니다.";
      failUrl.searchParams.set("error", message);
      window.location.assign(failUrl.toString());
    }
  }

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const result = await payOrderAction(orderId);
      // 성공 시 redirect가 발생해 여기에 도달하지 않는다.
      switch (result.status) {
        case "failed":
        case "unconfirmed":
          setError(result.error);
          return;
        case "pending":
          try {
            await openTossPayment(result);
          } catch (error) {
            setError(error instanceof Error ? error.message : "결제창을 열 수 없습니다.");
          }
          return;
      }
      const _exhaustive: never = result;
      return _exhaustive;
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

      <button
        onClick={handlePay}
        disabled={isPending}
        aria-busy={isPending}
        className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "결제 처리 중…" : "결제하기"}
      </button>
    </section>
  );
}
