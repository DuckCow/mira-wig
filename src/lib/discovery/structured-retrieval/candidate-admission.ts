import type {
  CategoricalPolicyFixture,
  ConstraintDecision,
} from "../types";
import {
  buildStructuredLandingIntent,
  verifyStructuredLanding,
} from "./landing";
import type {
  AdmitStructuredCandidateInput,
  GovernedCategoricalConstraint,
  MatchedGovernedAttribute,
  StructuredAdmissionRejectionReason,
  StructuredAdmissionResult,
  StructuredCandidatePartition,
  StructuredCandidateResultCore,
  StructuredCandidateSourceAttribution,
  StructuredEligibilityAttribution,
  StructuredEligibilitySummaryFixture,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function compareUtf16CodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function requestPlanIsValid(input: AdmitStructuredCandidateInput): boolean {
  const plan = input.requestPlan;
  if (!requestPlanShapeIsValid(plan)) {
    return false;
  }

  for (const [index, constraint] of plan.constraints.entries()) {
    const policy = plan.policies[index];
    const decision = plan.queryDecisions[index];
    if (
      policy === undefined ||
      decision === undefined ||
      !requestPlanEntryIsValid(
        plan.constraints[index - 1],
        constraint,
        policy,
        decision,
      )
    ) {
      return false;
    }
  }

  return true;
}

function requestPlanShapeIsValid(
  plan: AdmitStructuredCandidateInput["requestPlan"],
): boolean {
  return (
    plan.status === "APPLICABLE" &&
    plan.requestPlanVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.requestPlan &&
    plan.constraints.length >= 1 &&
    plan.constraints.length <= 2 &&
    plan.constraints.length === plan.policies.length &&
    plan.constraints.length === plan.queryDecisions.length
  );
}

function requestPlanEntryIsValid(
  priorConstraint: GovernedCategoricalConstraint | undefined,
  constraint: GovernedCategoricalConstraint,
  policy: CategoricalPolicyFixture,
  decision: ConstraintDecision,
): boolean {
  if (
    !governedConstraintIsValid(constraint) ||
    !policyMatchesConstraint(policy, constraint)
  ) {
    return false;
  }
  if (
    priorConstraint !== undefined &&
    canonicalConstraintOrder(priorConstraint, constraint) >= 0
  ) {
    return false;
  }
  return constraintDecisionsEqual(
    decision,
    expectedRequiredQueryDecision(constraint),
  );
}

function expectedRequiredQueryDecision(
  constraint: GovernedCategoricalConstraint,
): ConstraintDecision {
  const confirmationReasons =
    constraint.source.kind === "USER_CONFIRMATION"
      ? ["CONFIRMATION_CHANGED_INTENT_ONLY" as const]
      : [];
  return {
    constraintId: constraint.constraintId,
    subject: { kind: "QUERY" },
    authorityOutcome: { kind: "NOT_APPLICABLE" },
    gate: "REQUIRE_MATCH",
    score: "NONE",
    speechRequirements: ["NO_PRODUCT_ASSERTION"],
    partition: "NOT_APPLICABLE",
    relaxation: "NEVER",
    fallbackRoutes: [],
    reasons: [
      ...confirmationReasons,
      "CATEGORICAL_REQUIRED_BY_POLICY",
    ],
    diagnostics: [],
  };
}

function governedConstraintIsValid(
  constraint: GovernedCategoricalConstraint,
): boolean {
  if (!isNonblankRuntimeString(constraint.constraintId)) {
    return false;
  }
  return (
    governedConstraintSemanticsAreValid(constraint) &&
    governedConstraintSourceIsValid(constraint)
  );
}

function governedConstraintSemanticsAreValid(
  constraint: GovernedCategoricalConstraint,
): boolean {
  const governedAttribute =
    constraint.value.attributeId ===
      "fixture:governed-color-family" ||
    constraint.value.attributeId ===
      "fixture:governed-texture-family";
  return (
    constraint.value.kind === "CATEGORICAL" &&
    governedAttribute &&
    isNonblankRuntimeString(constraint.value.valueId) &&
    constraint.interpretationState === "DECLARED" &&
    constraint.attributeBand === "STYLISTIC" &&
    constraint.decisionProfile ===
      "GOVERNED_STYLISTIC_CATEGORICAL"
  );
}

function governedConstraintSourceIsValid(
  constraint: GovernedCategoricalConstraint,
): boolean {
  if (constraint.source.kind === "USER_CONFIRMATION") {
    return (
      isNonblankRuntimeString(constraint.source.priorConstraintId) &&
      constraint.source.priorConstraintId === constraint.constraintId
    );
  }
  return (
    isNonblankRuntimeString(constraint.source.spanId) &&
    isNonblankRuntimeString(constraint.source.lexiconEntryId) &&
    constraint.source.identityRecognizerId === null
  );
}

function policyMatchesConstraint(
  policy: CategoricalPolicyFixture,
  constraint: GovernedCategoricalConstraint,
): boolean {
  return (
    policy.kind === "CATEGORICAL_POLICY" &&
    policy.fixtureOnly === true &&
    policy.synthetic === true &&
    isNonblankRuntimeString(policy.policyVersion) &&
    isNonblankRuntimeString(policy.targetConstraintId) &&
    isNonblankRuntimeString(policy.attributeId) &&
    policy.targetConstraintId === constraint.constraintId &&
    policy.attributeId === constraint.value.attributeId &&
    policy.disposition === "REQUIRED"
  );
}

function canonicalConstraintOrder(
  left: GovernedCategoricalConstraint,
  right: GovernedCategoricalConstraint,
): number {
  const attributeOrder = compareUtf16CodeUnits(
    left.value.attributeId,
    right.value.attributeId,
  );
  return attributeOrder !== 0
    ? attributeOrder
    : compareUtf16CodeUnits(left.constraintId, right.constraintId);
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function subjectsEqual(
  left: ConstraintDecision["subject"],
  right: ConstraintDecision["subject"],
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return (
    left.kind === "QUERY" ||
    (right.kind === "FIXTURE_PRODUCT" &&
      left.fixtureProductId === right.fixtureProductId)
  );
}

function authorityOutcomesEqual(
  left: ConstraintDecision["authorityOutcome"],
  right: ConstraintDecision["authorityOutcome"],
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return (
    left.kind !== "PRESERVE_CALLER_CONTEXT" ||
    (right.kind === "PRESERVE_CALLER_CONTEXT" &&
      left.audienceNamespace.value === right.audienceNamespace.value)
  );
}

function constraintDecisionsEqual(
  left: ConstraintDecision,
  right: ConstraintDecision,
): boolean {
  return (
    constraintDecisionScalarFieldsEqual(left, right) &&
    constraintDecisionArrayFieldsEqual(left, right)
  );
}

function constraintDecisionScalarFieldsEqual(
  left: ConstraintDecision,
  right: ConstraintDecision,
): boolean {
  return (
    left.constraintId === right.constraintId &&
    subjectsEqual(left.subject, right.subject) &&
    authorityOutcomesEqual(
      left.authorityOutcome,
      right.authorityOutcome,
    ) &&
    left.gate === right.gate &&
    left.score === right.score &&
    left.partition === right.partition &&
    left.relaxation === right.relaxation
  );
}

function constraintDecisionArrayFieldsEqual(
  left: ConstraintDecision,
  right: ConstraintDecision,
): boolean {
  return (
    stringArraysEqual(
      left.speechRequirements,
      right.speechRequirements,
    ) &&
    stringArraysEqual(left.fallbackRoutes, right.fallbackRoutes) &&
    stringArraysEqual(left.reasons, right.reasons) &&
    stringArraysEqual(left.diagnostics, right.diagnostics)
  );
}

function expectedProductDecisions(
  constraint: GovernedCategoricalConstraint,
  candidateVariantId: string,
): readonly ConstraintDecision[] {
  const confirmationReasons =
    constraint.source.kind === "USER_CONFIRMATION"
      ? ["CONFIRMATION_CHANGED_INTENT_ONLY" as const]
      : [];
  const relaxation =
    constraint.source.kind === "USER_CONFIRMATION"
      ? "CONFIRMATION_REQUIRED" as const
      : "NEVER" as const;
  const common = {
    constraintId: constraint.constraintId,
    subject: {
      kind: "FIXTURE_PRODUCT" as const,
      fixtureProductId: candidateVariantId,
    },
    authorityOutcome: { kind: "NOT_APPLICABLE" as const },
    score: "NONE" as const,
    relaxation,
    fallbackRoutes: [],
    diagnostics: [],
  };
  return [
    {
      ...common,
      gate: "ASSERT_MATCH",
      speechRequirements: ["DISCLOSE_EVIDENCE_BASIS"],
      partition: "ASSERTED",
      reasons: [...confirmationReasons, "EVIDENCE_QUALIFIED_MATCH"],
    },
    {
      ...common,
      gate: "DO_NOT_GATE",
      speechRequirements: ["NO_PRODUCT_ASSERTION"],
      partition: "VIOLATING",
      reasons: [
        ...confirmationReasons,
        "EVIDENCE_QUALIFIED_MISMATCH",
      ],
    },
    {
      ...common,
      gate: "DO_NOT_GATE",
      speechRequirements: ["DISCLOSE_UNKNOWN"],
      partition: "UNKNOWN",
      reasons: [...confirmationReasons, "PRODUCT_EVIDENCE_UNKNOWN"],
    },
    {
      ...common,
      gate: "DO_NOT_GATE",
      speechRequirements: [
        "NO_PRODUCT_ASSERTION",
        "DISCLOSE_UNKNOWN",
      ],
      partition: "UNKNOWN",
      reasons: [
        ...confirmationReasons,
        "MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY",
      ],
    },
    {
      ...common,
      gate: "DO_NOT_GATE",
      speechRequirements: [
        "NO_PRODUCT_ASSERTION",
        "DISCLOSE_UNKNOWN",
      ],
      partition: "WITHHELD",
      reasons: [...confirmationReasons, "PRODUCT_EVIDENCE_CONFLICT"],
    },
  ];
}

function productDecisionSetIsValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  const decisions = input.evidenceEvaluation.productDecisions;
  return (
    input.evidenceEvaluation.status === "EVALUATED" &&
    decisions.length === input.requestPlan.constraints.length &&
    decisions.every((decision, index) => {
      const constraint = input.requestPlan.constraints[index];
      return (
        constraint !== undefined &&
        expectedProductDecisions(
          constraint,
          input.candidate.variantId,
        ).some((expected) =>
          constraintDecisionsEqual(decision, expected),
        )
      );
    })
  );
}

function canonicalPairOrder(
  left: {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  },
  right: {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  },
): number {
  const variantOrder = compareUtf16CodeUnits(
    left.variantId,
    right.variantId,
  );
  return variantOrder !== 0
    ? variantOrder
    : compareUtf16CodeUnits(
        left.canonicalStyleId,
        right.canonicalStyleId,
      );
}

function canonicalPairsAreValid(
  pairs: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[],
): boolean {
  return pairs.every(
    (pair, index) =>
      isNonblankRuntimeString(pair.variantId) &&
      isNonblankRuntimeString(pair.canonicalStyleId) &&
      (index === 0 ||
        canonicalPairOrder(pairs[index - 1] ?? pair, pair) < 0),
  );
}

function canonicalPairArraysEqual(
  left: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[],
  right: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (pair, index) =>
        pair.variantId === right[index]?.variantId &&
        pair.canonicalStyleId === right[index]?.canonicalStyleId,
    )
  );
}

