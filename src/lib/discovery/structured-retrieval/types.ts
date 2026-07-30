import type {
  CategoricalPolicyFixture,
  ConstraintDecision,
  DiscoveryContext,
  InterpretedConstraint,
  ParserResult,
  ProductEvidenceFixture,
  ProductEvidenceFixtureState,
} from "../types";

export type GovernedFixtureAttributeId =
  | "fixture:governed-color-family"
  | "fixture:governed-texture-family";

export interface D6B1StructuredRetrievalComponentVersions {
  readonly requestPlan: string;
  readonly stage0Scope: string;
  readonly candidateSource: string;
  readonly admissionRules: string;
  readonly landingContract: string;
  readonly fixtureSnapshot: string;
  readonly eligibilitySnapshot: string;
}

export interface D5StructuredRetrievalAttributionVersions {
  readonly normalizer: string;
  readonly parser: string;
  readonly constraintRules: string;
  readonly lexicon: string;
  readonly ontology: string;
}

export type GovernedCategoricalConstraint = InterpretedConstraint & {
  readonly value: {
    readonly kind: "CATEGORICAL";
    readonly attributeId: GovernedFixtureAttributeId;
    readonly valueId: string;
  };
};

export interface StructuredRequestPlan {
  readonly status: "APPLICABLE";
  readonly requestPlanVersion: string;
  readonly constraints: readonly GovernedCategoricalConstraint[];
  readonly policies: readonly CategoricalPolicyFixture[];
  readonly queryDecisions: readonly ConstraintDecision[];
}

export type StructuredRequestRejectionReason =
  | "INCOMPATIBLE_D5_PARSER_VERSION"
  | "CONSTRAINT_COUNT_OUTSIDE_D6_B1"
  | "UNSUPPORTED_OR_UNRESOLVED_REQUEST"
  | "AFFECTING_CONTRADICTION"
  | "OUTSIDE_GOVERNED_CATEGORICAL_SLICE"
  | "INVALID_CONSTRAINT_SOURCE"
  | "UNSUPPORTED_GOVERNED_ATTRIBUTE"
  | "DUPLICATE_GOVERNED_ATTRIBUTE"
  | "POLICY_COUNT_MISMATCH"
  | "POLICY_PROVENANCE_INVALID"
  | "POLICY_IDENTITY_MISMATCH"
  | "NON_REQUIRED_POLICY"
  | "INCOMPATIBLE_D5_QUERY_DECISION";

export interface StructuredRequestRejection {
  readonly status: "REQUEST_REJECTED";
  readonly reason: StructuredRequestRejectionReason;
}

export type StructuredRequestAssessment =
  | StructuredRequestPlan
  | StructuredRequestRejection;

export interface Stage0ContextBinding {
  readonly marketCode: DiscoveryContext["marketCode"];
  readonly locale: string;
  readonly queryLanguage:
    | { readonly mode: "AUTO" }
    | { readonly mode: "DECLARED"; readonly languageTag: string };
  readonly audienceNamespace: string;
}

export interface Stage0AllowedCanonicalPair {
  readonly variantId: string;
  readonly canonicalStyleId: string;
}

export interface Stage0AuthorityUniverseFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly stage0ScopeVersion: string;
  readonly fixtureSnapshotVersion: string;
  readonly context: Stage0ContextBinding;
  readonly allowedCanonicalPairs: readonly Stage0AllowedCanonicalPair[];
}

export interface ValidatedStage0AuthorityUniverse {
  readonly status: "VALIDATED";
  readonly stage0ScopeVersion: string;
  readonly fixtureSnapshotVersion: string;
  readonly context: Stage0ContextBinding;
  readonly allowedCanonicalPairs: readonly Stage0AllowedCanonicalPair[];
  readonly accountabilityKey: string;
}

