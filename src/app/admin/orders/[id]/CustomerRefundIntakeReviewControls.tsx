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
import type { RefundLineInput } from "@/lib/payment/refund/lines";

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
  const [lineEconomicAmounts, setLineEconomicAmounts] = useState<Record<string, string>>(() => (
    Object.fromEntries(lineOptions.map((option) => [option.orderItemId, ""]))
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
      const selectedLines = buildSelectedLines(lineOptions, lineQuantities, lineEconomicAmounts);
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
            requireSelectedLines(lineOptions, lineQuantities, lineEconomicAmounts),
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
        setLineEconomicAmounts(Object.fromEntries(lineOptions.map((option) => [option.orderItemId, ""])));
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
          lineEconomicAmounts={lineEconomicAmounts}
          linesError={fieldErrors.lines}
          isPending={isPending}
          onAmountChange={setAmountMinor}
          onRationaleChange={setMerchantRationale}
          onLineQuantityChange={(orderItemId, value) => setLineQuantities((current) => ({
            ...current,
            [orderItemId]: value,
          }))}
          onLineEconomicAmountChange={(orderItemId, value) => setLineEconomicAmounts((current) => ({
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
  | { ok: true; lines: readonly RefundLineInput[] }
  | { ok: false; message: string };

function buildSelectedLines(
  options: readonly RefundLineSelectionOption[],
  quantities: Readonly<Record<string, string>>,
  economicAmounts: Readonly<Record<string, string>>,
): SelectedLinesResult {
  const lines: RefundLineInput[] = [];
  for (const option of options) {
    const selected = buildSelectedLine(
      option,
      quantities[option.orderItemId] ?? "0",
      economicAmounts[option.orderItemId] ?? "",
    );
    if (selected.kind === "invalid") return { ok: false, message: selected.message };
    if (selected.kind === "selected") lines.push(selected.line);
  }
  return lines.length > 0
    ? { ok: true, lines }
    : { ok: false, message: "한 개 이상의 상품 수량을 선택해 주세요." };
}

type SelectedLineResult =
  | { kind: "skipped" }
  | { kind: "selected"; line: RefundLineInput }
  | { kind: "invalid"; message: string };

function buildSelectedLine(
  option: RefundLineSelectionOption,
  rawQuantity: string,
  rawEconomicAmount: string,
): SelectedLineResult {
  const quantity = parseUnsignedInteger(rawQuantity);
  if (quantity === null) return { kind: "invalid", message: "상품별 수량은 0 이상의 정수로 입력해 주세요." };
  if (quantity === 0) return { kind: "skipped" };
  if (option.remainingQuantity === null || quantity > option.remainingQuantity) {
    return { kind: "invalid", message: "현재 귀속 가능한 상품 수량을 초과했습니다." };
  }
  if (!option.requiresEconomicAllocation) {
    return { kind: "selected", line: { orderItemId: option.orderItemId, quantity } };
  }
  const merchandiseRefundAmount = parseUnsignedInteger(rawEconomicAmount);
  if (merchandiseRefundAmount === null) {
    return { kind: "invalid", message: "쿠폰 주문의 선택 상품마다 상품 환불액을 입력해 주세요." };
  }
  return {
    kind: "selected",
    line: { orderItemId: option.orderItemId, quantity, merchandiseRefundAmount },
  };
}

function parseUnsignedInteger(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requireSelectedLines(
  options: readonly RefundLineSelectionOption[],
  quantities: Readonly<Record<string, string>>,
  economicAmounts: Readonly<Record<string, string>>,
): readonly RefundLineInput[] {
  const result = buildSelectedLines(options, quantities, economicAmounts);
  return result.ok ? result.lines : [];
}