function pairIsIn(
  pair: {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  },
  pairs: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[],
): boolean {
  return pairs.some(
    (candidate) =>
      candidate.variantId === pair.variantId &&
      candidate.canonicalStyleId === pair.canonicalStyleId,
  );
}

function candidateIsInStage0Scope(
  input: AdmitStructuredCandidateInput,
): boolean {
  return pairIsIn(
    input.candidate,
    input.stage0Proof.allowedCanonicalPairs,
  );
}

function candidateSourceAccountabilityIsValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  return (
    stage0ProofIsAccountable(input) &&
    candidateProvenanceIsValid(input) &&
    attributionVersionsAreValid(input) &&
    attributionMembershipIsValid(input) &&
    enumeratedIdentitiesAreValid(input) &&
    accountabilityKeyIsValid(input.candidateSourceAttribution)
  );
}

function stage0ProofIsAccountable(
  input: AdmitStructuredCandidateInput,
): boolean {
  return (
    input.stage0Proof.status === "VALIDATED" &&
    input.stage0Proof.stage0ScopeVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.stage0Scope &&
    input.stage0Proof.fixtureSnapshotVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    canonicalPairsAreValid(input.stage0Proof.allowedCanonicalPairs)
  );
}

function candidateProvenanceIsValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  return (
    input.candidate.fixtureOnly === true &&
    input.candidate.synthetic === true &&
    input.candidate.fixtureSnapshotVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    input.candidate.candidateSourceVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.candidateSource &&
    isNonblankRuntimeString(input.candidate.variantId) &&
    isNonblankRuntimeString(input.candidate.canonicalStyleId)
  );
}

function attributionVersionsAreValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  const attribution = input.candidateSourceAttribution;
  return (
    attribution.fixtureSnapshotVersion ===
      input.candidate.fixtureSnapshotVersion &&
    attribution.candidateSourceVersion ===
      input.candidate.candidateSourceVersion
  );
}

function attributionMembershipIsValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  const scoped = input.candidateSourceAttribution.scopedMembership;
  return (
    canonicalPairsAreValid(scoped) &&
    canonicalPairArraysEqual(
      scoped,
      input.stage0Proof.allowedCanonicalPairs,
    )
  );
}

function enumeratedIdentitiesAreValid(
  input: AdmitStructuredCandidateInput,
): boolean {
  const enumerated =
    input.candidateSourceAttribution.enumeratedCandidateIdentities;
  const stage0Pairs = input.stage0Proof.allowedCanonicalPairs;
  if (
    !canonicalPairsAreValid(enumerated) ||
    enumerated.some((identity) => !pairIsIn(identity, stage0Pairs))
  ) {
    return false;
  }
  return (
    enumerated.filter(
      (identity) =>
        identity.variantId === input.candidate.variantId &&
        identity.canonicalStyleId === input.candidate.canonicalStyleId,
    ).length === 1
  );
}

function accountabilityKeyIsValid(
  attribution: StructuredCandidateSourceAttribution,
): boolean {
  return (
    attribution.accountabilityKey ===
    JSON.stringify([
      attribution.fixtureSnapshotVersion,
      attribution.candidateSourceVersion,
      attribution.scopedMembership,
      attribution.enumeratedCandidateIdentities,
    ])
  );
}

