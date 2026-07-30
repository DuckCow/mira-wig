import type { ConstraintDecision } from "../types";
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
  StructuredEligibilityAttribution,
  StructuredEligibilitySummaryFixture,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function requestPlanIsValid(input: AdmitStructuredCandidateInput): boolean {
  const plan = input.requestPlan;
  return (
    plan.status === "APPLICABLE" &&
    plan.requestPlanVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.requestPlan &&
    plan.constraints.length >= 1 &&
    plan.constraints.length <= 2 &&
    plan.constraints.length === plan.policies.length &&
    plan.constraints.length === plan.queryDecisions.length &&
    plan.queryDecisions.every(
      (decision, index) =>
        decision.constraintId === plan.constraints[index]?.constraintId &&
        decision.subject.kind === "QUERY" &&
        decision.gate === "REQUIRE_MATCH" &&
        decision.score === "NONE" &&
        decision.partition === "NOT_APPLICABLE",
    )
  );
}

function candidateIsInStage0Scope(
  input: AdmitStructuredCandidateInput,
): boolean {
  return input.stage0Proof.allowedCanonicalPairs.some(
    (pair) =>
      pair.variantId === input.candidate.variantId &&
      pair.canonicalStyleId === input.candidate.canonicalStyleId,
  );
}

function candidateIsInSourceAttribution(
  input: AdmitStructuredCandidateInput,
): boolean {
  return input.candidateSourceAttribution.enumeratedCandidateIdentities.some(
    (identity) =>
      identity.variantId === input.candidate.variantId &&
      identity.canonicalStyleId === input.candidate.canonicalStyleId,
  );
}

function productDecisionMatchesConstraint(
  decision: ConstraintDecision,
  constraint: GovernedCategoricalConstraint,
  candidateVariantId: string,
): boolean {
  if (
    !productDecisionIdentityMatches(
      decision,
      constraint,
      candidateVariantId,
    )
  ) {
    return false;
  }
  return productDecisionPartitionIsValid(decision);
}

function productDecisionIdentityMatches(
  decision: ConstraintDecision,
  constraint: GovernedCategoricalConstraint,
  candidateVariantId: string,
): boolean {
  if (
    decision.constraintId !== constraint.constraintId ||
    decision.subject.kind !== "FIXTURE_PRODUCT" ||
    decision.subject.fixtureProductId !== candidateVariantId ||
    decision.score !== "NONE" ||
    decision.gate === "REQUIRE_MATCH" ||
    decision.partition === "NOT_APPLICABLE"
  ) {
    return false;
  }
  return true;
}

function productDecisionPartitionIsValid(
  decision: ConstraintDecision,
): boolean {
  if (decision.partition === "ASSERTED") {
    return decision.gate === "ASSERT_MATCH";
  }
  if (
    decision.partition === "UNKNOWN" ||
    decision.partition === "VIOLATING" ||
    decision.partition === "WITHHELD"
  ) {
    return decision.gate === "DO_NOT_GATE";
  }
  return false;
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
        productDecisionMatchesConstraint(
          decision,
          constraint,
          input.candidate.variantId,
        )
      );
    })
  );
}

function relatedEligibilitySummaries(
  input: AdmitStructuredCandidateInput,
): readonly StructuredEligibilitySummaryFixture[] {
  return input.eligibilitySummaries.filter(
    (summary) =>
      summary.variantId === input.candidate.variantId ||
      summary.canonicalStyleId === input.candidate.canonicalStyleId,
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
  if (summary.variantId !== input.candidate.variantId) {
    return "ELIGIBILITY_VARIANT_MISMATCH";
  }
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
  if (
    !candidateIsInStage0Scope(input) ||
    !candidateIsInSourceAttribution(input)
  ) {
    return rejected(input, "CANDIDATE_OUTSIDE_STAGE0_SCOPE");
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
