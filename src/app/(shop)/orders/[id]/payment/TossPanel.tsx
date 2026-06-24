"use client";

import { useEffect } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import type { PayOrderResult } from "@/app/actions/payment";

type PendingPayOrderResult = Extract<PayOrderResult, { status: "pending" }>;

interface TossPanelProps {
  result: PendingPayOrderResult;
  onError: (message: string) => void;
}

const openedPaymentKeys = new Set<string>();

function paymentOpenKey(result: PendingPayOrderResult): string {
  return `${result.provider}:${result.orderId}:${result.providerTransactionId ?? "none"}`;
}

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

export function TossPanel({ result, onError }: TossPanelProps) {
  useEffect(() => {
    const openKey = paymentOpenKey(result);
    if (openedPaymentKeys.has(openKey)) return;
    openedPaymentKeys.add(openKey);

    void openTossPayment(result).catch((error: unknown) => {
      openedPaymentKeys.delete(openKey);
      onError(error instanceof Error ? error.message : "결제창을 열 수 없습니다.");
    });
  }, [result, onError]);

  return (
    <button
      disabled
      aria-busy
      className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl opacity-40 cursor-not-allowed"
    >
      결제창 여는 중…
    </button>
  );
}
