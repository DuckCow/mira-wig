import { DISCOVERY_COMPONENT_VERSIONS } from "../versions";
import {
  admitExactCandidate,
  assessExactSliceRequest,
} from "./candidate-admission";
import { deliverExactSliceEvent } from "./event-seam";
import { retrieveExactCandidateFixture } from "./exact-fixture-retriever";
import type {
  D5RetrievalAttributionVersions,
  ExactSliceCoreOutcome,
  ExactSliceRunResult,
  RunExactSkuFixtureSliceInput,
} from "./types";

function d5AttributionVersions(
  input: RunExactSkuFixtureSliceInput,
): D5RetrievalAttributionVersions {
  return {
    normalizer: DISCOVERY_COMPONENT_VERSIONS.normalizer,
    parser: input.parserResult.parserVersion,
    constraintRules: DISCOVERY_COMPONENT_VERSIONS.constraintRules,
    lexicon: input.parserResult.lexiconVersion,
    ontology: input.parserResult.ontologyVersion,
  };
}

function finishExactSlice(
  input: RunExactSkuFixtureSliceInput,
  d5Versions: D5RetrievalAttributionVersions,
  outcome: ExactSliceCoreOutcome,
): ExactSliceRunResult {
  return {
    ...outcome,
    eventDelivery: deliverExactSliceEvent(
      outcome,
      input.context,
      d5Versions,
      input.eventSeam,
    ),
  };
}

export function runExactSkuFixtureSlice(
  input: RunExactSkuFixtureSliceInput,
): ExactSliceRunResult {
  const d5Versions = d5AttributionVersions(input);
  const request = assessExactSliceRequest(input.parserResult);
  if (request.status !== "APPLICABLE") {
    return finishExactSlice(input, d5Versions, request);
  }

  const lookup = retrieveExactCandidateFixture(input.candidateSnapshot, {
    namespace: request.constraint.value.namespace,
    canonicalValue: request.constraint.value.value,
  });
  if (lookup.status !== "MATCH") {
    return finishExactSlice(input, d5Versions, lookup);
  }

  const admission = admitExactCandidate({
    request,
    context: input.context,
    candidate: lookup.candidate,
    candidateSetFingerprint: lookup.candidateSetFingerprint,
    catalogProofs: input.catalogProofs,
    eligibilitySummaries: input.eligibilitySummaries,
    d5Versions,
  });
  return finishExactSlice(input, d5Versions, admission);
}
