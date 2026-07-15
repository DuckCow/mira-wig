"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closeRefundRequestAction,
  type AdminCloseRefundRequestResult,
  type AdminRefundActionErrorCode,
} from "@/app/actions/admin/refund";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { getAdminRefundCloseErrorMessage } from "@/lib/admin-messages";

const REFRESH_FAILURES = new Set<AdminRefundActionErrorCode>([
  "PROVIDER_CONTACT_ALREADY_STARTED",
  "INVALID_TRANSITION",
  "CONFLICT",
]);

interface Props {
  orderId: string;
  refundAttemptId: string;
}

export function RefundRequestCloseControl({ orderId, refundAttemptId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const router = useRouter();
  const { showToast } = useToast();

  function closeDialog() {
    if (!isPending) setOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await closeRefundRequestAction({ orderId, refundAttemptId });
        handleResult(result);
      } catch {
        setOpen(false);
        showToast({ message: "처리 결과를 확인하지 못했습니다. 최신 상태를 확인해 주세요.", variant: "error" });
        router.refresh();
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function handleResult(result: AdminCloseRefundRequestResult) {
    setOpen(false);
    if (result.success) {
      showToast({ message: successMessage(result), variant: "success" });
      return;
    }
    showToast({ message: getAdminRefundCloseErrorMessage(result.errorCode), variant: "error" });
    if (REFRESH_FAILURES.has(result.errorCode)) router.refresh();
  }

  return (
    <div className="flex justify-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        환불 요청 철회
      </button>
      <Dialog open={open} onClose={closeDialog} title="환불 요청 철회">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              이 작업은 결제 대금을 되돌리는 환불 실행이 아니라, 결제 제공자 처리가 시작되기 전의 내부 환불
              요청을 철회합니다. 철회 후 주문은 환불 요청 이전 상태로 복원됩니다.
            </p>
            <p className="text-xs text-gray-500">이미 실행된 카드·결제 환불은 취소하지 않으며, 최종 가능 여부는 서버가 결정합니다.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={closeDialog}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {isPending ? "철회 처리 중..." : "환불 요청 철회"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function successMessage(result: Extract<AdminCloseRefundRequestResult, { success: true }>): string {
  if (result.replayed) return "이미 동일한 철회 작업이 완료되어 있었습니다.";
  if (result.restoredOrderStatus === "PAID") return "환불 요청을 철회했습니다. 주문 상태: 결제 완료";
  return "환불 요청을 철회했습니다. 주문 상태: 부분 환불";
}
