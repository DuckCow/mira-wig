import type {
  AuthorityOutcome,
  ConstraintDecision,
  ConstraintReasonCode,
  ConstraintDecisionTarget,
  ConstraintValue,
  ContinuousTolerancePolicyFixture,
  DecideConstraintInput,
  DecisionPolicyFixture,
  DecisionSubject,
  EvidencePartition,
  FallbackRoute,
  FixtureDecisionDiagnostic,
  GateDecision,
  InterpretedConstraint,
  ProductEvidenceFixture,
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
  readonly reasons: readonly ConstraintReasonCode[];
  readonly diagnostics: readonly FixtureDecisionDiagnostic[];
}

interface RuntimeDecideConstraintInput {
  readonly target: ConstraintDecisionTarget;
  readonly subject: DecisionSubject;
  readonly context: DecideConstraintInput["context"];
  readonly evidence?: ProductEvidenceFixture;
  readonly policies?: readonly DecisionPolicyFixture[];
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function invalidD5Input(message: string): never {
  throw new TypeError(`Invalid D5 decision input: ${message}`);
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

function confirmationReasons(constraint: InterpretedConstraint): ConstraintReasonCode[] {
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

function policySemanticKey(policy: DecisionPolicyFixture): string {
  if (policy.kind === "CONTINUOUS_TOLERANCE") {
    return JSON.stringify([policy.kind, policy.dimensionId, policy.unitId]);
  }

  return policy.kind;
}

function validatePolicies(
  policies: readonly DecisionPolicyFixture[],
): readonly DecisionPolicyFixture[] {
  const keys = new Set<string>();

  for (const policy of policies) {
    const key = policySemanticKey(policy);
    if (keys.has(key)) {
      invalidD5Input(`duplicate synthetic policy ${key}`);
    }
    keys.add(key);

    if (
      policy.kind === "CONTINUOUS_TOLERANCE" &&
      (!Number.isFinite(policy.lowerDelta) ||
        policy.lowerDelta < 0 ||
        !Number.isFinite(policy.upperDelta) ||
        policy.upperDelta < 0)
    ) {
      invalidD5Input(`invalid continuous tolerance policy ${key}`);
    }
  }

  return policies;
}

function assertAllowedPolicyKinds(
  policies: readonly DecisionPolicyFixture[],
  allowedKinds: readonly DecisionPolicyFixture["kind"][],
): void {
  for (const policy of policies) {
    if (!allowedKinds.includes(policy.kind)) {
      invalidD5Input(`policy ${policy.kind} is not supported for this target`);
    }
  }
}

function claimAuthorityUnavailable(
  policies: readonly DecisionPolicyFixture[],
): boolean {
  return policies.some(
    (policy) =>
      policy.kind === "CLAIM_AUTHORITY" && policy.status === "UNAVAILABLE",
  );
}

function vendorAttestationPermitted(
  policies: readonly DecisionPolicyFixture[],
): boolean {
  return policies.some(
    (policy) =>
      policy.kind === "VENDOR_ATTESTATION" && policy.permitted,
  );
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
): FixtureDecisionDiagnostic[] {
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
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
  reasons: readonly ConstraintReasonCode[],
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

function contradictionDecision(
  input: RuntimeDecideConstraintInput,
): ConstraintDecision {
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

function outcomeIntentDecision(
  input: RuntimeDecideConstraintInput,
): ConstraintDecision {
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

function audienceRouteDecision(
  input: RuntimeDecideConstraintInput,
): ConstraintDecision {
  return makeDecision(input.target, input.subject, {
    authorityOutcome: {
      kind: "PRESERVE_CALLER_CONTEXT",
      audienceNamespace: input.context.audienceNamespace,
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
  input: RuntimeDecideConstraintInput,
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
  input: RuntimeDecideConstraintInput,
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
  input: RuntimeDecideConstraintInput,
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

function exactOrCategoricalEvidenceComparable(
  constraint: ConstraintValue,
  evidence: ProductEvidenceFixture,
): boolean {
  if (constraint.kind === "EXACT_IDENTITY") {
    return (
      evidence.value?.kind === "EXACT_IDENTITY" &&
      evidence.value.namespace === constraint.namespace
    );
  }
  if (constraint.kind === "CATEGORICAL") {
    return evidence.value?.kind === "CATEGORICAL";
  }
  return false;
}

function exactOrCategoricalDecision(
  input: RuntimeDecideConstraintInput,
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
  if (!matches) {
    reasons.push("EVIDENCE_QUALIFIED_MISMATCH");
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
  input: RuntimeDecideConstraintInput,
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
  input: RuntimeDecideConstraintInput,
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
    reasons: [
      ...confirmationReasons(constraint),
      "CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE",
    ],
    diagnostics: ["SYNTHETIC_TOLERANCE_APPLIED"],
  });
}

function continuousDecision(
  input: RuntimeDecideConstraintInput,
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
  input: RuntimeDecideConstraintInput,
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
  if (!exactOrCategoricalEvidenceComparable(constraint.value, evidence)) {
    return unknownEvidenceDecision(input, constraint, [
      "PRODUCT_EVIDENCE_UNKNOWN",
    ]);
  }

  return exactOrCategoricalDecision(input, constraint, evidence, policies);
}

function productEvidenceDecision(
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): ConstraintDecision {
  const evidence = evidenceForSubject(input.subject, input.evidence);
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

function validateSensitiveUseContextConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.attributeBand !== "OUTCOME_INTENT" ||
    constraint.decisionProfile !== "SENSITIVE_USE_CONTEXT"
  ) {
    invalidD5Input("outcome intent lacks the sensitive-use-context profile");
  }
  assertAllowedPolicyKinds(policies, ["CLAIM_AUTHORITY"]);
  if (!claimAuthorityUnavailable(policies)) {
    invalidD5Input(
      "sensitive-use-context requires unavailable claim authority",
    );
  }
}

function validateAudienceRouteConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.attributeBand !== "AUTHORITY_ROUTE" ||
    constraint.decisionProfile !== null
  ) {
    invalidD5Input("audience route has an incompatible band or profile");
  }
  assertAllowedPolicyKinds(policies, []);
}

function validateUnsupportedQueryConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.interpretationState !== "UNRESOLVED" ||
    constraint.attributeBand !== "STYLISTIC" ||
    constraint.decisionProfile !== null
  ) {
    invalidD5Input(
      "unsupported query concept has an incompatible state, band, or profile",
    );
  }
  assertAllowedPolicyKinds(policies, []);
}

function validateQueryConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  switch (constraint.value.kind) {
    case "OUTCOME_INTENT":
      return validateSensitiveUseContextConstraint(constraint, policies);
    case "AUTHORITY_ROUTE":
      return validateAudienceRouteConstraint(constraint, policies);
    case "UNKNOWN_OR_UNSUPPORTED":
      return validateUnsupportedQueryConstraint(constraint, policies);
    case "EXACT_IDENTITY":
    case "CATEGORICAL":
    case "CONTINUOUS":
      return invalidD5Input(
        `constraint kind ${constraint.value.kind} is not query-level`,
      );
  }
}

function validateExactIdentityConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.attributeBand !== "IDENTITY" ||
    constraint.decisionProfile !== null
  ) {
    invalidD5Input("exact identity has an incompatible band or profile");
  }
  assertAllowedPolicyKinds(policies, []);
}

function validateClaimBearingMaterialConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.attributeBand !== "CLAIM_BEARING" ||
    constraint.decisionProfile !== "CLAIM_BEARING_MATERIAL"
  ) {
    invalidD5Input(
      "categorical constraint lacks the claim-bearing material profile",
    );
  }
  assertAllowedPolicyKinds(policies, ["VENDOR_ATTESTATION"]);
}

