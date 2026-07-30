import { decideConstraint } from "../decide-constraint";
import type {
  ConstraintDecision,
  DiscoveryContext,
} from "../types";
import type {
  GovernedCategoricalConstraint,
  StructuredCandidateEvidenceEvaluation,
  StructuredCandidateFixture,
  StructuredEvidenceAttribution,
  StructuredProductEvidenceFixture,
  StructuredRequestPlan,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function isRuntimeObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function evidenceStateIsValid(value: unknown): boolean {
  switch (value) {
    case "VERIFIED_OR_MEASURED":
    case "APPROVED_VENDOR_ATTESTED":
    case "UNAPPROVED_VENDOR_DECLARATION":
    case "HUMAN_CURATED_FROM_EVIDENCE":
    case "MODEL_INFERRED":
    case "MISSING":
    case "CONFLICTING":
    case "NOT_REPRESENTABLE":
    case "UNKNOWN_AUTHORITY":
      return true;
    default:
      return false;
  }
}

function nullEvidenceValueIsValid(
  state: StructuredProductEvidenceFixture["state"],
): boolean {
  return (
    state === "MISSING" ||
    state === "CONFLICTING" ||
    state === "NOT_REPRESENTABLE" ||
    state === "UNKNOWN_AUTHORITY"
  );
}

function categoricalEvidenceValueIsValid(value: unknown): boolean {
  return (
    isRuntimeObject(value) &&
    !Array.isArray(value) &&
    value.kind === "CATEGORICAL" &&
    isNonblankRuntimeString(value.valueId)
  );
}

function evidenceValueIsValid(
  evidence: StructuredProductEvidenceFixture,
): boolean {
  return evidence.value === null
    ? nullEvidenceValueIsValid(evidence.state)
    : categoricalEvidenceValueIsValid(evidence.value);
}

function evidenceFixtureIdentityIsValid(
  evidence: StructuredProductEvidenceFixture,
): boolean {
  return (
    evidence.fixtureOnly === true &&
    evidence.synthetic === true &&
    evidence.fixtureSnapshotVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    isNonblankRuntimeString(evidence.fixtureProductId) &&
    isNonblankRuntimeString(evidence.targetConstraintId) &&
    isNonblankRuntimeString(evidence.attributeId) &&
    (evidence.syntheticEvidenceRef === null ||
      isNonblankRuntimeString(evidence.syntheticEvidenceRef))
  );
}

function relatedEvidence(
  fixtures: readonly StructuredProductEvidenceFixture[],
  candidate: StructuredCandidateFixture,
  constraint: GovernedCategoricalConstraint,
): readonly StructuredProductEvidenceFixture[] {
  return fixtures.filter(
    (fixture) =>
      fixture.fixtureProductId === candidate.variantId &&
      fixture.targetConstraintId === constraint.constraintId,
  );
}

function evidenceProvenanceIsValid(
  evidence: StructuredProductEvidenceFixture,
): boolean {
  if (!evidenceStateIsValid(evidence.state)) {
    return false;
  }
  if (!evidenceValueIsValid(evidence)) {
    return false;
  }
  return evidenceFixtureIdentityIsValid(evidence);
}

function productDecisionIsCompatible(
  decision: ConstraintDecision,
  constraint: GovernedCategoricalConstraint,
  candidate: StructuredCandidateFixture,
): boolean {
  if (
    !productDecisionIdentityIsCompatible(
      decision,
      constraint,
      candidate,
    )
  ) {
    return false;
  }
  return productDecisionPartitionIsCompatible(decision);
}

function productDecisionIdentityIsCompatible(
  decision: ConstraintDecision,
  constraint: GovernedCategoricalConstraint,
  candidate: StructuredCandidateFixture,
): boolean {
  if (
    decision.constraintId !== constraint.constraintId ||
    decision.subject.kind !== "FIXTURE_PRODUCT" ||
    decision.subject.fixtureProductId !== candidate.variantId ||
    decision.authorityOutcome.kind !== "NOT_APPLICABLE" ||
    decision.score !== "NONE" ||
    decision.gate === "REQUIRE_MATCH" ||
    decision.fallbackRoutes.length !== 0 ||
    decision.diagnostics.length !== 0
  ) {
    return false;
  }
  return true;
}

function productDecisionPartitionIsCompatible(
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

function absentAttribution(
  constraint: GovernedCategoricalConstraint,
): StructuredEvidenceAttribution {
  return {
    constraintId: constraint.constraintId,
    attributeId: constraint.value.attributeId,
    status: "ABSENT",
    matchingRecordCount: 0,
    evidenceState: null,
    syntheticEvidenceRef: null,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
  };
}

function selectedAttribution(
  constraint: GovernedCategoricalConstraint,
  evidence: StructuredProductEvidenceFixture,
  status: StructuredEvidenceAttribution["status"],
): StructuredEvidenceAttribution {
  return {
    constraintId: constraint.constraintId,
    attributeId: constraint.value.attributeId,
    status,
    matchingRecordCount: 1,
    evidenceState: evidence.state,
    syntheticEvidenceRef: evidence.syntheticEvidenceRef,
    fixtureSnapshotVersion: evidence.fixtureSnapshotVersion,
  };
}

function duplicateAttribution(
  constraint: GovernedCategoricalConstraint,
  count: number,
): StructuredEvidenceAttribution {
  return {
    constraintId: constraint.constraintId,
    attributeId: constraint.value.attributeId,
    status: "REJECTED",
    matchingRecordCount: count,
    evidenceState: null,
    syntheticEvidenceRef: null,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
  };
}

type ConstraintEvidenceEvaluation =
  | {
      readonly status: "EVALUATED";
      readonly decision: ConstraintDecision;
      readonly attribution: StructuredEvidenceAttribution;
    }
  | {
      readonly status: "REJECTED";
      readonly reason:
        | "EVIDENCE_PROVENANCE_INVALID"
        | "DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE"
        | "EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH"
        | "EVIDENCE_NOT_REPRESENTABLE"
        | "INCOMPATIBLE_D5_PRODUCT_DECISION";
      readonly attribution: StructuredEvidenceAttribution;
    };

type EvidenceInputRejectionReason =
  | "EVIDENCE_PROVENANCE_INVALID"
  | "EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH"
  | "EVIDENCE_NOT_REPRESENTABLE";

function evidenceInputRejection(
  evidence: StructuredProductEvidenceFixture,
  constraint: GovernedCategoricalConstraint,
): EvidenceInputRejectionReason | null {
  if (!evidenceProvenanceIsValid(evidence)) {
    return "EVIDENCE_PROVENANCE_INVALID";
  }
  if (evidence.attributeId !== constraint.value.attributeId) {
    return "EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH";
  }
  return evidence.state === "NOT_REPRESENTABLE"
    ? "EVIDENCE_NOT_REPRESENTABLE"
    : null;
}

function evaluateConstraintEvidence(
  requestPlan: StructuredRequestPlan,
  context: DiscoveryContext,
  candidate: StructuredCandidateFixture,
  fixtures: readonly StructuredProductEvidenceFixture[],
  constraint: GovernedCategoricalConstraint,
  index: number,
): ConstraintEvidenceEvaluation {
  const matches = relatedEvidence(fixtures, candidate, constraint);
  if (matches.length > 1) {
    return {
      status: "REJECTED",
      reason: "DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE",
      attribution: duplicateAttribution(constraint, matches.length),
    };
  }

  const evidence = matches[0];
  const inputRejection =
    evidence === undefined
      ? null
      : evidenceInputRejection(evidence, constraint);
  if (evidence !== undefined && inputRejection !== null) {
    return {
      status: "REJECTED",
      reason: inputRejection,
      attribution: selectedAttribution(
        constraint,
        evidence,
        "REJECTED",
      ),
    };
  }

  const policy = requestPlan.policies[index];
  if (policy === undefined) {
    throw new TypeError("Structured policy evaluation invariant failed");
  }
  const decision = decideConstraint({
    target: {
      kind: "INTERPRETED_CONSTRAINT",
      decisionLevel: "FIXTURE_PRODUCT",
      constraint,
    },
    subject: {
      kind: "FIXTURE_PRODUCT",
      fixtureProductId: candidate.variantId,
    },
    context,
    policies: [policy],
    ...(evidence === undefined ? {} : { evidence }),
  });
  const attribution =
    evidence === undefined
      ? absentAttribution(constraint)
      : selectedAttribution(constraint, evidence, "SELECTED");
  return productDecisionIsCompatible(decision, constraint, candidate)
    ? { status: "EVALUATED", decision, attribution }
    : {
        status: "REJECTED",
        reason: "INCOMPATIBLE_D5_PRODUCT_DECISION",
        attribution,
      };
}

export function evaluateStructuredCandidateEvidence(
  requestPlan: StructuredRequestPlan,
  context: DiscoveryContext,
  candidate: StructuredCandidateFixture,
  fixtures: readonly StructuredProductEvidenceFixture[],
): StructuredCandidateEvidenceEvaluation {
  const productDecisions: ConstraintDecision[] = [];
  const evidenceAttribution: StructuredEvidenceAttribution[] = [];

  for (const [index, constraint] of requestPlan.constraints.entries()) {
    const evaluation = evaluateConstraintEvidence(
      requestPlan,
      context,
      candidate,
      fixtures,
      constraint,
      index,
    );
    evidenceAttribution.push(evaluation.attribution);
    if (evaluation.status === "REJECTED") {
      return {
        status: "EVIDENCE_REJECTED",
        reason: evaluation.reason,
        productDecisions,
        evidenceAttribution,
      };
    }
    productDecisions.push(evaluation.decision);
  }

  return {
    status: "EVALUATED",
    productDecisions,
    evidenceAttribution,
  };
}
