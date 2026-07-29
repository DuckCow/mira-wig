import { describe, expect, it } from "vitest";

import * as CandidateAdmissionModule from "../candidate-admission";
import * as EventSeamModule from "../event-seam";
import * as ExactFixtureRetrieverModule from "../exact-fixture-retriever";
import * as ExactSliceModule from "../exact-slice";
import * as LandingModule from "../landing";
import * as TypesModule from "../types";
import type {
  AdmitExactCandidateInput,
  ApplicableExactSliceRequest,
  CandidateFixtureFailureReason,
  CatalogIdentityProofFixture,
  D5RetrievalAttributionVersions,
  D6ExactRetrievalComponentVersions,
  EligibilitySummaryFixture,
  ExactAdmissionRejectionReason,
  ExactAdmissionResult,
  ExactCandidateFixture,
  ExactCandidateFixtureSnapshot,
  ExactCandidateLookup,
  ExactCandidateLookupFailure,
  ExactFixtureIdentity,
  ExactIdentityInterpretedConstraint,
  ExactLandingIntent,
  ExactLandingVerification,
  ExactSliceCoreOutcome,
  ExactSliceEventDelivery,
  ExactSliceEventPayload,
  ExactSliceEventSeam,
  ExactSliceRequestAssessment,
  ExactSliceRequestRejection,
  ExactSliceRunResult,
  ExactVariantResult,
  FixtureEligibilityOutcome,
  FixtureOptionFact,
  RunExactSkuFixtureSliceInput,
} from "../types";
import * as VersionsModule from "../versions";
import {
  candidateFixture,
  candidateSnapshot,
  catalogProof,
  eligibilitySummary,
  exactConstraint,
  exactSliceInput,
  parserResult,
  syntheticContext,
} from "./fixtures/synthetic-fixtures";

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;

type LookupMatch = Extract<ExactCandidateLookup, { readonly status: "MATCH" }>;
type LookupMiss = Extract<
  ExactCandidateLookup,
  { readonly status: "EXACT_NOT_FOUND" }
>;
type LookupInvalid = Extract<
  ExactCandidateLookup,
  { readonly status: "FIXTURE_INVALID" }
>;
type AdmissionAdmitted = Extract<
  ExactAdmissionResult,
  { readonly status: "ADMITTED" }
>;
type AdmissionRejected = Extract<
  ExactAdmissionResult,
  { readonly status: "ADMISSION_REJECTED" }
>;
type LandingVerified = Extract<
  ExactLandingVerification,
  { readonly status: "VERIFIED" }
>;
type LandingMismatch = Extract<
  ExactLandingVerification,
  { readonly status: "LANDING_INTEGRITY_MISMATCH" }
>;
type RunRequestRejection = Extract<
  ExactSliceRunResult,
  {
    readonly status:
      | "REQUEST_NOT_APPLICABLE"
      | "REQUEST_INVALID"
      | "UNSUPPORTED_EXACT_NAMESPACE";
  }
>;
type RunExactMiss = Extract<
  ExactSliceRunResult,
  { readonly status: "EXACT_NOT_FOUND" }
>;
type RunFixtureInvalid = Extract<
  ExactSliceRunResult,
  { readonly status: "FIXTURE_INVALID" }
>;
type RunAdmissionRejected = Extract<
  ExactSliceRunResult,
  { readonly status: "ADMISSION_REJECTED" }
>;
type RunAdmitted = Extract<
  ExactSliceRunResult,
  { readonly status: "ADMITTED" }
>;

const FROZEN_ESCAPING_STATUSES = [
  "REQUEST_NOT_APPLICABLE",
  "REQUEST_INVALID",
  "UNSUPPORTED_EXACT_NAMESPACE",
  "EXACT_NOT_FOUND",
  "FIXTURE_INVALID",
  "ADMISSION_REJECTED",
  "ADMITTED",
] as const;

const FROZEN_REQUEST_REASONS = [
  "NO_EXACT_IDENTITY",
  "ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE",
  "MULTIPLE_EXACT_IDENTITIES",
  "BLANK_EXACT_IDENTITY",
  "EXACT_IDENTITY_UNRESOLVED",
  "EXACT_IDENTITY_CONTRADICTED",
  "INCOMPATIBLE_D5_PARSER_VERSION",
  "UNSUPPORTED_EXACT_NAMESPACE",
] as const;

