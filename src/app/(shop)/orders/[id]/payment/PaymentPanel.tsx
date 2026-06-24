"use client";

import { useState, useTransition } from "react";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { payOrderAction, type PayOrderResult } from "@/app/actions/payment";
import { PayPalPanel } from "./PayPalPanel";
import { TossPanel } from "./TossPanel";

type PendingPayOrderResult = Extract<PayOrderResult, { status: "pending" }>;

interface PaymentPanelProps {
  orderId: string;
  totalAmount: number;
  currency: string;
  isFailed: boolean;
}

interface PaymentControlProps {
  pendingPayment: PendingPayOrderResult | null;
  isPending: boolean;
  onPay: () => void;
  onProviderError: (message: string) => void;
}

function formatPaymentAmount(totalAmount: number, currency: string): string {
  const currencyMeta = CURRENCY_META[currency];
  return currencyMeta ? formatPrice(totalAmount, currencyMeta) : `${totalAmount}`;
}

function PaymentButton({ isPending, onPay }: Pick<PaymentControlProps, "isPending" | "onPay">) {
  return (
    <button
      onClick={onPay}
      disabled={isPending}
      aria-busy={isPending}
      className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? "결제 처리 중…" : "결제하기"}
    </button>
  );
}

function PaymentControl({ pendingPayment, isPending, onPay, onProviderError }: PaymentControlProps) {
  if (pendingPayment?.provider === "toss") {
    return <TossPanel result={pendingPayment} onError={onProviderError} />;
  }
  if (pendingPayment?.provider === "paypal") return <PayPalPanel result={pendingPayment} />;
  return <PaymentButton isPending={isPending} onPay={onPay} />;
}

export function PaymentPanel({ orderId, totalAmount, currency, isFailed }: PaymentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayOrderResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const formattedAmount = formatPaymentAmount(totalAmount, currency);

  function handlePay() {
    setError(null);
    setPendingPayment(null);
    startTransition(async () => {
      const result = await payOrderAction(orderId);
      // 성공 시 redirect가 발생해 여기에 도달하지 않는다.
      switch (result.status) {
        case "failed":
        case "unconfirmed":
          setError(result.error);
          return;
        case "pending":
          setPendingPayment(result);
          return;
      }
      const _exhaustive: never = result;
      return _exhaustive;
    });
  }

  function handleProviderError(message: string) {
    setPendingPayment(null);
    setError(message);
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

      <PaymentControl
        pendingPayment={pendingPayment}
        isPending={isPending}
        onPay={handlePay}
        onProviderError={handleProviderError}
      />
    </section>
  );
}
