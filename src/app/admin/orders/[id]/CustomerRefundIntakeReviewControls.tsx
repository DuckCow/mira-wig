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
  type RefundLineSelectionOption,
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
  lineOptions: readonly RefundLineSelectionOption[];
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
  lineOptions,
}: Props) {
  const [adminRejectionReason, setAdminRejectionReason] = useState("");
  const [amountMinor, setAmountMinor] = useState("");
  const [merchantRationale, setMerchantRationale] = useState("");
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(() => (
    Object.fromEntries(lineOptions.map((option) => [option.orderItemId, "0"]))
  ));
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
    if (kind === "approve") {
      const selectedLines = buildSelectedLines(lineOptions, lineQuantities);
      if (!selectedLines.ok) {
        setFieldErrors({ lines: selectedLines.message });
        return;
      }
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
            requireSelectedLines(lineOptions, lineQuantities),
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
        setLineQuantities(Object.fromEntries(lineOptions.map((option) => [option.orderItemId, "0"])));
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
          lineOptions={lineOptions}
          lineQuantities={lineQuantities}
          linesError={fieldErrors.lines}
          isPending={isPending}
          onAmountChange={setAmountMinor}
          onRationaleChange={setMerchantRationale}
          onLineQuantityChange={(orderItemId, value) => setLineQuantities((current) => ({
            ...current,
            [orderItemId]: value,
          }))}
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

type SelectedLinesResult =
  | { ok: true; lines: readonly { orderItemId: string; quantity: number }[] }
  | { ok: false; message: string };

function buildSelectedLines(
  options: readonly RefundLineSelectionOption[],
  quantities: Readonly<Record<string, string>>,
): SelectedLinesResult {
  const lines: { orderItemId: string; quantity: number }[] = [];
  for (const option of options) {
    const raw = quantities[option.orderItemId] ?? "0";
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
      return { ok: false, message: "상품별 수량은 0 이상의 정수로 입력해 주세요." };
    }
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      return { ok: false, message: "상품별 수량을 확인해 주세요." };
    }
    if (quantity === 0) continue;
    if (option.remainingQuantity === null || quantity > option.remainingQuantity) {
      return { ok: false, message: "현재 귀속 가능한 상품 수량을 초과했습니다." };
    }
    lines.push({ orderItemId: option.orderItemId, quantity });
  }
  return lines.length > 0
    ? { ok: true, lines }
    : { ok: false, message: "한 개 이상의 상품 수량을 선택해 주세요." };
}

function requireSelectedLines(
  options: readonly RefundLineSelectionOption[],
  quantities: Readonly<Record<string, string>>,
): readonly { orderItemId: string; quantity: number }[] {
  const result = buildSelectedLines(options, quantities);
  return result.ok ? result.lines : [];
}