function relatedEligibilitySummaries(
  input: AdmitStructuredCandidateInput,
): readonly StructuredEligibilitySummaryFixture[] {
  return input.eligibilitySummaries.filter(
    (summary) => summary.variantId === input.candidate.variantId,
  );
}

function eligibilityMarkersAreValid(
  summary: StructuredEligibilitySummaryFixture,
): boolean {
  return (
    summary.fixtureOnly === true &&
    summary.synthetic === true &&
    isNonblankRuntimeString(summary.fixtureReason) &&
    (summary.outcome === "ADMISSIBLE_FIXTURE" ||
      summary.outcome === "UNKNOWN_FIXTURE" ||
      summary.outcome === "INELIGIBLE_FIXTURE")
  );
}

function amountIsValid(
  amount: number | null,
): amount is number {
  return Number.isInteger(amount) && amount !== null && amount >= 0;
}

function currencyIsValid(
  currency: string | null,
): currency is string {
  return (
    currency !== null &&
    isNonblankRuntimeString(currency) &&
    /^[A-Z]{3}$/u.test(currency)
  );
}

type EligibilityResolution =
  | {
      readonly status: "RESOLVED";
      readonly summary: StructuredEligibilitySummaryFixture & {
        readonly selectedVariantAmount: number;
        readonly currency: string;
      };
    }
  | {
      readonly status: "REJECTED";
      readonly reason: StructuredAdmissionRejectionReason;
    };

