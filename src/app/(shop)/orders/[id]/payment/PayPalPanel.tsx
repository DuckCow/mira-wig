"use client";

import type { PayOrderResult } from "@/app/actions/payment";

type PendingPayOrderResult = Extract<PayOrderResult, { status: "pending" }>;

interface PayPalPanelProps {
  result: PendingPayOrderResult;
}

export function PayPalPanel({ result }: PayPalPanelProps) {
  return (
    <div
      data-provider-transaction-id={result.providerTransactionId ?? undefined}
      className="space-y-3"
    >
      <p role="status" className="text-sm text-gray-600">PayPal 결제 준비 중</p>
      <button
        disabled
        className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl opacity-40 cursor-not-allowed"
      >
        PayPal 결제
      </button>
    </div>
  );
}
