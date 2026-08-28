"use client";

import { useState, useTransition } from "react";
import { startMtoProductionAction } from "@/app/actions/order-cancellation";

export function ProductionStartControl({
  orderId,
  orderItemId,
  requestKey,
}: {
  orderId: string;
  orderItemId: string;
  requestKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await startMtoProductionAction({ orderId, orderItemId, requestKey });
          setMessage(result.success
            ? "제작 시작이 기록되었습니다."
            : result.errorCode === "CONFLICT"
              ? "제작 상태가 변경되었습니다. 새로고침 후 확인해 주세요."
              : "현재 제작을 시작할 수 없습니다.");
        })}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "처리 중…" : "제작 시작"}
      </button>
      {message ? <p aria-live="polite" className="text-xs text-gray-600">{message}</p> : null}
    </div>
  );
}
