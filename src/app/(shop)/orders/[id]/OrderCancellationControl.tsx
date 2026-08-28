"use client";

import { useState, useTransition } from "react";
import {
  cancelMtoOrderAction,
  type CustomerCancelOrderActionResult,
} from "@/app/actions/order-cancellation";
import type { OrderCancellationMessages } from "@/lib/market/messages";

export function OrderCancellationControl({
  orderId,
  requestKey,
  messages,
}: {
  orderId: string;
  requestKey: string;
  messages: OrderCancellationMessages;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-5">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await cancelMtoOrderAction({ orderId, requestKey });
          setMessage(cancellationResultMessage(result, messages));
        })}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? messages.cancellationActionPending : messages.cancellationAction}
      </button>
      <p className="text-xs text-gray-500">{messages.cancellationGuidance}</p>
      {message ? <p aria-live="polite" className="text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}

export function cancellationResultMessage(
  result: CustomerCancelOrderActionResult,
  messages: OrderCancellationMessages,
): string {
  if (result.success) return messages.cancellationActionSuccess;
  if (result.errorCode === "FEATURE_DISABLED") return messages.cancellationFeatureDisabled;
  if (result.errorCode === "NOT_FOUND") return messages.cancellationNotFound;
  if (result.errorCode === "MANUAL_REVIEW_REQUIRED") return messages.cancellationManualReview;
  if (result.errorCode === "CONFLICT") return messages.cancellationConflict;
  return messages.cancellationUnavailable;
}
