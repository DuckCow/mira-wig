"use client";

import { CustomerRefundIntakeReasonCode } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";
import {
  submitCustomerRefundIntakeAction,
  withdrawCustomerRefundIntakeAction,
} from "@/app/actions/customer-refund-intake";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import {
  buildSubmitCustomerRefundIntakePayload,
  buildWithdrawCustomerRefundIntakePayload,
  customerRefundIntakeReasonOptions,
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
  locale: Locale;
}

type FieldErrors = Partial<Record<Exclude<CustomerRefundIntakeResultField, null>, string>>;

export function CustomerRefundIntakeControls({ orderId, mode, locale }: Props) {
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
    const validation = validateSubmission(reasonCode, detailCount, locale);
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
        applyPresentation(presentSubmitCustomerRefundIntakeResult(result, locale));
      } catch {
        applyPresentation(unexpectedCustomerRefundIntakeFailurePresentation(locale));
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
        applyPresentation(presentWithdrawCustomerRefundIntakeResult(result, locale));
      } catch {
        setWithdrawDialogOpen(false);
        applyPresentation(unexpectedCustomerRefundIntakeFailurePresentation(locale));
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
        locale={locale}
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
      locale={locale}
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
  locale: Locale;
}

function WithdrawControlsView({
  dialogOpen,
  isPending,
  panelError,
  closeDialog,
  openDialog,
  withdrawIntake,
  locale,
}: WithdrawControlsViewProps) {
  const messages = messagesFor(locale).order.intake;
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
          {messages.withdraw}
        </button>
      </div>
      <Dialog open={dialogOpen} onClose={closeDialog} title={messages.withdraw}>
        <form onSubmit={withdrawIntake} className="space-y-5">
          <div className="space-y-2 text-sm text-gray-700">
            <p>{messages.withdrawQuestion}</p>
            <p>{messages.orderUnchanged}</p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={closeDialog}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              {messages.cancel}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {isPending ? messages.withdrawing : messages.withdrawAction}
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
  locale: Locale;
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
  locale,
}: SubmitIntakeFormProps) {
  const messages = messagesFor(locale).order.intake;
  const reasonOptions = customerRefundIntakeReasonOptions(locale);
  return (
    <form onSubmit={submitIntake} className="mt-4 space-y-5">
      <fieldset
        disabled={isPending}
        aria-describedby={fieldErrors.reasonCode ? "customer-intake-reason-error" : undefined}
        aria-invalid={Boolean(fieldErrors.reasonCode)}
      >
        <legend className="text-sm font-medium text-gray-700">
          {messages.reason} <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {reasonOptions.map((option) => (
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
          {messages.detail} <span className="font-normal text-gray-500">({messages.optional})</span>
        </label>
        <div id="customer-intake-reason-detail-description" className="mt-1 space-y-1 text-xs text-gray-500">
          <p>{messages.plainText}</p>
          <p>{messages.noSecrets}</p>
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
        {isPending ? messages.submitting : messages.submitAction}
      </button>
    </form>
  );
}

function validateSubmission(
  reasonCode: CustomerRefundIntakeReasonCode | "",
  detailCount: number,
  locale: Locale,
): { valid: true; reasonCode: CustomerRefundIntakeReasonCode } | { valid: false; errors: FieldErrors } {
  const messages = messagesFor(locale).order.intake;
  if (!reasonCode) return { valid: false, errors: { reasonCode: messages.chooseReason } };
  if (detailCount > 500) {
    return { valid: false, errors: { reasonDetail: messages.detailTooLong } };
  }
  return { valid: true, reasonCode };
}

function panelErrorMessage(presentation: CustomerRefundIntakeResultPresentation): string | null {
  if (presentation.field || presentation.variant === "success") return null;
  return presentation.message;
}
