import type { FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export function ReviewPanelIntroduction() {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900">활성 요청 검토</h4>
      <p className="mt-1 text-xs text-gray-500">
        표시 정보는 검토용이며 최종 상태와 환불 가능 금액은 각 작업의 서버 트랜잭션이 다시 확인합니다.
      </p>
    </div>
  );
}

export function ApproveReviewNotice({
  message,
  misconfigured,
}: {
  message: string;
  misconfigured: boolean;
}) {
  return (
    <p className={`border-l-2 px-3 py-2 text-sm ${misconfigured
      ? "border-red-500 bg-red-50 text-red-800"
      : "border-amber-500 bg-amber-50 text-amber-900"}`}>
      {message}
    </p>
  );
}

export function RejectReviewForm({
  intakeId,
  value,
  count,
  error,
  isPending,
  onChange,
  onSubmit,
}: {
  intakeId: string;
  value: string;
  count: number;
  error: string | undefined;
  isPending: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={`intake-rejection-${intakeId}`} className="block text-sm font-medium text-gray-700">
          관리자 거절 사유 <span aria-hidden="true">*</span>
        </label>
        <p id={`intake-rejection-description-${intakeId}`} className="mt-1 text-xs text-gray-500">
          관리자 기록으로만 저장됩니다. 고객에게는 온라인 진행 불가 안내만 표시됩니다.
        </p>
        <textarea
          id={`intake-rejection-${intakeId}`}
          required
          disabled={isPending}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`intake-rejection-description-${intakeId}${error ? ` intake-rejection-error-${intakeId}` : ""}`}
          aria-invalid={Boolean(error)}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 flex justify-between gap-3 text-xs">
          <span id={`intake-rejection-error-${intakeId}`} className="text-red-700">{error ?? ""}</span>
          <span className={count > 500 ? "text-red-700" : "text-gray-500"}>{count} / 500</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
      >
        거절 검토
      </button>
    </form>
  );
}

export function ApproveReviewForm({
  intakeId,
  currency,
  remainingRequestableAmount,
  amountMinor,
  merchantRationale,
  rationaleCount,
  amountError,
  rationaleError,
  isPending,
  onAmountChange,
  onRationaleChange,
  onSubmit,
}: {
  intakeId: string;
  currency: string;
  remainingRequestableAmount: string;
  amountMinor: string;
  merchantRationale: string;
  rationaleCount: number;
  amountError: string | undefined;
  rationaleError: string | undefined;
  isPending: boolean;
  onAmountChange: (value: string) => void;
  onRationaleChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`intake-amount-${intakeId}`} className="block text-sm font-medium text-gray-700">
          승인 금액 ({currency} 최소 단위) <span aria-hidden="true">*</span>
        </label>
        <p id={`intake-amount-description-${intakeId}`} className="mt-1 text-xs text-gray-500">
          KRW/JPY는 입력 정수 자체가 최소 화폐 단위이고, USD 입력 정수는 센트입니다.
          참고: 표시 시점 기준 요청 가능 금액은 {remainingRequestableAmount}입니다.
          실제 승인 가능 여부와 금액은 승인 시점에 서버가 다시 검증합니다.
        </p>
        <input
          id={`intake-amount-${intakeId}`}
          required
          disabled={isPending}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amountMinor}
          onChange={(event) => onAmountChange(event.target.value)}
          aria-describedby={`intake-amount-description-${intakeId}${amountError ? ` intake-amount-error-${intakeId}` : ""}`}
          aria-invalid={Boolean(amountError)}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <p id={`intake-amount-error-${intakeId}`} className="mt-1 text-xs text-red-700">
          {amountError ?? ""}
        </p>
      </div>
      <div>
        <label htmlFor={`intake-rationale-${intakeId}`} className="block text-sm font-medium text-gray-700">
          관리자 환불 사유 <span aria-hidden="true">*</span>
        </label>
        <p id={`intake-rationale-description-${intakeId}`} className="mt-1 text-xs text-gray-500">
          고객 작성 사유와 별개인 관리자 전용 환불 요청 근거입니다.
        </p>
        <textarea
          id={`intake-rationale-${intakeId}`}
          required
          disabled={isPending}
          rows={3}
          value={merchantRationale}
          onChange={(event) => onRationaleChange(event.target.value)}
          aria-describedby={`intake-rationale-description-${intakeId}${rationaleError ? ` intake-rationale-error-${intakeId}` : ""}`}
          aria-invalid={Boolean(rationaleError)}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 flex justify-between gap-3 text-xs">
          <span id={`intake-rationale-error-${intakeId}`} className="text-red-700">{rationaleError ?? ""}</span>
          <span className={rationaleCount > 500 ? "text-red-700" : "text-gray-500"}>
            {rationaleCount} / 500
          </span>
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
      >
        승인 검토
      </button>
    </form>
  );
}

export function ReviewConfirmationDialogs({
  dialogKind,
  isPending,
  pendingOperation,
  amountMinor,
  currency,
  onClose,
  onReject,
  onApprove,
}: {
  dialogKind: "reject" | "approve" | null;
  isPending: boolean;
  pendingOperation: "reject" | "approve" | null;
  amountMinor: string;
  currency: string;
  onClose: () => void;
  onReject: (event: FormEvent<HTMLFormElement>) => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <Dialog open={dialogKind === "reject"} onClose={onClose} title="환불 검토 요청 거절">
        <form onSubmit={onReject} className="space-y-5">
          <p className="text-sm text-gray-700">
            이 요청을 거절하시겠습니까? 거절 사유는 관리자 기록으로 저장되며, 고객에게는 진행 불가 안내만 표시됩니다.
          </p>
          <ConfirmationButtons
            isPending={isPending && pendingOperation === "reject"}
            onCancel={onClose}
            pendingLabel="거절 처리 중..."
            submitLabel="요청 거절"
            destructive
          />
        </form>
      </Dialog>
      <Dialog open={dialogKind === "approve"} onClose={onClose} title="환불 검토 요청 승인">
        <form onSubmit={onApprove} className="space-y-5">
          <div className="space-y-2 text-sm text-gray-700">
            <p className="font-medium">승인 금액: {amountMinor || "—"} ({currency} 최소 단위)</p>
            <p>
              이 작업은 환불을 완료하는 것이 아니라, 입력 금액에 대한 RefundAttempt.REQUESTED 환불 요청을 생성합니다.
              실제 환불 처리는 별도로 실행되며 성공이 보장되지 않습니다.
            </p>
          </div>
          <ConfirmationButtons
            isPending={isPending && pendingOperation === "approve"}
            onCancel={onClose}
            pendingLabel="승인 처리 중..."
            submitLabel="환불 요청 생성"
          />
        </form>
      </Dialog>
    </>
  );
}

function ConfirmationButtons({
  isPending,
  onCancel,
  pendingLabel,
  submitLabel,
  destructive = false,
}: {
  isPending: boolean;
  onCancel: () => void;
  pendingLabel: string;
  submitLabel: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" disabled={isPending} onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">
        취소
      </button>
      <button
        type="submit"
        disabled={isPending}
        className={`${destructive ? "bg-red-700 hover:bg-red-600" : "bg-gray-900 hover:bg-gray-700"} px-4 py-2 text-sm font-medium text-white disabled:opacity-40`}
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
