"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { transitionOrderStatusAction } from "@/app/actions/admin/orders";
import { getAdminErrorMessage } from "@/lib/admin-messages";

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
      setError(getAdminErrorMessage(result.errorCode));
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
