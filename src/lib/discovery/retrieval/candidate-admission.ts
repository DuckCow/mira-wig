import { decideConstraint } from "../decide-constraint";
import type {
  ConstraintDecision,
  InterpretedConstraint,
  ParserResult,
  ProductEvidenceFixture,
} from "../types";
import { buildExactLandingIntent, verifyExactLanding } from "./landing";
import type {
  AdmitExactCandidateInput,
  ApplicableExactSliceRequest,
  CatalogIdentityProofFixture,
  EligibilitySummaryFixture,
  ExactAdmissionRejectionReason,
  ExactAdmissionResult,
  ExactCandidateFixture,
  ExactIdentityInterpretedConstraint,
  ExactSliceRequestAssessment,
  ExactVariantResult,
} from "./types";
import { D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankToken(value: string): boolean {
  return value.length > 0 && value.trim() === value;
}

function isExactIdentityConstraint(
  constraint: InterpretedConstraint,
): constraint is ExactIdentityInterpretedConstraint {
  return constraint.value.kind === "EXACT_IDENTITY";
}

function exactConstraintIsContradicted(
  parserResult: ParserResult,
  constraintId: string,
): boolean {
  return parserResult.contradictions.some(
    (contradiction) =>
      contradiction.leftConstraintId === constraintId ||
      contradiction.rightConstraintId === constraintId,
  );
}

export function assessExactSliceRequest(
  parserResult: ParserResult,
): ExactSliceRequestAssessment {
  const exactConstraints = parserResult.constraints.filter(
    isExactIdentityConstraint,
  );

  if (exactConstraints.length === 0) {
    return {
      status: "REQUEST_NOT_APPLICABLE",
      reason: "NO_EXACT_IDENTITY",
    };
  }
  if (exactConstraints.length > 1) {
    return {
      status: "REQUEST_INVALID",
      reason: "MULTIPLE_EXACT_IDENTITIES",
    };
  }
  if (parserResult.constraints.length !== 1) {
    return {
      status: "REQUEST_NOT_APPLICABLE",
      reason: "ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE",
    };
  }

  const constraint = exactConstraints[0];
  if (constraint === undefined) {
    throw new TypeError("Exact constraint count invariant failed");
  }
  if (constraint.value.namespace !== "SKU") {
    return {
      status: "UNSUPPORTED_EXACT_NAMESPACE",
      reason: "UNSUPPORTED_EXACT_NAMESPACE",
    };
  }
  if (!isNonblankToken(constraint.value.value)) {
    return {
      status: "REQUEST_INVALID",
      reason: "BLANK_EXACT_IDENTITY",
    };
  }
  if (constraint.interpretationState === "UNRESOLVED") {
    return {
      status: "REQUEST_INVALID",
      reason: "EXACT_IDENTITY_UNRESOLVED",
    };
  }
  if (exactConstraintIsContradicted(parserResult, constraint.constraintId)) {
    return {
      status: "REQUEST_INVALID",
      reason: "EXACT_IDENTITY_CONTRADICTED",
    };
  }

  return { status: "APPLICABLE", constraint };
}

function candidateSourceIsValid(
  request: ApplicableExactSliceRequest,
  candidate: ExactCandidateFixture,
): boolean {
  return (
    candidate.fixtureOnly &&
    candidate.synthetic &&
    candidate.fixtureSnapshotVersion ===
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    candidate.candidateSourceVersion ===
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.candidateSource &&
    candidate.identity.namespace === request.constraint.value.namespace &&
    candidate.identity.canonicalValue === request.constraint.value.value &&
    isNonblankToken(candidate.variantId) &&
    isNonblankToken(candidate.canonicalStyleId)
  );
}

function proofRelatesToCandidate(
  proof: CatalogIdentityProofFixture,
  candidate: ExactCandidateFixture,
): boolean {
  return (
    proof.variantId === candidate.variantId ||
    (proof.identity.namespace === candidate.identity.namespace &&
      proof.identity.canonicalValue === candidate.identity.canonicalValue)
  );
}

function proofMatchesCandidate(
  proof: CatalogIdentityProofFixture,
  candidate: ExactCandidateFixture,
): boolean {
  return (
    proof.fixtureOnly &&
    proof.synthetic &&
    proof.fixtureSnapshotVersion === candidate.fixtureSnapshotVersion &&
    isNonblankToken(proof.syntheticEvidenceRef) &&
    proof.variantId === candidate.variantId &&
    proof.canonicalStyleId === candidate.canonicalStyleId &&
    proof.identity.namespace === candidate.identity.namespace &&
    proof.identity.canonicalValue === candidate.identity.canonicalValue
  );
}

type ProofResolution =
  | { readonly status: "RESOLVED"; readonly proof: CatalogIdentityProofFixture }
  | {
      readonly status: "REJECTED";
      readonly reason: ExactAdmissionRejectionReason;
    };

function resolveCatalogProof(
  candidate: ExactCandidateFixture,
  proofs: readonly CatalogIdentityProofFixture[],
): ProofResolution {
  const related = proofs.filter((proof) =>
    proofRelatesToCandidate(proof, candidate),
  );
  if (related.length === 0) {
    return { status: "REJECTED", reason: "CATALOG_PROOF_MISSING" };
  }
  if (related.length > 1) {
    return { status: "REJECTED", reason: "CATALOG_PROOF_DUPLICATE" };
  }

  const proof = related[0];
  if (proof === undefined) {
    throw new TypeError("Catalog proof count invariant failed");
  }

  return proofMatchesCandidate(proof, candidate)
    ? { status: "RESOLVED", proof }
    : {
        status: "REJECTED",
        reason: "CANDIDATE_IDENTITY_INTEGRITY_MISMATCH",
      };
}

function buildD5Evidence(
  candidate: ExactCandidateFixture,
  proof: CatalogIdentityProofFixture,
): ProductEvidenceFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureProductId: candidate.variantId,
    attributeId: "identity:sku",
    value: {
      kind: "EXACT_IDENTITY",
      namespace: proof.identity.namespace,
      value: proof.identity.canonicalValue,
    },
    state: "VERIFIED_OR_MEASURED",
    syntheticEvidenceRef: proof.syntheticEvidenceRef,
  };
}

