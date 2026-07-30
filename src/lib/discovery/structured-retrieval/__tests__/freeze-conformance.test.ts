import { describe, expect, it } from "vitest";

import type {
  CategoricalPolicyFixture,
  InterpretedConstraint,
} from "../../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../../versions";
import { validateStage0AuthorityUniverse } from "../authority-universe";
import { admitStructuredCandidate } from "../candidate-admission";
import { evaluateStructuredCandidateEvidence } from "../evidence-evaluation";
import { enumerateStructuredCandidateFixtures } from "../fixture-candidate-source";
import { verifyStructuredLanding } from "../landing";
import { buildStructuredRequestPlan } from "../request-plan";
import { runStructuredCategoricalFixtureSlice } from "../structured-slice";
import type {
  AdmitStructuredCandidateInput,
  CandidateSourceRejection,
  CandidateSourceRejectionReason,
  D5StructuredRetrievalAttributionVersions,
  D6B1StructuredRetrievalComponentVersions,
  EvidenceEvaluationRejectionReason,
  EvidenceSelectionStatus,
  MatchedGovernedAttribute,
  Stage0AllowedCanonicalPair,
  Stage0ContextBinding,
  Stage0Rejection,
  Stage0RejectionReason,
  StructuredAdmissionRejectionReason,
  StructuredAdmissionResult,
  StructuredCandidatePartition,
  StructuredCandidateResult,
  StructuredCandidateSourceAttribution,
  StructuredEligibilityAttribution,
  StructuredEvidenceAttribution,
  StructuredLandingIntent,
  StructuredLandingVerification,
  StructuredRequestRejection,
  StructuredRequestRejectionReason,
  StructuredResultCounts,
  StructuredSliceCompleted,
  StructuredSliceRunResult,
  ValidatedStage0AuthorityUniverse,
} from "../types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "../versions";
import {
  candidateFixture,
  candidateSnapshot,
  categoricalPolicy,
  COLOR_ATTRIBUTE_ID,
  evidenceFixture,
  eligibilitySummary,
  governedConstraint,
  parserResult,
  stage0Proof,
  structuredInput,
  syntheticContext,
} from "./fixtures";

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;

type LandingVerified = Extract<
  StructuredLandingVerification,
  { readonly status: "VERIFIED" }
>;
type LandingMismatch = Extract<
  StructuredLandingVerification,
  { readonly status: "LANDING_INTEGRITY_MISMATCH" }
>;
type AdmissionAdmitted = Extract<
  StructuredAdmissionResult,
  { readonly status: "ADMITTED" }
>;
type AdmissionRejected = Extract<
  StructuredAdmissionResult,
  { readonly status: "ADMISSION_REJECTED" }
>;
type RunRequestRejected = Extract<
  StructuredSliceRunResult,
  { readonly status: "REQUEST_REJECTED" }
>;
type RunStage0Rejected = Extract<
  StructuredSliceRunResult,
  { readonly status: "STAGE0_REJECTED" }
>;
type RunCandidateSourceRejected = Extract<
  StructuredSliceRunResult,
  { readonly status: "CANDIDATE_SOURCE_REJECTED" }
>;
type RunCompleted = Extract<
  StructuredSliceRunResult,
  { readonly status: "COMPLETED" }
>;
type RemovedEligibilityVariantMismatch =
  `ELIGIBILITY_${"VARIANT"}_MISMATCH`;

const FROZEN_REQUEST_REASONS = [
  "INCOMPATIBLE_D5_PARSER_VERSION",
  "CONSTRAINT_COUNT_OUTSIDE_D6_B1",
  "UNSUPPORTED_OR_UNRESOLVED_REQUEST",
  "AFFECTING_CONTRADICTION",
  "OUTSIDE_GOVERNED_CATEGORICAL_SLICE",
  "INVALID_CONSTRAINT_SOURCE",
  "UNSUPPORTED_GOVERNED_ATTRIBUTE",
  "DUPLICATE_GOVERNED_ATTRIBUTE",
  "POLICY_COUNT_MISMATCH",
  "POLICY_PROVENANCE_INVALID",
  "POLICY_IDENTITY_MISMATCH",
  "NON_REQUIRED_POLICY",
] as const;

const FROZEN_STAGE0_REASONS = [
  "STAGE0_PROVENANCE_INVALID",
  "STAGE0_CONTEXT_MISMATCH",
  "STAGE0_MEMBERSHIP_INVALID",
  "DUPLICATE_STAGE0_MEMBERSHIP",
  "CONFLICTING_STAGE0_STYLE_PARENT",
] as const;

