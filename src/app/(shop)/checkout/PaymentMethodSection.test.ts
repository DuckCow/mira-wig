import { randomUUID } from "crypto";
import { PaymentProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/payment", () => ({
  initiatePayment: vi.fn(),
  confirmPayment: vi.fn(),
}));

import { confirmPayment, initiatePayment } from "@/app/actions/payment";
import type {
  InitiatePaymentActionResult,
  PaymentActionResult,
} from "@/app/actions/payment";
import { runMockPayment, type PaymentState } from "./PaymentMethodSection";

const mockInitiatePayment = vi.mocked(initiatePayment);
const mockConfirmPayment = vi.mocked(confirmPayment);

describe("checkout payment result handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(states.at(-1)).toEqual({
      kind: "success",
      orderId: "order-ready",
      paymentId: "payment-ready",
    });
  });

  it("fails closed on an unexpected fresh Eximbay channel and never confirms", async () => {
    const unexpectedFresh: InitiatePaymentActionResult = {
      channel: "FRESH_EXIMBAY_READY",
      durable: {
        kind: "READY",
        success: true,
        paymentId: "unexpected-fresh-payment",
        provider: PaymentProvider.EXIMBAY,
      },
      transientHandoff: {
        kind: "EXIMBAY_READY_HANDOFF_V1",
        paymentId: "unexpected-fresh-payment",
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
    mockInitiatePayment.mockResolvedValue(unexpectedFresh);
    const states: PaymentState[] = [];

    await runMockPayment("checkout-session", (state) => states.push(state));

    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      kind: "failed",
      message: "사용 가능한 테스트 결제 수단이 없습니다.",
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
});

function durableInitiation(durable: PaymentActionResult): InitiatePaymentActionResult {
  return { channel: "DURABLE_ONLY", durable };
}

function expectProviderNamesAbsent(states: PaymentState[]): void {
  const values = collectStringValues(states);
  for (const providerName of ["TOSS", "PAYPAL", "MOCK", "EXIMBAY"]) {
    for (const value of values) {
      expect(value.toLowerCase()).not.toContain(providerName.toLowerCase());
    }
  }
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
}
