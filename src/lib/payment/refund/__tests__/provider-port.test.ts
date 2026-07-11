import { RefundExecutionEvidenceOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { normalizeRefundAdapterResponse, type ResolveRefundAdapterResponseInput } from "../execution-result-contract";
import {
  RefundProviderContractError,
  normalizeRefundProviderObservation,
  normalizeRefundProviderRequest,
  type RefundProviderObservation,
  type RefundProviderRequest,
} from "../provider-port";

const OBSERVED_AT = new Date("2026-07-11T05:00:00.000Z");

describe("refund provider request contract", () => {
  it("canonicalizes the narrow immutable request", () => {
    const result = normalizeRefundProviderRequest(request({
      providerPaymentReference: "  provider_payment_1  ",
      currency: " krw ",
      operationKey: "  refund:payment_1:attempt_1  ",
    }));

    expect(result).toEqual({
      providerPaymentReference: "provider_payment_1",
      amount: 500,
      currency: "KRW",
      operationKey: "refund:payment_1:attempt_1",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid minimum-unit amount %s",
    (amount) => expectRequestFailure(request({ amount })),
  );

  it.each([
    request({ providerPaymentReference: "  " }),
    request({ operationKey: "\t" }),
    request({ currency: "KR" }),
    request({ currency: "KRW1" }),
  ])("rejects malformed request fields", (candidate) => expectRequestFailure(candidate));

  it("rejects unsupported request data", () => {
    const candidate = request();
    Reflect.set(candidate, "refundAttemptId", "attempt_internal_1");
    expectRequestFailure(candidate);
  });
});

describe("refund provider observation contract", () => {
  it.each([
    RefundExecutionEvidenceOutcome.SUCCEEDED,
    RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
    RefundExecutionEvidenceOutcome.UNKNOWN,
  ])("accepts provider-neutral outcome %s", (outcome) => {
    expect(normalizeRefundProviderObservation(observation({ outcome }))).toMatchObject({ outcome });
  });

  it("canonicalizes optional evidence, diagnostics, currency, and timestamp snapshots", () => {
    const source = observation({
      observedProviderRefundId: "  provider_refund_1  ",
      reportedCurrency: " krw ",
      safeCode: "  SAFE.CODE  ",
      safeMessage: "  Safe normalized message.  ",
    });
    const normalized = normalizeRefundProviderObservation(source);

    expect(normalized).toMatchObject({
      observedProviderRefundId: "provider_refund_1",
      reportedCurrency: "KRW",
      safeCode: "SAFE.CODE",
      safeMessage: "Safe normalized message.",
    });
    expect(normalized.observedAt).toEqual(source.observedAt);
    expect(normalized.observedAt).not.toBe(source.observedAt);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it("accepts null/null and deliberately mismatched positive money pairs", () => {
    expect(normalizeRefundProviderObservation(observation({
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      reportedAmount: null,
      reportedCurrency: null,
    }))).toMatchObject({ reportedAmount: null, reportedCurrency: null });
    expect(normalizeRefundProviderObservation(observation({
      reportedAmount: 501,
      reportedCurrency: "USD",
    }))).toMatchObject({ reportedAmount: 501, reportedCurrency: "USD" });
  });

  it.each([
    { reportedAmount: 500, reportedCurrency: null },
    { reportedAmount: null, reportedCurrency: "KRW" },
    { reportedAmount: 0, reportedCurrency: "KRW" },
    { reportedAmount: 1.5, reportedCurrency: "KRW" },
    { reportedAmount: Number.NaN, reportedCurrency: "KRW" },
    { reportedAmount: Number.POSITIVE_INFINITY, reportedCurrency: "KRW" },
    { reportedAmount: Number.MAX_SAFE_INTEGER + 1, reportedCurrency: "KRW" },
    { reportedAmount: 500, reportedCurrency: "KR" },
  ])("rejects malformed reported money %#", (override) => {
    expectObservationFailure(observation(override));
  });

  it("rejects unsupported outcomes, fields, bounds, and dates", () => {
    const outcome = observation();
    Reflect.set(outcome, "outcome", "NOT_A_REFUND_OUTCOME");
    expectObservationFailure(outcome);
    const unsupported = observation();
    Reflect.set(unsupported, "raw", { provider: "payload" });
    expectObservationFailure(unsupported);
    expectObservationFailure(observation({ observedProviderRefundId: "x".repeat(513) }));
    expectObservationFailure(observation({ safeCode: "X".repeat(129) }));
    expectObservationFailure(observation({ safeMessage: "x".repeat(501) }));
    expectObservationFailure(observation({ observedAt: new Date(Number.NaN) }));
    expectObservationFailure(observation({ observedAt: new Date(-8.64e15) }));
  });

  it.each([
    { safeCode: "unsafe code" },
    { safeMessage: "Error: provider failed\n at refund" },
    { safeMessage: "https://user:password@example.test/result" },
    { safeMessage: "authorization=Bearer secret" },
    { safeMessage: "refund_internal-1234 failed" },
  ])("rejects known unsafe diagnostic pattern %#", (override) => {
    expectObservationFailure(observation(override));
  });

  it("maps mechanically into resolver observation fields", () => {
    const providerObservation = normalizeRefundProviderObservation(observation());
    const resolverInput: ResolveRefundAdapterResponseInput = {
      commandId: "command_1",
      dispatchAttempt: 1,
      ...providerObservation,
      now: new Date("2026-07-11T05:01:00.000Z"),
    };

    const normalized = normalizeRefundAdapterResponse(resolverInput);
    expect(normalized).toMatchObject({ ok: true });
    if (!normalized.ok) throw new Error("Expected resolver-compatible provider observation.");
    expect(normalized.input).toMatchObject(providerObservation);
  });
});

function request(overrides: Partial<RefundProviderRequest> = {}): RefundProviderRequest {
  return {
    providerPaymentReference: "provider_payment_1",
    amount: 500,
    currency: "KRW",
    operationKey: "refund:payment_1:attempt_1",
    ...overrides,
  };
}

function observation(overrides: Partial<RefundProviderObservation> = {}): RefundProviderObservation {
  return {
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: null,
    reportedAmount: 500,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(OBSERVED_AT.getTime()),
    ...overrides,
  };
}

function expectRequestFailure(candidate: RefundProviderRequest): void {
  expect(() => normalizeRefundProviderRequest(candidate)).toThrowError(RefundProviderContractError);
  try {
    normalizeRefundProviderRequest(candidate);
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_REFUND_PROVIDER_REQUEST" });
  }
}

function expectObservationFailure(candidate: RefundProviderObservation): void {
  expect(() => normalizeRefundProviderObservation(candidate)).toThrowError(RefundProviderContractError);
  try {
    normalizeRefundProviderObservation(candidate);
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_REFUND_PROVIDER_OBSERVATION" });
  }
}