const FROZEN_CANDIDATE_SOURCE_REASONS = [
  "CANDIDATE_SOURCE_PROVENANCE_INVALID",
  "CANDIDATE_FIXTURE_PROVENANCE_INVALID",
  "DUPLICATE_CANDIDATE_VARIANT_ID",
  "CANDIDATE_CANONICAL_PARENT_MISMATCH",
] as const;

const FROZEN_EVIDENCE_REASONS = [
  "EVIDENCE_PROVENANCE_INVALID",
  "DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE",
  "EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH",
  "EVIDENCE_NOT_REPRESENTABLE",
] as const;

const FROZEN_D6_ADMISSION_REASONS = [
  "CANDIDATE_OUTSIDE_STAGE0_SCOPE",
  "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID",
  "REQUEST_PLAN_INVARIANT_FAILED",
  "PRODUCT_DECISION_SET_INVALID",
  "ELIGIBILITY_SUMMARY_MISSING",
  "ELIGIBILITY_SUMMARY_DUPLICATE",
  "ELIGIBILITY_PROVENANCE_INVALID",
  "ELIGIBILITY_SUMMARY_STALE",
  "ELIGIBILITY_MARKET_MISMATCH",
  "ELIGIBILITY_STYLE_MISMATCH",
  "ELIGIBILITY_SUMMARY_UNKNOWN",
  "ELIGIBILITY_SUMMARY_INELIGIBLE",
  "SELECTED_VARIANT_AMOUNT_INVALID",
  "SELECTED_VARIANT_CURRENCY_INVALID",
] as const;

const FROZEN_DURABLE_STATUSES = [
  "APPLICABLE",
  "REQUEST_REJECTED",
  "VALIDATED",
  "STAGE0_REJECTED",
  "CANDIDATE_SOURCE_REJECTED",
  "ADMITTED",
  "ADMISSION_REJECTED",
  "COMPLETED",
  "VERIFIED",
  "LANDING_INTEGRITY_MISMATCH",
] as const;

const FROZEN_EVIDENCE_SELECTION_STATUSES = [
  "SELECTED",
  "ABSENT",
  "REJECTED",
] as const;

const FROZEN_PARTITIONS = [
  "ASSERTED",
  "UNKNOWN",
  "VIOLATING",
  "WITHHELD",
] as const;

