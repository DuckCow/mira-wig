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
  const variantIdentities = new Map<string, string>();
  let duplicateCanonicalSku = false;
  let duplicateVariantId = false;
  for (const candidate of snapshot.candidates) {
    if (!candidateProvenanceIsValid(candidate, snapshot)) {
      return "CANDIDATE_FIXTURE_PROVENANCE_INVALID";
    }

    const key = identityKey(candidate.identity);
    if (identities.has(key)) {
      duplicateCanonicalSku = true;
    }
    identities.add(key);

    const existingVariantIdentity = variantIdentities.get(candidate.variantId);
    if (
      existingVariantIdentity !== undefined &&
      existingVariantIdentity !== key
    ) {
      duplicateVariantId = true;
    }
    variantIdentities.set(candidate.variantId, key);
  }

  if (duplicateCanonicalSku) {
    return "DUPLICATE_CANONICAL_SKU";
  }
  if (duplicateVariantId) {
    return "DUPLICATE_VARIANT_ID";
  }

  return null;
}

function exactLookupAccountabilityKey(
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
  const accountabilityKey = exactLookupAccountabilityKey(
    snapshot,
    identity,
    candidate,
  );

  if (candidate === undefined) {
    return {
      status: "EXACT_NOT_FOUND",
      reasons: ["EXACT_IDENTITY_NO_SUBSTITUTION"],
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
      exactLookupAccountabilityKey: accountabilityKey,
    };
  }

  return {
    status: "MATCH",
    candidate,
    exactLookupAccountabilityKey: accountabilityKey,
  };
}
