import { decideConstraint } from "../decide-constraint";
import type {
  CategoricalPolicyDisposition,
  CategoricalPolicyFixture,
  ConstraintDecision,
  DiscoveryContext,
  InterpretedConstraint,
  ParserResult,
  QuerySpan,
} from "../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../versions";
import type {
  GovernedCategoricalConstraint,
  GovernedFixtureAttributeId,
  StructuredRequestAssessment,
  StructuredRequestPlan,
  StructuredRequestRejection,
  StructuredRequestRejectionReason,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function isGovernedFixtureAttributeId(
  value: string,
): value is GovernedFixtureAttributeId {
  return (
    value === "fixture:governed-color-family" ||
    value === "fixture:governed-texture-family"
  );
}

function isCategoricalPolicyDisposition(
  value: unknown,
): value is CategoricalPolicyDisposition {
  return (
    value === "REQUIRED" ||
    value === "PREFERENCE" ||
    value === "ROUTE" ||
    value === "CLARIFICATION" ||
    value === "UNSUPPORTED"
  );
}

function isGovernedCategoricalConstraint(
  constraint: InterpretedConstraint,
): constraint is GovernedCategoricalConstraint {
  return (
    constraint.value.kind === "CATEGORICAL" &&
    isGovernedFixtureAttributeId(constraint.value.attributeId) &&
    constraint.interpretationState === "DECLARED" &&
    constraint.attributeBand === "STYLISTIC" &&
    constraint.decisionProfile === "GOVERNED_STYLISTIC_CATEGORICAL" &&
    isNonblankRuntimeString(constraint.constraintId) &&
    isNonblankRuntimeString(constraint.value.valueId) &&
    constraint.value.valueId.startsWith("fixture:")
  );
}

function querySpanRangeIsValid(
  parserResult: ParserResult,
  span: QuerySpan,
): boolean {
  return (
    spanRangeMatchesText(
      span.rawRange,
      parserResult.normalizedQuery.rawText,
      span.rawText,
    ) &&
    spanRangeMatchesText(
      span.normalizedRange,
      parserResult.normalizedQuery.comparisonText,
      span.normalizedText,
    )
  );
}

function spanRangeMatchesText(
  range: QuerySpan["rawRange"],
  sourceText: string,
  spanText: string,
): boolean {
  return (
    Number.isInteger(range.startInclusive) &&
    Number.isInteger(range.endExclusive) &&
    range.startInclusive >= 0 &&
    range.endExclusive > range.startInclusive &&
    range.endExclusive <= sourceText.length &&
    sourceText.slice(range.startInclusive, range.endExclusive) === spanText
  );
}

function constraintSourceIsValid(
  parserResult: ParserResult,
  constraint: GovernedCategoricalConstraint,
): boolean {
  if (constraint.source.kind === "USER_CONFIRMATION") {
    return confirmationSourceIsValid(constraint);
  }
  return querySpanSourceIsValid(parserResult, constraint);
}

function confirmationSourceIsValid(
  constraint: GovernedCategoricalConstraint,
): boolean {
  return (
    constraint.source.kind === "USER_CONFIRMATION" &&
    isNonblankRuntimeString(constraint.source.priorConstraintId) &&
    constraint.source.priorConstraintId === constraint.constraintId
  );
}

function querySpanSourceIsValid(
  parserResult: ParserResult,
  constraint: GovernedCategoricalConstraint,
): boolean {
  if (constraint.source.kind !== "QUERY_SPAN") {
    return false;
  }
  if (
    !isNonblankRuntimeString(constraint.source.spanId) ||
    !isNonblankRuntimeString(constraint.source.lexiconEntryId) ||
    constraint.source.identityRecognizerId !== null
  ) {
    return false;
  }

  const source = constraint.source;
  const matchingSpans = parserResult.spans.filter(
    (span) =>
      span.spanId === source.spanId &&
      span.constraintId === constraint.constraintId,
  );
  if (matchingSpans.length !== 1) {
    return false;
  }

  const span = matchingSpans[0];
  return (
    span !== undefined &&
    spanMatchesSource(span, source, constraint) &&
    querySpanRangeIsValid(parserResult, span)
  );
}

function spanMatchesSource(
  span: QuerySpan,
  source: Extract<
    GovernedCategoricalConstraint["source"],
    { readonly kind: "QUERY_SPAN" }
  >,
  constraint: GovernedCategoricalConstraint,
): boolean {
  return (
    span.owner === "CONCEPT" &&
    span.conceptId === constraint.value.attributeId &&
    span.interpretationState === "DECLARED" &&
    span.lexiconEntryId === source.lexiconEntryId &&
    span.identityRecognizerId === null
  );
}

function policyProvenanceIsValid(
  policy: CategoricalPolicyFixture,
): boolean {
  return (
    policy.kind === "CATEGORICAL_POLICY" &&
    policy.fixtureOnly === true &&
    policy.synthetic === true &&
    isNonblankRuntimeString(policy.policyVersion) &&
    isNonblankRuntimeString(policy.targetConstraintId) &&
    isNonblankRuntimeString(policy.attributeId) &&
    isCategoricalPolicyDisposition(policy.disposition)
  );
}

function policyForConstraint(
  constraint: GovernedCategoricalConstraint,
  policies: readonly CategoricalPolicyFixture[],
): CategoricalPolicyFixture | null {
  const matching = policies.filter(
    (policy) => policy.targetConstraintId === constraint.constraintId,
  );
  if (matching.length !== 1) {
    return null;
  }

  const policy = matching[0];
  return policy?.attributeId === constraint.value.attributeId
    ? policy
    : null;
}

function queryDecisionIsRequired(
  constraint: GovernedCategoricalConstraint,
  decision: ConstraintDecision,
): boolean {
  const expectedReasons =
    constraint.source.kind === "USER_CONFIRMATION"
      ? [
          "CONFIRMATION_CHANGED_INTENT_ONLY",
          "CATEGORICAL_REQUIRED_BY_POLICY",
        ]
      : ["CATEGORICAL_REQUIRED_BY_POLICY"];

  return (
    queryDecisionIdentityIsRequired(constraint, decision) &&
    queryDecisionTupleIsRequired(decision) &&
    decisionReasonsMatch(decision, expectedReasons)
  );
}

function queryDecisionIdentityIsRequired(
  constraint: GovernedCategoricalConstraint,
  decision: ConstraintDecision,
): boolean {
  return (
    decision.constraintId === constraint.constraintId &&
    decision.subject.kind === "QUERY" &&
    decision.authorityOutcome.kind === "NOT_APPLICABLE"
  );
}

function queryDecisionTupleIsRequired(
  decision: ConstraintDecision,
): boolean {
  return (
    decision.gate === "REQUIRE_MATCH" &&
    decision.score === "NONE" &&
    decision.speechRequirements.length === 1 &&
    decision.speechRequirements[0] === "NO_PRODUCT_ASSERTION" &&
    decision.partition === "NOT_APPLICABLE" &&
    decision.relaxation === "NEVER" &&
    decision.fallbackRoutes.length === 0 &&
    decision.diagnostics.length === 0
  );
}

function decisionReasonsMatch(
  decision: ConstraintDecision,
  expectedReasons: readonly string[],
): boolean {
  return (
    decision.reasons.length === expectedReasons.length &&
    decision.reasons.every(
      (reason, index) => reason === expectedReasons[index],
    )
  );
}

function affectingContradictionExists(
  parserResult: ParserResult,
): boolean {
  const constraintIds = new Set(
    parserResult.constraints.map((constraint) => constraint.constraintId),
  );
  return parserResult.contradictions.some(
    (contradiction) =>
      constraintIds.has(contradiction.leftConstraintId) ||
      constraintIds.has(contradiction.rightConstraintId),
  );
}

function canonicalConstraintOrder(
  left: GovernedCategoricalConstraint,
  right: GovernedCategoricalConstraint,
): number {
  const attributeOrder = left.value.attributeId.localeCompare(
    right.value.attributeId,
  );
  return attributeOrder !== 0
    ? attributeOrder
    : left.constraintId.localeCompare(right.constraintId);
}

function applicablePlan(
  constraints: readonly GovernedCategoricalConstraint[],
  policies: readonly CategoricalPolicyFixture[],
  queryDecisions: readonly ConstraintDecision[],
): StructuredRequestPlan {
  return {
    status: "APPLICABLE",
    requestPlanVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.requestPlan,
    constraints,
    policies,
    queryDecisions,
  };
}

function requestRejected(
  reason: StructuredRequestRejectionReason,
): StructuredRequestRejection {
  return { status: "REQUEST_REJECTED", reason };
}

function parserShapeRejection(
  parserResult: ParserResult,
): StructuredRequestRejection | null {
  if (parserResult.parserVersion !== DISCOVERY_COMPONENT_VERSIONS.parser) {
    return requestRejected("INCOMPATIBLE_D5_PARSER_VERSION");
  }
  if (
    parserResult.constraints.length < 1 ||
    parserResult.constraints.length > 2
  ) {
    return requestRejected("CONSTRAINT_COUNT_OUTSIDE_D6_B1");
  }
  if (
    parserResult.unsupported.length > 0 ||
    parserResult.constraints.some(
      (constraint) => constraint.interpretationState === "UNRESOLVED",
    )
  ) {
    return requestRejected("UNSUPPORTED_OR_UNRESOLVED_REQUEST");
  }
  if (
    parserResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "AMBIGUOUS_SAME_PRECEDENCE_OVERLAP" ||
        diagnostic.code === "CONFIRMATION_TARGET_OR_VALUE_MISMATCH",
    )
  ) {
    return requestRejected("UNSUPPORTED_OR_UNRESOLVED_REQUEST");
  }
  return affectingContradictionExists(parserResult)
    ? requestRejected("AFFECTING_CONTRADICTION")
    : null;
}