const COMPILE_TIME_CONFORMANCE = {
  registryFields: true,
  d5VersionFields: true,
  requestRejectionFields: true,
  stage0ContextFields: true,
  stage0PairFields: true,
  validatedStage0Fields: true,
  stage0RejectionFields: true,
  candidateSourceAttributionFields: true,
  candidateSourceRejectionFields: true,
  evidenceAttributionFields: true,
  eligibilityAttributionFields: true,
  matchedAttributeFields: true,
  landingIntentFields: true,
  landingVerifiedFields: true,
  landingMismatchFields: true,
  candidateResultFields: true,
  admissionAdmittedFields: true,
  admissionRejectedFields: true,
  countFields: true,
  completedFields: true,
  runRequestRejectedFields: true,
  runStage0RejectedFields: true,
  runCandidateSourceRejectedFields: true,
  runCompletedFields: true,
  requestReasons: true,
  requestCompatibilitySentinel: true,
  stage0Reasons: true,
  candidateSourceReasons: true,
  evidenceReasons: true,
  evidenceCompatibilitySentinel: true,
  admissionReasons: true,
  oldEligibilityReasonAbsent: true,
  accountabilityReasonPresent: true,
  evidenceSelectionStatuses: true,
  partitions: true,
} satisfies {
  readonly registryFields: Equal<
    keyof D6B1StructuredRetrievalComponentVersions,
    | "requestPlan"
    | "stage0Scope"
    | "candidateSource"
    | "admissionRules"
    | "landingContract"
    | "fixtureSnapshot"
    | "eligibilitySnapshot"
  >;
  readonly d5VersionFields: Equal<
    keyof D5StructuredRetrievalAttributionVersions,
    "normalizer" | "parser" | "constraintRules" | "lexicon" | "ontology"
  >;
  readonly requestRejectionFields: Equal<
    keyof StructuredRequestRejection,
    "status" | "reason"
  >;
  readonly stage0ContextFields: Equal<
    keyof Stage0ContextBinding,
    "marketCode" | "locale" | "queryLanguage" | "audienceNamespace"
  >;
  readonly stage0PairFields: Equal<
    keyof Stage0AllowedCanonicalPair,
    "variantId" | "canonicalStyleId"
  >;
  readonly validatedStage0Fields: Equal<
    keyof ValidatedStage0AuthorityUniverse,
    | "status"
    | "stage0ScopeVersion"
    | "fixtureSnapshotVersion"
    | "context"
    | "allowedCanonicalPairs"
    | "accountabilityKey"
  >;
  readonly stage0RejectionFields: Equal<
    keyof Stage0Rejection,
    "status" | "reason"
  >;
  readonly candidateSourceAttributionFields: Equal<
    keyof StructuredCandidateSourceAttribution,
    | "fixtureSnapshotVersion"
    | "candidateSourceVersion"
    | "scopedMembership"
    | "enumeratedCandidateIdentities"
    | "accountabilityKey"
  >;
  readonly candidateSourceRejectionFields: Equal<
    keyof CandidateSourceRejection,
    "status" | "reason"
  >;
  readonly evidenceAttributionFields: Equal<
    keyof StructuredEvidenceAttribution,
    | "constraintId"
    | "attributeId"
    | "status"
    | "matchingRecordCount"
    | "evidenceState"
    | "syntheticEvidenceRef"
    | "fixtureSnapshotVersion"
  >;
  readonly eligibilityAttributionFields: Equal<
    keyof StructuredEligibilityAttribution,
    | "fixtureSnapshotVersion"
    | "eligibilitySnapshotVersion"
    | "variantId"
    | "canonicalStyleId"
    | "marketCode"
    | "fixtureReason"
  >;
  readonly matchedAttributeFields: Equal<
    keyof MatchedGovernedAttribute,
    "constraintId" | "attributeId" | "valueId"
  >;
  readonly landingIntentFields: Equal<
    keyof StructuredLandingIntent,
    | "displayedVariantId"
    | "displayedStyleId"
    | "priceBasis"
    | "amount"
    | "currency"
    | "matchedGovernedAttributes"
    | "candidateSourceAttribution"
    | "stage0Attribution"
    | "evidenceAttribution"
    | "eligibilityAttribution"
    | "d5Versions"
    | "d6Versions"
  >;
  readonly landingVerifiedFields: Equal<keyof LandingVerified, "status">;
  readonly landingMismatchFields: Equal<
    keyof LandingMismatch,
    "status" | "reason"
  >;
  readonly candidateResultFields: Equal<
    keyof StructuredCandidateResult,
    | "displayedVariantId"
    | "displayedStyleId"
    | "partition"
    | "priceBasis"
    | "amount"
    | "currency"
    | "matchedGovernedAttributes"
    | "queryDecisions"
    | "productDecisions"
    | "candidateSourceAttribution"
    | "stage0Attribution"
    | "evidenceAttribution"
    | "eligibilityAttribution"
    | "d5Versions"
    | "d6Versions"
    | "landingIntent"
    | "landingIntegrity"
  >;
  readonly admissionAdmittedFields: Equal<
    keyof AdmissionAdmitted,
    "status" | "candidate"
  >;
  readonly admissionRejectedFields: Equal<
    keyof AdmissionRejected,
    | "status"
    | "variantId"
    | "canonicalStyleId"
    | "reason"
    | "candidateSourceAttribution"
    | "stage0Attribution"
    | "evidenceAttribution"
    | "d5Versions"
    | "d6Versions"
  >;
  readonly countFields: Equal<
    keyof StructuredResultCounts,
    | "scopedMembership"
    | "enumeratedCandidates"
    | "admissionAttempts"
    | "asserted"
    | "unknown"
    | "violating"
    | "withheld"
    | "admissionRejected"
  >;
  readonly completedFields: Equal<
    keyof StructuredSliceCompleted,
    | "status"
    | "requestPlan"
    | "stage0Attribution"
    | "candidateSourceAttribution"
    | "assertedCandidates"
    | "unknownCandidates"
    | "violatingCandidates"
    | "withheldCandidates"
    | "admissionRejections"
    | "counts"
    | "technicalOrder"
    | "ranking"
    | "relaxation"
    | "d5Versions"
    | "d6Versions"
  >;
  readonly runRequestRejectedFields: Equal<
    keyof RunRequestRejected,
    "status" | "reason" | "d5Versions" | "d6Versions"
  >;
  readonly runStage0RejectedFields: Equal<
    keyof RunStage0Rejected,
    "status" | "reason" | "requestPlan" | "d5Versions" | "d6Versions"
  >;
  readonly runCandidateSourceRejectedFields: Equal<
    keyof RunCandidateSourceRejected,
    | "status"
    | "reason"
    | "requestPlan"
    | "stage0Attribution"
    | "d5Versions"
    | "d6Versions"
  >;
  readonly runCompletedFields: Equal<
    keyof RunCompleted,
    keyof StructuredSliceCompleted
  >;
  readonly requestReasons: Equal<
    Exclude<
      StructuredRequestRejectionReason,
      "INCOMPATIBLE_D5_QUERY_DECISION"
    >,
    (typeof FROZEN_REQUEST_REASONS)[number]
  >;
  readonly requestCompatibilitySentinel: Equal<
    Extract<
      StructuredRequestRejectionReason,
      "INCOMPATIBLE_D5_QUERY_DECISION"
    >,
    "INCOMPATIBLE_D5_QUERY_DECISION"
  >;
  readonly stage0Reasons: Equal<
    Stage0RejectionReason,
    (typeof FROZEN_STAGE0_REASONS)[number]
  >;
  readonly candidateSourceReasons: Equal<
    CandidateSourceRejectionReason,
    (typeof FROZEN_CANDIDATE_SOURCE_REASONS)[number]
  >;
  readonly evidenceReasons: Equal<
    Exclude<
      EvidenceEvaluationRejectionReason,
      "INCOMPATIBLE_D5_PRODUCT_DECISION"
    >,
    (typeof FROZEN_EVIDENCE_REASONS)[number]
  >;
  readonly evidenceCompatibilitySentinel: Equal<
    Extract<
      EvidenceEvaluationRejectionReason,
      "INCOMPATIBLE_D5_PRODUCT_DECISION"
    >,
    "INCOMPATIBLE_D5_PRODUCT_DECISION"
  >;
  readonly admissionReasons: Equal<
    Exclude<
      StructuredAdmissionRejectionReason,
      "INCOMPATIBLE_D5_PRODUCT_DECISION"
    >,
    | (typeof FROZEN_EVIDENCE_REASONS)[number]
    | (typeof FROZEN_D6_ADMISSION_REASONS)[number]
  >;
  readonly oldEligibilityReasonAbsent: Equal<
    Extract<
      StructuredAdmissionRejectionReason,
      RemovedEligibilityVariantMismatch
    >,
    never
  >;
  readonly accountabilityReasonPresent: Equal<
    Extract<
      StructuredAdmissionRejectionReason,
      "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID"
    >,
    "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID"
  >;
  readonly evidenceSelectionStatuses: Equal<
    EvidenceSelectionStatus,
    (typeof FROZEN_EVIDENCE_SELECTION_STATUSES)[number]
  >;
  readonly partitions: Equal<
    StructuredCandidatePartition,
    (typeof FROZEN_PARTITIONS)[number]
  >;
};

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function expectExactKeys(
  value: object,
  fields: readonly string[],
): void {
  expect(sortedKeys(value)).toEqual([...fields].sort());
}