function validateContinuousConstraint(
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (
    constraint.attributeBand !== "DIMENSIONAL_CONTINUOUS" ||
    constraint.decisionProfile !== null
  ) {
    invalidD5Input("continuous constraint has an incompatible band or profile");
  }
  assertAllowedPolicyKinds(policies, ["CONTINUOUS_TOLERANCE"]);
}

function validateNotRepresentableConstraint(
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (constraint.value.kind !== "UNKNOWN_OR_UNSUPPORTED") {
    invalidD5Input("product representation target must be unsupported");
  }
  if (
    constraint.value.state === "UNSUPPORTED" &&
    constraint.interpretationState === "UNRESOLVED" &&
    constraint.attributeBand === "STYLISTIC" &&
    constraint.decisionProfile === null &&
    input.evidence?.state === "NOT_REPRESENTABLE"
  ) {
    assertAllowedPolicyKinds(policies, []);
    return;
  }

  invalidD5Input("unsupported constraint lacks NOT_REPRESENTABLE evidence");
}

function validateFixtureProductConstraint(
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): void {
  switch (constraint.value.kind) {
    case "EXACT_IDENTITY":
      return validateExactIdentityConstraint(constraint, policies);
    case "CATEGORICAL":
      return validateClaimBearingMaterialConstraint(constraint, policies);
    case "CONTINUOUS":
      return validateContinuousConstraint(constraint, policies);
    case "UNKNOWN_OR_UNSUPPORTED":
      return validateNotRepresentableConstraint(input, constraint, policies);
    case "OUTCOME_INTENT":
    case "AUTHORITY_ROUTE":
      return invalidD5Input(
        `constraint kind ${constraint.value.kind} is not fixture-product-level`,
      );
  }
}

