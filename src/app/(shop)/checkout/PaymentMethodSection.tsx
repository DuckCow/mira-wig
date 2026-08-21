"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  confirmPayment,
  initiatePayment,
  type InitiatePaymentActionResult,
  type PaymentActionResult,
} from "@/app/actions/payment";
import type { Locale } from "@/lib/market/locale";
import type { MarketCode } from "@/lib/market/types";
import { messagesFor, type StorefrontMessages } from "@/lib/market/messages";
import { withStorefrontHandoff } from "@/lib/market/request-context";
import { createCheckoutEximbayBrowserConsumer } from "./eximbay-browser-consumer";

interface PaymentMethodSectionProps {
  checkoutSessionId: string;
  mockPaymentEnabled: boolean;
  locale: Locale;
  marketCode: MarketCode;
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

const MOCK_METHOD = "MOCK";
const MOCK_PROVIDER = "MOCK";
export function PaymentMethodSection({
  checkoutSessionId,
  mockPaymentEnabled,
  locale,
  marketCode,
}: PaymentMethodSectionProps) {
  const messages = messagesFor(locale).checkout.payment;
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
      await runMockPayment(checkoutSessionId, setState, locale);
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{messages.title}</h2>
      <div className="mt-4 space-y-3">
        <DisabledPaymentMethod title={messages.cardPending} description={messages.cardDisabled} />
        <DisabledPaymentMethod title={messages.overseasPending} description={messages.overseasDisabled} />
        {mockPaymentEnabled && (
          <MockPaymentMethod
            disabled={buttonDisabled}
            state={state}
            onClick={handleMockPaymentClick}
            messages={messages}
          />
        )}
      </div>
      <PaymentStateMessage state={state} messages={messages} locale={locale} marketCode={marketCode} />
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
  messages,
}: {
  disabled: boolean;
  state: PaymentState;
  onClick: () => void;
  messages: StorefrontMessages["checkout"]["payment"];
}) {
  return (
    <div className="rounded-lg border border-gray-900 bg-white px-3 py-3">
      <p className="text-sm font-medium text-gray-900">{messages.mockTitle}</p>
      <p className="mt-1 text-xs text-gray-500">
        {messages.mockDescription}
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-busy={state.kind === "processing"}
        onClick={onClick}
        className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {mockButtonLabel(state, messages)}
      </button>
    </div>
  );
}

function PaymentStateMessage({ state, messages, locale, marketCode }: { state: PaymentState; messages: StorefrontMessages["checkout"]["payment"]; locale: Locale; marketCode: MarketCode }) {
  if (state.kind === "idle") return null;
  if (state.kind === "processing") {
    return <p className="mt-3 text-sm text-gray-600" aria-live="polite">{messages.processing}</p>;
  }
  if (state.kind === "checkingOrders" || state.kind === "inProgress" || state.kind === "outcomeUnknown") {
    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700" aria-live="polite">
        <p>{state.message}</p>
        <Link href={withStorefrontHandoff("/orders", { marketCode, locale })} className="font-medium underline underline-offset-2">
          {messages.orders}
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
      <p>{messages.success}</p>
      {state.orderId && (
        <Link href={withStorefrontHandoff(`/orders/${encodeURIComponent(state.orderId)}`, { marketCode, locale })} className="font-medium underline underline-offset-2">
          {messages.orders}
        </Link>
      )}
    </div>
  );
}

export async function runMockPayment(
  checkoutSessionId: string,
  setState: (state: PaymentState) => void,
  locale: Locale = "ko",
) {
  const messages = messagesFor(locale).checkout.payment;
  const initiated = await initiatePayment(checkoutSessionId, { method: MOCK_METHOD });
  if (!await handleInitiationExecution(initiated, setState, messages)) return;

  const confirmed = await confirmPayment(checkoutSessionId, { method: MOCK_METHOD });
  handleConfirmationResult(confirmed, setState, messages);
}