const FROZEN_FIXTURE_FAILURE_REASONS = [
  "CANDIDATE_SNAPSHOT_PROVENANCE_INVALID",
  "CANDIDATE_FIXTURE_PROVENANCE_INVALID",
  "DUPLICATE_CANONICAL_SKU",
  "DUPLICATE_VARIANT_ID",
] as const;

const FROZEN_ADMISSION_REJECTION_REASONS = [
  "CANDIDATE_SOURCE_PROVENANCE_INVALID",
  "CATALOG_PROOF_MISSING",
  "CATALOG_PROOF_DUPLICATE",
  "CANDIDATE_IDENTITY_INTEGRITY_MISMATCH",
  "ELIGIBILITY_SUMMARY_MISSING",
  "ELIGIBILITY_SUMMARY_DUPLICATE",
  "ELIGIBILITY_IDENTITY_MISMATCH",
  "ELIGIBILITY_SUMMARY_PROVENANCE_INVALID",
  "ELIGIBILITY_SUMMARY_UNKNOWN",
  "ELIGIBILITY_SUMMARY_INELIGIBLE",
  "SELECTED_VARIANT_PRICE_INVALID",
] as const;

const FROZEN_LANDING_VERIFICATION_STATUSES = [
  "VERIFIED",
  "LANDING_INTEGRITY_MISMATCH",
] as const;

const FROZEN_EVENT_DELIVERY_STATUSES = [
  "DISABLED",
  "INJECTED_SINK_RETURNED",
  "INJECTED_SINK_THREW",
] as const;

const PROVISIONAL_FIXTURE_ELIGIBILITY_OUTCOMES = [
  "ADMISSIBLE_FIXTURE",
  "UNKNOWN_FIXTURE",
  "INELIGIBLE_FIXTURE",
] as const;