function validateDecisionInput(
  input: RuntimeDecideConstraintInput,
  policies: readonly DecisionPolicyFixture[],
): void {
  if (input.target.kind === "CONTRADICTION") {
    if (input.subject.kind !== "QUERY") {
      invalidD5Input("contradiction requires a query subject");
    }
    assertAllowedPolicyKinds(policies, []);
    return;
  }

  const expectedLevel =
    input.subject.kind === "QUERY" ? "QUERY" : "FIXTURE_PRODUCT";
  if (input.target.decisionLevel !== expectedLevel) {
    invalidD5Input(
      `${input.target.decisionLevel} target cannot use ${input.subject.kind} subject`,
    );
  }

  if (expectedLevel === "QUERY") {
    validateQueryConstraint(input.target.constraint, policies);
    return;
  }

  validateFixtureProductConstraint(input, input.target.constraint, policies);
}

function decideQueryConstraint(
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
): ConstraintDecision {
  switch (constraint.value.kind) {
    case "OUTCOME_INTENT":
      return outcomeIntentDecision(input);
    case "AUTHORITY_ROUTE":
      return audienceRouteDecision(input);
    case "UNKNOWN_OR_UNSUPPORTED":
      return unsupportedDecision(
        input,
        constraint.value.state === "AMBIGUOUS",
      );
    case "EXACT_IDENTITY":
    case "CATEGORICAL":
    case "CONTINUOUS":
      return invalidD5Input(
        `constraint kind ${constraint.value.kind} is not query-level`,
      );
  }
}

function decideFixtureProductConstraint(
  input: RuntimeDecideConstraintInput,
  constraint: InterpretedConstraint,
  policies: readonly DecisionPolicyFixture[],
): ConstraintDecision {
  switch (constraint.value.kind) {
    case "EXACT_IDENTITY":
    case "CATEGORICAL":
    case "CONTINUOUS":
    case "UNKNOWN_OR_UNSUPPORTED":
      return productEvidenceDecision(input, constraint, policies);
    case "OUTCOME_INTENT":
    case "AUTHORITY_ROUTE":
      return invalidD5Input(
        `constraint kind ${constraint.value.kind} is not fixture-product-level`,
      );
  }
}

export function decideConstraint(
  input: DecideConstraintInput,
): ConstraintDecision;
export function decideConstraint(
  input: RuntimeDecideConstraintInput,
): ConstraintDecision {
  const policies = validatePolicies(input.policies ?? []);
  validateDecisionInput(input, policies);

  if (input.target.kind === "CONTRADICTION") {
    return contradictionDecision(input);
  }

  const constraint = input.target.constraint;
  if (input.target.decisionLevel === "QUERY") {
    return decideQueryConstraint(input, constraint);
  }

  return decideFixtureProductConstraint(input, constraint, policies);
}
