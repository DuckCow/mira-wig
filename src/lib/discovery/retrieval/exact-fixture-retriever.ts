import type {
  CandidateFixtureFailureReason,
  ExactCandidateFixture,
  ExactCandidateFixtureSnapshot,
  ExactCandidateLookup,
  ExactFixtureIdentity,
} from "./types";
import { D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankToken(value: string): boolean {
  return value.length > 0 && value.trim() === value;
}

function identityKey(identity: ExactFixtureIdentity): string {
  return JSON.stringify([identity.namespace, identity.canonicalValue]);
}

function snapshotProvenanceIsValid(
  snapshot: ExactCandidateFixtureSnapshot,
): boolean {
  return (
    snapshot.fixtureOnly &&
    snapshot.synthetic &&
    snapshot.fixtureSnapshotVersion ===
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    snapshot.candidateSourceVersion ===
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.candidateSource
  );
}

function candidateProvenanceIsValid(
  candidate: ExactCandidateFixture,
  snapshot: ExactCandidateFixtureSnapshot,
): boolean {
  return (
    candidate.fixtureOnly &&
    candidate.synthetic &&
    candidate.fixtureSnapshotVersion === snapshot.fixtureSnapshotVersion &&
    candidate.candidateSourceVersion === snapshot.candidateSourceVersion &&
    candidate.identity.namespace === "SKU" &&
    isNonblankToken(candidate.identity.canonicalValue) &&
    isNonblankToken(candidate.variantId) &&
    isNonblankToken(candidate.canonicalStyleId)
  );
}

function validateSnapshot(
  snapshot: ExactCandidateFixtureSnapshot,
): CandidateFixtureFailureReason | null {
  if (!snapshotProvenanceIsValid(snapshot)) {
    return "CANDIDATE_SNAPSHOT_PROVENANCE_INVALID";
  }

  const identities = new Set<string>();
  for (const candidate of snapshot.candidates) {
    if (!candidateProvenanceIsValid(candidate, snapshot)) {
      return "CANDIDATE_FIXTURE_PROVENANCE_INVALID";
    }

    const key = identityKey(candidate.identity);
    if (identities.has(key)) {
      return "DUPLICATE_CANONICAL_SKU";
    }
    identities.add(key);
  }

  return null;
}

function candidateSetFingerprint(
  snapshot: ExactCandidateFixtureSnapshot,
  identity: ExactFixtureIdentity,
  candidate: ExactCandidateFixture | undefined,
): string {
  return JSON.stringify([
    snapshot.fixtureSnapshotVersion,
    snapshot.candidateSourceVersion,
    identity.namespace,
    identity.canonicalValue,
    candidate?.variantId ?? null,
    candidate?.canonicalStyleId ?? null,
  ]);
}

export function retrieveExactCandidateFixture(
  snapshot: ExactCandidateFixtureSnapshot,
  identity: ExactFixtureIdentity,
): ExactCandidateLookup {
  const fixtureFailure = validateSnapshot(snapshot);
  if (fixtureFailure !== null) {
    return { status: "FIXTURE_INVALID", reason: fixtureFailure };
  }

  const candidate = snapshot.candidates.find(
    (entry) =>
      entry.identity.namespace === identity.namespace &&
      entry.identity.canonicalValue === identity.canonicalValue,
  );
  const fingerprint = candidateSetFingerprint(snapshot, identity, candidate);

  if (candidate === undefined) {
    return {
      status: "EXACT_NOT_FOUND",
      reasons: ["EXACT_IDENTITY_NO_SUBSTITUTION"],
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
      candidateSetFingerprint: fingerprint,
    };
  }

  return {
    status: "MATCH",
    candidate,
    candidateSetFingerprint: fingerprint,
  };
}