const COMPILE_TIME_CONFORMANCE = {
  registryFields: true,
  d5VersionFields: true,
  exactIdentityFields: true,
  candidateFixtureFields: true,
  candidateSnapshotFields: true,
  catalogProofFields: true,
  eligibilityFields: true,
  exactConstraintFields: true,
  exactConstraintKind: true,
  applicableRequestFields: true,
  requestAssessmentStatuses: true,
  escapingStatuses: true,
  requestReasons: true,
  lookupStatuses: true,
  lookupMatchFields: true,
  lookupMissFields: true,
  lookupInvalidFields: true,
  lookupFailureStatuses: true,
  fixtureFailureReasons: true,
  admissionReasons: true,
  exactResultFields: true,
  landingIntentFields: true,
  landingVerifiedFields: true,
  landingMismatchFields: true,
  landingVerificationStatuses: true,
  admissionAdmittedFields: true,
  admissionRejectedFields: true,
  coreOutcomeStatuses: true,
  eventPayloadFields: true,
  eventName: true,
  eventSeamFields: true,
  eventDeliveryStatuses: true,
  runRequestFields: true,
  runMissFields: true,
  runFixtureInvalidFields: true,
  runAdmissionRejectedFields: true,
  runAdmittedFields: true,
  runInputFields: true,
  admissionInputFields: true,
  priceBasis: true,
  fixtureOptionFact: true,
  fixtureEligibilityOutcomes: true,
  removedAdmissionReasons: true,
  removedEventDelivery: true,
  removedEligibilityFields: true,
  removedAdmittedField: true,
  removedAccountabilityField: true,
} satisfies {
  readonly registryFields: Equal<
    keyof D6ExactRetrievalComponentVersions,
    | "candidateSource"
    | "admissionRules"
    | "landingContract"
    | "eventSchema"
    | "fixtureSnapshot"
  >;
  readonly d5VersionFields: Equal<
    keyof D5RetrievalAttributionVersions,
    "normalizer" | "parser" | "constraintRules" | "lexicon" | "ontology"
  >;
  readonly exactIdentityFields: Equal<
    keyof ExactFixtureIdentity,
    "namespace" | "canonicalValue"
  >;
  readonly candidateFixtureFields: Equal<
    keyof ExactCandidateFixture,
    | "fixtureOnly"
    | "synthetic"
    | "fixtureSnapshotVersion"
    | "candidateSourceVersion"
    | "variantId"
    | "canonicalStyleId"
    | "identity"
  >;
  readonly candidateSnapshotFields: Equal<
    keyof ExactCandidateFixtureSnapshot,
    | "fixtureOnly"
    | "synthetic"
    | "fixtureSnapshotVersion"
    | "candidateSourceVersion"
    | "candidates"
  >;
  readonly catalogProofFields: Equal<
    keyof CatalogIdentityProofFixture,
    | "fixtureOnly"
    | "synthetic"
    | "fixtureSnapshotVersion"
    | "syntheticEvidenceRef"
    | "variantId"
    | "canonicalStyleId"
    | "identity"
    | "optionFacts"
  >;
  readonly eligibilityFields: Equal<
    keyof EligibilitySummaryFixture,
    | "fixtureOnly"
    | "synthetic"
    | "fixtureSnapshotVersion"
    | "variantId"
    | "marketCode"
    | "outcome"
    | "fixtureReason"
    | "selectedVariantAmount"
    | "currency"
  >;
  readonly exactConstraintFields: Equal<
    keyof ExactIdentityInterpretedConstraint,
    | "constraintId"
    | "value"
    | "source"
    | "interpretationState"
    | "attributeBand"
    | "decisionProfile"
  >;
  readonly exactConstraintKind: Equal<
    ExactIdentityInterpretedConstraint["value"]["kind"],
    "EXACT_IDENTITY"
  >;
  readonly applicableRequestFields: Equal<
    keyof ApplicableExactSliceRequest,
    "status" | "constraint"
  >;
  readonly requestAssessmentStatuses: Equal<
    ExactSliceRequestAssessment["status"],
    | "APPLICABLE"
    | "REQUEST_NOT_APPLICABLE"
    | "REQUEST_INVALID"
    | "UNSUPPORTED_EXACT_NAMESPACE"
  >;
  readonly escapingStatuses: Equal<
    ExactSliceRunResult["status"],
    (typeof FROZEN_ESCAPING_STATUSES)[number]
  >;
  readonly requestReasons: Equal<
    ExactSliceRequestRejection["reason"],
    (typeof FROZEN_REQUEST_REASONS)[number]
  >;
  readonly lookupStatuses: Equal<
    ExactCandidateLookup["status"],
    "MATCH" | "EXACT_NOT_FOUND" | "FIXTURE_INVALID"
  >;
  readonly lookupMatchFields: Equal<
    keyof LookupMatch,
    "status" | "candidate" | "exactLookupAccountabilityKey"
  >;
  readonly lookupMissFields: Equal<
    keyof LookupMiss,
    "status" | "reasons" | "fallbackRoutes" | "exactLookupAccountabilityKey"
  >;
  readonly lookupInvalidFields: Equal<
    keyof LookupInvalid,
    "status" | "reason"
  >;
  readonly lookupFailureStatuses: Equal<
    ExactCandidateLookupFailure["status"],
    "EXACT_NOT_FOUND" | "FIXTURE_INVALID"
  >;
  readonly fixtureFailureReasons: Equal<
    CandidateFixtureFailureReason,
    (typeof FROZEN_FIXTURE_FAILURE_REASONS)[number]
  >;
  readonly admissionReasons: Equal<
    ExactAdmissionRejectionReason,
    (typeof FROZEN_ADMISSION_REJECTION_REASONS)[number]
  >;
  readonly exactResultFields: Equal<
    keyof ExactVariantResult,
    | "displayedStyleId"
    | "displayedVariantId"
    | "exactIdentity"
    | "priceBasis"
    | "amount"
    | "currency"
    | "optionFacts"
    | "exactLookupAccountabilityKey"
    | "candidateSourceVersion"
    | "fixtureSnapshotVersion"
    | "admissionVersion"
    | "landingVersion"
    | "d5Versions"
    | "d5Decision"
    | "eligibilityFixtureReason"
  >;
  readonly landingIntentFields: Equal<
    keyof ExactLandingIntent,
    | "displayedStyleId"
    | "displayedVariantId"
    | "priceBasis"
    | "exactIdentity"
    | "fallbackRoutes"
    | "speechRequirements"
    | "exactLookupAccountabilityKey"
    | "candidateSourceVersion"
    | "fixtureSnapshotVersion"
    | "admissionVersion"
    | "landingVersion"
    | "d5Versions"
  >;
  readonly landingVerifiedFields: Equal<keyof LandingVerified, "status">;
  readonly landingMismatchFields: Equal<
    keyof LandingMismatch,
    "status" | "reason"
  >;
  readonly landingVerificationStatuses: Equal<
    ExactLandingVerification["status"],
    (typeof FROZEN_LANDING_VERIFICATION_STATUSES)[number]
  >;
  readonly admissionAdmittedFields: Equal<
    keyof AdmissionAdmitted,
    "status" | "result" | "landingIntent"
  >;
  readonly admissionRejectedFields: Equal<
    keyof AdmissionRejected,
    "status" | "reason" | "exactLookupAccountabilityKey"
  >;
  readonly coreOutcomeStatuses: Equal<
    ExactSliceCoreOutcome["status"],
    ExactSliceRunResult["status"]
  >;
  readonly eventPayloadFields: Equal<
    keyof ExactSliceEventPayload,
    | "eventName"
    | "eventSchemaVersion"
    | "outcome"
    | "marketCode"
    | "d5Versions"
    | "d6Versions"
    | "exactLookupAccountabilityKey"
    | "displayedStyleId"
    | "displayedVariantId"
  >;
  readonly eventName: Equal<
    ExactSliceEventPayload["eventName"],
    "D6_EXACT_SLICE_EVALUATED_PROVISIONAL"
  >;
  readonly eventSeamFields: Equal<
    keyof ExactSliceEventSeam,
    "enabled" | "sink"
  >;
  readonly eventDeliveryStatuses: Equal<
    ExactSliceEventDelivery["status"],
    (typeof FROZEN_EVENT_DELIVERY_STATUSES)[number]
  >;
  readonly runRequestFields: Equal<
    keyof RunRequestRejection,
    "status" | "reason" | "eventDelivery"
  >;
  readonly runMissFields: Equal<
    keyof RunExactMiss,
    | "status"
    | "reasons"
    | "fallbackRoutes"
    | "exactLookupAccountabilityKey"
    | "eventDelivery"
  >;
  readonly runFixtureInvalidFields: Equal<
    keyof RunFixtureInvalid,
    "status" | "reason" | "eventDelivery"
  >;
  readonly runAdmissionRejectedFields: Equal<
    keyof RunAdmissionRejected,
    "status" | "reason" | "exactLookupAccountabilityKey" | "eventDelivery"
  >;
  readonly runAdmittedFields: Equal<
    keyof RunAdmitted,
    "status" | "result" | "landingIntent" | "eventDelivery"
  >;
  readonly runInputFields: Equal<
    keyof RunExactSkuFixtureSliceInput,
    | "parserResult"
    | "context"
    | "candidateSnapshot"
    | "catalogProofs"
    | "eligibilitySummaries"
    | "eventSeam"
  >;
  readonly admissionInputFields: Equal<
    keyof AdmitExactCandidateInput,
    | "request"
    | "context"
    | "candidate"
    | "exactLookupAccountabilityKey"
    | "catalogProofs"
    | "eligibilitySummaries"
    | "d5Versions"
  >;
  readonly priceBasis: Equal<ExactVariantResult["priceBasis"], "SELECTED_VARIANT">;
  readonly fixtureOptionFact: Equal<
    FixtureOptionFact,
    string | number | boolean | null
  >;
  readonly fixtureEligibilityOutcomes: Equal<
    FixtureEligibilityOutcome,
    (typeof PROVISIONAL_FIXTURE_ELIGIBILITY_OUTCOMES)[number]
  >;
  readonly removedAdmissionReasons: Equal<
    Extract<
      ExactAdmissionRejectionReason,
      "D5_EXACT_DECISION_REJECTED" | "LANDING_INTEGRITY_MISMATCH"
    >,
    never
  >;
  readonly removedEventDelivery: Equal<
    Extract<ExactSliceEventDelivery["status"], "DELIVERED_TO_IN_MEMORY_SINK">,
    never
  >;
  readonly removedEligibilityFields: Equal<
    Extract<
      keyof EligibilitySummaryFixture,
      "version" | "reason" | "fulfillmentClass"
    >,
    never
  >;
  readonly removedAdmittedField: Equal<
    Extract<keyof AdmissionAdmitted, "landingVerification">,
    never
  >;
  readonly removedAccountabilityField: Equal<
    Extract<
      | keyof LookupMatch
      | keyof LookupMiss
      | keyof ExactVariantResult
      | keyof ExactLandingIntent
      | keyof ExactSliceEventPayload,
      "candidateSetFingerprint"
    >,
    never
  >;
};

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function expectExactKeys(value: object, fields: readonly string[]): void {
  expect(sortedKeys(value)).toEqual([...fields].sort());
}

