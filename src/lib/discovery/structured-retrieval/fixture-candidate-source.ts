import type {
  ScopedStructuredCandidates,
  Stage0AllowedCanonicalPair,
  StructuredCandidateEnumeration,
  StructuredCandidateFixture,
  StructuredCandidateFixtureSnapshot,
  ValidatedStage0AuthorityUniverse,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function snapshotProvenanceIsValid(
  snapshot: StructuredCandidateFixtureSnapshot,
): boolean {
  return (
    snapshot.fixtureOnly === true &&
    snapshot.synthetic === true &&
    snapshot.fixtureSnapshotVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    snapshot.candidateSourceVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.candidateSource &&
    typeof snapshot.candidatesByVariantId === "object" &&
    snapshot.candidatesByVariantId !== null
  );
}

function candidateProvenanceIsValid(
  candidate: StructuredCandidateFixture,
  snapshot: StructuredCandidateFixtureSnapshot,
  membership: Stage0AllowedCanonicalPair,
): boolean {
  return (
    candidate.fixtureOnly === true &&
    candidate.synthetic === true &&
    candidate.fixtureSnapshotVersion === snapshot.fixtureSnapshotVersion &&
    candidate.candidateSourceVersion === snapshot.candidateSourceVersion &&
    isNonblankRuntimeString(candidate.variantId) &&
    isNonblankRuntimeString(candidate.canonicalStyleId) &&
    candidate.variantId === membership.variantId
  );
}

function candidatesForMembership(
  snapshot: StructuredCandidateFixtureSnapshot,
  membership: Stage0AllowedCanonicalPair,
): readonly StructuredCandidateFixture[] | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      snapshot.candidatesByVariantId,
      membership.variantId,
    )
  ) {
    return [];
  }

  const candidates =
    snapshot.candidatesByVariantId[membership.variantId];
  return Array.isArray(candidates) ? candidates : null;
}

function copyCandidate(
  candidate: StructuredCandidateFixture,
): StructuredCandidateFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion: candidate.fixtureSnapshotVersion,
    candidateSourceVersion: candidate.candidateSourceVersion,
    variantId: candidate.variantId,
    canonicalStyleId: candidate.canonicalStyleId,
  };
}

function scopedCandidates(
  snapshot: StructuredCandidateFixtureSnapshot,
  stage0Proof: ValidatedStage0AuthorityUniverse,
  candidates: readonly StructuredCandidateFixture[],
): ScopedStructuredCandidates {
  const enumeratedCandidateIdentities = candidates.map((candidate) => ({
    variantId: candidate.variantId,
    canonicalStyleId: candidate.canonicalStyleId,
  }));
  const scopedMembership = stage0Proof.allowedCanonicalPairs.map((pair) => ({
    variantId: pair.variantId,
    canonicalStyleId: pair.canonicalStyleId,
  }));
  return {
    status: "SCOPED_CANDIDATES",
    candidates,
    attribution: {
      fixtureSnapshotVersion: snapshot.fixtureSnapshotVersion,
      candidateSourceVersion: snapshot.candidateSourceVersion,
      scopedMembership,
      enumeratedCandidateIdentities,
      accountabilityKey: JSON.stringify([
        snapshot.fixtureSnapshotVersion,
        snapshot.candidateSourceVersion,
        scopedMembership,
        enumeratedCandidateIdentities,
      ]),
    },
  };
}

export function enumerateStructuredCandidateFixtures(
  snapshot: StructuredCandidateFixtureSnapshot,
  stage0Proof: ValidatedStage0AuthorityUniverse,
): StructuredCandidateEnumeration {
  if (!snapshotProvenanceIsValid(snapshot)) {
    return {
      status: "CANDIDATE_SOURCE_REJECTED",
      reason: "CANDIDATE_SOURCE_PROVENANCE_INVALID",
    };
  }

  const candidates: StructuredCandidateFixture[] = [];
  for (const membership of stage0Proof.allowedCanonicalPairs) {
    const membershipCandidates = candidatesForMembership(
      snapshot,
      membership,
    );
    if (
      membershipCandidates === null ||
      membershipCandidates.some(
        (candidate) =>
          !candidateProvenanceIsValid(
            candidate,
            snapshot,
            membership,
          ),
      )
    ) {
      return {
        status: "CANDIDATE_SOURCE_REJECTED",
        reason: "CANDIDATE_FIXTURE_PROVENANCE_INVALID",
      };
    }
    if (membershipCandidates.length > 1) {
      return {
        status: "CANDIDATE_SOURCE_REJECTED",
        reason: "DUPLICATE_CANDIDATE_VARIANT_ID",
      };
    }

    const candidate = membershipCandidates[0];
    if (candidate === undefined) {
      continue;
    }
    if (candidate.canonicalStyleId !== membership.canonicalStyleId) {
      return {
        status: "CANDIDATE_SOURCE_REJECTED",
        reason: "CANDIDATE_CANONICAL_PARENT_MISMATCH",
      };
    }
    candidates.push(copyCandidate(candidate));
  }

  return scopedCandidates(snapshot, stage0Proof, candidates);
}
