import { RefundExecutionEvidenceOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { normalizeRefundObservation } from "../refund-observation-contract";

const OBSERVED_AT = new Date("2026-07-11T05:00:00.000Z");

describe("normalized refund observation authority", () => {
  it("owns and freezes the exact seven-field normalized shape", () => {
    const source = observation({
      observedProviderRefundId: " provider_refund_1 ",
      reportedCurrency: " krw ",
      safeCode: " SAFE.CODE ",
      safeMessage: " Safe message. ",
    });
    const result = normalizeRefundObservation(source);
    if (!result.ok) throw new Error("Expected observation normalization success.");

    expect(Object.keys(result.observation)).toEqual([
      "outcome",
      "observedProviderRefundId",
      "reportedAmount",
      "reportedCurrency",
      "safeCode",
      "safeMessage",
      "observedAt",
    ]);
    expect(result.observation).toMatchObject({
      observedProviderRefundId: "provider_refund_1",
      reportedCurrency: "KRW",
      safeCode: "SAFE.CODE",
      safeMessage: "Safe message.",
    });
    expect(result.observation.observedAt).not.toBe(source.observedAt);
    expect(Object.isFrozen(result.observation)).toBe(true);
  });

  it.each([
    null,
    [],
    { ...observation(), raw: "provider payload" },
    observation({ reportedAmount: 0 }),
    observation({ reportedCurrency: "KR" }),
    observation({ safeCode: "unsafe code" }),
    observation({ safeMessage: "authorization=Bearer secret" }),
    observation({ observedAt: new Date(Number.NaN) }),
  ])("rejects malformed, expanded, or unsafe observation %#", (candidate) => {
    expect(normalizeRefundObservation(candidate)).toEqual({ ok: false });
  });

  it("enforces code-point bounds and exact own fields", () => {
    expect(normalizeRefundObservation(observation({ observedProviderRefundId: "x".repeat(513) })))
      .toEqual({ ok: false });
    expect(normalizeRefundObservation(observation({ safeCode: "X".repeat(129) })))
      .toEqual({ ok: false });
    expect(normalizeRefundObservation(observation({ safeMessage: "x".repeat(501) })))
      .toEqual({ ok: false });
    const inherited = {};
    Object.setPrototypeOf(inherited, observation());
    expect(normalizeRefundObservation(inherited)).toEqual({ ok: false });
    expect(normalizeRefundObservation({ ...observation(), [Symbol("extra")]: true }))
      .toEqual({ ok: false });
  });
});

function observation(overrides: Record<string, unknown> = {}) {
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