type SingleEligibilityResolution =
  | {
      readonly status: "RESOLVED";
      readonly summary: StructuredEligibilitySummaryFixture;
    }
  | {
      readonly status: "REJECTED";
      readonly reason: StructuredAdmissionRejectionReason;
    };

function resolveSingleEligibilitySummary(
  input: AdmitStructuredCandidateInput,
): SingleEligibilityResolution {
  const related = relatedEligibilitySummaries(input);
  if (related.length === 0) {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_MISSING",
    };
  }
  if (related.length > 1) {
    return {
      status: "REJECTED",
      reason: "ELIGIBILITY_SUMMARY_DUPLICATE",
    };
  }

  const summary = related[0];
  if (summary === undefined) {
    throw new TypeError("Structured eligibility count invariant failed");
  }
  return { status: "RESOLVED", summary };
}

function eligibilityProvenanceFailure(
  summary: StructuredEligibilitySummaryFixture,
): StructuredAdmissionRejectionReason | null {
  if (!eligibilityMarkersAreValid(summary)) {
    return "ELIGIBILITY_PROVENANCE_INVALID";
  }
  if (
    summary.fixtureSnapshotVersion !==
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot ||
    summary.eligibilitySnapshotVersion !==
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.eligibilitySnapshot
  ) {
    return "ELIGIBILITY_SUMMARY_STALE";
  }
  return null;
}

function eligibilityIdentityFailure(
  input: AdmitStructuredCandidateInput,
  summary: StructuredEligibilitySummaryFixture,
): StructuredAdmissionRejectionReason | null {
  if (summary.canonicalStyleId !== input.candidate.canonicalStyleId) {
    return "ELIGIBILITY_STYLE_MISMATCH";
  }
  if (summary.marketCode !== input.context.marketCode) {
    return "ELIGIBILITY_MARKET_MISMATCH";
  }
  return null;
}

function eligibilityOutcomeFailure(
  summary: StructuredEligibilitySummaryFixture,
): StructuredAdmissionRejectionReason | null {
  if (summary.outcome === "UNKNOWN_FIXTURE") {
    return "ELIGIBILITY_SUMMARY_UNKNOWN";
  }
  if (summary.outcome === "INELIGIBLE_FIXTURE") {
    return "ELIGIBILITY_SUMMARY_INELIGIBLE";
  }
  return null;
}

function resolveEligibilitySummary(
  input: AdmitStructuredCandidateInput,
): EligibilityResolution {
  const single = resolveSingleEligibilitySummary(input);
  if (single.status === "REJECTED") {
    return single;
  }
  const summary = single.summary;
  const validationFailure =
    eligibilityProvenanceFailure(summary) ??
    eligibilityIdentityFailure(input, summary) ??
    eligibilityOutcomeFailure(summary);
  if (validationFailure !== null) {
    return { status: "REJECTED", reason: validationFailure };
  }

  const selectedVariantAmount = summary.selectedVariantAmount;
  if (!amountIsValid(selectedVariantAmount)) {
    return {
      status: "REJECTED",
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    };
  }
  const currency = summary.currency;
  if (!currencyIsValid(currency)) {
    return {
      status: "REJECTED",
      reason: "SELECTED_VARIANT_CURRENCY_INVALID",
    };
  }

  return {
    status: "RESOLVED",
    summary: {
      ...summary,
      selectedVariantAmount,
      currency,
    },
  };
}

function candidatePartition(
  decisions: readonly ConstraintDecision[],
): StructuredCandidatePartition {
  if (decisions.some((decision) => decision.partition === "WITHHELD")) {
    return "WITHHELD";
  }
  if (decisions.some((decision) => decision.partition === "VIOLATING")) {
    return "VIOLATING";
  }
  if (decisions.some((decision) => decision.partition === "UNKNOWN")) {
    return "UNKNOWN";
  }
  return "ASSERTED";
}

