import { describe, expect, it } from "vitest";

import { verifyStructuredLanding } from "../landing";
import { runStructuredCategoricalFixtureSlice } from "../structured-slice";
import type {
  StructuredCandidateFixture,
  StructuredEligibilitySummaryFixture,
  StructuredLandingIntent,
  StructuredProductEvidenceFixture,
} from "../types";
import {
  candidateFixture,
  candidateSnapshot,
  categoricalPolicy,
  evidenceFixture,
  eligibilitySummary,
  governedConstraint,
  parserResult,
  stage0Proof,
  structuredInput,
  TEXTURE_ATTRIBUTE_ID,
} from "./fixtures";

function runOne(
  candidate: StructuredCandidateFixture,
  evidenceFixtures: readonly StructuredProductEvidenceFixture[],
  eligibilitySummaries: readonly StructuredEligibilitySummaryFixture[],
) {
  const constraint = governedConstraint();
  return runStructuredCategoricalFixtureSlice(
    structuredInput({
      parserResult: parserResult([constraint]),
      policies: [categoricalPolicy(constraint)],
      stage0Proof: stage0Proof([
        {
          variantId: candidate.variantId,
          canonicalStyleId: candidate.canonicalStyleId,
        },
      ]),
      candidateSnapshot: candidateSnapshot([candidate]),
      evidenceFixtures,
      eligibilitySummaries,
    }),
  );
}

function rejectionReason(
  result: ReturnType<typeof runStructuredCategoricalFixtureSlice>,
): string | null {
  if (
    result.status !== "COMPLETED" ||
    result.admissionRejections.length !== 1
  ) {
    return null;
  }
  return result.admissionRejections[0]?.reason ?? null;
}

describe("D6-B1 evidence rejection boundary", () => {
  it("rejects duplicate, wrong-attribute, and NOT_REPRESENTABLE evidence instead of making it unknown", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const valid = evidenceFixture(candidate, constraint);
    const duplicate = evidenceFixture(candidate, constraint, "HUMAN_CURATED_FROM_EVIDENCE");
    const wrongAttribute = evidenceFixture(candidate, constraint, "VERIFIED_OR_MEASURED", {
      attributeId: TEXTURE_ATTRIBUTE_ID,
    });
    const notRepresentable = evidenceFixture(
      candidate,
      constraint,
      "NOT_REPRESENTABLE",
    );
    const eligibility = [eligibilitySummary(candidate)];

    expect(
      rejectionReason(runOne(candidate, [valid, duplicate], eligibility)),
    ).toBe("DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE");
    expect(
      rejectionReason(runOne(candidate, [wrongAttribute], eligibility)),
    ).toBe("EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH");
    expect(
      rejectionReason(runOne(candidate, [notRepresentable], eligibility)),
    ).toBe("EVIDENCE_NOT_REPRESENTABLE");
  });

  it("ignores unrelated candidate and target-attribute evidence", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const valid = evidenceFixture(candidate, constraint);
    const baseline = runOne(
      candidate,
      [valid],
      [eligibilitySummary(candidate)],
    );
    const unrelatedCandidate = evidenceFixture(
      candidateFixture("fixture:variant:unrelated", "fixture:style:unrelated"),
      constraint,
    );
    const unrelatedTarget = evidenceFixture(candidate, constraint, "CONFLICTING", {
      targetConstraintId: "constraint:unrelated",
      attributeId: TEXTURE_ATTRIBUTE_ID,
    });

    expect(
      runOne(
        candidate,
        [unrelatedTarget, valid, unrelatedCandidate],
        [eligibilitySummary(candidate)],
      ),
    ).toEqual(baseline);
  });
});

