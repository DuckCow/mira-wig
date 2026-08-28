"use client";

import { useState, useTransition } from "react";
import { replaceCancellationRefundAction } from "@/app/actions/order-cancellation";

export function CancellationRefundReplacementControl({
  orderId,
  requestKey,
}: {
  orderId: string;
  requestKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await replaceCancellationRefundAction({ orderId, requestKey });
          setMessage(result.success
            ? `미해결 환불 의무 ${result.amount} ${result.currency} 요청을 기록했습니다.`
            : "대체 환불 요청을 만들 수 없습니다. 현재 원장 상태를 확인해 주세요.");
        })}
        className="rounded border border-amber-400 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? "처리 중…" : "미해결 환불 의무 다시 요청"}
      </button>
      {message ? <p aria-live="polite" className="text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}