function decideExactCandidate(
  input: AdmitExactCandidateInput,
  proof: CatalogIdentityProofFixture,
): ConstraintDecision {
  return decideConstraint({
    target: {
      kind: "INTERPRETED_CONSTRAINT",
      decisionLevel: "FIXTURE_PRODUCT",
      constraint: input.request.constraint,
    },
    subject: {
      kind: "FIXTURE_PRODUCT",
      fixtureProductId: input.candidate.variantId,
    },
    context: input.context,
    evidence: buildD5Evidence(input.candidate, proof),
  });
}

function d5DecisionAdmits(decision: ConstraintDecision): boolean {
  return (
    decision.gate === "ASSERT_MATCH" &&
    decision.partition === "ASSERTED" &&
    decision.reasons.includes("EXACT_IDENTITY_MATCH") &&
    decision.reasons.includes("EXACT_IDENTITY_NO_SUBSTITUTION")
  );
}

type EligibilityResolution =
  | {
      readonly status: "RESOLVED";
      readonly summary: EligibilitySummaryFixture;
    }
  | {
      readonly status: "REJECTED";
      readonly reason: ExactAdmissionRejectionReason;
    };

function eligibilitySummaryProvenanceIsValid(
  summary: EligibilitySummaryFixture,
  candidate: ExactCandidateFixture,
): boolean {
  return (
    summary.fixtureOnly &&
    summary.synthetic &&
    summary.fixtureSnapshotVersion === candidate.fixtureSnapshotVersion &&
    isNonblankToken(summary.fixtureReason)
  );
}