function directAdmission(
  summaries: readonly EligibilitySummaryFixture[],
): ExactAdmissionResult {
  const request = CandidateAdmissionModule.assessExactSliceRequest(
    parserResult(),
  );
  if (request.status !== "APPLICABLE") {
    throw new TypeError("Synthetic exact request must be applicable");
  }
  const lookup = ExactFixtureRetrieverModule.retrieveExactCandidateFixture(
    candidateSnapshot(),
    { namespace: "SKU", canonicalValue: "SKU-EXACT-001" },
  );
  if (lookup.status !== "MATCH") {
    throw new TypeError("Synthetic exact candidate must resolve");
  }

  return CandidateAdmissionModule.admitExactCandidate({
    request,
    context: syntheticContext(),
    candidate: lookup.candidate,
    exactLookupAccountabilityKey: lookup.exactLookupAccountabilityKey,
    catalogProofs: [catalogProof()],
    eligibilitySummaries: summaries,
    d5Versions: {
      normalizer: "d5-conservative-normalizer/v0.1",
      parser: "d5-injected-span-parser/v0.1",
      constraintRules: "d5-constraint-decisions/v0.1",
      lexicon: "synthetic-lexicon/v0.1-provisional",
      ontology: "synthetic-ontology/v0.1-provisional",
    },
  });
}

