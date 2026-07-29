import type {
  AuthorityOutcome,
  ConstraintDecision,
  ConstraintDecisionTarget,
  ConstraintValue,
  ContinuousTolerancePolicyFixture,
  DecideConstraintInput,
  DecisionDiagnostic,
  DecisionPolicyFixture,
  DecisionSubject,
  EvidencePartition,
  FallbackRoute,
  GateDecision,
  InterpretedConstraint,
  ProductEvidenceFixture,
  ProvisionalReasonCode,
  RelaxationDecision,
  ScoreDecision,
  SpeechRequirement,
} from "./types";

interface DecisionFields {
  readonly authorityOutcome: AuthorityOutcome;
  readonly gate: GateDecision;
  readonly score: ScoreDecision;
  readonly speechRequirements: readonly SpeechRequirement[];
  readonly partition: EvidencePartition;
  readonly relaxation: RelaxationDecision;
  readonly fallbackRoutes: readonly FallbackRoute[];
  readonly reasons: readonly ProvisionalReasonCode[];
  readonly diagnostics: readonly DecisionDiagnostic[];
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function copySubject(subject: DecisionSubject): DecisionSubject {
  if (subject.kind === "QUERY") {
    return { kind: "QUERY" };
  }

  return { kind: "FIXTURE_PRODUCT", fixtureProductId: subject.fixtureProductId };
}

function targetConstraintId(target: ConstraintDecisionTarget): string {
  return target.kind === "CONTRADICTION"
    ? target.contradiction.constraintId
    : target.constraint.constraintId;
}

function makeDecision(
  target: ConstraintDecisionTarget,
  subject: DecisionSubject,
  fields: DecisionFields,
): ConstraintDecision {
  return {
    constraintId: targetConstraintId(target),
    subject: copySubject(subject),
    authorityOutcome: fields.authorityOutcome,
    gate: fields.gate,
    score: fields.score,
    speechRequirements: unique(fields.speechRequirements),
    partition: fields.partition,
    relaxation: fields.relaxation,
    fallbackRoutes: unique(fields.fallbackRoutes),
    reasons: unique(fields.reasons),
    diagnostics: unique(fields.diagnostics),
  };
}

function notApplicableAuthority(): AuthorityOutcome {
  return { kind: "NOT_APPLICABLE" };
}

function confirmationReasons(constraint: InterpretedConstraint): ProvisionalReasonCode[] {
  return constraint.source.kind === "USER_CONFIRMATION"
    ? ["CONFIRMATION_CHANGED_INTENT_ONLY"]
    : [];
}

function relaxationForConstraint(
  constraint: InterpretedConstraint,
): RelaxationDecision {
  if (constraint.value.kind === "CONTINUOUS") {
    return "NOT_APPLICABLE";
  }

  return constraint.source.kind === "USER_CONFIRMATION"
    ? "CONFIRMATION_REQUIRED"
    : "NEVER";
}

function matchingPolicy<T extends DecisionPolicyFixture["kind"]>(
  policies: readonly DecisionPolicyFixture[],
  kind: T,
): DecisionPolicyFixture | undefined {
  return policies.find((policy) => policy.kind === kind);
}

function vendorAttestationPermitted(
  policies: readonly DecisionPolicyFixture[],
): boolean {
  const policy = matchingPolicy(policies, "VENDOR_ATTESTATION");
  return policy?.kind === "VENDOR_ATTESTATION" && policy.permitted;
}

function evidenceHasAssertionAuthority(
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): boolean {
  if (
    evidence.state === "VERIFIED_OR_MEASURED" ||
    evidence.state === "HUMAN_CURATED_FROM_EVIDENCE"
  ) {
    return true;
  }

  return (
    evidence.state === "APPROVED_VENDOR_ATTESTED" &&
    vendorAttestationPermitted(policies)
  );
}

function vendorPolicyDiagnostics(
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): DecisionDiagnostic[] {
  return evidence.state === "APPROVED_VENDOR_ATTESTED" &&
    vendorAttestationPermitted(policies)
    ? ["SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED"]
    : [];
}

function evidenceForSubject(
  subject: DecisionSubject,
  evidence: ProductEvidenceFixture | undefined,
): ProductEvidenceFixture | undefined {
  if (
    subject.kind !== "FIXTURE_PRODUCT" ||
    evidence === undefined ||
    evidence.fixtureProductId !== subject.fixtureProductId
  ) {
    return undefined;
  }

  return evidence;
}

function unknownEvidenceDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
  reasons: readonly ProvisionalReasonCode[],
  speechRequirements: readonly SpeechRequirement[] = ["DISCLOSE_UNKNOWN"],
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "DO_NOT_GATE",
    score: "NONE",
    speechRequirements,
    partition: "UNKNOWN",
    relaxation: relaxationForConstraint(constraint),
    fallbackRoutes: [],
    reasons: [...confirmationReasons(constraint), ...reasons],
    diagnostics: [],
  });
}

