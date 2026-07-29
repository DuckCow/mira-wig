import { describe, expect, it } from "vitest";

import { runExactSkuFixtureSlice } from "../exact-slice";
import {
  candidateFixture,
  candidateSnapshot,
  catalogProof,
  eligibilitySummary,
  exactConstraint,
  exactContradiction,
  exactSliceInput,
  nonExactConstraint,
  parserResult,
} from "./fixtures/synthetic-fixtures";

describe("D6-A1 exact SKU fixture slice", () => {
  it("admits one exact variant through D5 and the mandatory choke point", () => {
    const result = runExactSkuFixtureSlice(exactSliceInput());

    expect(result.status).toBe("ADMITTED");
    expect(result.eventDelivery).toEqual({ status: "DISABLED" });
    if (result.status === "ADMITTED") {
      expect(result.result.exactIdentity).toEqual({
        namespace: "SKU",
        canonicalValue: "SKU-EXACT-001",
      });
      expect(result.result.d5Decision.reasons).toEqual([
        "EXACT_IDENTITY_MATCH",
        "EXACT_IDENTITY_NO_SUBSTITUTION",
      ]);
      expect(result.result.priceBasis).toBe("SELECTED_VARIANT");
      expect(result.result.amount).toBe(85000);
      expect(result.result.displayedVariantId).toBe("variant-exact-001");
      expect(result.result.displayedStyleId).toBe("style-exact-001");
    }
  });

  it("returns exact-not-found before any sibling or alternative", () => {
    const result = runExactSkuFixtureSlice(
      exactSliceInput({
        candidateSnapshot: candidateSnapshot([
          candidateFixture({
            variantId: "variant-sibling",
            identity: {
              namespace: "SKU",
              canonicalValue: "SKU-SIBLING-001",
            },
          }),
        ]),
      }),
    );

    expect(result).toMatchObject({
      status: "EXACT_NOT_FOUND",
      reasons: ["EXACT_IDENTITY_NO_SUBSTITUTION"],
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
      eventDelivery: { status: "DISABLED" },
    });
    expect(result).not.toHaveProperty("result");
  });

  it("rejects a duplicate candidate fixture without constructing a result", () => {
    const result = runExactSkuFixtureSlice(
      exactSliceInput({
        candidateSnapshot: candidateSnapshot([
          candidateFixture({ variantId: "variant-duplicate-a" }),
          candidateFixture({ variantId: "variant-duplicate-b" }),
        ]),
      }),
    );

    expect(result).toEqual({
      status: "FIXTURE_INVALID",
      reason: "DUPLICATE_CANONICAL_SKU",
      eventDelivery: { status: "DISABLED" },
    });
  });

  it("does not consult candidates for unsupported or multi-constraint requests", () => {
    const invalidSnapshot = candidateSnapshot([
      candidateFixture({ variantId: "variant-duplicate-a" }),
      candidateFixture({ variantId: "variant-duplicate-b" }),
    ]);

    expect(
      runExactSkuFixtureSlice(
        exactSliceInput({
          parserResult: parserResult([
            exactConstraint({ namespace: "UPC" }),
          ]),
          candidateSnapshot: invalidSnapshot,
        }),
      ),
    ).toMatchObject({
      status: "UNSUPPORTED_EXACT_NAMESPACE",
      reason: "UNSUPPORTED_EXACT_NAMESPACE",
    });
    expect(
      runExactSkuFixtureSlice(
        exactSliceInput({
          parserResult: parserResult([
            exactConstraint(),
            nonExactConstraint(),
          ]),
          candidateSnapshot: invalidSnapshot,
        }),
      ),
    ).toMatchObject({
      status: "REQUEST_NOT_APPLICABLE",
      reason: "ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE",
    });
  });

  it("does not consult candidates for contradicted exact identity", () => {
    const result = runExactSkuFixtureSlice(
      exactSliceInput({
        parserResult: parserResult(
          [exactConstraint()],
          [exactContradiction()],
        ),
        candidateSnapshot: candidateSnapshot([
          candidateFixture({ variantId: "variant-duplicate-a" }),
          candidateFixture({ variantId: "variant-duplicate-b" }),
        ]),
      }),
    );

    expect(result).toMatchObject({
      status: "REQUEST_INVALID",
      reason: "EXACT_IDENTITY_CONTRADICTED",
    });
  });

  it("is deterministic under unrelated fixture permutations and mutates no input", () => {
    const exactCandidate = candidateFixture();
    const unrelatedCandidate = candidateFixture({
      variantId: "variant-unrelated",
      canonicalStyleId: "style-unrelated",
      identity: {
        namespace: "SKU",
        canonicalValue: "SKU-UNRELATED-001",
      },
    });
    const exactProof = catalogProof();
    const unrelatedProof = catalogProof({
      variantId: "variant-unrelated",
      canonicalStyleId: "style-unrelated",
      identity: {
        namespace: "SKU",
        canonicalValue: "SKU-UNRELATED-001",
      },
      syntheticEvidenceRef: "synthetic-evidence:unrelated",
    });
    const exactEligibility = eligibilitySummary();
    const unrelatedEligibility = eligibilitySummary({
      variantId: "variant-unrelated",
      reason: "synthetic-unrelated",
    });
    const firstInput = exactSliceInput({
      candidateSnapshot: candidateSnapshot([
        exactCandidate,
        unrelatedCandidate,
      ]),
      catalogProofs: [exactProof, unrelatedProof],
      eligibilitySummaries: [exactEligibility, unrelatedEligibility],
    });
    const secondInput = exactSliceInput({
      candidateSnapshot: candidateSnapshot([
        unrelatedCandidate,
        exactCandidate,
      ]),
      catalogProofs: [unrelatedProof, exactProof],
      eligibilitySummaries: [unrelatedEligibility, exactEligibility],
    });
    const firstBefore = JSON.stringify(firstInput);
    const secondBefore = JSON.stringify(secondInput);

    const first = runExactSkuFixtureSlice(firstInput);
    const firstRepeat = runExactSkuFixtureSlice(firstInput);
    const second = runExactSkuFixtureSlice(secondInput);

    expect(firstRepeat).toEqual(first);
    expect(second).toEqual(first);
    expect(JSON.stringify(firstInput)).toBe(firstBefore);
    expect(JSON.stringify(secondInput)).toBe(secondBefore);
  });
});
