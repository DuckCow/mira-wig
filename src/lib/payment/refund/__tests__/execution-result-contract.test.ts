import {
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildRefundExecutionApplyOperationKey,
  buildRefundResultDedupKey,
  normalizeRefundAdapterResponse,
  type ResolveRefundAdapterResponseInput,
} from "../execution-result-contract";

const NOW = new Date("2026-07-11T04:00:00.000Z");

describe("refund adapter-response contract", () => {
  it("normalizes identity, currency, optional text, and deterministic result key", () => {
    const result = normalizeRefundAdapterResponse(input({
      commandId: "  command_1  ",
      observedProviderRefundId: "  provider_refund_1  ",
      reportedAmount: 500,
      reportedCurrency: " krw ",
      safeCode: "  SAFE_CODE  ",
      safeMessage: "  Safe message  ",
    }));

    if (!result.ok) throw new Error(`Expected normalization success, received ${result.code}.`);
    expect(result.input.commandId).toBe("command_1");
    expect(result.input.sourceDedupKey).toBe("refund-result:command_1:1");
    expect(result.input.observedProviderRefundId).toBe("provider_refund_1");
    expect(result.input.reportedAmount).toBe(500);
    expect(result.input.reportedCurrency).toBe("KRW");
    expect(result.input.safeCode).toBe("SAFE_CODE");
    expect(result.input.safeMessage).toBe("Safe message");
    expect(buildRefundResultDedupKey("command_1", 1)).toBe("refund-result:command_1:1");
    expect(buildRefundExecutionApplyOperationKey("evidence_1")).toBe("refund-exec-apply:evidence_1");
  });

  it.each([
    RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
    RefundExecutionEvidenceOutcome.UNKNOWN,
  ])("synthesizes a stable safe code for %s", (outcome) => {
    const first = normalizeRefundAdapterResponse(input({ outcome, safeCode: null }));
    const second = normalizeRefundAdapterResponse(input({ outcome, safeCode: null }));

    expect(first).toEqual(second);
    expect(first.ok && first.input.safeCode).toMatch(/^[A-Z_]+$/);
  });

  it("allows success with an absent amount/currency pair", () => {
    const result = normalizeRefundAdapterResponse(input({
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      reportedAmount: null,
      reportedCurrency: null,
    }));

    expect(result).toMatchObject({ ok: true, input: { reportedAmount: null, reportedCurrency: null } });
  });

  it("rejects an unknown runtime outcome", () => {
    const candidate = input();
    Reflect.set(candidate, "outcome", "NOT_A_REFUND_OUTCOME");

    expect(normalizeRefundAdapterResponse(candidate))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid dispatch attempt %s",
    (dispatchAttempt) => {
      expect(normalizeRefundAdapterResponse(input({ dispatchAttempt })))
        .toMatchObject({ ok: false, code: "INVALID_DISPATCH_ATTEMPT" });
    },
  );

  it.each([
    { reportedAmount: 1, reportedCurrency: null },
    { reportedAmount: null, reportedCurrency: "KRW" },
    { reportedAmount: 0, reportedCurrency: "KRW" },
    { reportedAmount: 1.5, reportedCurrency: "KRW" },
    { reportedAmount: 1, reportedCurrency: "KR" },
  ])("rejects malformed money evidence %#", (override) => {
    expect(normalizeRefundAdapterResponse(input(override)))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
  });

  it("rejects blank/oversized identities, oversized safe fields, and invalid dates", () => {
    expect(normalizeRefundAdapterResponse(input({ commandId: "  " })))
      .toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
    expect(normalizeRefundAdapterResponse(input({ observedProviderRefundId: "x".repeat(513) })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
    expect(normalizeRefundAdapterResponse(input({ safeCode: "x".repeat(129) })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
    expect(normalizeRefundAdapterResponse(input({ safeMessage: "x".repeat(501) })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
    expect(normalizeRefundAdapterResponse(input({ observedAt: new Date(Number.NaN) })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
    expect(normalizeRefundAdapterResponse(input({ now: new Date(Number.NaN) })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
  });

  it.each([
    "Error: provider failed\n    at execute (/app/refund.ts:1:1)",
    "https://user:password@example.test/result",
    "authorization=Bearer secret",
    "command_internal-1234 failed",
  ])("rejects unsafe diagnostic content", (safeMessage) => {
    expect(normalizeRefundAdapterResponse(input({ safeMessage })))
      .toMatchObject({ ok: false, code: "INVALID_EVIDENCE" });
  });
});

function input(
  override: Partial<ResolveRefundAdapterResponseInput> = {},
): ResolveRefundAdapterResponseInput {
  return {
    commandId: "command_1",
    dispatchAttempt: 1,
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: null,
    reportedAmount: 500,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: NOW,
    now: NOW,
    ...override,
  };
}
