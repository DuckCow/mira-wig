import { DISCOVERY_COMPONENT_VERSIONS } from "../versions";
import { validateStage0AuthorityUniverse } from "./authority-universe";
import { admitStructuredCandidate } from "./candidate-admission";
import { evaluateStructuredCandidateEvidence } from "./evidence-evaluation";
import { enumerateStructuredCandidateFixtures } from "./fixture-candidate-source";
import { buildStructuredRequestPlan } from "./request-plan";
import type {
  D5StructuredRetrievalAttributionVersions,
  RunStructuredCategoricalFixtureSliceInput,
  StructuredAdmissionResult,
  StructuredCandidateFixture,
  StructuredCandidateResult,
  StructuredSliceRunResult,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function d5AttributionVersions(
  input: RunStructuredCategoricalFixtureSliceInput,
): D5StructuredRetrievalAttributionVersions {
  return {
    normalizer: DISCOVERY_COMPONENT_VERSIONS.normalizer,
    parser: input.parserResult.parserVersion,
    constraintRules: DISCOVERY_COMPONENT_VERSIONS.constraintRules,
    lexicon: input.parserResult.lexiconVersion,
    ontology: input.parserResult.ontologyVersion,
  };
}

function technicalCandidateOrder(
  left: StructuredCandidateFixture,
  right: StructuredCandidateFixture,
): number {
  const variantOrder = left.variantId.localeCompare(right.variantId);
  return variantOrder !== 0
    ? variantOrder
    : left.canonicalStyleId.localeCompare(right.canonicalStyleId);
}

interface CandidatePartitions {
  readonly asserted: StructuredCandidateResult[];
  readonly unknown: StructuredCandidateResult[];
  readonly violating: StructuredCandidateResult[];
  readonly withheld: StructuredCandidateResult[];
  readonly rejected: Extract<
    StructuredAdmissionResult,
    { readonly status: "ADMISSION_REJECTED" }
  >[];
}

function emptyPartitions(): CandidatePartitions {
  return {
    asserted: [],
    unknown: [],
    violating: [],
    withheld: [],
    rejected: [],
  };
}

function addAdmissionResult(
  partitions: CandidatePartitions,
  admission: StructuredAdmissionResult,
): void {
  if (admission.status === "ADMISSION_REJECTED") {
    partitions.rejected.push(admission);
    return;
  }

  switch (admission.candidate.partition) {
    case "ASSERTED":
      partitions.asserted.push(admission.candidate);
      return;
    case "UNKNOWN":
      partitions.unknown.push(admission.candidate);
      return;
    case "VIOLATING":
      partitions.violating.push(admission.candidate);
      return;
    case "WITHHELD":
      partitions.withheld.push(admission.candidate);
  }
}

export function runStructuredCategoricalFixtureSlice(
  input: RunStructuredCategoricalFixtureSliceInput,
): StructuredSliceRunResult {
  const d5Versions = d5AttributionVersions(input);
  const d6Versions = {
    ...D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS,
  };
  const requestPlan = buildStructuredRequestPlan(
    input.parserResult,
    input.context,
    input.policies,
  );
  if (requestPlan.status === "REQUEST_REJECTED") {
    return {
      ...requestPlan,
      d5Versions,
      d6Versions,
    };
  }

  const stage0 = validateStage0AuthorityUniverse(
    input.stage0Proof,
    input.context,
  );
  if (stage0.status === "STAGE0_REJECTED") {
    return {
      ...stage0,
      requestPlan,
      d5Versions,
      d6Versions,
    };
  }

  const enumeration = enumerateStructuredCandidateFixtures(
    input.candidateSnapshot,
    stage0,
  );
  if (enumeration.status === "CANDIDATE_SOURCE_REJECTED") {
    return {
      ...enumeration,
      requestPlan,
      stage0Attribution: stage0,
      d5Versions,
      d6Versions,
    };
  }

  const candidates = [...enumeration.candidates].sort(
    technicalCandidateOrder,
  );
  const partitions = emptyPartitions();
  for (const candidate of candidates) {
    const evidenceEvaluation = evaluateStructuredCandidateEvidence(
      requestPlan,
      input.context,
      candidate,
      input.evidenceFixtures,
    );
    const admission = admitStructuredCandidate({
      requestPlan,
      context: input.context,
      stage0Proof: stage0,
      candidate,
      candidateSourceAttribution: enumeration.attribution,
      evidenceEvaluation,
      eligibilitySummaries: input.eligibilitySummaries,
      d5Versions,
      d6Versions,
    });
    addAdmissionResult(partitions, admission);
  }

  return {
    status: "COMPLETED",
    requestPlan,
    stage0Attribution: stage0,
    candidateSourceAttribution: enumeration.attribution,
    assertedCandidates: partitions.asserted,
    unknownCandidates: partitions.unknown,
    violatingCandidates: partitions.violating,
    withheldCandidates: partitions.withheld,
    admissionRejections: partitions.rejected,
    counts: {
      scopedMembership: stage0.allowedCanonicalPairs.length,
      enumeratedCandidates: candidates.length,
      admissionAttempts: candidates.length,
      asserted: partitions.asserted.length,
      unknown: partitions.unknown.length,
      violating: partitions.violating.length,
      withheld: partitions.withheld.length,
      admissionRejected: partitions.rejected.length,
    },
    technicalOrder: "VARIANT_ID_THEN_STYLE_ID",
    ranking: "NONE",
    relaxation: "NONE",
    d5Versions,
    d6Versions,
  };
}