describe("D6-B1 eligibility admission", () => {
  it.each([
    {
      name: "missing",
      summaries: (): readonly StructuredEligibilitySummaryFixture[] => [],
      reason: "ELIGIBILITY_SUMMARY_MISSING",
    },
    {
      name: "duplicate",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate),
        eligibilitySummary(candidate, {
          fixtureReason: "fixture:eligible:duplicate",
        }),
      ],
      reason: "ELIGIBILITY_SUMMARY_DUPLICATE",
    },
    {
      name: "stale",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          eligibilitySnapshotVersion: "fixture:stale",
        }),
      ],
      reason: "ELIGIBILITY_SUMMARY_STALE",
    },
    {
      name: "market mismatch",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { marketCode: "US" }),
      ],
      reason: "ELIGIBILITY_MARKET_MISMATCH",
    },
    {
      name: "variant mismatch",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          variantId: "fixture:variant:mismatch",
        }),
      ],
      reason: "ELIGIBILITY_VARIANT_MISMATCH",
    },
    {
      name: "style mismatch",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          canonicalStyleId: "fixture:style:mismatch",
        }),
      ],
      reason: "ELIGIBILITY_STYLE_MISMATCH",
    },
    {
      name: "unknown",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { outcome: "UNKNOWN_FIXTURE" }),
      ],
      reason: "ELIGIBILITY_SUMMARY_UNKNOWN",
    },
    {
      name: "ineligible",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { outcome: "INELIGIBLE_FIXTURE" }),
      ],
      reason: "ELIGIBILITY_SUMMARY_INELIGIBLE",
    },
    {
      name: "negative amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: -1 }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "fractional amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: 1.5 }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "null amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: null }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "null currency",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { currency: null }),
      ],
      reason: "SELECTED_VARIANT_CURRENCY_INVALID",
    },
    {
      name: "invalid currency",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { currency: "krw" }),
      ],
      reason: "SELECTED_VARIANT_CURRENCY_INVALID",
    },
  ])("rejects $name eligibility explicitly", ({ summaries, reason }) => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const result = runOne(
      candidate,
      [evidenceFixture(candidate, constraint)],
      summaries(candidate),
    );

    expect(rejectionReason(result)).toBe(reason);
    if (result.status === "COMPLETED") {
      expect(result.counts.admissionAttempts).toBe(1);
      expect(result.counts.admissionRejected).toBe(1);
    }
  });

  it("rejects invalid eligibility fixture markers", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const summary = eligibilitySummary(candidate);
    Object.defineProperty(summary, "synthetic", { value: false });

    expect(
      rejectionReason(
        runOne(
          candidate,
          [evidenceFixture(candidate, constraint)],
          [summary],
        ),
      ),
    ).toBe("ELIGIBILITY_PROVENANCE_INVALID");
  });

  it("performs exactly one admission attempt per scoped candidate", () => {
    const constraint = governedConstraint();
    const admitted = candidateFixture(
      "fixture:variant:a",
      "fixture:style:a",
    );
    const rejected = candidateFixture(
      "fixture:variant:b",
      "fixture:style:b",
    );
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([constraint]),
        policies: [categoricalPolicy(constraint)],
        stage0Proof: stage0Proof([
          {
            variantId: rejected.variantId,
            canonicalStyleId: rejected.canonicalStyleId,
          },
          {
            variantId: admitted.variantId,
            canonicalStyleId: admitted.canonicalStyleId,
          },
        ]),
        candidateSnapshot: candidateSnapshot([rejected, admitted]),
        evidenceFixtures: [
          evidenceFixture(admitted, constraint),
          evidenceFixture(rejected, constraint, "NOT_REPRESENTABLE"),
        ],
        eligibilitySummaries: [
          eligibilitySummary(admitted),
          eligibilitySummary(rejected),
        ],
      }),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.counts.enumeratedCandidates).toBe(2);
      expect(result.counts.admissionAttempts).toBe(2);
      expect(result.counts.asserted).toBe(1);
      expect(result.counts.admissionRejected).toBe(1);
      const outputIds = [
        ...result.assertedCandidates.map(
          (entry) => entry.displayedVariantId,
        ),
        ...result.admissionRejections.map((entry) => entry.variantId),
      ];
      expect(new Set(outputIds).size).toBe(2);
    }
  });
});

describe("D6-B1 landing integrity", () => {
  it("preserves selected variant, style, amount, and currency without repair", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const eligibility = eligibilitySummary(candidate, {
      selectedVariantAmount: 91234,
      currency: "KRW",
    });
    const result = runOne(
      candidate,
      [evidenceFixture(candidate, constraint)],
      [eligibility],
    );
    if (result.status !== "COMPLETED") {
      throw new TypeError("Synthetic structured run must complete");
    }
    const admitted = result.assertedCandidates[0];
    if (admitted === undefined) {
      throw new TypeError("Synthetic structured candidate must assert");
    }

    expect(admitted).toMatchObject({
      displayedVariantId: candidate.variantId,
      displayedStyleId: candidate.canonicalStyleId,
      priceBasis: "SELECTED_VARIANT",
      amount: 91234,
      currency: "KRW",
    });
    expect(
      verifyStructuredLanding(
        admitted.landingIntent,
        candidate,
        eligibility,
      ),
    ).toEqual({ status: "VERIFIED" });

    const mismatches: readonly StructuredLandingIntent[] = [
      {
        ...admitted.landingIntent,
        displayedVariantId: "fixture:variant:mismatch",
      },
      {
        ...admitted.landingIntent,
        displayedStyleId: "fixture:style:mismatch",
      },
      { ...admitted.landingIntent, amount: 1 },
      { ...admitted.landingIntent, currency: "USD" },
    ];
    for (const intent of mismatches) {
      const before = JSON.stringify(intent);
      expect(
        verifyStructuredLanding(intent, candidate, eligibility),
      ).toEqual({
        status: "LANDING_INTEGRITY_MISMATCH",
        reason: "LANDING_INTEGRITY_MISMATCH",
      });
      expect(JSON.stringify(intent)).toBe(before);
    }
  });
});
