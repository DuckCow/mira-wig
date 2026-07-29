import type {
  ConstraintDecision,
  DiscoveryContext,
  DiscoveryReasonCode,
  FallbackRoute,
  InterpretedConstraint,
  ParserResult,
  SpeechRequirement,
} from "../types";

export interface D6ExactRetrievalComponentVersions {
  readonly candidateSource: string;
  readonly admissionRules: string;
  readonly landingContract: string;
  readonly eventSchema: string;
  readonly fixtureSnapshot: string;
}

export interface D5RetrievalAttributionVersions {
  readonly normalizer: string;
  readonly parser: string;
  readonly constraintRules: string;
  readonly lexicon: string;
  readonly ontology: string;
}

export interface ExactFixtureIdentity {
  readonly namespace: string;
  readonly canonicalValue: string;
}

export interface ExactCandidateFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly candidateSourceVersion: string;
  readonly variantId: string;
  readonly canonicalStyleId: string;
  readonly identity: ExactFixtureIdentity;
}

export interface ExactCandidateFixtureSnapshot {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly candidateSourceVersion: string;
  readonly candidates: readonly ExactCandidateFixture[];
}

export type FixtureOptionFact = string | number | boolean | null;

export interface CatalogIdentityProofFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly syntheticEvidenceRef: string;
  readonly variantId: string;
  readonly canonicalStyleId: string;
  readonly identity: ExactFixtureIdentity;
  readonly optionFacts: Readonly<Record<string, FixtureOptionFact>>;
}

export type FixtureEligibilityOutcome =
  | "ADMISSIBLE_FIXTURE"
  | "UNKNOWN_FIXTURE"
  | "INELIGIBLE_FIXTURE";

export interface EligibilitySummaryFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureSnapshotVersion: string;
  readonly variantId: string;
  readonly marketCode: DiscoveryContext["marketCode"];
  readonly outcome: FixtureEligibilityOutcome;
  readonly fixtureReason: string;
  readonly selectedVariantAmount: number | null;
  readonly currency: string | null;
}

export type ExactIdentityInterpretedConstraint = InterpretedConstraint & {
  readonly value: {
    readonly kind: "EXACT_IDENTITY";
    readonly namespace: string;
    readonly value: string;
  };
};

export interface ApplicableExactSliceRequest {
  readonly status: "APPLICABLE";
  readonly constraint: ExactIdentityInterpretedConstraint;
}

export type ExactSliceRequestRejection =
  | {
      readonly status: "REQUEST_NOT_APPLICABLE";
      readonly reason:
        | "NO_EXACT_IDENTITY"
        | "ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE";
    }
  | {
      readonly status: "REQUEST_INVALID";
      readonly reason:
        | "MULTIPLE_EXACT_IDENTITIES"
        | "BLANK_EXACT_IDENTITY"
        | "EXACT_IDENTITY_UNRESOLVED"
        | "EXACT_IDENTITY_CONTRADICTED"
        | "INCOMPATIBLE_D5_PARSER_VERSION";
    }
  | {
      readonly status: "UNSUPPORTED_EXACT_NAMESPACE";
      readonly reason: "UNSUPPORTED_EXACT_NAMESPACE";
    };

export type ExactSliceRequestAssessment =
  | ApplicableExactSliceRequest
  | ExactSliceRequestRejection;

export type CandidateFixtureFailureReason =
  | "CANDIDATE_SNAPSHOT_PROVENANCE_INVALID"
  | "CANDIDATE_FIXTURE_PROVENANCE_INVALID"
  | "DUPLICATE_CANONICAL_SKU"
  | "DUPLICATE_VARIANT_ID";

export type ExactCandidateLookup =
  | {
      readonly status: "MATCH";
      readonly candidate: ExactCandidateFixture;
      readonly exactLookupAccountabilityKey: string;
    }
  | {
      readonly status: "EXACT_NOT_FOUND";
      readonly reasons: readonly DiscoveryReasonCode[];
      readonly fallbackRoutes: readonly FallbackRoute[];
      readonly exactLookupAccountabilityKey: string;
    }
  | {
      readonly status: "FIXTURE_INVALID";
      readonly reason: CandidateFixtureFailureReason;
    };

export type ExactCandidateLookupFailure = Exclude<
  ExactCandidateLookup,
  { readonly status: "MATCH" }
>;

export type ExactAdmissionRejectionReason =
  | "CANDIDATE_SOURCE_PROVENANCE_INVALID"
  | "CATALOG_PROOF_MISSING"
  | "CATALOG_PROOF_DUPLICATE"
  | "CANDIDATE_IDENTITY_INTEGRITY_MISMATCH"
  | "ELIGIBILITY_SUMMARY_MISSING"
  | "ELIGIBILITY_SUMMARY_DUPLICATE"
  | "ELIGIBILITY_IDENTITY_MISMATCH"
  | "ELIGIBILITY_SUMMARY_PROVENANCE_INVALID"
  | "ELIGIBILITY_SUMMARY_UNKNOWN"
  | "ELIGIBILITY_SUMMARY_INELIGIBLE"
  | "SELECTED_VARIANT_PRICE_INVALID";

