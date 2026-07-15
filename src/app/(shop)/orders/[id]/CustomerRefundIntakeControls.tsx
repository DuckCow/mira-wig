"use client";

import { CustomerRefundIntakeReasonCode } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  submitCustomerRefundIntakeAction,
  withdrawCustomerRefundIntakeAction,
} from "@/app/actions/customer-refund-intake";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import {
  buildSubmitCustomerRefundIntakePayload,
  buildWithdrawCustomerRefundIntakePayload,
  CUSTOMER_REFUND_INTAKE_REASON_OPTIONS,
  isCustomerRefundIntakeReasonCode,
  presentSubmitCustomerRefundIntakeResult,
  presentWithdrawCustomerRefundIntakeResult,
  unexpectedCustomerRefundIntakeFailurePresentation,
  type CustomerRefundIntakeResultField,
  type CustomerRefundIntakeResultPresentation,
} from "./customer-intake-presentation";

interface Props {
  orderId: string;
  mode: "submit" | "withdraw";
}

type FieldErrors = Partial<Record<Exclude<CustomerRefundIntakeResultField, null>, string>>;

export function CustomerRefundIntakeControls({ orderId, mode }: Props) {
  const [reasonCode, setReasonCode] = useState<CustomerRefundIntakeReasonCode | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [panelError, setPanelError] = useState<string | null>(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const router = useRouter();
  const { showToast } = useToast();
  const detailCount = Array.from(reasonDetail).length;

  function closeWithdrawDialog() {
    if (!isPending) setWithdrawDialogOpen(false);
  }

  function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "submit" || submittingRef.current) return;
    const validation = validateSubmission(reasonCode, detailCount);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setPanelError(null);
      return;
    }

    submittingRef.current = true;
    setFieldErrors({});
    setPanelError(null);
    startTransition(async () => {
      try {
        const result = await submitCustomerRefundIntakeAction(
          buildSubmitCustomerRefundIntakePayload(orderId, validation.reasonCode, reasonDetail),
        );
        applyPresentation(presentSubmitCustomerRefundIntakeResult(result));
      } catch {
        applyPresentation(unexpectedCustomerRefundIntakeFailurePresentation());
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function withdrawIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "withdraw" || submittingRef.current) return;
    submittingRef.current = true;
    setPanelError(null);
    startTransition(async () => {
      try {
        const result = await withdrawCustomerRefundIntakeAction(
          buildWithdrawCustomerRefundIntakePayload(orderId),
        );
        setWithdrawDialogOpen(false);
        applyPresentation(presentWithdrawCustomerRefundIntakeResult(result));
      } catch {
        setWithdrawDialogOpen(false);
        applyPresentation(unexpectedCustomerRefundIntakeFailurePresentation());
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function applyPresentation(presentation: CustomerRefundIntakeResultPresentation) {
    setFieldErrors(presentation.field ? { [presentation.field]: presentation.message } : {});
    setPanelError(panelErrorMessage(presentation));
    showToast({ message: presentation.message, variant: presentation.variant });
    if (presentation.clearInputs) {
      setReasonCode("");
      setReasonDetail("");
    }
    if (presentation.refresh) router.refresh();
  }

  if (mode === "withdraw") {
    return (
      <WithdrawControlsView
        dialogOpen={withdrawDialogOpen}
        isPending={isPending}
        panelError={panelError}
        closeDialog={closeWithdrawDialog}
        openDialog={() => setWithdrawDialogOpen(true)}
        withdrawIntake={withdrawIntake}
      />
    );
  }

  return (
    <SubmitIntakeForm
      detailCount={detailCount}
      fieldErrors={fieldErrors}
      isPending={isPending}
      panelError={panelError}
      reasonCode={reasonCode}
      reasonDetail={reasonDetail}
      setFieldErrors={setFieldErrors}
      setReasonCode={setReasonCode}
      setReasonDetail={setReasonDetail}
      submitIntake={submitIntake}
    />
  );
}

interface WithdrawControlsViewProps {
  dialogOpen: boolean;
  isPending: boolean;
  panelError: string | null;
  closeDialog: () => void;
  openDialog: () => void;
  withdrawIntake: (event: FormEvent<HTMLFormElement>) => void;
}

function WithdrawControlsView({
  dialogOpen,
  isPending,
  panelError,
  closeDialog,
  openDialog,
  withdrawIntake,
}: WithdrawControlsViewProps) {
  return (
    <div className="space-y-3 border-t border-gray-200 pt-4">
      {panelError ? <p role="alert" className="text-sm text-red-700">{panelError}</p> : null}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={isPending}
          onClick={openDialog}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          환불 검토 요청 철회
        </button>
      </div>
      <Dialog open={dialogOpen} onClose={closeDialog} title="환불 검토 요청 철회">
        <form onSubmit={withdrawIntake} className="space-y-5">
          <div className="space-y-2 text-sm text-gray-700">
            <p>환불 검토 요청을 철회하시겠습니까?</p>
            <p>주문과 결제는 그대로 유지됩니다.</p>
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
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {isPending ? "철회 처리 중..." : "요청 철회"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

interface SubmitIntakeFormProps {
  detailCount: number;
  fieldErrors: FieldErrors;
  isPending: boolean;
  panelError: string | null;
  reasonCode: CustomerRefundIntakeReasonCode | "";
  reasonDetail: string;
  setFieldErrors: Dispatch<SetStateAction<FieldErrors>>;
  setReasonCode: Dispatch<SetStateAction<CustomerRefundIntakeReasonCode | "">>;
  setReasonDetail: Dispatch<SetStateAction<string>>;
  submitIntake: (event: FormEvent<HTMLFormElement>) => void;
}

function SubmitIntakeForm({
  detailCount,
  fieldErrors,
  isPending,
  panelError,
  reasonCode,
  reasonDetail,
  setFieldErrors,
  setReasonCode,
  setReasonDetail,
  submitIntake,
}: SubmitIntakeFormProps) {
  return (
    <form onSubmit={submitIntake} className="mt-4 space-y-5">
      <fieldset
        disabled={isPending}
        aria-describedby={fieldErrors.reasonCode ? "customer-intake-reason-error" : undefined}
        aria-invalid={Boolean(fieldErrors.reasonCode)}
      >
        <legend className="text-sm font-medium text-gray-700">
          요청 사유 <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CUSTOMER_REFUND_INTAKE_REASON_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="customer-refund-intake-reason"
                value={option.value}
                checked={reasonCode === option.value}
                required
                onChange={(event) => {
                  if (isCustomerRefundIntakeReasonCode(event.currentTarget.value)) {
                    setReasonCode(event.currentTarget.value);
                    setFieldErrors((current) => ({ ...current, reasonCode: undefined }));
                  }
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p id="customer-intake-reason-error" className="mt-1 text-xs text-red-700">
          {fieldErrors.reasonCode ?? ""}
        </p>
      </fieldset>

      <div>
        <label htmlFor="customer-intake-reason-detail" className="block text-sm font-medium text-gray-700">
          요청 내용 <span className="font-normal text-gray-500">(선택)</span>
        </label>
        <div id="customer-intake-reason-detail-description" className="mt-1 space-y-1 text-xs text-gray-500">
          <p>일반 텍스트와 줄바꿈만 입력할 수 있습니다.</p>
          <p>카드번호·계좌번호·비밀번호 등 결제/인증 정보는 입력하지 마세요.</p>
        </div>
        <textarea
          id="customer-intake-reason-detail"
          disabled={isPending}
          rows={4}
          value={reasonDetail}
          onChange={(event) => {
            setReasonDetail(event.currentTarget.value);
            setFieldErrors((current) => ({ ...current, reasonDetail: undefined }));
          }}
          aria-describedby={`customer-intake-reason-detail-description${fieldErrors.reasonDetail ? " customer-intake-reason-detail-error" : ""}`}
          aria-invalid={Boolean(fieldErrors.reasonDetail)}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 flex justify-between gap-3 text-xs">
          <span id="customer-intake-reason-detail-error" className="text-red-700">
            {fieldErrors.reasonDetail ?? ""}
          </span>
          <span className={detailCount > 500 ? "text-red-700" : "text-gray-500"}>
            {detailCount} / 500
          </span>
        </div>
      </div>

      {panelError ? <p role="alert" className="text-sm text-red-700">{panelError}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
      >
        {isPending ? "요청 접수 중..." : "환불 검토 요청 접수"}
      </button>
    </form>
  );
}

function validateSubmission(
  reasonCode: CustomerRefundIntakeReasonCode | "",
  detailCount: number,
): { valid: true; reasonCode: CustomerRefundIntakeReasonCode } | { valid: false; errors: FieldErrors } {
  if (!reasonCode) return { valid: false, errors: { reasonCode: "요청 사유를 선택해주세요." } };
  if (detailCount > 500) {
    return { valid: false, errors: { reasonDetail: "요청 내용은 500자 이내로 입력해주세요." } };
  }
  return { valid: true, reasonCode };
}

function panelErrorMessage(presentation: CustomerRefundIntakeResultPresentation): string | null {
  if (presentation.field || presentation.variant === "success") return null;
  return presentation.message;
}
