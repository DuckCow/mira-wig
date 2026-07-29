import { describe, expect, it } from "vitest";

import { retrieveExactCandidateFixture } from "../exact-fixture-retriever";
import {
  candidateFixture,
  candidateSnapshot,
  EXACT_SKU,
} from "./fixtures/synthetic-fixtures";

describe("exact fixture retriever", () => {
  it("returns exactly the canonical SKU candidate without normalization", () => {
    const result = retrieveExactCandidateFixture(candidateSnapshot(), {
      namespace: "SKU",
      canonicalValue: EXACT_SKU,
    });

    expect(result.status).toBe("MATCH");
    if (result.status === "MATCH") {
      expect(result.candidate.identity.canonicalValue).toBe(EXACT_SKU);
      expect(result.candidateSetFingerprint).toBe(
        JSON.stringify([
          "d6-exact-retrieval-fixture/v0.1-provisional",
          "d6-exact-fixture-retriever/v0.1-provisional",
          "SKU",
          EXACT_SKU,
          "variant-exact-001",
          "style-exact-001",
        ]),
      );
    }

    expect(
      retrieveExactCandidateFixture(candidateSnapshot(), {
        namespace: "SKU",
        canonicalValue: EXACT_SKU.toLowerCase(),
      }).status,
    ).toBe("EXACT_NOT_FOUND");
  });

  it("returns an explicit exact miss with frozen no-substitution semantics", () => {
    const result = retrieveExactCandidateFixture(
      candidateSnapshot([
        candidateFixture({
          variantId: "variant-sibling",
          identity: {
            namespace: "SKU",
            canonicalValue: "SKU-SIBLING-001",
          },
        }),
      ]),
      { namespace: "SKU", canonicalValue: "SKU-MISSING-001" },
    );

    expect(result).toMatchObject({
      status: "EXACT_NOT_FOUND",
      reasons: ["EXACT_IDENTITY_NO_SUBSTITUTION"],
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
    });
    expect(result).not.toHaveProperty("candidate");
  });

  it("rejects duplicate canonical SKU identities before lookup", () => {
    const first = candidateFixture({ variantId: "variant-duplicate-a" });
    const second = candidateFixture({ variantId: "variant-duplicate-b" });
    const forward = retrieveExactCandidateFixture(
      candidateSnapshot([first, second]),
      { namespace: "SKU", canonicalValue: EXACT_SKU },
    );
    const reverse = retrieveExactCandidateFixture(
      candidateSnapshot([second, first]),
      { namespace: "SKU", canonicalValue: EXACT_SKU },
    );

    expect(forward).toEqual({
      status: "FIXTURE_INVALID",
      reason: "DUPLICATE_CANONICAL_SKU",
    });
    expect(reverse).toEqual(forward);
  });

  it("rejects inconsistent snapshot and candidate provenance", () => {
    const invalidSnapshot = {
      ...candidateSnapshot(),
      candidateSourceVersion: "synthetic-unreviewed-source",
    };
    const invalidCandidate = candidateFixture({
      candidateSourceVersion: "synthetic-unreviewed-source",
    });

    expect(
      retrieveExactCandidateFixture(invalidSnapshot, {
        namespace: "SKU",
        canonicalValue: EXACT_SKU,
      }),
    ).toEqual({
      status: "FIXTURE_INVALID",
      reason: "CANDIDATE_SNAPSHOT_PROVENANCE_INVALID",
    });
    expect(
      retrieveExactCandidateFixture(candidateSnapshot([invalidCandidate]), {
        namespace: "SKU",
        canonicalValue: EXACT_SKU,
      }),
    ).toEqual({
      status: "FIXTURE_INVALID",
      reason: "CANDIDATE_FIXTURE_PROVENANCE_INVALID",
    });
  });

  it("keeps unrelated input order out of candidate accountability", () => {
    const exact = candidateFixture();
    const unrelated = candidateFixture({
      variantId: "variant-unrelated",
      canonicalStyleId: "style-unrelated",
      identity: {
        namespace: "SKU",
        canonicalValue: "SKU-UNRELATED-001",
      },
    });
    const before = JSON.stringify([exact, unrelated]);
    const first = retrieveExactCandidateFixture(
      candidateSnapshot([exact, unrelated]),
      { namespace: "SKU", canonicalValue: EXACT_SKU },
    );
    const second = retrieveExactCandidateFixture(
      candidateSnapshot([unrelated, exact]),
      { namespace: "SKU", canonicalValue: EXACT_SKU },
    );

    expect(first).toEqual(second);
    expect(JSON.stringify([exact, unrelated])).toBe(before);
  });
});
