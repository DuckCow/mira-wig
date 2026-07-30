import { describe, expect, it } from "vitest";

import { validateStage0AuthorityUniverse } from "../authority-universe";
import { enumerateStructuredCandidateFixtures } from "../fixture-candidate-source";
import type {
  StructuredCandidateFixture,
  ValidatedStage0AuthorityUniverse,
} from "../types";
import {
  candidateFixture,
  candidateSnapshot,
  stage0Proof,
  STYLE_A,
  STYLE_B,
  syntheticContext,
  VARIANT_A,
  VARIANT_B,
} from "./fixtures";

function validatedStage0(
  pairs: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[] = [{ variantId: VARIANT_A, canonicalStyleId: STYLE_A }],
): ValidatedStage0AuthorityUniverse {
  const validation = validateStage0AuthorityUniverse(
    stage0Proof(pairs),
    syntheticContext(),
  );
  if (validation.status !== "VALIDATED") {
    throw new TypeError("Synthetic Stage-0 fixture must validate");
  }
  return validation;
}

describe("D6-B1 Stage-0 authority-universe proof", () => {
  it("binds validated canonical pairs to full caller context", () => {
    const result = validatedStage0([
      { variantId: VARIANT_B, canonicalStyleId: STYLE_B },
      { variantId: VARIANT_A, canonicalStyleId: STYLE_A },
    ]);

    expect(result.context).toEqual({
      marketCode: "KR",
      locale: "ko-KR",
      queryLanguage: { mode: "AUTO" },
      audienceNamespace: "HUMAN",
    });
    expect(result.allowedCanonicalPairs).toEqual([
      { variantId: VARIANT_A, canonicalStyleId: STYLE_A },
      { variantId: VARIANT_B, canonicalStyleId: STYLE_B },
    ]);
    expect(result.accountabilityKey).toContain(
      "d6-b1-stage-0-authority-universe/v0.1-provisional",
    );
  });

  it("rejects malformed provenance and caller-context mismatch", () => {
    const invalid = stage0Proof();
    Object.defineProperty(invalid, "synthetic", { value: false });

    expect(
      validateStage0AuthorityUniverse(invalid, syntheticContext()),
    ).toEqual({
      status: "STAGE0_REJECTED",
      reason: "STAGE0_PROVENANCE_INVALID",
    });
    expect(
      validateStage0AuthorityUniverse(
        stage0Proof(undefined, {
          context: {
            marketCode: "US",
            locale: "ko-KR",
            queryLanguage: { mode: "AUTO" },
            audienceNamespace: "HUMAN",
          },
        }),
        syntheticContext(),
      ),
    ).toEqual({
      status: "STAGE0_REJECTED",
      reason: "STAGE0_CONTEXT_MISMATCH",
    });
  });

  it("rejects duplicate membership and conflicting canonical parents deterministically", () => {
    expect(
      validateStage0AuthorityUniverse(
        stage0Proof([
          { variantId: VARIANT_A, canonicalStyleId: STYLE_A },
          { variantId: VARIANT_A, canonicalStyleId: STYLE_A },
        ]),
        syntheticContext(),
      ),
    ).toEqual({
      status: "STAGE0_REJECTED",
      reason: "DUPLICATE_STAGE0_MEMBERSHIP",
    });
    const conflictPairs = [
      { variantId: VARIANT_A, canonicalStyleId: STYLE_A },
      { variantId: VARIANT_A, canonicalStyleId: STYLE_B },
    ];
    for (const pairs of [conflictPairs, [...conflictPairs].reverse()]) {
      expect(
        validateStage0AuthorityUniverse(
          stage0Proof(pairs),
          syntheticContext(),
        ),
      ).toEqual({
        status: "STAGE0_REJECTED",
        reason: "CONFLICTING_STAGE0_STYLE_PARENT",
      });
    }
  });
});

describe("D6-B1 scoped fixture candidate source", () => {
  it("reads only exact Stage-0 membership keys before enumeration", () => {
    const allowed = candidateFixture();
    const excluded = candidateFixture(
      "fixture:variant:excluded",
      "fixture:style:excluded",
    );
    const reads: string[] = [];
    const candidateMap: Record<
      string,
      readonly StructuredCandidateFixture[]
    > = {
      [allowed.variantId]: [allowed],
      [excluded.variantId]: [excluded],
    };
    const trackedMap = new Proxy(candidateMap, {
      get: (target, property) => {
        reads.push(String(property));
        return typeof property === "string"
          ? target[property]
          : undefined;
      },
    });
    const result = enumerateStructuredCandidateFixtures(
      {
        ...candidateSnapshot(),
        candidatesByVariantId: trackedMap,
      },
      validatedStage0(),
    );

    expect(result.status).toBe("SCOPED_CANDIDATES");
    expect(reads).toEqual([VARIANT_A]);
    expect(JSON.stringify(result)).not.toContain(excluded.variantId);
  });

  it("rejects malformed, duplicate, and conflicting-parent scoped candidates", () => {
    const malformed = candidateFixture();
    Object.defineProperty(malformed, "fixtureOnly", { value: false });
    const duplicateA = candidateFixture();
    const duplicateB = candidateFixture();
    const parentMismatch = candidateFixture(VARIANT_A, STYLE_B);

    expect(
      enumerateStructuredCandidateFixtures(
        candidateSnapshot([malformed]),
        validatedStage0(),
      ),
    ).toMatchObject({
      status: "CANDIDATE_SOURCE_REJECTED",
      reason: "CANDIDATE_FIXTURE_PROVENANCE_INVALID",
    });
    expect(
      enumerateStructuredCandidateFixtures(
        {
          ...candidateSnapshot(),
          candidatesByVariantId: {
            [VARIANT_A]: [duplicateA, duplicateB],
          },
        },
        validatedStage0(),
      ),
    ).toMatchObject({
      status: "CANDIDATE_SOURCE_REJECTED",
      reason: "DUPLICATE_CANDIDATE_VARIANT_ID",
    });
    expect(
      enumerateStructuredCandidateFixtures(
        candidateSnapshot([parentMismatch]),
        validatedStage0(),
      ),
    ).toMatchObject({
      status: "CANDIDATE_SOURCE_REJECTED",
      reason: "CANDIDATE_CANONICAL_PARENT_MISMATCH",
    });
  });

  it("keeps unrelated source inputs out of candidate accountability", () => {
    const allowed = candidateFixture();
    const unrelated = candidateFixture(
      "fixture:variant:unrelated",
      "fixture:style:unrelated",
    );
    const baseline = enumerateStructuredCandidateFixtures(
      candidateSnapshot([allowed]),
      validatedStage0(),
    );
    const withUnrelated = enumerateStructuredCandidateFixtures(
      candidateSnapshot([unrelated, allowed]),
      validatedStage0(),
    );

    expect(withUnrelated).toEqual(baseline);
    if (
      baseline.status === "SCOPED_CANDIDATES" &&
      withUnrelated.status === "SCOPED_CANDIDATES"
    ) {
      expect(withUnrelated.attribution.accountabilityKey).toBe(
        baseline.attribution.accountabilityKey,
      );
    }
  });
});
