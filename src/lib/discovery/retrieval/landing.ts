import type {
  CatalogIdentityProofFixture,
  ExactLandingIntent,
  ExactLandingVerification,
  ExactVariantResult,
} from "./types";

export function buildExactLandingIntent(
  result: ExactVariantResult,
): ExactLandingIntent {
  return {
    displayedStyleId: result.displayedStyleId,
    displayedVariantId: result.displayedVariantId,
    priceBasis: result.priceBasis,
    exactIdentity: { ...result.exactIdentity },
    fallbackRoutes: [...result.d5Decision.fallbackRoutes],
    speechRequirements: [...result.d5Decision.speechRequirements],
    exactLookupAccountabilityKey: result.exactLookupAccountabilityKey,
    candidateSourceVersion: result.candidateSourceVersion,
    fixtureSnapshotVersion: result.fixtureSnapshotVersion,
    admissionVersion: result.admissionVersion,
    landingVersion: result.landingVersion,
    d5Versions: { ...result.d5Versions },
  };
}

export function verifyExactLanding(
  intent: ExactLandingIntent,
  proof: CatalogIdentityProofFixture,
): ExactLandingVerification {
  const matches =
    intent.displayedVariantId === proof.variantId &&
    intent.displayedStyleId === proof.canonicalStyleId &&
    intent.exactIdentity.namespace === proof.identity.namespace &&
    intent.exactIdentity.canonicalValue === proof.identity.canonicalValue &&
    intent.fixtureSnapshotVersion === proof.fixtureSnapshotVersion;

  return matches
    ? { status: "VERIFIED" }
    : {
        status: "LANDING_INTEGRITY_MISMATCH",
        reason: "LANDING_INTEGRITY_MISMATCH",
      };
}
