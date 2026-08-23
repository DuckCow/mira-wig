import { randomUUID } from "crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadSdk = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/payment", () => ({
  initiatePayment: vi.fn(),
  confirmPayment: vi.fn(),
}));
vi.mock("@/lib/payment/eximbay/sdk-loader", () => ({ loadEximbaySdkV2: loadSdk }));

import { confirmPayment, initiatePayment } from "@/app/actions/payment";
import type {
  InitiatePaymentActionResult,
  PaymentActionResult,
} from "@/app/actions/payment";
import {
  PaymentMethodSection,
  runEximbayCardPayment,
  runMockPayment,
  runPaymentOnce,
  type PaymentState,
} from "./PaymentMethodSection";

const mockInitiatePayment = vi.mocked(initiatePayment);
const mockConfirmPayment = vi.mocked(confirmPayment);

describe("checkout payment result handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSdk.mockReset();
  });

  it.each([
    ["IN_PROGRESS", "inProgress"],
    ["OUTCOME_UNKNOWN", "outcomeUnknown"],
    ["REMEDIATION_REQUIRED", "remediationRequired"],
  ] as const)("does not confirm an initiation result in %s", async (kind, expectedState) => {
    mockInitiatePayment.mockResolvedValue(durableInitiation({
      kind,
      success: false,
      errorCode: kind === "IN_PROGRESS"
        ? "ATTEMPT_IN_PROGRESS"
        : kind === "OUTCOME_UNKNOWN"
          ? "ATTEMPT_OUTCOME_UNKNOWN"
          : "SESSION_REMEDIATION_REQUIRED",
      error: "raw-provider-payload-must-not-render",
      retryable: false,
    }));
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(states.at(-1)?.kind).toBe(expectedState);
    expect(JSON.stringify(states)).not.toContain("raw-provider-payload-must-not-render");
    expectProviderNamesAbsent(states);
  });

  it("confirms only READY and completes with the confirmation's persisted identity", async () => {
    mockInitiatePayment.mockResolvedValue(durableInitiation({
      kind: "READY",
      success: true,
      paymentId: "payment-ready",
      provider: PaymentProvider.MOCK,
    }));
    mockConfirmPayment.mockResolvedValue({
      kind: "READY",
      success: true,
      orderId: "order-ready",
      paymentId: "payment-ready",
      provider: PaymentProvider.MOCK,
    });
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).toHaveBeenCalledTimes(1);
    expect(mockConfirmPayment).toHaveBeenCalledWith("checkout-session", { method: "MOCK" });
    expect(loadSdk).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      kind: "success",
      orderId: "order-ready",
      paymentId: "payment-ready",
    });
  });

  it("delegates an admitted fresh Eximbay CARD handoff through the checkout-owned consumer", async () => {
    const requestPay = vi.fn();
    loadSdk.mockResolvedValue(requestPay);
    const fresh = freshEximbayExecution();
    mockInitiatePayment.mockResolvedValue(fresh);
    const states: PaymentState[] = [];

    await runEximbayCardPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(mockInitiatePayment).toHaveBeenCalledWith("checkout-session", { method: "CARD" });
    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(loadSdk).toHaveBeenCalledWith("SANDBOX");
    expect(requestPay).toHaveBeenCalledTimes(1);
    expect(requestPay).toHaveBeenCalledWith(fresh.transientHandoff.payload);
    expect(states.at(-1)).toEqual({
      kind: "inProgress",
      message: "결제가 처리 중입니다. 주문 내역에서 확인해 주세요.",
    });
  });

  it("rejects a fresh Eximbay handoff whose Payment identity does not match", async () => {
    const mismatched = freshEximbayExecution("other-payment-id");
    mockInitiatePayment.mockResolvedValue(mismatched);
    const states: PaymentState[] = [];

    await runEximbayCardPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      kind: "failed",
      message: "현재 사용할 수 있는 카드 결제 수단이 없습니다.",
    });
    expect(JSON.stringify(states)).not.toMatch(/SYNTHETIC_UI|synthetic-ui|EXIMBAY/u);
  });

  it("does not propagate a hostile initiation message into UI state or confirmation", async () => {
    const sentinel = `initiation-ui-secret-${randomUUID()}?next=/attacker`;
    mockInitiatePayment.mockResolvedValue(durableInitiation({
      kind: "FAILED",
      success: false,
      errorCode: "PAYMENT_FAILED",
      error: sentinel,
      retryable: false,
    }));
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    const serialized = JSON.stringify(states);
    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ kind: "failed", message: "결제가 승인되지 않았습니다." });
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("next=");
    expectProviderNamesAbsent(states);
  });

  it("does not propagate a hostile completion message into UI state or navigation material", async () => {
    const sentinel = `completion-ui-secret-${randomUUID()}&redirect=https://attacker.invalid`;
    mockInitiatePayment.mockResolvedValue(durableInitiation({
      kind: "READY",
      success: true,
      paymentId: "payment-ready",
      provider: PaymentProvider.MOCK,
    }));
    mockConfirmPayment.mockResolvedValue({
      kind: "FAILED",
      success: false,
      errorCode: "COMPLETION_RETRYABLE",
      error: sentinel,
      retryable: true,
    });
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    const serialized = JSON.stringify(states);
    expect(mockConfirmPayment).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({
      kind: "checkingOrders",
      message: "결제가 처리 중입니다. 주문 내역에서 확인해 주세요.",
    });
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("attacker.invalid");
    expectProviderNamesAbsent(states);
  });

  it.each([
    "TOSS internal error",
    "retry via PayPal",
    "mock-provider failure",
    "eximbay_reference",
  ])("removes embedded provider provenance from failed UI state: %s", async (error) => {
    mockInitiatePayment.mockResolvedValue(durableInitiation({
      kind: "FAILED",
      success: false,
      errorCode: "PAYMENT_FAILED",
      error,
      retryable: false,
    }));
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    expect(states.at(-1)).toEqual({
      kind: "failed",
      message: "결제가 승인되지 않았습니다.",
    });
    expectProviderNamesAbsent(states);
  });

  it("renders one active provider-neutral international card option only when admitted", () => {
    const disabled = renderPaymentMethods(false);
    const enabled = renderPaymentMethods(true);

    expect(disabled).toContain("해외 결제 (준비 중)");
    expect(disabled).not.toContain("해외 카드로 결제");
    expect(enabled).toContain("해외 카드 결제");
    expect(enabled).toContain("해외 카드로 결제");
    expect(enabled).not.toContain("EXIMBAY");
  });

  it("fails a browser handoff publicly without confirmation or internal detail", async () => {
    loadSdk.mockRejectedValue(new Error("HOSTILE_SDK_DETAIL"));
    mockInitiatePayment.mockResolvedValue(freshEximbayExecution());
    const states: PaymentState[] = [];

    await runEximbayCardPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      kind: "failed",
      message: "현재 사용할 수 있는 카드 결제 수단이 없습니다.",
    });
    expect(JSON.stringify(states)).not.toContain("HOSTILE_SDK_DETAIL");
  });

  it("admits only one rapid payment execution through the shared click guard", async () => {
    const control = { current: false };
    const gate = promiseGate<void>();
    const run = vi.fn(() => gate.promise);
    const states: PaymentState[] = [];
    const initial: PaymentState = { kind: "idle" };

    const first = runPaymentOnce(control, initial, (state) => states.push(state), run);
    const second = runPaymentOnce(control, initial, (state) => states.push(state), run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(states).toEqual([{ kind: "processing" }]);
    gate.resolve();
    await Promise.all([first, second]);
  });
});