function directAdmissionInput(): AdmitStructuredCandidateInput {
  const constraint = governedConstraint();
  const context = syntheticContext();
  const candidate = candidateFixture();
  const requestPlan = buildStructuredRequestPlan(
    parserResult([constraint]),
    context,
    [categoricalPolicy(constraint)],
  );
  if (requestPlan.status !== "APPLICABLE") {
    throw new TypeError("Synthetic request plan must apply");
  }
  const stage0 = validateStage0AuthorityUniverse(
    stage0Proof(),
    context,
  );
  if (stage0.status !== "VALIDATED") {
    throw new TypeError("Synthetic Stage-0 proof must validate");
  }
  const enumeration = enumerateStructuredCandidateFixtures(
    candidateSnapshot([candidate]),
    stage0,
  );
  if (enumeration.status !== "SCOPED_CANDIDATES") {
    throw new TypeError("Synthetic candidate must enumerate");
  }
  const evidenceEvaluation = evaluateStructuredCandidateEvidence(
    requestPlan,
    context,
    candidate,
    [evidenceFixture(candidate, constraint)],
  );
  if (evidenceEvaluation.status !== "EVALUATED") {
    throw new TypeError("Synthetic evidence must evaluate");
  }

  return {
    requestPlan,
    context,
    stage0Proof: stage0,
    candidate,
    candidateSourceAttribution: enumeration.attribution,
    evidenceEvaluation,
    eligibilitySummaries: [eligibilitySummary(candidate)],
    d5Versions: {
      normalizer: DISCOVERY_COMPONENT_VERSIONS.normalizer,
      parser: DISCOVERY_COMPONENT_VERSIONS.parser,
      constraintRules: DISCOVERY_COMPONENT_VERSIONS.constraintRules,
      lexicon: "fixture:d6-b1-freeze-lexicon/v0.1-provisional",
      ontology: "fixture:d6-b1-freeze-ontology/v0.1-provisional",
    },
    d6Versions: {
      ...D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS,
    },
  };
}