describe("D6-A1 source-vocabulary freeze conformance", () => {
  it("promotes exactly three registry values and preserves two provisional values", () => {
    expect(VersionsModule.D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS).toEqual({
      candidateSource: "d6-exact-fixture-retriever/v0.1",
      admissionRules: "d6-exact-candidate-admission/v0.1",
      landingContract: "d6-exact-landing/v0.1",
      eventSchema: "d6-discovery-events/v0.1-provisional",
      fixtureSnapshot: "d6-exact-retrieval-fixture/v0.1-provisional",
    });
  });

  it("keeps the exact value-export inventory and entrypoint distinction", () => {
    const moduleExports = {
      "types.ts": Object.keys(TypesModule).sort(),
      "versions.ts": Object.keys(VersionsModule).sort(),
      "exact-fixture-retriever.ts": Object.keys(
        ExactFixtureRetrieverModule,
      ).sort(),
      "candidate-admission.ts": Object.keys(
        CandidateAdmissionModule,
      ).sort(),
      "landing.ts": Object.keys(LandingModule).sort(),
      "event-seam.ts": Object.keys(EventSeamModule).sort(),
      "exact-slice.ts": Object.keys(ExactSliceModule).sort(),
    };

    expect(moduleExports).toEqual({
      "types.ts": [],
      "versions.ts": ["D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS"],
      "exact-fixture-retriever.ts": ["retrieveExactCandidateFixture"],
      "candidate-admission.ts": [
        "admitExactCandidate",
        "assessExactSliceRequest",
      ],
      "landing.ts": ["buildExactLandingIntent", "verifyExactLanding"],
      "event-seam.ts": ["deliverExactSliceEvent"],
      "exact-slice.ts": ["runExactSkuFixtureSlice"],
    });
    expect(ExactSliceModule.runExactSkuFixtureSlice).toBeTypeOf("function");
    expect(LandingModule.verifyExactLanding).toBeTypeOf("function");
  });

  it("locks every adjudicated frozen output field set", () => {
    const directAdmitted = directAdmission([eligibilitySummary()]);
    const directRejected = directAdmission([]);
    const admitted = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput(),
    );
    const requestRejected = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput({ parserResult: parserResult([]) }),
    );
    const exactMiss = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput({ candidateSnapshot: candidateSnapshot([]) }),
    );
    const fixtureInvalid = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput({
        candidateSnapshot: candidateSnapshot([
          candidateFixture({ variantId: "variant-duplicate-a" }),
          candidateFixture({ variantId: "variant-duplicate-b" }),
        ]),
      }),
    );
    const admissionRejected = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput({ eligibilitySummaries: [] }),
    );

    expect(directAdmitted.status).toBe("ADMITTED");
    expect(directRejected.status).toBe("ADMISSION_REJECTED");
    expect(admitted.status).toBe("ADMITTED");
    if (
      directAdmitted.status !== "ADMITTED" ||
      directRejected.status !== "ADMISSION_REJECTED" ||
      admitted.status !== "ADMITTED"
    ) {
      throw new TypeError("Synthetic freeze fixtures must reach exact branches");
    }

    expectExactKeys(directAdmitted, [
      "status",
      "result",
      "landingIntent",
    ]);
    expectExactKeys(directRejected, [
      "status",
      "reason",
      "exactLookupAccountabilityKey",
    ]);
    expectExactKeys(admitted.result.d5Versions, [
      "normalizer",
      "parser",
      "constraintRules",
      "lexicon",
      "ontology",
    ]);
    expectExactKeys(admitted.result.exactIdentity, [
      "namespace",
      "canonicalValue",
    ]);
    expectExactKeys(admitted.result, [
      "displayedStyleId",
      "displayedVariantId",
      "exactIdentity",
      "priceBasis",
      "amount",
      "currency",
      "optionFacts",
      "exactLookupAccountabilityKey",
      "candidateSourceVersion",
      "fixtureSnapshotVersion",
      "admissionVersion",
      "landingVersion",
      "d5Versions",
      "d5Decision",
      "eligibilityFixtureReason",
    ]);
    expectExactKeys(admitted.landingIntent, [
      "displayedStyleId",
      "displayedVariantId",
      "priceBasis",
      "exactIdentity",
      "fallbackRoutes",
      "speechRequirements",
      "exactLookupAccountabilityKey",
      "candidateSourceVersion",
      "fixtureSnapshotVersion",
      "admissionVersion",
      "landingVersion",
      "d5Versions",
    ]);
    expectExactKeys(requestRejected, ["status", "reason", "eventDelivery"]);
    expectExactKeys(exactMiss, [
      "status",
      "reasons",
      "fallbackRoutes",
      "exactLookupAccountabilityKey",
      "eventDelivery",
    ]);
    expectExactKeys(fixtureInvalid, ["status", "reason", "eventDelivery"]);
    expectExactKeys(admissionRejected, [
      "status",
      "reason",
      "exactLookupAccountabilityKey",
      "eventDelivery",
    ]);
    expectExactKeys(admitted, [
      "status",
      "result",
      "landingIntent",
      "eventDelivery",
    ]);

    const verified = LandingModule.verifyExactLanding(
      admitted.landingIntent,
      catalogProof(),
    );
    const mismatch = LandingModule.verifyExactLanding(
      { ...admitted.landingIntent, displayedVariantId: "variant-mismatch" },
      catalogProof(),
    );
    expectExactKeys(verified, ["status"]);
    expectExactKeys(mismatch, ["status", "reason"]);
  });

  it("exhaustively locks frozen literals and reuses D5 exact semantics", () => {
    expect(Object.values(COMPILE_TIME_CONFORMANCE).every(Boolean)).toBe(true);
    expect(FROZEN_ESCAPING_STATUSES).toEqual([
      "REQUEST_NOT_APPLICABLE",
      "REQUEST_INVALID",
      "UNSUPPORTED_EXACT_NAMESPACE",
      "EXACT_NOT_FOUND",
      "FIXTURE_INVALID",
      "ADMISSION_REJECTED",
      "ADMITTED",
    ]);
    expect(FROZEN_REQUEST_REASONS).toHaveLength(8);
    expect(FROZEN_FIXTURE_FAILURE_REASONS).toHaveLength(4);
    expect(FROZEN_ADMISSION_REJECTION_REASONS).toHaveLength(11);
    expect(FROZEN_LANDING_VERIFICATION_STATUSES).toEqual([
      "VERIFIED",
      "LANDING_INTEGRITY_MISMATCH",
    ]);
    expect(FROZEN_EVENT_DELIVERY_STATUSES).toEqual([
      "DISABLED",
      "INJECTED_SINK_RETURNED",
      "INJECTED_SINK_THREW",
    ]);

    const admitted = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput(),
    );
    const miss = ExactFixtureRetrieverModule.retrieveExactCandidateFixture(
      candidateSnapshot([]),
      { namespace: "SKU", canonicalValue: "SKU-EXACT-001" },
    );
    expect(admitted.status).toBe("ADMITTED");
    if (admitted.status === "ADMITTED") {
      expect(admitted.result.exactIdentity.namespace).toBe("SKU");
      expect(admitted.result.priceBasis).toBe("SELECTED_VARIANT");
      expect(admitted.result.d5Decision.reasons).toEqual([
        "EXACT_IDENTITY_MATCH",
        "EXACT_IDENTITY_NO_SUBSTITUTION",
      ]);
    }
    expect(miss).toMatchObject({
      status: "EXACT_NOT_FOUND",
      reasons: ["EXACT_IDENTITY_NO_SUBSTITUTION"],
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
    });
  });

  it("keeps fixture, event, input, and internal vocabulary explicitly provisional", () => {
    expect(PROVISIONAL_FIXTURE_ELIGIBILITY_OUTCOMES).toEqual([
      "ADMISSIBLE_FIXTURE",
      "UNKNOWN_FIXTURE",
      "INELIGIBLE_FIXTURE",
    ]);
    expect(candidateFixture()).toMatchObject({
      fixtureOnly: true,
      synthetic: true,
      fixtureSnapshotVersion:
        "d6-exact-retrieval-fixture/v0.1-provisional",
      candidateSourceVersion: "d6-exact-fixture-retriever/v0.1",
    });
    expect(
      VersionsModule.D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.eventSchema,
    ).toContain("provisional");
    expect(
      VersionsModule.D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    ).toContain("provisional");

    let event: ExactSliceEventPayload | undefined;
    ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput({
        eventSeam: {
          enabled: true,
          sink: (payload) => {
            event = payload;
          },
        },
      }),
    );
    expect(event?.eventName).toBe(
      "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
    );
    expect(event?.eventSchemaVersion).toBe(
      "d6-discovery-events/v0.1-provisional",
    );
    expectExactKeys(exactSliceInput(), [
      "parserResult",
      "context",
      "candidateSnapshot",
      "catalogProofs",
      "eligibilitySummaries",
    ]);

    const applicable = CandidateAdmissionModule.assessExactSliceRequest(
      parserResult([exactConstraint()]),
    );
    const match = ExactFixtureRetrieverModule.retrieveExactCandidateFixture(
      candidateSnapshot(),
      { namespace: "SKU", canonicalValue: "SKU-EXACT-001" },
    );
    expect(applicable.status).toBe("APPLICABLE");
    expect(match.status).toBe("MATCH");
  });

  it("keeps every removed or retired symbol absent from active shapes", () => {
    expect(Object.values(COMPILE_TIME_CONFORMANCE).every(Boolean)).toBe(true);

    const admitted = ExactSliceModule.runExactSkuFixtureSlice(
      exactSliceInput(),
    );
    const summary = eligibilitySummary();
    expect(admitted).not.toHaveProperty("landingVerification");
    expect(summary).not.toHaveProperty("version");
    expect(summary).not.toHaveProperty("reason");
    expect(summary).not.toHaveProperty("fulfillmentClass");
    if (admitted.status === "ADMITTED") {
      expect(admitted.result).not.toHaveProperty("candidateSetFingerprint");
      expect(admitted.landingIntent).not.toHaveProperty(
        "candidateSetFingerprint",
      );
    }
  });
});