async function handleInitiationExecution(
  execution: InitiatePaymentActionResult,
  setState: (state: PaymentState) => void,
  messages: StorefrontMessages["checkout"]["payment"],
): Promise<boolean> {
  if (execution.channel === "FRESH_EXIMBAY_READY") {
    await delegateFreshEximbayHandoff(execution, setState, messages);
    return false;
  }
  return handleInitiationResult(execution.durable, setState, messages);
}

async function delegateFreshEximbayHandoff(
  execution: Extract<InitiatePaymentActionResult, { channel: "FRESH_EXIMBAY_READY" }>,
  setState: (state: PaymentState) => void,
  messages: StorefrontMessages["checkout"]["payment"],
): Promise<void> {
  const created = createCheckoutEximbayBrowserConsumer(execution);
  if (!created.ok) {
    setState({ kind: "failed", message: messages.unavailableMock });
    return;
  }
  const result = await created.consumer.invokeFromUserAction();
  created.consumer.dispose();
  if (result.kind === "BROWSER_HANDOFF_FAILED") {
    setState({ kind: "failed", message: messages.unavailableMock });
  }
}

function handleInitiationResult(
  initiated: PaymentActionResult,
  setState: (state: PaymentState) => void,
  messages: StorefrontMessages["checkout"]["payment"],
): boolean {
  if (initiated.kind === "IN_PROGRESS") {
    setState({ kind: "inProgress", message: messages.initiationInProgress });
    return false;
  }
  if (initiated.kind === "OUTCOME_UNKNOWN") {
    setState({ kind: "outcomeUnknown", message: messages.outcomeUnknown });
    return false;
  }
  if (initiated.kind === "REMEDIATION_REQUIRED") {
    setState({ kind: "remediationRequired", message: messages.remediationRequired });
    return false;
  }
  if (initiated.kind === "FAILED") {
    setState({ kind: "failed", message: paymentErrorMessage(initiated, messages) });
    return false;
  }
  if (initiated.provider !== MOCK_PROVIDER) {
    setState({ kind: "failed", message: messages.unavailableMock });
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
  messages: StorefrontMessages["checkout"]["payment"],
): void {
  if (confirmed.kind === "IN_PROGRESS") {
    setState({ kind: "inProgress", message: messages.orderProcessing });
    return;
  }
  if (confirmed.kind === "OUTCOME_UNKNOWN") {
    setState({ kind: "outcomeUnknown", message: messages.outcomeUnknown });
    return;
  }
  if (confirmed.kind === "REMEDIATION_REQUIRED") {
    setState({ kind: "remediationRequired", message: messages.remediationRequired });
    return;
  }
  if (confirmed.kind === "FAILED") {
    if (confirmed.errorCode === "COMPLETION_RETRYABLE") {
      setState({ kind: "checkingOrders", message: messages.orderProcessing });
      return;
    }
    setState({ kind: "failed", message: paymentErrorMessage(confirmed, messages) });
    return;
  }
  if (confirmed.kind === "REDIRECT") {
    setState({ kind: "failed", message: messages.confirmationUnexpected });
    return;
  }
  setState({ kind: "success", orderId: confirmed.orderId, paymentId: confirmed.paymentId });
}

function mockButtonLabel(state: PaymentState, messages: StorefrontMessages["checkout"]["payment"]): string {
  if (state.kind === "processing") return messages.processing;
  if (state.kind === "inProgress") return messages.checkingState;
  if (state.kind === "outcomeUnknown") return messages.checkingOutcome;
  if (state.kind === "remediationRequired") return messages.checkingProblem;
  if (state.kind === "checkingOrders") return messages.checkingOrders;
  if (state.kind === "success") return messages.completed;
  if (state.kind === "failed") return messages.retry;
  return messages.start;
}

function isTerminalState(state: PaymentState): boolean {
  return state.kind === "success"
    || state.kind === "failed"
    || state.kind === "checkingOrders"
    || state.kind === "inProgress"
    || state.kind === "outcomeUnknown"
    || state.kind === "remediationRequired";
}

function paymentErrorMessage(result: FailedPayment, messages: StorefrontMessages["checkout"]["payment"]): string {
  return messages.errors[result.errorCode] ?? messages.fallbackError;
}