function invalidCandidateSnapshotInput(): ReturnType<
  typeof structuredInput
> {
  const snapshot = candidateSnapshot();
  Object.defineProperty(snapshot, "synthetic", { value: false });
  return structuredInput({ candidateSnapshot: snapshot });
}

describe("D6-B1 source-vocabulary freeze conformance", () => {
  it("freezes two supported entrypoints without locking helper exports", () => {
    expect(runStructuredCategoricalFixtureSlice).toBeTypeOf("function");
    expect(verifyStructuredLanding).toBeTypeOf("function");
  });

  it("promotes exactly five behavioral versions and keeps two snapshots provisional", () => {
    expect(D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS).toEqual({
      requestPlan: "d6-b1-structured-request-plan/v0.1",
      stage0Scope: "d6-b1-stage-0-authority-universe/v0.1",
      candidateSource:
        "d6-b1-categorical-fixture-candidate-source/v0.1",
      admissionRules:
        "d6-b1-structured-candidate-admission/v0.1",
      landingContract: "d6-b1-structured-landing/v0.1",
      fixtureSnapshot:
        "d6-b1-categorical-retrieval-fixture/v0.1-provisional",
      eligibilitySnapshot:
        "d6-b1-eligibility-fixture/v0.1-provisional",
    });
  });

  it("locks the selected durable field sets and branch shapes", () => {
    const completed = runStructuredCategoricalFixtureSlice(
      structuredInput(),
    );
    const requestRejected = runStructuredCategoricalFixtureSlice(
      structuredInput({ parserResult: parserResult([]) }),
    );
    const invalidStage0 = stage0Proof();
    Object.defineProperty(invalidStage0, "fixtureOnly", {
      value: false,
    });
    const stage0Rejected = runStructuredCategoricalFixtureSlice(
      structuredInput({ stage0Proof: invalidStage0 }),
    );
    const candidateSourceRejected =
      runStructuredCategoricalFixtureSlice(
        invalidCandidateSnapshotInput(),
      );
    const admitted = admitStructuredCandidate(directAdmissionInput());

    expect(completed.status).toBe("COMPLETED");
    expect(admitted.status).toBe("ADMITTED");
    if (completed.status !== "COMPLETED" || admitted.status !== "ADMITTED") {
      throw new TypeError("Synthetic freeze branches must complete");
    }
    const candidate = completed.assertedCandidates[0];
    const evidenceAttribution = candidate?.evidenceAttribution[0];
    if (candidate === undefined || evidenceAttribution === undefined) {
      throw new TypeError("Synthetic asserted candidate must exist");
    }

    expectExactKeys(completed.stage0Attribution.context, [
      "marketCode",
      "locale",
      "queryLanguage",
      "audienceNamespace",
    ]);
    expectExactKeys(
      completed.stage0Attribution.allowedCanonicalPairs[0] ?? {},
      ["variantId", "canonicalStyleId"],
    );
    expectExactKeys(completed.stage0Attribution, [
      "status",
      "stage0ScopeVersion",
      "fixtureSnapshotVersion",
      "context",
      "allowedCanonicalPairs",
      "accountabilityKey",
    ]);
    expectExactKeys(completed.candidateSourceAttribution, [
      "fixtureSnapshotVersion",
      "candidateSourceVersion",
      "scopedMembership",
      "enumeratedCandidateIdentities",
      "accountabilityKey",
    ]);
    expectExactKeys(evidenceAttribution, [
      "constraintId",
      "attributeId",
      "status",
      "matchingRecordCount",
      "evidenceState",
      "syntheticEvidenceRef",
      "fixtureSnapshotVersion",
    ]);
    expectExactKeys(candidate.eligibilityAttribution, [
      "fixtureSnapshotVersion",
      "eligibilitySnapshotVersion",
      "variantId",
      "canonicalStyleId",
      "marketCode",
      "fixtureReason",
    ]);
    expectExactKeys(candidate.matchedGovernedAttributes[0] ?? {}, [
      "constraintId",
      "attributeId",
      "valueId",
    ]);
    expectExactKeys(candidate.landingIntent, [
      "displayedVariantId",
      "displayedStyleId",
      "priceBasis",
      "amount",
      "currency",
      "matchedGovernedAttributes",
      "candidateSourceAttribution",
      "stage0Attribution",
      "evidenceAttribution",
      "eligibilityAttribution",
      "d5Versions",
      "d6Versions",
    ]);
    expectExactKeys(candidate, [
      "displayedVariantId",
      "displayedStyleId",
      "partition",
      "priceBasis",
      "amount",
      "currency",
      "matchedGovernedAttributes",
      "queryDecisions",
      "productDecisions",
      "candidateSourceAttribution",
      "stage0Attribution",
      "evidenceAttribution",
      "eligibilityAttribution",
      "d5Versions",
      "d6Versions",
      "landingIntent",
      "landingIntegrity",
    ]);
    expectExactKeys(admitted, ["status", "candidate"]);
    expectExactKeys(completed.counts, [
      "scopedMembership",
      "enumeratedCandidates",
      "admissionAttempts",
      "asserted",
      "unknown",
      "violating",
      "withheld",
      "admissionRejected",
    ]);
    expectExactKeys(completed, [
      "status",
      "requestPlan",
      "stage0Attribution",
      "candidateSourceAttribution",
      "assertedCandidates",
      "unknownCandidates",
      "violatingCandidates",
      "withheldCandidates",
      "admissionRejections",
      "counts",
      "technicalOrder",
      "ranking",
      "relaxation",
      "d5Versions",
      "d6Versions",
    ]);
    expectExactKeys(requestRejected, [
      "status",
      "reason",
      "d5Versions",
      "d6Versions",
    ]);
    expectExactKeys(stage0Rejected, [
      "status",
      "reason",
      "requestPlan",
      "d5Versions",
      "d6Versions",
    ]);
    expectExactKeys(candidateSourceRejected, [
      "status",
      "reason",
      "requestPlan",
      "stage0Attribution",
      "d5Versions",
      "d6Versions",
    ]);
  });

  it("locks durable literals and excludes provisional compatibility sentinels", () => {
    expect(Object.values(COMPILE_TIME_CONFORMANCE).every(Boolean)).toBe(
      true,
    );
    expect(FROZEN_DURABLE_STATUSES).toEqual([
      "APPLICABLE",
      "REQUEST_REJECTED",
      "VALIDATED",
      "STAGE0_REJECTED",
      "CANDIDATE_SOURCE_REJECTED",
      "ADMITTED",
      "ADMISSION_REJECTED",
      "COMPLETED",
      "VERIFIED",
      "LANDING_INTEGRITY_MISMATCH",
    ]);
    expect(FROZEN_EVIDENCE_SELECTION_STATUSES).toEqual([
      "SELECTED",
      "ABSENT",
      "REJECTED",
    ]);
    expect(FROZEN_PARTITIONS).toEqual([
      "ASSERTED",
      "UNKNOWN",
      "VIOLATING",
      "WITHHELD",
    ]);
    expect(FROZEN_REQUEST_REASONS).not.toContain(
      "INCOMPATIBLE_D5_QUERY_DECISION",
    );
    expect(FROZEN_EVIDENCE_REASONS).not.toContain(
      "INCOMPATIBLE_D5_PRODUCT_DECISION",
    );
    expect(FROZEN_STAGE0_REASONS).toHaveLength(5);
    expect(FROZEN_CANDIDATE_SOURCE_REASONS).toHaveLength(4);
    expect(FROZEN_D6_ADMISSION_REASONS).toHaveLength(14);

    const completed = runStructuredCategoricalFixtureSlice(
      structuredInput(),
    );
    expect(completed).toMatchObject({
      status: "COMPLETED",
      technicalOrder: "VARIANT_ID_THEN_STYLE_ID",
      ranking: "NONE",
      relaxation: "NONE",
      assertedCandidates: [
        {
          priceBasis: "SELECTED_VARIANT",
          landingIntegrity: { status: "VERIFIED" },
        },
      ],
    });
  });

  it("makes every previously untested durable reason explicit", () => {
    const constraint = governedConstraint();
    const unsupportedRequest = buildStructuredRequestPlan(
      parserResult([constraint], {
        unsupported: [
          {
            constraintId: constraint.constraintId,
            conceptId: "fixture:unsupported",
            spanId: "span:color",
            state: "UNRESOLVED",
          },
        ],
      }),
      syntheticContext(),
      [categoricalPolicy(constraint)],
    );

    const unsupportedAttribute: InterpretedConstraint = {
      ...constraint,
      value: {
        kind: "CATEGORICAL",
        attributeId: "fixture:governed-unsupported",
        valueId: "fixture:value:unsupported",
      },
    };
    const unsupportedAttributePolicy: CategoricalPolicyFixture = {
      kind: "CATEGORICAL_POLICY",
      fixtureOnly: true,
      synthetic: true,
      targetConstraintId: unsupportedAttribute.constraintId,
      attributeId: "fixture:governed-unsupported",
      disposition: "REQUIRED",
      policyVersion: "fixture:policy:unsupported/v0.1-provisional",
    };
    const unsupportedAttributeResult = buildStructuredRequestPlan(
      parserResult([unsupportedAttribute]),
      syntheticContext(),
      [unsupportedAttributePolicy],
    );
    const countMismatch = buildStructuredRequestPlan(
      parserResult([constraint]),
      syntheticContext(),
      [],
    );
    const identityMismatch = buildStructuredRequestPlan(
      parserResult([constraint]),
      syntheticContext(),
      [
        categoricalPolicy(constraint, "REQUIRED", {
          targetConstraintId: "constraint:other",
        }),
      ],
    );
    const sourceProvenanceRejected =
      runStructuredCategoricalFixtureSlice(
        invalidCandidateSnapshotInput(),
      );

    expect(unsupportedRequest).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "UNSUPPORTED_OR_UNRESOLVED_REQUEST",
    });
    expect(unsupportedAttributeResult).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "UNSUPPORTED_GOVERNED_ATTRIBUTE",
    });
    expect(countMismatch).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "POLICY_COUNT_MISMATCH",
    });
    expect(identityMismatch).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "POLICY_IDENTITY_MISMATCH",
    });
    expect(sourceProvenanceRejected).toMatchObject({
      status: "CANDIDATE_SOURCE_REJECTED",
      reason: "CANDIDATE_SOURCE_PROVENANCE_INVALID",
    });
  });

  it("keeps accountability rejection reachable and the old eligibility reason absent", () => {
    const baseline = directAdmissionInput();
    const result = admitStructuredCandidate({
      ...baseline,
      candidateSourceAttribution: {
        ...baseline.candidateSourceAttribution,
        accountabilityKey: "fixture:forged-accountability-key",
      },
    });

    expect(result).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID",
    });
    if (result.status !== "ADMISSION_REJECTED") {
      throw new TypeError("Forged accountability must reject");
    }
    expectExactKeys(result, [
      "status",
      "variantId",
      "canonicalStyleId",
      "reason",
      "candidateSourceAttribution",
      "stage0Attribution",
      "evidenceAttribution",
      "d5Versions",
      "d6Versions",
    ]);
    const removedEligibilityReason = [
      "ELIGIBILITY",
      "VARIANT",
      "MISMATCH",
    ].join("_");
    expect(JSON.stringify(result)).not.toContain(removedEligibilityReason);
  });

  it("completes empty Stage-0 membership with zero enumeration", () => {
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        stage0Proof: stage0Proof([]),
        candidateSnapshot: candidateSnapshot([]),
        evidenceFixtures: [],
        eligibilitySummaries: [],
      }),
    );

    expect(result).toMatchObject({
      status: "COMPLETED",
      assertedCandidates: [],
      unknownCandidates: [],
      violatingCandidates: [],
      withheldCandidates: [],
      admissionRejections: [],
      counts: {
        scopedMembership: 0,
        enumeratedCandidates: 0,
        admissionAttempts: 0,
        asserted: 0,
        unknown: 0,
        violating: 0,
        withheld: 0,
        admissionRejected: 0,
      },
      technicalOrder: "VARIANT_ID_THEN_STYLE_ID",
      ranking: "NONE",
      relaxation: "NONE",
    });
  });

  it("uses one UTF-16 code-unit relation across request, Stage 0, source, admission, and completed order", () => {
    const constraintZ = governedConstraint(COLOR_ATTRIBUTE_ID, {
      constraintId: "constraint:z",
    });
    const constraintUmlaut = governedConstraint(COLOR_ATTRIBUTE_ID, {
      constraintId: "constraint:ä",
    });
    for (const constraints of [
      [constraintZ, constraintUmlaut],
      [constraintUmlaut, constraintZ],
    ]) {
      expect(
        buildStructuredRequestPlan(
          parserResult(constraints),
          syntheticContext(),
          constraints.map((entry) => categoricalPolicy(entry)),
        ),
      ).toMatchObject({
        status: "REQUEST_REJECTED",
        reason: "DUPLICATE_GOVERNED_ATTRIBUTE",
      });
    }

    const planZ = buildStructuredRequestPlan(
      parserResult([constraintZ]),
      syntheticContext(),
      [categoricalPolicy(constraintZ)],
    );
    const planUmlaut = buildStructuredRequestPlan(
      parserResult([constraintUmlaut]),
      syntheticContext(),
      [categoricalPolicy(constraintUmlaut)],
    );
    if (
      planZ.status !== "APPLICABLE" ||
      planUmlaut.status !== "APPLICABLE"
    ) {
      throw new TypeError("Single synthetic plans must apply");
    }
    const direct = directAdmissionInput();
    const equalAttributePlan = {
      status: "APPLICABLE" as const,
      requestPlanVersion: planZ.requestPlanVersion,
      constraints: [planZ.constraints[0], planUmlaut.constraints[0]].filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      ),
      policies: [planZ.policies[0], planUmlaut.policies[0]].filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      ),
      queryDecisions: [
        planZ.queryDecisions[0],
        planUmlaut.queryDecisions[0],
      ].filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      ),
    };
    const equalAttributeEvidence =
      evaluateStructuredCandidateEvidence(
        equalAttributePlan,
        direct.context,
        direct.candidate,
        [
          evidenceFixture(direct.candidate, constraintZ),
          evidenceFixture(direct.candidate, constraintUmlaut),
        ],
      );
    expect(
      admitStructuredCandidate({
        ...direct,
        requestPlan: equalAttributePlan,
        evidenceEvaluation: equalAttributeEvidence,
      }).status,
    ).toBe("ADMITTED");
    expect(
      admitStructuredCandidate({
        ...direct,
        requestPlan: {
          ...equalAttributePlan,
          constraints: [...equalAttributePlan.constraints].reverse(),
          policies: [...equalAttributePlan.policies].reverse(),
          queryDecisions: [
            ...equalAttributePlan.queryDecisions,
          ].reverse(),
        },
        evidenceEvaluation: {
          ...equalAttributeEvidence,
          productDecisions: [
            ...equalAttributeEvidence.productDecisions,
          ].reverse(),
          evidenceAttribution: [
            ...equalAttributeEvidence.evidenceAttribution,
          ].reverse(),
        },
      }),
    ).toMatchObject({
      status: "ADMISSION_REJECTED",
      reason: "REQUEST_PLAN_INVARIANT_FAILED",
    });

    const candidateZ = candidateFixture(
      "fixture:variant:z",
      "fixture:style:z",
    );
    const candidateUmlaut = candidateFixture(
      "fixture:variant:ä",
      "fixture:style:ä",
    );
    const constraint = governedConstraint();
    const candidates = [candidateZ, candidateUmlaut];
    const reverseCandidates = [...candidates].reverse();
    const baseline = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([constraint]),
        policies: [categoricalPolicy(constraint)],
        stage0Proof: stage0Proof(reverseCandidates),
        candidateSnapshot: candidateSnapshot(reverseCandidates),
        evidenceFixtures: reverseCandidates.map((candidate) =>
          evidenceFixture(candidate, constraint),
        ),
        eligibilitySummaries: reverseCandidates.map((candidate) =>
          eligibilitySummary(candidate),
        ),
      }),
    );
    const permuted = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([constraint]),
        policies: [categoricalPolicy(constraint)],
        stage0Proof: stage0Proof(candidates),
        candidateSnapshot: candidateSnapshot(candidates),
        evidenceFixtures: candidates.map((candidate) =>
          evidenceFixture(candidate, constraint),
        ),
        eligibilitySummaries: candidates.map((candidate) =>
          eligibilitySummary(candidate),
        ),
      }),
    );

    expect(baseline).toEqual(permuted);
    expect(baseline.status).toBe("COMPLETED");
    if (baseline.status !== "COMPLETED") {
      throw new TypeError("Unicode synthetic run must complete");
    }
    const expectedVariantOrder = [
      "fixture:variant:z",
      "fixture:variant:ä",
    ];
    expect(
      baseline.stage0Attribution.allowedCanonicalPairs.map(
        (pair) => pair.variantId,
      ),
    ).toEqual(expectedVariantOrder);
    expect(
      baseline.candidateSourceAttribution.enumeratedCandidateIdentities.map(
        (pair) => pair.variantId,
      ),
    ).toEqual(expectedVariantOrder);
    expect(
      baseline.assertedCandidates.map(
        (candidate) => candidate.displayedVariantId,
      ),
    ).toEqual(expectedVariantOrder);
  });
});
