"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { transitionOrderStatusAction } from "@/app/actions/admin/orders";

const ERROR_MESSAGES = {
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "관리자 권한이 필요합니다.",
  NOT_FOUND: "주문을 찾을 수 없습니다.",
  INVALID_TRANSITION: "현재 상태에서는 이 전이를 할 수 없습니다.",
  CONFLICT: "주문 상태가 이미 바뀌었습니다. 새로고침 후 다시 확인하세요.",
} as const;

type Props = {
  orderId: string;
  currentStatus: OrderStatus;
  targetStatus: OrderStatus;
  label: string;
};

export function OrderStatusTransitionButton({ orderId, currentStatus, targetStatus, label }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runTransition() {
    startTransition(async () => {
      setError(null);
      const result = await transitionOrderStatusAction(orderId, targetStatus, currentStatus);
      if (result.success) {
        router.refresh();
        return;
      }
      setError(ERROR_MESSAGES[result.errorCode]);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runTransition}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "처리 중..." : label}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
