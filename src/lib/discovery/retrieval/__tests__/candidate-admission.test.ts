import { describe, expect, it } from "vitest";

import {
  admitExactCandidate,
  assessExactSliceRequest,
} from "../candidate-admission";
import { retrieveExactCandidateFixture } from "../exact-fixture-retriever";
import type {
  AdmitExactCandidateInput,
  ApplicableExactSliceRequest,
  EligibilitySummaryFixture,
} from "../types";
import {
  candidateSnapshot,
  catalogProof,
  eligibilitySummary,
  exactConstraint,
  exactContradiction,
  EXACT_SKU,
  nonExactConstraint,
  parserResult,
  syntheticContext,
} from "./fixtures/synthetic-fixtures";

function applicableRequest(): ApplicableExactSliceRequest {
  const request = assessExactSliceRequest(parserResult());
  if (request.status !== "APPLICABLE") {
    throw new TypeError("Synthetic exact request must be applicable");
  }
  return request;
}

function admissionInput(
  overrides: Partial<AdmitExactCandidateInput> = {},
): AdmitExactCandidateInput {
  const lookup = retrieveExactCandidateFixture(candidateSnapshot(), {
    namespace: "SKU",
    canonicalValue: EXACT_SKU,
  });
  if (lookup.status !== "MATCH") {
    throw new TypeError("Synthetic exact candidate must resolve");
  }

  return {
    request: applicableRequest(),
    context: syntheticContext(),
    candidate: lookup.candidate,
    candidateSetFingerprint: lookup.candidateSetFingerprint,
    catalogProofs: [catalogProof()],
    eligibilitySummaries: [eligibilitySummary()],
    d5Versions: {
      normalizer: "d5-conservative-normalizer/v0.1",
      parser: "d5-injected-span-parser/v0.1",
      constraintRules: "d5-constraint-decisions/v0.1",
      lexicon: "synthetic-lexicon/v0.1-provisional",
      ontology: "synthetic-ontology/v0.1-provisional",
    },
    ...overrides,
  };
}

describe("exact request applicability", () => {
  it("does not run without an exact identity", () => {
    expect(assessExactSliceRequest(parserResult([]))).toEqual({
      status: "REQUEST_NOT_APPLICABLE",
      reason: "NO_EXACT_IDENTITY",
    });
  });

  it("does not run when an additional constraint is present", () => {
    expect(
      assessExactSliceRequest(
        parserResult([exactConstraint(), nonExactConstraint()]),
      ),
    ).toEqual({
      status: "REQUEST_NOT_APPLICABLE",
      reason: "ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE",
    });
  });

  it("rejects multiple exact identities before candidate lookup", () => {
    expect(
      assessExactSliceRequest(
        parserResult([
          exactConstraint(),
          exactConstraint({
            constraintId: "constraint:exact-2",
            value: "SKU-EXACT-002",
          }),
        ]),
      ),
    ).toEqual({
      status: "REQUEST_INVALID",
      reason: "MULTIPLE_EXACT_IDENTITIES",
    });
  });

  it("rejects unsupported namespaces and blank values explicitly", () => {
    expect(
      assessExactSliceRequest(
        parserResult([exactConstraint({ namespace: "UPC" })]),
      ),
    ).toEqual({
      status: "UNSUPPORTED_EXACT_NAMESPACE",
      reason: "UNSUPPORTED_EXACT_NAMESPACE",
    });
    expect(
      assessExactSliceRequest(
        parserResult([exactConstraint({ value: " " })]),
      ),
    ).toEqual({
      status: "REQUEST_INVALID",
      reason: "BLANK_EXACT_IDENTITY",
    });
  });

  it("rejects unresolved or contradicted exact identities", () => {
    expect(
      assessExactSliceRequest(
        parserResult([
          exactConstraint({ interpretationState: "UNRESOLVED" }),
        ]),
      ),
    ).toEqual({
      status: "REQUEST_INVALID",
      reason: "EXACT_IDENTITY_UNRESOLVED",
    });
    expect(
      assessExactSliceRequest(
        parserResult([exactConstraint()], [exactContradiction()]),
      ),
    ).toEqual({
      status: "REQUEST_INVALID",
      reason: "EXACT_IDENTITY_CONTRADICTED",
    });
  });
});

