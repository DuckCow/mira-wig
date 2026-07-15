"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveCustomerRefundIntakeAction,
  rejectCustomerRefundIntakeAction,
} from "@/app/actions/admin/customer-refund-intake";
import { useToast } from "@/components/ui/Toast";
import {
  ApproveReviewNotice,
  ApproveReviewForm,
  RejectReviewForm,
  ReviewConfirmationDialogs,
  ReviewPanelIntroduction,
} from "./CustomerRefundIntakeReviewForms";
import {
  buildApproveCustomerRefundIntakePayload,
  buildRejectCustomerRefundIntakePayload,
  canRenderCustomerRefundIntakeApproveControls,
  customerRefundIntakeApproveNotice,
  presentApproveCustomerRefundIntakeResult,
  presentRejectCustomerRefundIntakeResult,
  unexpectedReviewFailurePresentation,
  type CustomerRefundIntakeApproveState,
  type ReviewResultField,
  type ReviewResultPresentation,
} from "./customer-intake-presentation";

interface Props {
  orderId: string;
  intakeId: string;
  ownershipConsistent: boolean;
  approveState: CustomerRefundIntakeApproveState;
  currency: string;
  remainingRequestableAmount: string;
}

type DialogKind = "reject" | "approve" | null;
type FieldErrors = Partial<Record<Exclude<ReviewResultField, null>, string>>;

export function CustomerRefundIntakeReviewControls({
  orderId,
  intakeId,
  ownershipConsistent,
  approveState,
  currency,
  remainingRequestableAmount,
}: Props) {
  const [adminRejectionReason, setAdminRejectionReason] = useState("");
  const [amountMinor, setAmountMinor] = useState("");
  const [merchantRationale, setMerchantRationale] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dialogKind, setDialogKind] = useState<DialogKind>(null);
  const [pendingOperation, setPendingOperation] = useState<Exclude<DialogKind, null> | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const router = useRouter();
  const { showToast } = useToast();

  const canApprove = canRenderCustomerRefundIntakeApproveControls(
    ownershipConsistent,
    approveState,
  );
  const approveNotice = customerRefundIntakeApproveNotice(ownershipConsistent, approveState);
  const rejectionCount = Array.from(adminRejectionReason).length;
  const rationaleCount = Array.from(merchantRationale).length;

  function closeDialog() {
    if (!isPending) setDialogKind(null);
  }

  function requestConfirmation(
    kind: Exclude<DialogKind, null>,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const tooLong = kind === "reject" ? rejectionCount > 500 : rationaleCount > 500;
    if (tooLong) {
      setFieldErrors(kind === "reject"
        ? { rejectionReason: "거절 사유는 500자 이내로 입력해 주세요." }
        : { merchantRationale: "환불 사유는 500자 이내로 입력해 주세요." });
      return;
    }
    setFieldErrors({});
    setDialogKind(kind);
  }

  function submitReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPendingOperation("reject");
    startTransition(async () => {
      try {
        const result = await rejectCustomerRefundIntakeAction(
          buildRejectCustomerRefundIntakePayload(orderId, intakeId, adminRejectionReason),
        );
        applyPresentation(presentRejectCustomerRefundIntakeResult(result), "reject");
      } catch {
        applyPresentation(unexpectedReviewFailurePresentation(), "reject");
      } finally {
        submittingRef.current = false;
        setPendingOperation(null);
      }
    });
  }

  function submitApprove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPendingOperation("approve");
    startTransition(async () => {
      try {
        const result = await approveCustomerRefundIntakeAction(
          buildApproveCustomerRefundIntakePayload(
            orderId,
            intakeId,
            amountMinor,
            merchantRationale,
          ),
        );
        applyPresentation(presentApproveCustomerRefundIntakeResult(result), "approve");
      } catch {
        applyPresentation(unexpectedReviewFailurePresentation(), "approve");
      } finally {
        submittingRef.current = false;
        setPendingOperation(null);
      }
    });
  }

  function applyPresentation(
    presentation: ReviewResultPresentation,
    operation: Exclude<DialogKind, null>,
  ) {
    setDialogKind(null);
    setFieldErrors(presentation.field ? { [presentation.field]: presentation.message } : {});
    if (presentation.clearInputs) {
      if (operation === "reject") setAdminRejectionReason("");
      if (operation === "approve") {
        setAmountMinor("");
        setMerchantRationale("");
      }
    }
    showToast({ message: presentation.message, variant: presentation.variant });
    if (presentation.refresh) router.refresh();
  }

  return (
    <div className="mt-5 space-y-6 border-t border-gray-200 pt-5">
      <ReviewPanelIntroduction />

      <RejectReviewForm
        intakeId={intakeId}
        value={adminRejectionReason}
        count={rejectionCount}
        error={fieldErrors.rejectionReason}
        isPending={isPending}
        onChange={setAdminRejectionReason}
        onSubmit={(event) => requestConfirmation("reject", event)}
      />

      {approveNotice ? (
        <ApproveReviewNotice
          message={approveNotice}
          misconfigured={approveState === "misconfigured" && ownershipConsistent}
        />
      ) : canApprove ? (
        <ApproveReviewForm
          intakeId={intakeId}
          currency={currency}
          remainingRequestableAmount={remainingRequestableAmount}
          amountMinor={amountMinor}
          merchantRationale={merchantRationale}
          rationaleCount={rationaleCount}
          amountError={fieldErrors.amount}
          rationaleError={fieldErrors.merchantRationale}
          isPending={isPending}
          onAmountChange={setAmountMinor}
          onRationaleChange={setMerchantRationale}
          onSubmit={(event) => requestConfirmation("approve", event)}
        />
      ) : null}

      <ReviewConfirmationDialogs
        dialogKind={dialogKind}
        isPending={isPending}
        pendingOperation={pendingOperation}
        amountMinor={amountMinor}
        currency={currency}
        onClose={closeDialog}
        onReject={submitReject}
        onApprove={submitApprove}
      />
    </div>
  );
}
