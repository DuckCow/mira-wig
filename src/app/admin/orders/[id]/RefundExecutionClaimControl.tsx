"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  claimRefundExecutionAction,
  type AdminClaimRefundExecutionErrorCode,
  type AdminClaimRefundExecutionResult,
} from "@/app/actions/admin/refund";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { getAdminRefundClaimErrorMessage } from "@/lib/admin-messages";
import type { RefundExecutionClaimTarget } from "./refund-claim-presentation";

const REFRESH_FAILURES = new Set<AdminClaimRefundExecutionErrorCode>([
  "FEATURE_DISABLED",
  "CAPABILITY_UNSUPPORTED",
  "NOT_CLAIMABLE",
  "CONFLICT",
  "NOT_FOUND",
]);

interface Props {
  orderId: string;
  target: RefundExecutionClaimTarget;
}

export function RefundExecutionClaimControl({ orderId, target }: Props) {
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
        const result = await claimRefundExecutionAction({
          orderId,
          refundAttemptId: target.refundAttemptId,
        });
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

  function handleResult(result: AdminClaimRefundExecutionResult) {
    setOpen(false);
    if (result.success) {
      showToast({ message: successMessage(result), variant: "success" });
      if (result.outcome === "ALREADY_CLAIMED") router.refresh();
      return;
    }
    showToast({
      message: getAdminRefundClaimErrorMessage(result.errorCode),
      variant: result.errorCode === "MANUAL_REVIEW_REQUIRED" ? "warning" : "error",
    });
    if (REFRESH_FAILURES.has(result.errorCode)) router.refresh();
  }

  return (
    <div className="flex justify-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
      >
        환불 실행 승인
      </button>
      <Dialog open={open} onClose={closeDialog} title="환불 실행 승인">
        <form onSubmit={handleSubmit} className="space-y-5">
          <dl className="grid gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
            <TargetInfo label="환불 요청" value={`#${target.shortAttemptId}`} />
            <TargetInfo label="금액" value={`${target.amount} (${target.currency})`} />
            <TargetInfo label="제공자" value={target.provider} />
            <TargetInfo label="모드" value={target.mode} />
          </dl>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              이 작업은 환불 실행을 승인하여 요청을 PROCESSING 상태로 바꾸고 READY 실행 명령 하나를 기록합니다.
              이 단계에서는 결제 제공자에게 환불을 보내지 않습니다.
            </p>
            <p>
              승인 후에는 실행 전 철회를 사용할 수 없습니다. 실제 전송은 별도로 활성화된 후속 절차에서만 진행되며,
              최종 가능 여부는 서버가 결정합니다.
            </p>
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
              {isPending ? "승인 기록 중..." : "환불 실행 승인"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function successMessage(result: Extract<AdminClaimRefundExecutionResult, { success: true }>): string {
  if (result.outcome === "CLAIMED") return "환불 실행 승인을 기록했습니다. 아직 환불은 전송되지 않았습니다.";
  if (result.outcome === "REPLAYED") return "동일한 환불 실행 승인이 이미 기록되어 있었습니다.";
  return "다른 관리자가 이미 환불 실행 승인을 기록했습니다. 최신 상태를 표시합니다.";
}

function TargetInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-gray-900">{value}</dd>
    </div>
  );
}