function contradictionDecision(input: DecideConstraintInput): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "REQUIRE_CLARIFICATION",
    score: "NONE",
    speechRequirements: ["DISCLOSE_ROUTE_LIMITATION"],
    partition: "NOT_APPLICABLE",
    relaxation: "NOT_APPLICABLE",
    fallbackRoutes: ["CLARIFICATION"],
    reasons: ["CONTRADICTORY_QUERY"],
    diagnostics: [],
  });
}

function outcomeIntentDecision(input: DecideConstraintInput): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: { kind: "OUTSIDE_DISCOVERY_AUTHORITY" },
    gate: "ROUTE_ONLY",
    score: "NONE",
    speechRequirements: ["DISCLOSE_ROUTE_LIMITATION", "NO_PRODUCT_ASSERTION"],
    partition: "NOT_APPLICABLE",
    relaxation: "NEVER",
    fallbackRoutes: ["EDUCATION_OR_CONSULTATION"],
    reasons: ["CLAIM_AUTHORITY_UNAVAILABLE_ROUTE"],
    diagnostics: [],
  });
}

function audienceRouteDecision(input: DecideConstraintInput): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: {
      kind: "PRESERVE_CALLER_CONTEXT",
      audienceNamespace: { value: input.context.audienceNamespace.value },
    },
    gate: "ROUTE_ONLY",
    score: "NONE",
    speechRequirements: ["DISCLOSE_ROUTE_LIMITATION"],
    partition: "NOT_APPLICABLE",
    relaxation: "NEVER",
    fallbackRoutes: ["AUDIENCE_SWITCH_OFFER"],
    reasons: ["AUDIENCE_NAMESPACE_PRESERVED"],
    diagnostics: [],
  });
}

function unsupportedDecision(
  input: DecideConstraintInput,
  ambiguous: boolean,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: ambiguous ? "REQUIRE_CLARIFICATION" : "UNSUPPORTED",
    score: "NONE",
    speechRequirements: ["DISCLOSE_ROUTE_LIMITATION", "NO_PRODUCT_ASSERTION"],
    partition: ambiguous ? "NOT_APPLICABLE" : "UNKNOWN",
    relaxation: "NOT_APPLICABLE",
    fallbackRoutes: [ambiguous ? "CLARIFICATION" : "EXPLICIT_UNSUPPORTED"],
    reasons: ambiguous ? [] : ["UNSUPPORTED_CONCEPT"],
    diagnostics: [],
  });
}

function conflictingEvidenceDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "DO_NOT_GATE",
    score: "NONE",
    speechRequirements: ["NO_PRODUCT_ASSERTION", "DISCLOSE_UNKNOWN"],
    partition: "WITHHELD",
    relaxation: relaxationForConstraint(constraint),
    fallbackRoutes: [],
    reasons: [...confirmationReasons(constraint), "PRODUCT_EVIDENCE_CONFLICT"],
    diagnostics: [],
  });
}

function notRepresentableDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "UNSUPPORTED",
    score: "NONE",
    speechRequirements: ["DISCLOSE_ROUTE_LIMITATION", "NO_PRODUCT_ASSERTION"],
    partition: "UNKNOWN",
    relaxation: "NOT_APPLICABLE",
    fallbackRoutes: ["EXPLICIT_UNSUPPORTED"],
    reasons: [...confirmationReasons(constraint), "UNSUPPORTED_CONCEPT"],
    diagnostics: [],
  });
}

function evidenceAttributeMatches(
  constraint: ConstraintValue,
  evidence: ProductEvidenceFixture,
): boolean {
  if (constraint.kind === "EXACT_IDENTITY") {
    return evidence.attributeId === `identity:${constraint.namespace.toLowerCase()}`;
  }
  if (constraint.kind === "CATEGORICAL") {
    return evidence.attributeId === constraint.attributeId;
  }
  if (constraint.kind === "CONTINUOUS") {
    return evidence.attributeId === constraint.dimensionId;
  }
  return false;
}

function exactOrCategoricalMatches(
  constraint: ConstraintValue,
  evidence: ProductEvidenceFixture,
): boolean {
  if (constraint.kind === "EXACT_IDENTITY") {
    return (
      evidence.value?.kind === "EXACT_IDENTITY" &&
      evidence.value.namespace === constraint.namespace &&
      evidence.value.value === constraint.value
    );
  }
  if (constraint.kind === "CATEGORICAL") {
    return (
      evidence.value?.kind === "CATEGORICAL" &&
      evidence.value.valueId === constraint.valueId
    );
  }
  return false;
}

function exactOrCategoricalDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): ConstraintDecision {
  const matches = exactOrCategoricalMatches(constraint.value, evidence);
  const exactIdentity = constraint.value.kind === "EXACT_IDENTITY";
  const reasons = confirmationReasons(constraint);
  if (matches) {
    reasons.push(
      exactIdentity ? "EXACT_IDENTITY_MATCH" : "EVIDENCE_QUALIFIED_MATCH",
    );
  }
  if (exactIdentity) {
    reasons.push("EXACT_IDENTITY_NO_SUBSTITUTION");
  }

  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: matches ? "ASSERT_MATCH" : "DO_NOT_GATE",
    score: "NONE",
    speechRequirements: matches
      ? ["DISCLOSE_EVIDENCE_BASIS"]
      : ["NO_PRODUCT_ASSERTION"],
    partition: matches ? "ASSERTED" : "VIOLATING",
    relaxation: relaxationForConstraint(constraint),
    fallbackRoutes:
      exactIdentity && !matches ? ["EXACT_IDENTITY_NOT_FOUND"] : [],
    reasons,
    diagnostics: vendorPolicyDiagnostics(evidence, policies),
  });
}

function findTolerancePolicy(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): ContinuousTolerancePolicyFixture | undefined {
  if (constraint.value.kind !== "CONTINUOUS") {
    return undefined;
  }

  const continuousValue = constraint.value;
  for (const policy of policies) {
    if (
      policy.kind === "CONTINUOUS_TOLERANCE" &&
      policy.dimensionId === continuousValue.dimensionId &&
      policy.unitId === continuousValue.quantity.unitId &&
      Number.isFinite(policy.lowerDelta) &&
      policy.lowerDelta >= 0 &&
      Number.isFinite(policy.upperDelta) &&
      policy.upperDelta >= 0
    ) {
      return policy;
    }
  }

  return undefined;
}

interface ContinuousEvaluation {
  readonly matches: boolean;
}

function evaluateContinuous(
  constraint: InterpretedConstraint,
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): ContinuousEvaluation | null {
  if (
    constraint.value.kind !== "CONTINUOUS" ||
    evidence.value?.kind !== "MEASURED_QUANTITY"
  ) {
    return null;
  }

  const policy = findTolerancePolicy(constraint, policies);
  if (
    policy === undefined ||
    evidence.value.quantity.unitId !== constraint.value.quantity.unitId
  ) {
    return null;
  }

  const difference = evidence.value.quantity.value - constraint.value.quantity.value;
  return {
    matches:
      difference >= -policy.lowerDelta && difference <= policy.upperDelta,
  };
}

function continuousAssertedDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "ASSERT_MATCH",
    score: "PREFERENCE_ALLOWED",
    speechRequirements: ["DISCLOSE_EVIDENCE_BASIS"],
    partition: "ASSERTED",
    relaxation: "NOT_APPLICABLE",
    fallbackRoutes: [],
    reasons: [
      ...confirmationReasons(constraint),
      "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE",
    ],
    diagnostics: ["SYNTHETIC_TOLERANCE_APPLIED"],
  });
}

function continuousViolatingDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: notApplicableAuthority(),
    gate: "DO_NOT_GATE",
    score: "NONE",
    speechRequirements: ["NO_PRODUCT_ASSERTION"],
    partition: "VIOLATING",
    relaxation: "NOT_APPLICABLE",
    fallbackRoutes: [],
    reasons: confirmationReasons(constraint),
    diagnostics: ["SYNTHETIC_TOLERANCE_APPLIED"],
  });
}

function continuousDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): ConstraintDecision {
  const evaluation = evaluateContinuous(constraint, evidence, policies);
  if (evaluation === null) {
    return unknownEvidenceDecision(input, constraint, ["SYNTHETIC_TOLERANCE_REQUIRED"]);
  }
  return evaluation.matches
    ? continuousAssertedDecision(input, constraint)
    : continuousViolatingDecision(input, constraint);
}

function authoritativeEvidenceDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
  evidence: ProductEvidenceFixture,
  policies: readonly DecisionPolicyFixture[],
): ConstraintDecision {
  if (!evidenceAttributeMatches(constraint.value, evidence) || evidence.value === null) {
    return unknownEvidenceDecision(input, constraint, ["PRODUCT_EVIDENCE_UNKNOWN"]);
  }

  if (constraint.value.kind === "CONTINUOUS") {
    return continuousDecision(input, constraint, evidence, policies);
  }

  return exactOrCategoricalDecision(input, constraint, evidence, policies);
}

function productEvidenceDecision(
  input: DecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  const evidence = evidenceForSubject(input.subject, input.evidence);
  const policies = input.policies ?? [];
  if (evidence === undefined) {
    return unknownEvidenceDecision(input, constraint, ["PRODUCT_EVIDENCE_UNKNOWN"]);
  }
  if (evidence.state === "CONFLICTING") {
    return conflictingEvidenceDecision(input, constraint);
  }
  if (evidence.state === "NOT_REPRESENTABLE") {
    return notRepresentableDecision(input, constraint);
  }
  if (evidence.state === "MODEL_INFERRED") {
    return unknownEvidenceDecision(
      input,
      constraint,
      ["MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY"],
      ["NO_PRODUCT_ASSERTION", "DISCLOSE_UNKNOWN"],
    );
  }
  if (!evidenceHasAssertionAuthority(evidence, policies)) {
    return unknownEvidenceDecision(input, constraint, ["PRODUCT_EVIDENCE_UNKNOWN"]);
  }

  return authoritativeEvidenceDecision(input, constraint, evidence, policies);
}

export function decideConstraint(input: DecideConstraintInput): ConstraintDecision {
  if (input.target.kind === "CONTRADICTION") {
    return contradictionDecision(input);
  }

  const constraint = input.target.constraint;
  switch (constraint.value.kind) {
    case "OUTCOME_INTENT":
      return outcomeIntentDecision(input);
    case "AUTHORITY_ROUTE":
      return audienceRouteDecision(input);
    case "UNKNOWN_OR_UNSUPPORTED":
      return unsupportedDecision(input, constraint.value.state === "AMBIGUOUS");
    case "EXACT_IDENTITY":
    case "CATEGORICAL":
    case "CONTINUOUS":
      return productEvidenceDecision(input, constraint);
  }
}
