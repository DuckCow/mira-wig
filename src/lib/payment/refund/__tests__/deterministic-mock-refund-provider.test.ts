import { RefundExecutionEvidenceOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { RefundProviderContractError, type RefundProviderObservation, type RefundProviderRequest } from "../provider-port";
import {
  DeterministicMockRefundProvider,
  InvalidMockRefundPlanError,
  MockRefundPlanNotFoundError,
  RefundProviderIdentityConflictError,
  type DeterministicMockRefundPlan,
} from "../providers/deterministic-mock-refund-provider";

const OBSERVED_AT = new Date("2026-07-11T06:00:00.000Z");

describe("deterministic MOCK refund provider planning", () => {
  it("represents all five outcomes through explicit plans", async () => {
    const outcomes = [
      RefundExecutionEvidenceOutcome.SUCCEEDED,
      RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
      RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
      RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      RefundExecutionEvidenceOutcome.UNKNOWN,
    ];
    const plans = outcomes.map((outcome, index) => plan({
      providerOperationKey: `refund:payment_${index}:attempt_${index}`,
      outcome,
      reportedAmount: index === 1 ? null : 500 + index,
      reportedCurrency: index === 1 ? null : index === 2 ? "USD" : "KRW",
      observedProviderRefundId: index === 0 ? "provider_refund_success" : null,
      safeCode: index === 4 ? "MOCK.UNKNOWN" : null,
      safeMessage: index === 4 ? "MOCK outcome remains unknown." : null,
    }));
    const adapter = new DeterministicMockRefundProvider(plans);

    const results = await Promise.all(plans.map((configured) => adapter.refund(configured.expectedRequest)));

    expect(results.map((result) => result.outcome)).toEqual(outcomes);
    expect(results[0]).toMatchObject({ observedProviderRefundId: "provider_refund_success" });
    expect(results[1]).toMatchObject({ reportedAmount: null, reportedCurrency: null });
    expect(results[2]).toMatchObject({ reportedAmount: 502, reportedCurrency: "USD" });
    expect(results[4]).toMatchObject({ safeCode: "MOCK.UNKNOWN", safeMessage: "MOCK outcome remains unknown." });
  });

  it("rejects duplicate and mismatched operation identities", () => {
    const configured = plan();
    expect(() => new DeterministicMockRefundProvider([configured, configured]))
      .toThrowError(InvalidMockRefundPlanError);
    expect(() => new DeterministicMockRefundProvider([{
      ...configured,
      providerOperationKey: "refund:other:attempt",
    }])).toThrowError(InvalidMockRefundPlanError);
  });

  it("rejects malformed request, observation, and unsupported plan data", () => {
    const malformedRequest = plan();
    Reflect.set(malformedRequest.expectedRequest, "amount", 0);
    expect(() => new DeterministicMockRefundProvider([malformedRequest]))
      .toThrowError(RefundProviderContractError);

    const malformedObservation = plan();
    Reflect.set(malformedObservation.observation, "reportedCurrency", null);
    expect(() => new DeterministicMockRefundProvider([malformedObservation]))
      .toThrowError(RefundProviderContractError);

    const unsupported = plan();
    Reflect.set(unsupported, "provider", "MOCK");
    expect(() => new DeterministicMockRefundProvider([unsupported]))
      .toThrowError(InvalidMockRefundPlanError);
  });
});

describe("deterministic MOCK refund provider execution", () => {
  it("returns byte-equivalent exact replay with a stable timestamp and fresh values", async () => {
    const configured = plan();
    const adapter = new DeterministicMockRefundProvider([configured]);

    const first = await adapter.refund(configured.expectedRequest);
    const second = await adapter.refund({ ...configured.expectedRequest });

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.observedAt).not.toBe(second.observedAt);
    expect(first.observedAt.getTime()).toBe(OBSERVED_AT.getTime());
    expect(adapter.physicalInvocationCount).toBe(2);
    expect(adapter.configuredOperationCount).toBe(1);
  });

  it("converges concurrent exact calls on one prevalidated logical observation", async () => {
    const configured = plan();
    const adapter = new DeterministicMockRefundProvider([configured]);

    const results = await Promise.all(Array.from(
      { length: 8 },
      () => adapter.refund({ ...configured.expectedRequest }),
    ));

    expect(results.every((result) => sameObservation(result, results[0]))).toBe(true);
    expect(new Set(results.map((result) => result.observedAt.getTime()))).toEqual(new Set([OBSERVED_AT.getTime()]));
    expect(adapter.configuredOperationCount).toBe(1);
    expect(adapter.physicalInvocationCount).toBe(8);
  });

  it.each([
    { providerPaymentReference: "provider_payment_changed" },
    { amount: 501 },
    { currency: "USD" },
  ])("rejects changed operation identity %# without changing exact replay", async (override) => {
    const configured = plan();
    const adapter = new DeterministicMockRefundProvider([configured]);
    const original = await adapter.refund(configured.expectedRequest);

    await expect(adapter.refund({ ...configured.expectedRequest, ...override }))
      .rejects.toMatchObject({
        code: "REFUND_PROVIDER_IDENTITY_CONFLICT",
        message: "Refund provider operation identity conflicts with the configured request.",
      });
    await expect(adapter.refund(configured.expectedRequest)).resolves.toEqual(original);
  });

  it("throws a static typed configuration error for a missing plan", async () => {
    const adapter = new DeterministicMockRefundProvider([]);

    await expect(adapter.refund(request())).rejects.toEqual(expect.objectContaining({
      code: "MOCK_REFUND_PLAN_NOT_FOUND",
      message: "Deterministic MOCK refund plan was not found.",
    }));
    await expect(adapter.refund(request())).rejects.toBeInstanceOf(MockRefundPlanNotFoundError);
  });

  it("isolates returned object and Date mutation from later replay", async () => {
    const configured = plan();
    const adapter = new DeterministicMockRefundProvider([configured]);
    const first = await adapter.refund(configured.expectedRequest);

    expect(Reflect.set(first, "safeMessage", "changed")).toBe(false);
    first.observedAt.setUTCFullYear(2035);
    const replay = await adapter.refund(configured.expectedRequest);

    expect(replay.safeMessage).toBe("Safe MOCK observation.");
    expect(replay.observedAt.getTime()).toBe(OBSERVED_AT.getTime());
  });

  it("keeps plans and replay state isolated by adapter instance", async () => {
    const firstPlan = plan({ observedProviderRefundId: "provider_refund_first" });
    const secondPlan = plan({ observedProviderRefundId: "provider_refund_second" });
    const first = new DeterministicMockRefundProvider([firstPlan]);
    const second = new DeterministicMockRefundProvider([secondPlan]);

    await expect(first.refund(firstPlan.expectedRequest)).resolves
      .toMatchObject({ observedProviderRefundId: "provider_refund_first" });
    await expect(second.refund(secondPlan.expectedRequest)).resolves
      .toMatchObject({ observedProviderRefundId: "provider_refund_second" });
    expect(first.physicalInvocationCount).toBe(1);
    expect(second.physicalInvocationCount).toBe(1);
  });

  it("uses the dedicated identity-conflict error type", async () => {
    const configured = plan();
    const adapter = new DeterministicMockRefundProvider([configured]);
    await expect(adapter.refund({ ...configured.expectedRequest, amount: 999 }))
      .rejects.toBeInstanceOf(RefundProviderIdentityConflictError);
  });
});