export type Stage0RejectionReason =
  | "STAGE0_PROVENANCE_INVALID"
  | "STAGE0_CONTEXT_MISMATCH"
  | "STAGE0_MEMBERSHIP_INVALID"
  | "DUPLICATE_STAGE0_MEMBERSHIP"
  | "CONFLICTING_STAGE0_STYLE_PARENT";

export interface Stage0Rejection {
  readonly status: "STAGE0_REJECTED";
  readonly reason: Stage0RejectionReason;
}

export type Stage0Validation =
  | ValidatedStage0AuthorityUniverse
  | Stage0Rejection;

export interface StructuredCandidateFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly candidateSourceVersion: string;
  readonly variantId: string;
  readonly canonicalStyleId: string;
}

export interface StructuredCandidateFixtureSnapshot {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly candidateSourceVersion: string;
  readonly candidatesByVariantId: Readonly<
    Record<string, readonly StructuredCandidateFixture[]>
  >;
}

export interface StructuredCandidateSourceAttribution {
  readonly fixtureSnapshotVersion: string;
  readonly candidateSourceVersion: string;
  readonly scopedMembership: readonly Stage0AllowedCanonicalPair[];
  readonly enumeratedCandidateIdentities: readonly Stage0AllowedCanonicalPair[];
  readonly accountabilityKey: string;
}

export interface ScopedStructuredCandidates {
  readonly status: "SCOPED_CANDIDATES";
  readonly candidates: readonly StructuredCandidateFixture[];
  readonly attribution: StructuredCandidateSourceAttribution;
}

export type CandidateSourceRejectionReason =
  | "CANDIDATE_SOURCE_PROVENANCE_INVALID"
  | "CANDIDATE_FIXTURE_PROVENANCE_INVALID"
  | "DUPLICATE_CANDIDATE_VARIANT_ID"
  | "CANDIDATE_CANONICAL_PARENT_MISMATCH";

export interface CandidateSourceRejection {
  readonly status: "CANDIDATE_SOURCE_REJECTED";
  readonly reason: CandidateSourceRejectionReason;
}

export type StructuredCandidateEnumeration =
  | ScopedStructuredCandidates
  | CandidateSourceRejection;

export interface StructuredProductEvidenceFixture
  extends ProductEvidenceFixture {
  readonly fixtureSnapshotVersion: string;
  readonly targetConstraintId: string;
}

export type EvidenceSelectionStatus =
  | "SELECTED"
  | "ABSENT"
  | "REJECTED";

export interface StructuredEvidenceAttribution {
  readonly constraintId: string;
  readonly attributeId: GovernedFixtureAttributeId;
  readonly status: EvidenceSelectionStatus;
  readonly matchingRecordCount: number;
  readonly evidenceState: ProductEvidenceFixtureState | null;
  readonly syntheticEvidenceRef: string | null;
  readonly fixtureSnapshotVersion: string;
}

export type EvidenceEvaluationRejectionReason =
  | "EVIDENCE_PROVENANCE_INVALID"
  | "DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE"
  | "EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH"
  | "EVIDENCE_NOT_REPRESENTABLE"
  | "INCOMPATIBLE_D5_PRODUCT_DECISION";

export type StructuredCandidateEvidenceEvaluation =
  | {
      readonly status: "EVALUATED";
      readonly productDecisions: readonly ConstraintDecision[];
      readonly evidenceAttribution: readonly StructuredEvidenceAttribution[];
    }
  | {
      readonly status: "EVIDENCE_REJECTED";
      readonly reason: EvidenceEvaluationRejectionReason;
      readonly productDecisions: readonly ConstraintDecision[];
      readonly evidenceAttribution: readonly StructuredEvidenceAttribution[];
    };

export type StructuredFixtureEligibilityOutcome =
  | "ADMISSIBLE_FIXTURE"
  | "UNKNOWN_FIXTURE"
  | "INELIGIBLE_FIXTURE";

export interface StructuredEligibilitySummaryFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly eligibilitySnapshotVersion: string;
  readonly variantId: string;
  readonly canonicalStyleId: string;
  readonly marketCode: DiscoveryContext["marketCode"];
  readonly outcome: StructuredFixtureEligibilityOutcome;
  readonly fixtureReason: string;
  readonly selectedVariantAmount: number | null;
  readonly currency: string | null;
}

export interface StructuredEligibilityAttribution {
  readonly fixtureSnapshotVersion: string;
  readonly eligibilitySnapshotVersion: string;
  readonly variantId: string;
  readonly canonicalStyleId: string;
  readonly marketCode: DiscoveryContext["marketCode"];
  readonly fixtureReason: string;
}

export interface MatchedGovernedAttribute {
  readonly constraintId: string;
  readonly attributeId: GovernedFixtureAttributeId;
  readonly valueId: string;
}

export type StructuredCandidatePartition =
  | "ASSERTED"
  | "UNKNOWN"
  | "VIOLATING"
  | "WITHHELD";

export interface StructuredLandingIntent {
  readonly displayedVariantId: string;
  readonly displayedStyleId: string;
  readonly priceBasis: "SELECTED_VARIANT";
  readonly amount: number;
  readonly currency: string;
  readonly matchedGovernedAttributes: readonly MatchedGovernedAttribute[];
  readonly candidateSourceAttribution: StructuredCandidateSourceAttribution;
  readonly stage0Attribution: ValidatedStage0AuthorityUniverse;
  readonly evidenceAttribution: readonly StructuredEvidenceAttribution[];
  readonly eligibilityAttribution: StructuredEligibilityAttribution;
  readonly d5Versions: D5StructuredRetrievalAttributionVersions;
  readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
}

export type StructuredLandingVerification =
  | { readonly status: "VERIFIED" }
  | {
      readonly status: "LANDING_INTEGRITY_MISMATCH";
      readonly reason: "LANDING_INTEGRITY_MISMATCH";
    };

export interface StructuredCandidateResultCore {
  readonly displayedVariantId: string;
  readonly displayedStyleId: string;
  readonly partition: StructuredCandidatePartition;
  readonly priceBasis: "SELECTED_VARIANT";
  readonly amount: number;
  readonly currency: string;
  readonly matchedGovernedAttributes: readonly MatchedGovernedAttribute[];
  readonly queryDecisions: readonly ConstraintDecision[];
  readonly productDecisions: readonly ConstraintDecision[];
  readonly candidateSourceAttribution: StructuredCandidateSourceAttribution;
  readonly stage0Attribution: ValidatedStage0AuthorityUniverse;
  readonly evidenceAttribution: readonly StructuredEvidenceAttribution[];
  readonly eligibilityAttribution: StructuredEligibilityAttribution;
  readonly d5Versions: D5StructuredRetrievalAttributionVersions;
  readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
}

export interface StructuredCandidateResult
  extends StructuredCandidateResultCore {
  readonly landingIntent: StructuredLandingIntent;
  readonly landingIntegrity: Extract<
    StructuredLandingVerification,
    { readonly status: "VERIFIED" }
  >;
}

export type StructuredAdmissionRejectionReason =
  | EvidenceEvaluationRejectionReason
  | "CANDIDATE_OUTSIDE_STAGE0_SCOPE"
  | "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID"
  | "REQUEST_PLAN_INVARIANT_FAILED"
  | "PRODUCT_DECISION_SET_INVALID"
  | "ELIGIBILITY_SUMMARY_MISSING"
  | "ELIGIBILITY_SUMMARY_DUPLICATE"
  | "ELIGIBILITY_PROVENANCE_INVALID"
  | "ELIGIBILITY_SUMMARY_STALE"
  | "ELIGIBILITY_MARKET_MISMATCH"
  | "ELIGIBILITY_STYLE_MISMATCH"
  | "ELIGIBILITY_SUMMARY_UNKNOWN"
  | "ELIGIBILITY_SUMMARY_INELIGIBLE"
  | "SELECTED_VARIANT_AMOUNT_INVALID"
  | "SELECTED_VARIANT_CURRENCY_INVALID";