type GovernedConstraintResolution =
  | {
      readonly status: "RESOLVED";
      readonly constraints: readonly GovernedCategoricalConstraint[];
    }
  | StructuredRequestRejection;

function outsideCategoricalProfile(
  constraint: InterpretedConstraint,
): boolean {
  return (
    constraint.value.kind !== "CATEGORICAL" ||
    constraint.interpretationState !== "DECLARED" ||
    constraint.attributeBand !== "STYLISTIC" ||
    constraint.decisionProfile !==
      "GOVERNED_STYLISTIC_CATEGORICAL"
  );
}

function resolveGovernedConstraints(
  parserResult: ParserResult,
): GovernedConstraintResolution {
  if (parserResult.constraints.some(outsideCategoricalProfile)) {
    return requestRejected("OUTSIDE_GOVERNED_CATEGORICAL_SLICE");
  }
  if (
    parserResult.constraints.some(
      (constraint) =>
        constraint.value.kind === "CATEGORICAL" &&
        !isGovernedFixtureAttributeId(constraint.value.attributeId),
    )
  ) {
    return requestRejected("UNSUPPORTED_GOVERNED_ATTRIBUTE");
  }

  const constraints = parserResult.constraints.filter(
    isGovernedCategoricalConstraint,
  );
  if (constraints.length !== parserResult.constraints.length) {
    return requestRejected("OUTSIDE_GOVERNED_CATEGORICAL_SLICE");
  }
  constraints.sort(canonicalConstraintOrder);
  if (
    !constraints.every((constraint) =>
      constraintSourceIsValid(parserResult, constraint),
    )
  ) {
    return requestRejected("INVALID_CONSTRAINT_SOURCE");
  }

  const attributes = new Set(
    constraints.map((constraint) => constraint.value.attributeId),
  );
  return attributes.size === constraints.length
    ? { status: "RESOLVED", constraints }
    : requestRejected("DUPLICATE_GOVERNED_ATTRIBUTE");
}