describe("mandatory exact candidate admission", () => {
  it("uses the frozen D5 exact decision and selected-variant price", () => {
    const result = admitExactCandidate(admissionInput());

    expect(result.status).toBe("ADMITTED");
    if (result.status === "ADMITTED") {
      expect(result.result.d5Decision).toMatchObject({
        gate: "ASSERT_MATCH",
        partition: "ASSERTED",
        reasons: [
          "EXACT_IDENTITY_MATCH",
          "EXACT_IDENTITY_NO_SUBSTITUTION",
        ],
      });
      expect(result.result).toMatchObject({
        displayedStyleId: "style-exact-001",
        displayedVariantId: "variant-exact-001",
        priceBasis: "SELECTED_VARIANT",
        amount: 85000,
        currency: "KRW",
      });
    }
  });

  it("rejects a candidate that does not preserve the applicable request", () => {
    expect(
      admitExactCandidate(
        admissionInput({
          candidate: {
            ...admissionInput().candidate,
            identity: {
              namespace: "SKU",
              canonicalValue: "SKU-OTHER-001",
            },
          },
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CANDIDATE_SOURCE_PROVENANCE_INVALID",
    });
  });

  it("rejects missing and duplicate catalog proofs", () => {
    expect(
      admitExactCandidate(admissionInput({ catalogProofs: [] })),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CATALOG_PROOF_MISSING",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          catalogProofs: [
            catalogProof(),
            catalogProof({
              syntheticEvidenceRef: "synthetic-evidence:duplicate",
            }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CATALOG_PROOF_DUPLICATE",
    });
  });

  it("rejects variant and canonical-style proof mismatches without repair", () => {
    expect(
      admitExactCandidate(
        admissionInput({
          catalogProofs: [catalogProof({ variantId: "variant-other" })],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CANDIDATE_IDENTITY_INTEGRITY_MISMATCH",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          catalogProofs: [
            catalogProof({ canonicalStyleId: "style-other" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CANDIDATE_IDENTITY_INTEGRITY_MISMATCH",
    });
  });

  it("distinguishes missing, duplicate, and market-mismatched summaries", () => {
    expect(
      admitExactCandidate(admissionInput({ eligibilitySummaries: [] })),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_SUMMARY_MISSING",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          eligibilitySummaries: [
            eligibilitySummary(),
            eligibilitySummary({ reason: "synthetic-duplicate" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_SUMMARY_DUPLICATE",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          eligibilitySummaries: [
            eligibilitySummary({ marketCode: "US" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_IDENTITY_MISMATCH",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          eligibilitySummaries: [
            eligibilitySummary({ version: "synthetic-stale-snapshot" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_IDENTITY_MISMATCH",
    });
  });

  it("keeps unknown and ineligible fixture outcomes distinct", () => {
    expect(
      admitExactCandidate(
        admissionInput({
          eligibilitySummaries: [
            eligibilitySummary({ outcome: "UNKNOWN_FIXTURE" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_SUMMARY_UNKNOWN",
    });
    expect(
      admitExactCandidate(
        admissionInput({
          eligibilitySummaries: [
            eligibilitySummary({ outcome: "INELIGIBLE_FIXTURE" }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "ELIGIBILITY_SUMMARY_INELIGIBLE",
    });
  });

  it.each([
    { selectedVariantAmount: -1, currency: "KRW" },
    { selectedVariantAmount: 1.5, currency: "KRW" },
    { selectedVariantAmount: null, currency: "KRW" },
    { selectedVariantAmount: 85000, currency: null },
    { selectedVariantAmount: 85000, currency: " " },
  ] satisfies readonly Partial<EligibilitySummaryFixture>[])(
    "rejects structurally invalid admitted price data %#",
    (fixture) => {
      expect(
        admitExactCandidate(
          admissionInput({
            eligibilitySummaries: [eligibilitySummary(fixture)],
          }),
        ),
      ).toMatchObject({
        status: "ADMISSION_REJECTED",
        reason: "SELECTED_VARIANT_PRICE_INVALID",
      });
    },
  );

  it("never substitutes a lower sibling price", () => {
    const result = admitExactCandidate(
      admissionInput({
        eligibilitySummaries: [
          eligibilitySummary(),
          eligibilitySummary({
            variantId: "variant-lower-sibling",
            selectedVariantAmount: 10000,
          }),
        ],
      }),
    );

    expect(result.status).toBe("ADMITTED");
    if (result.status === "ADMITTED") {
      expect(result.result.amount).toBe(85000);
      expect(result.result).not.toHaveProperty("styleMinimumPrice");
    }
  });
});