type PlanOverrides = Partial<RefundProviderObservation> & {
  providerOperationKey?: string;
};

function plan(overrides: PlanOverrides = {}): DeterministicMockRefundPlan {
  const {
    providerOperationKey = "refund:payment_1:attempt_1",
    ...observationOverrides
  } = overrides;
  return {
    providerOperationKey,
    expectedRequest: request({ providerOperationKey }),
    observation: observation(observationOverrides),
  };
}

function request(overrides: Partial<RefundProviderRequest> = {}): RefundProviderRequest {
  return {
    providerPaymentReference: "provider_payment_1",
    amount: 500,
    currency: "KRW",
    providerOperationKey: "refund:payment_1:attempt_1",
    ...overrides,
  };
}

function observation(overrides: Partial<RefundProviderObservation> = {}): RefundProviderObservation {
  return {
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: "provider_refund_1",
    reportedAmount: 500,
    reportedCurrency: "KRW",
    safeCode: "MOCK.SUCCEEDED",
    safeMessage: "Safe MOCK observation.",
    observedAt: new Date(OBSERVED_AT.getTime()),
    ...overrides,
  };
}

function sameObservation(left: RefundProviderObservation, right: RefundProviderObservation): boolean {
  return left.outcome === right.outcome
    && left.observedProviderRefundId === right.observedProviderRefundId
    && left.reportedAmount === right.reportedAmount
    && left.reportedCurrency === right.reportedCurrency
    && left.safeCode === right.safeCode
    && left.safeMessage === right.safeMessage
    && left.observedAt.getTime() === right.observedAt.getTime();
}