function matchedAttributes(
  constraints: readonly GovernedCategoricalConstraint[],
  decisions: readonly ConstraintDecision[],
): readonly MatchedGovernedAttribute[] {
  const matches: MatchedGovernedAttribute[] = [];
  for (const [index, decision] of decisions.entries()) {
    const constraint = constraints[index];
    if (
      constraint !== undefined &&
      decision.gate === "ASSERT_MATCH" &&
      decision.partition === "ASSERTED"
    ) {
      matches.push({
        constraintId: constraint.constraintId,
        attributeId: constraint.value.attributeId,
        valueId: constraint.value.valueId,
      });
    }
  }
  return matches;
}

function eligibilityAttribution(
  summary: StructuredEligibilitySummaryFixture,
): StructuredEligibilityAttribution {
  return {
    fixtureSnapshotVersion: summary.fixtureSnapshotVersion,
    eligibilitySnapshotVersion: summary.eligibilitySnapshotVersion,
    variantId: summary.variantId,
    canonicalStyleId: summary.canonicalStyleId,
    marketCode: summary.marketCode,
    fixtureReason: summary.fixtureReason,
  };
}

function rejected(
  input: AdmitStructuredCandidateInput,
  reason: StructuredAdmissionRejectionReason,
): StructuredAdmissionResult {
  return {
    status: "ADMISSION_REJECTED",
    variantId: input.candidate.variantId,
    canonicalStyleId: input.candidate.canonicalStyleId,
    reason,
    candidateSourceAttribution: input.candidateSourceAttribution,
    stage0Attribution: input.stage0Proof,
    evidenceAttribution: input.evidenceEvaluation.evidenceAttribution,
    d5Versions: input.d5Versions,
    d6Versions: input.d6Versions,
  };
}

export function admitStructuredCandidate(
  input: AdmitStructuredCandidateInput,
): StructuredAdmissionResult {
  if (!requestPlanIsValid(input)) {
    return rejected(input, "REQUEST_PLAN_INVARIANT_FAILED");
  }
  if (!candidateIsInStage0Scope(input)) {
    return rejected(input, "CANDIDATE_OUTSIDE_STAGE0_SCOPE");
  }
  if (!candidateSourceAccountabilityIsValid(input)) {
    return rejected(
      input,
      "CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID",
    );
  }
  if (input.evidenceEvaluation.status === "EVIDENCE_REJECTED") {
    return rejected(input, input.evidenceEvaluation.reason);
  }
  if (!productDecisionSetIsValid(input)) {
    return rejected(input, "PRODUCT_DECISION_SET_INVALID");
  }

  const eligibility = resolveEligibilitySummary(input);
  if (eligibility.status === "REJECTED") {
    return rejected(input, eligibility.reason);
  }

  const productDecisions = input.evidenceEvaluation.productDecisions;
  const resultCore: StructuredCandidateResultCore = {
    displayedVariantId: input.candidate.variantId,
    displayedStyleId: input.candidate.canonicalStyleId,
    partition: candidatePartition(productDecisions),
    priceBasis: "SELECTED_VARIANT",
    amount: eligibility.summary.selectedVariantAmount,
    currency: eligibility.summary.currency,
    matchedGovernedAttributes: matchedAttributes(
      input.requestPlan.constraints,
      productDecisions,
    ),
    queryDecisions: input.requestPlan.queryDecisions,
    productDecisions,
    candidateSourceAttribution: input.candidateSourceAttribution,
    stage0Attribution: input.stage0Proof,
    evidenceAttribution: input.evidenceEvaluation.evidenceAttribution,
    eligibilityAttribution: eligibilityAttribution(eligibility.summary),
    d5Versions: input.d5Versions,
    d6Versions: input.d6Versions,
  };
  const landingIntent = buildStructuredLandingIntent(resultCore);
  const landingIntegrity = verifyStructuredLanding(
    landingIntent,
    input.candidate,
    eligibility.summary,
  );
  if (landingIntegrity.status !== "VERIFIED") {
    throw new TypeError("Structured landing construction invariant failed");
  }

  return {
    status: "ADMITTED",
    candidate: {
      ...resultCore,
      landingIntent,
      landingIntegrity,
    },
  };
}
