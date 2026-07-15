import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildRefundExecutionClaimPresentation } from "./refund-claim-presentation";

type Input = Parameters<typeof buildRefundExecutionClaimPresentation>[0];

describe("refund execution claim presentation", () => {
  it("exposes one bounded target for a coherent enabled MOCK/SANDBOX request", () => {
    const presentation = buildRefundExecutionClaimPresentation(input());

    expect(presentation).toEqual({
      control: {
        refundAttemptId: "attempt_1234567890",
        shortAttemptId: "attempt_",
        amount: "₩4,000",
        currency: "KRW",
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
      },
      advisory: null,
    });
    expect(Object.keys(presentation.control ?? {}).sort()).toEqual([
      "amount", "currency", "mode", "provider", "refundAttemptId", "shortAttemptId",
    ]);
  });

  it.each([
    ["disabled", {}, "비활성화"],
    ["misconfigured", {}, "설정을 확인"],
    ["enabled", { paymentProvider: PaymentProvider.TOSS }, "MOCK"],
    ["enabled", { paymentMode: PaymentMode.LIVE }, "SANDBOX"],
  ] as const)("withholds the control for %s / %j", (activationState, overrides, copy) => {
    const presentation = buildRefundExecutionClaimPresentation(input({ activationState, ...overrides }));

    expect(presentation.control).toBeNull();
    expect(presentation.advisory).toContain(copy);
  });

  it("escalates REQUESTED command evidence", () => {
    const presentation = buildRefundExecutionClaimPresentation(input({ hasExecutionCommand: true }));

    expect(presentation.control).toBeNull();
    expect(presentation.advisory).toContain("수동 확인");
  });

  it("escalates REQUESTED provider-contact evidence", () => {
    const presentation = buildRefundExecutionClaimPresentation(input({ hasProviderRefundId: true }));

    expect(presentation.control).toBeNull();
    expect(presentation.advisory).toContain("수동 확인");
  });

  it.each([
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.CANCELLED,
  ])("withholds the control for %s", (attemptStatus) => {
    expect(buildRefundExecutionClaimPresentation(input({ attemptStatus })).control).toBeNull();
  });

  it.each([
    { orderStatus: OrderStatus.PAID },
    { paymentStatus: PaymentAttemptStatus.FAILED },
    { providerPaymentKeyPresent: false },
    { orderAmount: 9_999 },
    { orderCurrency: "USD" },
    { attemptPaymentIdentityMatches: false },
    { attemptAmount: 0 },
    { attemptCurrency: "USD" },
    { attemptProvider: PaymentProvider.TOSS },
    { attemptMode: PaymentMode.LIVE },
    { singleOpenTarget: false },
  ])("fails closed for aggregate identity mismatch %j", (overrides) => {
    const presentation = buildRefundExecutionClaimPresentation(input(overrides));

    expect(presentation.control).toBeNull();
    expect(presentation.advisory).toContain("수동 확인");
  });

  it("never projects execution or customer internals", () => {
    const serialized = JSON.stringify(buildRefundExecutionClaimPresentation(input()));

    for (const forbidden of [
      "commandId", "operationKey", "actorUserId", "providerPaymentKey", "customerUserId",
      "leaseOwner", "providerRefundId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function input(overrides: Partial<Input> = {}): Input {
  return {
    activationState: "enabled",
    orderStatus: OrderStatus.REFUND_PENDING,
    orderAmount: 10_000,
    orderCurrency: "KRW",
    paymentStatus: PaymentAttemptStatus.SUCCEEDED,
    paymentAmount: 10_000,
    paymentCurrency: "KRW",
    paymentProvider: PaymentProvider.MOCK,
    paymentMode: PaymentMode.SANDBOX,
    providerPaymentKeyPresent: true,
    attemptStatus: RefundAttemptStatus.REQUESTED,
    attemptId: "attempt_1234567890",
    attemptAmount: 4_000,
    attemptCurrency: "KRW",
    attemptProvider: PaymentProvider.MOCK,
    attemptMode: PaymentMode.SANDBOX,
    attemptPaymentIdentityMatches: true,
    singleOpenTarget: true,
    hasProviderRefundId: false,
    hasExecutionCommand: false,
    formattedAmount: "₩4,000",
    ...overrides,
  };
}