function durableInitiation(durable: PaymentActionResult): InitiatePaymentActionResult {
  return { channel: "DURABLE_ONLY", durable };
}

function freshEximbayExecution(
  handoffPaymentId = "fresh-payment-id",
): Extract<InitiatePaymentActionResult, { channel: "FRESH_EXIMBAY_READY" }> {
  return {
    channel: "FRESH_EXIMBAY_READY",
    durable: {
      kind: "READY",
      success: true,
      paymentId: "fresh-payment-id",
      provider: PaymentProvider.EXIMBAY,
    },
    transientHandoff: {
      kind: "EXIMBAY_READY_HANDOFF_V1",
      paymentId: handoffPaymentId,
      mode: "SANDBOX",
      sdkGeneration: "v2",
      payload: {
        fgkey: "SYNTHETIC_UI_FGKEY_NEVER_RENDER",
        payment: {
          transaction_type: "PAYMENT",
          order_id: "synthetic-ui-order",
          currency: "USD",
          amount: "1.00",
          lang: "EN",
          payment_method: "P000",
        },
        merchant: { mid: "SYNTHETIC_UI_MID_NEVER_RENDER" },
        buyer: { name: "Synthetic Buyer", email: "synthetic-ui@example.test" },
        url: {
          return_url: "https://payments.example.test/return",
          status_url: "https://payments.example.test/status",
        },
      },
    },
  };
}

function expectProviderNamesAbsent(states: PaymentState[]): void {
  const values = collectStringValues(states);
  for (const providerName of ["TOSS", "PAYPAL", "MOCK", "EXIMBAY"]) {
    for (const value of values) {
      expect(value.toLowerCase()).not.toContain(providerName.toLowerCase());
    }
  }
}

function renderPaymentMethods(eximbayCardEnabled: boolean): string {
  return renderToStaticMarkup(createElement(PaymentMethodSection, {
    checkoutSessionId: "checkout-session",
    mockPaymentEnabled: false,
    eximbayCardEnabled,
    locale: "ko",
    marketCode: "US",
  }));
}

function promiseGate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
}