export interface ExactVariantResult {
  readonly displayedStyleId: string;
  readonly displayedVariantId: string;
  readonly exactIdentity: ExactFixtureIdentity;
  readonly priceBasis: "SELECTED_VARIANT";
  readonly amount: number;
  readonly currency: string;
  readonly optionFacts: Readonly<Record<string, FixtureOptionFact>>;
  readonly exactLookupAccountabilityKey: string;
  readonly candidateSourceVersion: string;
  readonly fixtureSnapshotVersion: string;
  readonly admissionVersion: string;
  readonly landingVersion: string;
  readonly d5Versions: D5RetrievalAttributionVersions;
  readonly d5Decision: ConstraintDecision;
  readonly eligibilityFixtureReason: string;
}

export interface ExactLandingIntent {
  readonly displayedStyleId: string;
  readonly displayedVariantId: string;
  readonly priceBasis: "SELECTED_VARIANT";
  readonly exactIdentity: ExactFixtureIdentity;
  readonly fallbackRoutes: readonly FallbackRoute[];
  readonly speechRequirements: readonly SpeechRequirement[];
  readonly exactLookupAccountabilityKey: string;
  readonly candidateSourceVersion: string;
  readonly fixtureSnapshotVersion: string;
  readonly admissionVersion: string;
  readonly landingVersion: string;
  readonly d5Versions: D5RetrievalAttributionVersions;
}

export type ExactLandingVerification =
  | { readonly status: "VERIFIED" }
  | {
      readonly status: "LANDING_INTEGRITY_MISMATCH";
      readonly reason: "LANDING_INTEGRITY_MISMATCH";
    };

export type ExactAdmissionResult =
  | {
      readonly status: "ADMITTED";
      readonly result: ExactVariantResult;
      readonly landingIntent: ExactLandingIntent;
    }
  | {
      readonly status: "ADMISSION_REJECTED";
      readonly reason: ExactAdmissionRejectionReason;
      readonly exactLookupAccountabilityKey: string;
    };

export type ExactSliceCoreOutcome =
  | ExactSliceRequestRejection
  | ExactCandidateLookupFailure
  | ExactAdmissionResult;

export interface ExactSliceEventPayload {
  readonly eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL";
  readonly eventSchemaVersion: string;
  readonly outcome: ExactSliceCoreOutcome["status"];
  readonly marketCode: DiscoveryContext["marketCode"];
  readonly d5Versions: D5RetrievalAttributionVersions;
  readonly d6Versions: D6ExactRetrievalComponentVersions;
  readonly exactLookupAccountabilityKey: string | null;
  readonly displayedStyleId: string | null;
  readonly displayedVariantId: string | null;
}

export type ExactSliceEventSeam =
  | {
      readonly enabled?: false;
      readonly sink?: (event: ExactSliceEventPayload) => void;
    }
  | {
      readonly enabled: true;
      readonly sink: (event: ExactSliceEventPayload) => void;
    };

export type ExactSliceEventDelivery =
  | { readonly status: "DISABLED" }
  | { readonly status: "INJECTED_SINK_RETURNED" }
  | { readonly status: "INJECTED_SINK_THREW" };

interface EventDeliveryFields {
  readonly eventDelivery: ExactSliceEventDelivery;
}

export type ExactSliceRunResult =
  | (ExactSliceRequestRejection & EventDeliveryFields)
  | (ExactCandidateLookupFailure & EventDeliveryFields)
  | (ExactAdmissionResult & EventDeliveryFields);

export interface RunExactSkuFixtureSliceInput {
  readonly parserResult: ParserResult;
  readonly context: DiscoveryContext;
  readonly candidateSnapshot: ExactCandidateFixtureSnapshot;
  readonly catalogProofs: readonly CatalogIdentityProofFixture[];
  readonly eligibilitySummaries: readonly EligibilitySummaryFixture[];
  readonly eventSeam?: ExactSliceEventSeam;
}

export interface AdmitExactCandidateInput {
  readonly request: ApplicableExactSliceRequest;
  readonly context: DiscoveryContext;
  readonly candidate: ExactCandidateFixture;
  readonly exactLookupAccountabilityKey: string;
  readonly catalogProofs: readonly CatalogIdentityProofFixture[];
  readonly eligibilitySummaries: readonly EligibilitySummaryFixture[];
  readonly d5Versions: D5RetrievalAttributionVersions;
}
