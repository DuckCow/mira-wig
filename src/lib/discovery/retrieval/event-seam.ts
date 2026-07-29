import type { DiscoveryContext } from "../types";
import type {
  D5RetrievalAttributionVersions,
  ExactSliceCoreOutcome,
  ExactSliceEventDelivery,
  ExactSliceEventPayload,
  ExactSliceEventSeam,
} from "./types";
import { D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

interface EventOutcomeFields {
  readonly exactLookupAccountabilityKey: string | null;
  readonly displayedStyleId: string | null;
  readonly displayedVariantId: string | null;
}

function eventOutcomeFields(outcome: ExactSliceCoreOutcome): EventOutcomeFields {
  if (outcome.status === "ADMITTED") {
    return {
      exactLookupAccountabilityKey:
        outcome.result.exactLookupAccountabilityKey,
      displayedStyleId: outcome.result.displayedStyleId,
      displayedVariantId: outcome.result.displayedVariantId,
    };
  }

  if (
    outcome.status === "EXACT_NOT_FOUND" ||
    outcome.status === "ADMISSION_REJECTED"
  ) {
    return {
      exactLookupAccountabilityKey: outcome.exactLookupAccountabilityKey,
      displayedStyleId: null,
      displayedVariantId: null,
    };
  }

  return {
    exactLookupAccountabilityKey: null,
    displayedStyleId: null,
    displayedVariantId: null,
  };
}

function buildPayload(
  outcome: ExactSliceCoreOutcome,
  context: DiscoveryContext,
  d5Versions: D5RetrievalAttributionVersions,
): ExactSliceEventPayload {
  return {
    eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
    eventSchemaVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.eventSchema,
    outcome: outcome.status,
    marketCode: context.marketCode,
    d5Versions: { ...d5Versions },
    d6Versions: { ...D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS },
    ...eventOutcomeFields(outcome),
  };
}

export function deliverExactSliceEvent(
  outcome: ExactSliceCoreOutcome,
  context: DiscoveryContext,
  d5Versions: D5RetrievalAttributionVersions,
  seam: ExactSliceEventSeam | undefined,
): ExactSliceEventDelivery {
  if (seam?.enabled !== true) {
    return { status: "DISABLED" };
  }

  const payload = buildPayload(outcome, context, d5Versions);
  try {
    seam.sink(payload);
    return { status: "INJECTED_SINK_RETURNED" };
  } catch {
    return { status: "INJECTED_SINK_THREW" };
  }
}
