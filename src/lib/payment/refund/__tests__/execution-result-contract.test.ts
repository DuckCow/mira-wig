import { RefundExecutionEvidenceOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildRefundExecutionApplyOperationKey,
  buildRefundResultDedupKey,
  normalizePersistFreshRefundExecutionObservationInput,
  normalizeReplayRefundExecutionResultInput,
  resultFailure,
  type PersistFreshRefundExecutionObservationInput,
} from "../execution-result-contract";

const OBSERVED_AT = new Date("2026-07-11T04:00:00.000Z");

describe("refund execution result envelopes", () => {
  it("normalizes the exact fresh fence and generation-independent evidence identity", () => {
    const result = normalizePersistFreshRefundExecutionObservationInput(freshInput({
      commandId: "  command_1  ",
      observation: observation({ reportedCurrency: " krw " }),
    }));

    expect(result).toMatchObject({
      ok: true,
      input: {
        commandId: "command_1",
        dispatchAttempt: 1,
        leaseGeneration: 2,
        observation: { reportedCurrency: "KRW" },
      },
    });
    expect(buildRefundResultDedupKey("command_1", 1)).toBe("refund-result:command_1:1");
    expect(buildRefundExecutionApplyOperationKey("evidence_1")).toBe("refund-exec-apply:evidence_1");
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) throw new Error("Expected normalized fresh input.");
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(result.input.observation)).toBe(true);
  });

  it("normalizes exact replay without accepting fresh authority fields", () => {
    const result = normalizeReplayRefundExecutionResultInput({
      commandId: " command_1 ",
      dispatchAttempt: 1,
      observation: observation(),
    });
    expect(result).toMatchObject({ ok: true, input: { commandId: "command_1" } });

    expect(normalizeReplayRefundExecutionResultInput({
      commandId: "command_1",
      dispatchAttempt: 1,
      observation: observation(),
      leaseGeneration: 2,
    })).toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });
  });

  it.each([0, -1, 1.5, 2_147_483_648])("rejects invalid dispatch ordinal %s", (dispatchAttempt) => {
    expect(normalizePersistFreshRefundExecutionObservationInput(freshInput({ dispatchAttempt })))
      .toMatchObject({ ok: false, code: "INVALID_DISPATCH_ATTEMPT" });
  });

  it.each([0, -1, 1.5, 2_147_483_648])("rejects invalid lease generation %s", (leaseGeneration) => {
    expect(normalizePersistFreshRefundExecutionObservationInput(freshInput({ leaseGeneration })))
      .toMatchObject({ ok: false, code: "INVALID_LEASE_GENERATION" });
  });

  it("rejects malformed lease tokens and exact-envelope drift", () => {
    expect(normalizePersistFreshRefundExecutionObservationInput(freshInput({ leaseToken: "A".repeat(64) })))
      .toMatchObject({ ok: false, code: "INVALID_LEASE_TOKEN" });
    expect(normalizePersistFreshRefundExecutionObservationInput({ ...freshInput(), now: OBSERVED_AT }))
      .toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });
  });

  it("rejects missing, inherited-only, extra symbol, and caller-owned authority", () => {
    const missing = Object.fromEntries(
      Object.entries(freshInput()).filter(([key]) => key !== "observation"),
    );
    expect(normalizePersistFreshRefundExecutionObservationInput(missing))
      .toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });

    const inherited = {};
    Object.setPrototypeOf(inherited, freshInput());
    expect(normalizePersistFreshRefundExecutionObservationInput(inherited))
      .toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });

    const symbol = { ...freshInput(), [Symbol("extra")]: true };
    expect(normalizePersistFreshRefundExecutionObservationInput(symbol))
      .toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });

    for (const extra of ["source", "sourceDedupKey", "now", "status", "reportedAmount"]) {
      expect(normalizePersistFreshRefundExecutionObservationInput({
        ...freshInput(),
        [extra]: "caller-owned",
      })).toMatchObject({ ok: false, code: "INVALID_OBSERVATION" });
    }
  });

  it("returns frozen failures with the exact public failure keys", () => {
    const failure = resultFailure("FEATURE_DISABLED", "Static failure.");
    expect(Object.keys(failure)).toEqual(["ok", "code", "message"]);
    expect(Object.isFrozen(failure)).toBe(true);
  });

  it.each([
    RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
    RefundExecutionEvidenceOutcome.UNKNOWN,
  ])("synthesizes stable safe code for %s", (outcome) => {
    const result = normalizeReplayRefundExecutionResultInput({
      commandId: "command_1",
      dispatchAttempt: 1,
      observation: observation({ outcome, safeCode: null }),
    });
    expect(result.ok && result.input.observation.safeCode).toMatch(/^[A-Z_]+$/);
  });
});

function freshInput(
  override: Partial<PersistFreshRefundExecutionObservationInput> = {},
): PersistFreshRefundExecutionObservationInput {
  return {
    commandId: "command_1",
    dispatchAttempt: 1,
    leaseGeneration: 2,
    leaseToken: "a".repeat(64),
    observation: observation(),
    ...override,
  };
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: "provider_refund_1",
    reportedAmount: 500,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(OBSERVED_AT.getTime()),
    ...overrides,
  };
}