function resolveEligibilitySummary(
  input: AdmitExactCandidateInput,
): EligibilityResolution {
  const exactMatches = input.eligibilitySummaries.filter(
    (summary) =>
      summary.variantId === input.candidate.variantId &&
      summary.marketCode === input.context.marketCode,
  );
  if (exactMatches.length > 1) {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_DUPLICATE",
    };
  }
  if (exactMatches.length === 0) {
    const variantSummaryExists = input.eligibilitySummaries.some(
      (summary) => summary.variantId === input.candidate.variantId,
    );
    const marketSummaryExists = input.eligibilitySummaries.some(
      (summary) => summary.marketCode === input.context.marketCode,
    );
    return {
      status: "REJECTED",
      reason: variantSummaryExists || marketSummaryExists
        ? "ELIGIBILITY_IDENTITY_MISMATCH"
        : "ELIGIBILITY_SUMMARY_MISSING",
    };
  }

  const summary = exactMatches[0];
  if (summary === undefined) {
    throw new TypeError("Eligibility summary count invariant failed");
  }
  if (!eligibilitySummaryProvenanceIsValid(summary, input.candidate)) {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_PROVENANCE_INVALID",
    };
  }
  if (summary.outcome === "UNKNOWN_FIXTURE") {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_UNKNOWN",
    };
  }
  if (summary.outcome === "INELIGIBLE_FIXTURE") {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_INELIGIBLE",
    };
  }

  return { status: "RESOLVED", summary };
}

function selectedVariantPriceIsValid(
  summary: EligibilitySummaryFixture,
): summary is EligibilitySummaryFixture & {
  readonly selectedVariantAmount: number;
  readonly currency: string;
} {
  return (
    Number.isInteger(summary.selectedVariantAmount) &&
    summary.selectedVariantAmount !== null &&
    summary.selectedVariantAmount >= 0 &&
    summary.currency !== null &&
    isNonblankToken(summary.currency)
  );
}

function rejected(
  input: AdmitExactCandidateInput,
  reason: ExactAdmissionRejectionReason,
): ExactAdmissionResult {
  return {
    status: "ADMISSION_REJECTED",
    reason,
    exactLookupAccountabilityKey: input.exactLookupAccountabilityKey,
  };
}

function buildExactResult(
  input: AdmitExactCandidateInput,
  proof: CatalogIdentityProofFixture,
  summary: EligibilitySummaryFixture & {
    readonly selectedVariantAmount: number;
    readonly currency: string;
  },
  d5Decision: ConstraintDecision,
): ExactVariantResult {
  return {
    displayedStyleId: proof.canonicalStyleId,
    displayedVariantId: proof.variantId,
    exactIdentity: { ...proof.identity },
    priceBasis: "SELECTED_VARIANT",
    amount: summary.selectedVariantAmount,
    currency: summary.currency,
    optionFacts: { ...proof.optionFacts },
    exactLookupAccountabilityKey: input.exactLookupAccountabilityKey,
    candidateSourceVersion: input.candidate.candidateSourceVersion,
    fixtureSnapshotVersion: input.candidate.fixtureSnapshotVersion,
    admissionVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.admissionRules,
    landingVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.landingContract,
    d5Versions: { ...input.d5Versions },
    d5Decision,
    eligibilityFixtureReason: summary.fixtureReason,
  };
}

export function admitExactCandidate(
  input: AdmitExactCandidateInput,
): ExactAdmissionResult {
  if (!candidateSourceIsValid(input.request, input.candidate)) {
    return rejected(input, "CANDIDATE_SOURCE_PROVENANCE_INVALID");
  }

  const proofResolution = resolveCatalogProof(
    input.candidate,
    input.catalogProofs,
  );
  if (proofResolution.status === "REJECTED") {
    return rejected(input, proofResolution.reason);
  }

  const d5Decision = decideExactCandidate(input, proofResolution.proof);
  if (!d5DecisionAdmits(d5Decision)) {
    throw new TypeError("Frozen D5 exact decision invariant failed");
  }

  const eligibilityResolution = resolveEligibilitySummary(input);
  if (eligibilityResolution.status === "REJECTED") {
    return rejected(input, eligibilityResolution.reason);
  }
  if (!selectedVariantPriceIsValid(eligibilityResolution.summary)) {
    return rejected(input, "SELECTED_VARIANT_PRICE_INVALID");
  }

  const result = buildExactResult(
    input,
    proofResolution.proof,
    eligibilityResolution.summary,
    d5Decision,
  );
  const landingIntent = buildExactLandingIntent(result);
  const landingVerification = verifyExactLanding(
    landingIntent,
    proofResolution.proof,
  );
  if (landingVerification.status !== "VERIFIED") {
    throw new TypeError("Exact landing construction invariant failed");
  }

  return {
    status: "ADMITTED",
    result,
    landingIntent,
  };
}
