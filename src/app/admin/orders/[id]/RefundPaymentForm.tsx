"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { refundOrderPaymentAction } from "@/app/actions/admin/orders";
import { getAdminErrorMessage } from "@/lib/admin-messages";

type Props = {
  orderId: string;
  paymentId: string;
  currency: string;
  refundableAmount: number;
  formattedRefundableAmount: string;
  idempotencyKey: string;
};

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function parsePartialAmount(value: FormDataEntryValue | null): number | null {
  const raw = stringValue(value).trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

function getSubmitMode(event: FormEvent<HTMLFormElement>): string {
  const nativeEvent = event.nativeEvent;
  if (!("submitter" in nativeEvent)) return "";
  const submitter = nativeEvent.submitter;
  return submitter instanceof HTMLButtonElement ? submitter.value : "";
}

export function RefundPaymentForm({
  orderId,
  paymentId,
  currency,
  refundableAmount,
  formattedRefundableAmount,
  idempotencyKey,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const mode = getSubmitMode(event);
    if (mode !== "partial") {
      startTransition(() => {
        void submitRefund(formData, undefined);
      });
      return;
    }

    const amount = parsePartialAmount(formData.get("amount"));
    if (amount === null) {
      setError(getAdminErrorMessage("INVALID_AMOUNT"));
      return;
    }
    startTransition(() => {
      void submitRefund(formData, amount);
    });
  }

  async function submitRefund(formData: FormData, amount: number | undefined) {
    setError(null);
    const result = await refundOrderPaymentAction({
      orderId,
      paymentId,
      amount,
      reason: stringValue(formData.get("reason")).trim(),
      idempotencyKey: stringValue(formData.get("idempotencyKey")),
    });
    if (result.success || result.errorCode === "ALREADY") {
      router.refresh();
      return;
    }
    setError(getAdminErrorMessage(result.errorCode));
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-100 pt-4 space-y-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-gray-400">환불 가능액</p>
          <p className="text-sm font-semibold text-gray-900">{formattedRefundableAmount}</p>
        </div>
        <button
          type="submit"
          name="refundMode"
          value="full"
          disabled={isPending || refundableAmount <= 0}
          className="inline-flex items-center justify-center rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "전액 환불"}
        </button>
      </div>
      <label className="block text-xs text-gray-500">
        환불 사유
        <input
          name="reason"
          required
          placeholder="환불 사유를 입력하세요"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm text-gray-800"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="amount"
          type="number"
          min={1}
          max={refundableAmount}
          step={1}
          placeholder={`부분 환불 금액 (${currency} 최소단위 정수)`}
          className="min-w-0 flex-1 rounded border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          name="refundMode"
          value="partial"
          disabled={isPending || refundableAmount <= 0}
          className="inline-flex items-center justify-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          부분 환불
        </button>
      </div>
      {error && <p className="text-sm text-red-600" aria-live="polite">{error}</p>}
    </form>
  );
}