type PolicyResolution =
  | {
      readonly status: "RESOLVED";
      readonly policies: readonly CategoricalPolicyFixture[];
    }
  | StructuredRequestRejection;

function resolveRequiredPolicies(
  constraints: readonly GovernedCategoricalConstraint[],
  policies: readonly CategoricalPolicyFixture[],
): PolicyResolution {
  if (policies.length !== constraints.length) {
    return requestRejected("POLICY_COUNT_MISMATCH");
  }
  if (!policies.every(policyProvenanceIsValid)) {
    return requestRejected("POLICY_PROVENANCE_INVALID");
  }

  const orderedPolicies: CategoricalPolicyFixture[] = [];
  for (const constraint of constraints) {
    const policy = policyForConstraint(constraint, policies);
    if (policy === null) {
      return requestRejected("POLICY_IDENTITY_MISMATCH");
    }
    orderedPolicies.push(policy);
  }
  return orderedPolicies.some(
    (policy) => policy.disposition !== "REQUIRED",
  )
    ? requestRejected("NON_REQUIRED_POLICY")
    : { status: "RESOLVED", policies: orderedPolicies };
}

type QueryDecisionResolution =
  | {
      readonly status: "RESOLVED";
      readonly decisions: readonly ConstraintDecision[];
    }
  | StructuredRequestRejection;

function resolveQueryDecisions(
  constraints: readonly GovernedCategoricalConstraint[],
  policies: readonly CategoricalPolicyFixture[],
  context: DiscoveryContext,
): QueryDecisionResolution {
  const decisions = constraints.map((constraint, index) => {
    const policy = policies[index];
    if (policy === undefined) {
      throw new TypeError("Structured policy ordering invariant failed");
    }
    return decideConstraint({
      target: {
        kind: "INTERPRETED_CONSTRAINT",
        decisionLevel: "QUERY",
        constraint,
      },
      subject: { kind: "QUERY" },
      context,
      policies: [policy],
    });
  });
  const incompatible = decisions.some((decision, index) => {
    const constraint = constraints[index];
    return (
      constraint === undefined ||
      !queryDecisionIsRequired(constraint, decision)
    );
  });
  return incompatible
    ? requestRejected("INCOMPATIBLE_D5_QUERY_DECISION")
    : { status: "RESOLVED", decisions };
}

export function buildStructuredRequestPlan(
  parserResult: ParserResult,
  context: DiscoveryContext,
  policies: readonly CategoricalPolicyFixture[],
): StructuredRequestAssessment {
  const shapeRejection = parserShapeRejection(parserResult);
  if (shapeRejection !== null) {
    return shapeRejection;
  }
  const constraintResolution = resolveGovernedConstraints(parserResult);
  if (constraintResolution.status === "REQUEST_REJECTED") {
    return constraintResolution;
  }
  const policyResolution = resolveRequiredPolicies(
    constraintResolution.constraints,
    policies,
  );
  if (policyResolution.status === "REQUEST_REJECTED") {
    return policyResolution;
  }
  const decisionResolution = resolveQueryDecisions(
    constraintResolution.constraints,
    policyResolution.policies,
    context,
  );
  if (decisionResolution.status === "REQUEST_REJECTED") {
    return decisionResolution;
  }

  return applicablePlan(
    constraintResolution.constraints,
    policyResolution.policies,
    decisionResolution.decisions,
  );
}
