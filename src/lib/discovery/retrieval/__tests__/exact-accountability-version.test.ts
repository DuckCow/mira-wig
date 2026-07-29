import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  D6ExactRetrievalComponentVersions,
  ExactCandidateFixture,
  ExactCandidateFixtureSnapshot,
} from "../types";

const BASE_VERSIONS: D6ExactRetrievalComponentVersions = {
  candidateSource: "candidate-source/base",
  admissionRules: "admission/base",
  landingContract: "landing/base",
  eventSchema: "event/base",
  fixtureSnapshot: "fixture/base",
};

async function accountabilityKeyFor(
  versions: D6ExactRetrievalComponentVersions,
): Promise<string> {
  vi.resetModules();
  vi.doMock("../versions", () => ({
    D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS: versions,
  }));
  const { retrieveExactCandidateFixture } = await import(
    "../exact-fixture-retriever"
  );
  const candidate: ExactCandidateFixture = {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion: versions.fixtureSnapshot,
    candidateSourceVersion: versions.candidateSource,
    variantId: "variant-version-test",
    canonicalStyleId: "style-version-test",
    identity: {
      namespace: "SKU",
      canonicalValue: "SKU-VERSION-TEST",
    },
  };
  const snapshot: ExactCandidateFixtureSnapshot = {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion: versions.fixtureSnapshot,
    candidateSourceVersion: versions.candidateSource,
    candidates: [candidate],
  };
  const result = retrieveExactCandidateFixture(snapshot, candidate.identity);
  if (result.status !== "MATCH") {
    throw new TypeError("Synthetic version fixture must resolve");
  }
  return result.exactLookupAccountabilityKey;
}

afterEach(() => {
  vi.doUnmock("../versions");
  vi.resetModules();
});

describe("exact lookup accountability version inputs", () => {
  it("changes with candidate-source and fixture-snapshot versions", async () => {
    const baseline = await accountabilityKeyFor(BASE_VERSIONS);
    const changedCandidateSource = await accountabilityKeyFor({
      ...BASE_VERSIONS,
      candidateSource: "candidate-source/changed",
    });
    const changedFixtureSnapshot = await accountabilityKeyFor({
      ...BASE_VERSIONS,
      fixtureSnapshot: "fixture/changed",
    });

    expect(changedCandidateSource).not.toBe(baseline);
    expect(changedFixtureSnapshot).not.toBe(baseline);
  });
});
