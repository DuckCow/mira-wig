"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { confirmPayment, initiatePayment, type PaymentActionResult } from "@/app/actions/payment";

interface PaymentMethodSectionProps {
  checkoutSessionId: string;
  mockPaymentEnabled: boolean;
}

type FailedPayment = Extract<PaymentActionResult, { success: false }>;
export type PaymentState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "inProgress"; message: string }
  | { kind: "outcomeUnknown"; message: string }
  | { kind: "remediationRequired"; message: string }
  | { kind: "checkingOrders"; message: string }
  | { kind: "success"; orderId?: string; paymentId: string }
  | { kind: "failed"; message: string };
type PaymentErrorCode = FailedPayment["errorCode"];

const MOCK_METHOD = "MOCK";
const MOCK_PROVIDER = "MOCK";
const ORDER_PROCESSING_MESSAGE = "결제가 처리 중입니다. 주문 내역에서 확인해 주세요.";
const PAYMENT_ERROR_MESSAGES: Partial<Record<PaymentErrorCode, string>> = {
  UNAUTHORIZED: "로그인이 필요합니다. 다시 로그인해 주세요.",
  SESSION_UNAVAILABLE: "주문서가 만료되었거나 현재 마켓과 맞지 않습니다. 주문서를 다시 생성해 주세요.",
  SESSION_NOT_USABLE: "주문서가 만료되었거나 현재 마켓과 맞지 않습니다. 주문서를 다시 생성해 주세요.",
  PROVIDER_INVALID: "현재 사용할 수 있는 결제 수단이 없습니다.",
  PROVIDER_MISMATCH: "현재 사용할 수 있는 결제 수단이 없습니다.",
  PROVIDER_UNAVAILABLE: "현재 사용할 수 있는 결제 수단이 없습니다.",
  PAYMENT_UNAVAILABLE: "결제 시도를 다시 시작해야 합니다. 주문서를 새로 생성해 주세요.",
  PROVIDER_RETRYABLE: "일시적인 처리 지연입니다. 잠시 후 주문서를 다시 생성해 주세요.",
  PAYMENT_FAILED: "결제가 승인되지 않았습니다.",
  PROVIDER_TERMINAL: "결제가 승인되지 않았습니다.",
};

export function PaymentMethodSection({
  checkoutSessionId,
  mockPaymentEnabled,
}: PaymentMethodSectionProps) {
  const [state, setState] = useState<PaymentState>({ kind: "idle" });
  const inFlightRef = useRef(false);
  const buttonDisabled = inFlightRef.current || state.kind === "processing" || isTerminalState(state);

  function handleMockPaymentClick() {
    void handleMockPayment();
  }

  async function handleMockPayment() {
    if (inFlightRef.current || isTerminalState(state)) return;
    inFlightRef.current = true;
    setState({ kind: "processing" });
    try {
      await runMockPayment(checkoutSessionId, setState);
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">결제 방법</h2>
      <div className="mt-4 space-y-3">
        <DisabledPaymentMethod title="카드 결제 (준비 중)" description="실제 결제 연동은 아직 비활성화되어 있습니다." />
        <DisabledPaymentMethod title="해외 결제 (준비 중)" description="미국·일본 결제 수단은 정책 확정 후 열립니다." />
        {mockPaymentEnabled && (
          <MockPaymentMethod
            disabled={buttonDisabled}
            state={state}
            onClick={handleMockPaymentClick}
          />
        )}
      </div>
      <PaymentStateMessage state={state} />
    </section>
  );
}

function DisabledPaymentMethod({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  );
}

function MockPaymentMethod({
  disabled,
  state,
  onClick,
}: {
  disabled: boolean;
  state: PaymentState;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-900 bg-white px-3 py-3">
      <p className="text-sm font-medium text-gray-900">테스트 결제 (MOCK)</p>
      <p className="mt-1 text-xs text-gray-500">
        개발 환경에서만 주문 생성까지 확인합니다. 실제 결제는 발생하지 않습니다.
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-busy={state.kind === "processing"}
        onClick={onClick}
        className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {mockButtonLabel(state)}
      </button>
    </div>
  );
}

function PaymentStateMessage({ state }: { state: PaymentState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "processing") {
    return <p className="mt-3 text-sm text-gray-600" aria-live="polite">테스트 결제 처리 중...</p>;
  }
  if (state.kind === "checkingOrders" || state.kind === "inProgress" || state.kind === "outcomeUnknown") {
    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700" aria-live="polite">
        <p>{state.message}</p>
        <Link href="/orders" className="font-medium underline underline-offset-2">
          주문 내역 보기
        </Link>
      </div>
    );
  }
  if (state.kind === "remediationRequired") {
    return <p className="mt-3 text-sm text-amber-700" role="alert">{state.message}</p>;
  }
  if (state.kind === "failed") {
    return <p className="mt-3 text-sm text-red-600" role="alert">{state.message}</p>;
  }
  return (
    <div className="mt-3 space-y-2 text-sm text-green-700" aria-live="polite">
      <p>테스트 주문이 생성되었습니다.</p>
      {state.orderId && (
        <Link href={`/orders/${state.orderId}`} className="font-medium underline underline-offset-2">
          주문 내역 보기
        </Link>
      )}
    </div>
  );
}