export type StructuredAdmissionResult =
  | {
      readonly status: "ADMITTED";
      readonly candidate: StructuredCandidateResult;
    }
  | {
      readonly status: "ADMISSION_REJECTED";
      readonly variantId: string;
      readonly canonicalStyleId: string;
      readonly reason: StructuredAdmissionRejectionReason;
      readonly candidateSourceAttribution: StructuredCandidateSourceAttribution;
      readonly stage0Attribution: ValidatedStage0AuthorityUniverse;
      readonly evidenceAttribution: readonly StructuredEvidenceAttribution[];
      readonly d5Versions: D5StructuredRetrievalAttributionVersions;
      readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
    };

export interface StructuredResultCounts {
  readonly scopedMembership: number;
  readonly enumeratedCandidates: number;
  readonly admissionAttempts: number;
  readonly asserted: number;
  readonly unknown: number;
  readonly violating: number;
  readonly withheld: number;
  readonly admissionRejected: number;
}

export interface StructuredSliceCompleted {
  readonly status: "COMPLETED";
  readonly requestPlan: StructuredRequestPlan;
  readonly stage0Attribution: ValidatedStage0AuthorityUniverse;
  readonly candidateSourceAttribution: StructuredCandidateSourceAttribution;
  readonly assertedCandidates: readonly StructuredCandidateResult[];
  readonly unknownCandidates: readonly StructuredCandidateResult[];
  readonly violatingCandidates: readonly StructuredCandidateResult[];
  readonly withheldCandidates: readonly StructuredCandidateResult[];
  readonly admissionRejections: readonly Extract<
    StructuredAdmissionResult,
    { readonly status: "ADMISSION_REJECTED" }
  >[];
  readonly counts: StructuredResultCounts;
  readonly technicalOrder: "VARIANT_ID_THEN_STYLE_ID";
  readonly ranking: "NONE";
  readonly relaxation: "NONE";
  readonly d5Versions: D5StructuredRetrievalAttributionVersions;
  readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
}

export type StructuredSliceRunResult =
  | (StructuredRequestRejection & {
      readonly d5Versions: D5StructuredRetrievalAttributionVersions;
      readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
    })
  | (Stage0Rejection & {
      readonly requestPlan: StructuredRequestPlan;
      readonly d5Versions: D5StructuredRetrievalAttributionVersions;
      readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
    })
  | (CandidateSourceRejection & {
      readonly requestPlan: StructuredRequestPlan;
      readonly stage0Attribution: ValidatedStage0AuthorityUniverse;
      readonly d5Versions: D5StructuredRetrievalAttributionVersions;
      readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
    })
  | StructuredSliceCompleted;

export interface RunStructuredCategoricalFixtureSliceInput {
  readonly parserResult: ParserResult;
  readonly context: DiscoveryContext;
  readonly policies: readonly CategoricalPolicyFixture[];
  readonly stage0Proof: Stage0AuthorityUniverseFixture;
  readonly candidateSnapshot: StructuredCandidateFixtureSnapshot;
  readonly evidenceFixtures: readonly StructuredProductEvidenceFixture[];
  readonly eligibilitySummaries: readonly StructuredEligibilitySummaryFixture[];
}

export interface AdmitStructuredCandidateInput {
  readonly requestPlan: StructuredRequestPlan;
  readonly context: DiscoveryContext;
  readonly stage0Proof: ValidatedStage0AuthorityUniverse;
  readonly candidate: StructuredCandidateFixture;
  readonly candidateSourceAttribution: StructuredCandidateSourceAttribution;
  readonly evidenceEvaluation: StructuredCandidateEvidenceEvaluation;
  readonly eligibilitySummaries: readonly StructuredEligibilitySummaryFixture[];
  readonly d5Versions: D5StructuredRetrievalAttributionVersions;
  readonly d6Versions: D6B1StructuredRetrievalComponentVersions;
}
