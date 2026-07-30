import type {
  StructuredCandidateFixture,
  StructuredCandidateResultCore,
  StructuredEligibilitySummaryFixture,
  StructuredLandingIntent,
  StructuredLandingVerification,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

export function buildStructuredLandingIntent(
  result: StructuredCandidateResultCore,
): StructuredLandingIntent {
  return {
    displayedVariantId: result.displayedVariantId,
    displayedStyleId: result.displayedStyleId,
    priceBasis: result.priceBasis,
    amount: result.amount,
    currency: result.currency,
    matchedGovernedAttributes: result.matchedGovernedAttributes.map(
      (attribute) => ({ ...attribute }),
    ),
    candidateSourceAttribution: {
      ...result.candidateSourceAttribution,
      scopedMembership:
        result.candidateSourceAttribution.scopedMembership.map((pair) => ({
          ...pair,
        })),
      enumeratedCandidateIdentities:
        result.candidateSourceAttribution.enumeratedCandidateIdentities.map(
          (pair) => ({ ...pair }),
        ),
    },
    stage0Attribution: {
      ...result.stage0Attribution,
      context: {
        ...result.stage0Attribution.context,
        queryLanguage: {
          ...result.stage0Attribution.context.queryLanguage,
        },
      },
      allowedCanonicalPairs:
        result.stage0Attribution.allowedCanonicalPairs.map((pair) => ({
          ...pair,
        })),
    },
    evidenceAttribution: result.evidenceAttribution.map((entry) => ({
      ...entry,
    })),
    eligibilityAttribution: { ...result.eligibilityAttribution },
    d5Versions: { ...result.d5Versions },
    d6Versions: { ...result.d6Versions },
  };
}

export function verifyStructuredLanding(
  intent: StructuredLandingIntent,
  candidate: StructuredCandidateFixture,
  eligibility: StructuredEligibilitySummaryFixture,
): StructuredLandingVerification {
  const identityMatches = landingIdentityMatches(
    intent,
    candidate,
    eligibility,
  );
  const priceMatches = landingPriceMatches(intent, eligibility);
  const attributionMatches = landingAttributionMatches(
    intent,
    candidate,
    eligibility,
  );
  const stage0ContainsCandidate = landingStage0ContainsCandidate(
    intent,
    candidate,
  );
  const matches =
    identityMatches &&
    priceMatches &&
    attributionMatches &&
    stage0ContainsCandidate;

  return matches
    ? { status: "VERIFIED" }
    : {
        status: "LANDING_INTEGRITY_MISMATCH",
        reason: "LANDING_INTEGRITY_MISMATCH",
      };
}

function landingIdentityMatches(
  intent: StructuredLandingIntent,
  candidate: StructuredCandidateFixture,
  eligibility: StructuredEligibilitySummaryFixture,
): boolean {
  return (
    intent.displayedVariantId === candidate.variantId &&
    intent.displayedStyleId === candidate.canonicalStyleId &&
    eligibility.variantId === candidate.variantId &&
    eligibility.canonicalStyleId === candidate.canonicalStyleId
  );
}

function landingPriceMatches(
  intent: StructuredLandingIntent,
  eligibility: StructuredEligibilitySummaryFixture,
): boolean {
  return (
    intent.priceBasis === "SELECTED_VARIANT" &&
    intent.amount === eligibility.selectedVariantAmount &&
    intent.currency === eligibility.currency
  );
}

function landingAttributionMatches(
  intent: StructuredLandingIntent,
  candidate: StructuredCandidateFixture,
  eligibility: StructuredEligibilitySummaryFixture,
): boolean {
  return (
    intent.candidateSourceAttribution.fixtureSnapshotVersion ===
      candidate.fixtureSnapshotVersion &&
    intent.candidateSourceAttribution.candidateSourceVersion ===
      candidate.candidateSourceVersion &&
    intent.eligibilityAttribution.fixtureSnapshotVersion ===
      eligibility.fixtureSnapshotVersion &&
    intent.eligibilityAttribution.eligibilitySnapshotVersion ===
      eligibility.eligibilitySnapshotVersion &&
    intent.eligibilityAttribution.variantId === eligibility.variantId &&
    intent.eligibilityAttribution.canonicalStyleId ===
      eligibility.canonicalStyleId &&
    intent.eligibilityAttribution.marketCode === eligibility.marketCode &&
    intent.d6Versions.landingContract ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.landingContract
  );
}

function landingStage0ContainsCandidate(
  intent: StructuredLandingIntent,
  candidate: StructuredCandidateFixture,
): boolean {
  return intent.stage0Attribution.allowedCanonicalPairs.some(
    (pair) =>
      pair.variantId === candidate.variantId &&
      pair.canonicalStyleId === candidate.canonicalStyleId,
  );
}