export async function runMockPayment(
  checkoutSessionId: string,
  setState: (state: PaymentState) => void,
) {
  const initiated = await initiatePayment(checkoutSessionId, { method: MOCK_METHOD });
  if (!handleInitiationResult(initiated, setState)) return;

  const confirmed = await confirmPayment(checkoutSessionId, { method: MOCK_METHOD });
  handleConfirmationResult(confirmed, setState);
}

function handleInitiationResult(
  initiated: PaymentActionResult,
  setState: (state: PaymentState) => void,
): boolean {
  if (initiated.kind === "IN_PROGRESS") {
    setState({ kind: "inProgress", message: "결제 준비가 처리 중입니다. 주문 내역에서 상태를 확인해 주세요." });
    return false;
  }
  if (initiated.kind === "OUTCOME_UNKNOWN") {
    setState({ kind: "outcomeUnknown", message: "결제 결과를 확인 중입니다. 자동으로 다시 결제하지 말고 주문 내역을 확인해 주세요." });
    return false;
  }
  if (initiated.kind === "REMEDIATION_REQUIRED") {
    setState({ kind: "remediationRequired", message: "이 주문서의 결제 문제를 확인 중입니다. 새 결제를 진행할 수 없습니다." });
    return false;
  }
  if (initiated.kind === "FAILED") {
    setState({ kind: "failed", message: paymentErrorMessage(initiated) });
    return false;
  }
  if (initiated.provider !== MOCK_PROVIDER) {
    setState({ kind: "failed", message: "현재 사용할 수 있는 테스트 결제 수단이 없습니다." });
    return false;
  }
  if (initiated.kind === "REDIRECT") {
    window.location.assign(initiated.redirectTo);
    return false;
  }
  return true;
}

function handleConfirmationResult(
  confirmed: PaymentActionResult,
  setState: (state: PaymentState) => void,
): void {
  if (confirmed.kind === "IN_PROGRESS") {
    setState({ kind: "inProgress", message: "결제가 처리 중입니다. 주문 내역에서 상태를 확인해 주세요." });
    return;
  }
  if (confirmed.kind === "OUTCOME_UNKNOWN") {
    setState({ kind: "outcomeUnknown", message: "결제 결과를 확인 중입니다. 자동으로 다시 결제하지 말고 주문 내역을 확인해 주세요." });
    return;
  }
  if (confirmed.kind === "REMEDIATION_REQUIRED") {
    setState({ kind: "remediationRequired", message: "이 주문서의 결제 문제를 확인 중입니다. 새 결제를 진행할 수 없습니다." });
    return;
  }
  if (confirmed.kind === "FAILED") {
    if (confirmed.errorCode === "COMPLETION_RETRYABLE") {
      setState({ kind: "checkingOrders", message: ORDER_PROCESSING_MESSAGE });
      return;
    }
    setState({ kind: "failed", message: paymentErrorMessage(confirmed) });
    return;
  }
  if (confirmed.kind === "REDIRECT") {
    setState({ kind: "failed", message: "결제 확인 결과가 예상한 형식과 다릅니다." });
    return;
  }
  setState({ kind: "success", orderId: confirmed.orderId, paymentId: confirmed.paymentId });
}

function mockButtonLabel(state: PaymentState): string {
  if (state.kind === "processing") return "테스트 결제 처리 중...";
  if (state.kind === "inProgress") return "결제 처리 상태 확인";
  if (state.kind === "outcomeUnknown") return "결제 결과 확인 중";
  if (state.kind === "remediationRequired") return "결제 문제 확인 중";
  if (state.kind === "checkingOrders") return "주문 내역에서 확인";
  if (state.kind === "success") return "테스트 주문 생성 완료";
  if (state.kind === "failed") return "주문서 다시 생성 후 재시도";
  return "테스트 결제 진행";
}

function isTerminalState(state: PaymentState): boolean {
  return state.kind === "success"
    || state.kind === "failed"
    || state.kind === "checkingOrders"
    || state.kind === "inProgress"
    || state.kind === "outcomeUnknown"
    || state.kind === "remediationRequired";
}

function paymentErrorMessage(result: FailedPayment): string {
  return PAYMENT_ERROR_MESSAGES[result.errorCode] ?? "결제를 완료할 수 없습니다. 주문서를 다시 생성해 주세요.";
}
