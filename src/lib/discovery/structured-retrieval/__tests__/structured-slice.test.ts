import { describe, expect, it } from "vitest";

import { runStructuredCategoricalFixtureSlice } from "../structured-slice";
import type {
  RunStructuredCategoricalFixtureSliceInput,
  StructuredCandidateFixture,
} from "../types";
import {
  candidateFixture,
  candidateSnapshot,
  categoricalPolicy,
  COLOR_ATTRIBUTE_ID,
  evidenceFixture,
  eligibilitySummary,
  governedConstraint,
  parserResult,
  stage0Proof,
  structuredInput,
  STYLE_A,
  TEXTURE_ATTRIBUTE_ID,
  VARIANT_A,
} from "./fixtures";

function candidate(letter: string): StructuredCandidateFixture {
  return candidateFixture(
    `fixture:variant:${letter}`,
    `fixture:style:${letter}`,
  );
}

function pairsFor(candidates: readonly StructuredCandidateFixture[]): {
  readonly variantId: string;
  readonly canonicalStyleId: string;
}[] {
  return candidates.map((entry) => ({
    variantId: entry.variantId,
    canonicalStyleId: entry.canonicalStyleId,
  }));
}

function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  Object.freeze(value);
}

describe("D6-B1 structured categorical fixture slice", () => {
  it("admits an authoritative match with full attribution and selected-variant landing", () => {
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput(),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.counts).toEqual({
        scopedMembership: 1,
        enumeratedCandidates: 1,
        admissionAttempts: 1,
        asserted: 1,
        unknown: 0,
        violating: 0,
        withheld: 0,
        admissionRejected: 0,
      });
      const admitted = result.assertedCandidates[0];
      expect(admitted).toMatchObject({
        displayedVariantId: VARIANT_A,
        displayedStyleId: STYLE_A,
        partition: "ASSERTED",
        priceBasis: "SELECTED_VARIANT",
        amount: 85000,
        currency: "KRW",
        landingIntegrity: { status: "VERIFIED" },
      });
      expect(admitted?.matchedGovernedAttributes).toEqual([
        {
          constraintId: "constraint:color",
          attributeId: COLOR_ATTRIBUTE_ID,
          valueId: "fixture:color-family:dark",
        },
      ]);
      expect(admitted?.queryDecisions[0]).toHaveProperty(
        "gate",
        "REQUIRE_MATCH",
      );
      expect(admitted?.productDecisions[0]).toMatchObject({
        gate: "ASSERT_MATCH",
        score: "NONE",
        partition: "ASSERTED",
        reasons: ["EVIDENCE_QUALIFIED_MATCH"],
      });
      expect(admitted?.d5Versions).toEqual({
        normalizer: "d5-conservative-normalizer/v0.1",
        parser: "d5-injected-span-parser/v0.1",
        constraintRules: "d5-constraint-decisions/v0.2",
        lexicon: "fixture:d6-b1-lexicon/v0.1-provisional",
        ontology: "fixture:d6-b1-ontology/v0.1-provisional",
      });
      expect(result.technicalOrder).toBe("VARIANT_ID_THEN_STYLE_ID");
      expect(result.ranking).toBe("NONE");
      expect(result.relaxation).toBe("NONE");
      expect(JSON.stringify(result).toLowerCase()).not.toContain("event");
    }
  });

  it("stops rejected requests and invalid Stage-0 proofs before candidate access", () => {
    const inaccessibleSnapshot = candidateSnapshot();
    Object.defineProperty(inaccessibleSnapshot, "candidatesByVariantId", {
      get: (): never => {
        throw new Error("candidate source was accessed");
      },
    });
    const invalidStage0 = stage0Proof();
    Object.defineProperty(invalidStage0, "fixtureOnly", { value: false });

    expect(
      runStructuredCategoricalFixtureSlice(
        structuredInput({
          parserResult: parserResult([]),
          candidateSnapshot: inaccessibleSnapshot,
        }),
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "CONSTRAINT_COUNT_OUTSIDE_D6_B1",
    });
    expect(
      runStructuredCategoricalFixtureSlice(
        structuredInput({
          stage0Proof: invalidStage0,
          candidateSnapshot: inaccessibleSnapshot,
        }),
      ),
    ).toMatchObject({
      status: "STAGE0_REJECTED",
      reason: "STAGE0_PROVENANCE_INVALID",
    });

    const first = governedConstraint(COLOR_ATTRIBUTE_ID);
    const second = governedConstraint(COLOR_ATTRIBUTE_ID, {
      constraintId: "constraint:color:second",
      valueId: "fixture:color-family:light",
    });
    const duplicateInput = {
      parserResult: parserResult([first, second]),
      policies: [categoricalPolicy(first), categoricalPolicy(second)],
      candidateSnapshot: inaccessibleSnapshot,
    };
    expect(
      runStructuredCategoricalFixtureSlice(
        structuredInput(duplicateInput),
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "DUPLICATE_GOVERNED_ATTRIBUTE",
    });
    expect(
      runStructuredCategoricalFixtureSlice(
        structuredInput({
          ...duplicateInput,
          parserResult: parserResult([first, second], {
            contradictions: [
              {
                constraintId: "contradiction:color",
                leftConstraintId: first.constraintId,
                rightConstraintId: second.constraintId,
                attributeId: COLOR_ATTRIBUTE_ID,
                kind: "MUTUALLY_EXCLUSIVE_VALUES",
              },
            ],
          }),
        }),
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "AFFECTING_CONTRADICTION",
    });
  });

  it("keeps a Stage-0-excluded but eligible candidate absent everywhere", () => {
    const color = governedConstraint();
    const allowed = candidateFixture();
    const excluded = candidate("excluded");
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([color]),
        policies: [categoricalPolicy(color)],
        stage0Proof: stage0Proof([
          { variantId: allowed.variantId, canonicalStyleId: allowed.canonicalStyleId },
        ]),
        candidateSnapshot: candidateSnapshot([allowed, excluded]),
        evidenceFixtures: [
          evidenceFixture(allowed, color),
          evidenceFixture(excluded, color),
        ],
        eligibilitySummaries: [
          eligibilitySummary(allowed),
          eligibilitySummary(excluded),
        ],
      }),
    );

    expect(result.status).toBe("COMPLETED");
    expect(JSON.stringify(result)).not.toContain(excluded.variantId);
    expect(JSON.stringify(result)).not.toContain(
      excluded.canonicalStyleId,
    );
  });

  it("preserves asserted, violating, unknown, withheld, vendor, and model truth separately", () => {
    const color = governedConstraint();
    const asserted = candidate("a");
    const violating = candidate("b");
    const missing = candidate("c");
    const conflict = candidate("d");
    const vendor = candidate("e");
    const model = candidate("f");
    const candidates = [
      model,
      conflict,
      missing,
      asserted,
      vendor,
      violating,
    ];
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([color]),
        policies: [categoricalPolicy(color)],
        stage0Proof: stage0Proof(pairsFor(candidates)),
        candidateSnapshot: candidateSnapshot(candidates),
        evidenceFixtures: [
          evidenceFixture(
            asserted,
            color,
            "HUMAN_CURATED_FROM_EVIDENCE",
          ),
          evidenceFixture(violating, color, "VERIFIED_OR_MEASURED", {
            value: {
              kind: "CATEGORICAL",
              valueId: "fixture:color-family:light",
            },
          }),
          evidenceFixture(conflict, color, "CONFLICTING"),
          evidenceFixture(vendor, color, "APPROVED_VENDOR_ATTESTED"),
          evidenceFixture(model, color, "MODEL_INFERRED"),
        ],
        eligibilitySummaries: candidates.map((entry) =>
          eligibilitySummary(entry),
        ),
      }),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.assertedCandidates.map((entry) => entry.displayedVariantId)).toEqual([
        asserted.variantId,
      ]);
      expect(result.violatingCandidates.map((entry) => entry.displayedVariantId)).toEqual([
        violating.variantId,
      ]);
      expect(result.withheldCandidates.map((entry) => entry.displayedVariantId)).toEqual([
        conflict.variantId,
      ]);
      expect(result.unknownCandidates.map((entry) => entry.displayedVariantId)).toEqual([
        missing.variantId,
        vendor.variantId,
        model.variantId,
      ]);
      const modelResult = result.unknownCandidates.find(
        (entry) => entry.displayedVariantId === model.variantId,
      );
      expect(modelResult?.productDecisions[0]?.reasons).toEqual([
        "MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY",
      ]);

      const decisions = [
        ...result.assertedCandidates,
        ...result.unknownCandidates,
        ...result.violatingCandidates,
        ...result.withheldCandidates,
      ].flatMap((entry) => entry.productDecisions);
      expect(decisions.every((decision) => Object.keys(decision).length === 11)).toBe(
        true,
      );
      expect(decisions.every((decision) => decision.gate !== "REQUIRE_MATCH")).toBe(
        true,
      );
      expect(
        decisions.every(
          (decision) => decision.score !== "PREFERENCE_ALLOWED",
        ),
      ).toBe(true);
    }
  });

  it("uses WITHHELD then VIOLATING then UNKNOWN then ASSERTED precedence for pairs", () => {
    const color = governedConstraint(COLOR_ATTRIBUTE_ID);
    const texture = governedConstraint(TEXTURE_ATTRIBUTE_ID);
    const asserted = candidate("a");
    const unknown = candidate("b");
    const violating = candidate("c");
    const withheld = candidate("d");
    const candidates = [withheld, violating, unknown, asserted];
    const mismatch = {
      kind: "CATEGORICAL" as const,
      valueId: "fixture:value:mismatch",
    };
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([texture, color]),
        policies: [categoricalPolicy(texture), categoricalPolicy(color)],
        stage0Proof: stage0Proof(pairsFor(candidates)),
        candidateSnapshot: candidateSnapshot(candidates),
        evidenceFixtures: [
          evidenceFixture(asserted, color),
          evidenceFixture(asserted, texture),
          evidenceFixture(unknown, color),
          evidenceFixture(violating, color, "VERIFIED_OR_MEASURED", {
            value: mismatch,
          }),
          evidenceFixture(violating, texture),
          evidenceFixture(withheld, color, "VERIFIED_OR_MEASURED", {
            value: mismatch,
          }),
          evidenceFixture(withheld, texture, "CONFLICTING"),
        ],
        eligibilitySummaries: candidates.map((entry) =>
          eligibilitySummary(entry),
        ),
      }),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.assertedCandidates[0]?.displayedVariantId).toBe(
        asserted.variantId,
      );
      expect(result.unknownCandidates[0]?.displayedVariantId).toBe(
        unknown.variantId,
      );
      expect(result.violatingCandidates[0]?.displayedVariantId).toBe(
        violating.variantId,
      );
      expect(result.withheldCandidates[0]?.displayedVariantId).toBe(
        withheld.variantId,
      );
      expect(result.withheldCandidates[0]?.productDecisions.map(
        (decision) => decision.partition,
      )).toEqual(["VIOLATING", "WITHHELD"]);
    }
  });

  it("returns inspectable zero asserted results without ranking or relaxation", () => {
    const color = governedConstraint();
    const mismatchCandidate = candidate("zero");
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([color]),
        policies: [categoricalPolicy(color)],
        stage0Proof: stage0Proof(pairsFor([mismatchCandidate])),
        candidateSnapshot: candidateSnapshot([mismatchCandidate]),
        evidenceFixtures: [
          evidenceFixture(
            mismatchCandidate,
            color,
            "VERIFIED_OR_MEASURED",
            {
              value: {
                kind: "CATEGORICAL",
                valueId: "fixture:color-family:other",
              },
            },
          ),
        ],
        eligibilitySummaries: [eligibilitySummary(mismatchCandidate)],
      }),
    );

    expect(result).toMatchObject({
      status: "COMPLETED",
      assertedCandidates: [],
      counts: { asserted: 0, violating: 1 },
      ranking: "NONE",
      relaxation: "NONE",
    });
    if (result.status === "COMPLETED") {
      expect(result.requestPlan.constraints).toHaveLength(1);
      expect(result.requestPlan.queryDecisions).toHaveLength(1);
    }
  });

  it("is repeatable, immutable, and independent of every fixture-array order", () => {
    const color = governedConstraint(COLOR_ATTRIBUTE_ID);
    const texture = governedConstraint(TEXTURE_ATTRIBUTE_ID);
    const first = candidate("a");
    const second = candidate("b");
    const evidence = [
      evidenceFixture(first, color),
      evidenceFixture(first, texture),
      evidenceFixture(second, color),
      evidenceFixture(second, texture),
    ];
    const eligibility = [
      eligibilitySummary(first),
      eligibilitySummary(second),
    ];
    const input = structuredInput({
      parserResult: parserResult([color, texture]),
      policies: [categoricalPolicy(color), categoricalPolicy(texture)],
      stage0Proof: stage0Proof(pairsFor([first, second])),
      candidateSnapshot: candidateSnapshot([first, second]),
      evidenceFixtures: evidence,
      eligibilitySummaries: eligibility,
    });
    const permuted: RunStructuredCategoricalFixtureSliceInput = {
      ...input,
      parserResult: parserResult([texture, color]),
      policies: [categoricalPolicy(texture), categoricalPolicy(color)],
      stage0Proof: stage0Proof(pairsFor([second, first])),
      candidateSnapshot: candidateSnapshot([second, first]),
      evidenceFixtures: [...evidence].reverse(),
      eligibilitySummaries: [...eligibility].reverse(),
    };
    const before = JSON.stringify(input);
    const permutedBefore = JSON.stringify(permuted);
    deepFreeze(input);
    deepFreeze(permuted);

    const baseline = runStructuredCategoricalFixtureSlice(input);
    expect(runStructuredCategoricalFixtureSlice(input)).toEqual(baseline);
    expect(runStructuredCategoricalFixtureSlice(permuted)).toEqual(
      baseline,
    );
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(permuted)).toBe(permutedBefore);
  });
});
