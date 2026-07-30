import { describe, expect, it } from "vitest";

import { runExactSkuFixtureSlice } from "../exact-slice";
import { verifyExactLanding } from "../landing";
import type {
  ExactLandingIntent,
  ExactSliceEventPayload,
  RunExactSkuFixtureSliceInput,
} from "../types";
import {
  candidateSnapshot,
  catalogProof,
  exactSliceInput,
  parserResult,
} from "./fixtures/synthetic-fixtures";

function runWithCapturedEvent(input: RunExactSkuFixtureSliceInput): {
  readonly run: ReturnType<typeof runExactSkuFixtureSlice>;
  readonly event: ExactSliceEventPayload;
} {
  let captured: ExactSliceEventPayload | undefined;
  const run = runExactSkuFixtureSlice({
    ...input,
    eventSeam: {
      enabled: true,
      sink: (event) => {
        captured = event;
      },
    },
  });
  if (captured === undefined) {
    throw new TypeError("Enabled synthetic event sink must be called");
  }
  return { run, event: captured };
}

describe("exact landing integrity", () => {
  it("preserves the exact canonical style and variant", () => {
    const run = runExactSkuFixtureSlice(exactSliceInput());

    expect(run.status).toBe("ADMITTED");
    if (run.status === "ADMITTED") {
      expect(run.landingIntent).toMatchObject({
        displayedStyleId: "style-exact-001",
        displayedVariantId: "variant-exact-001",
        priceBasis: "SELECTED_VARIANT",
      });
      expect(
        verifyExactLanding(run.landingIntent, catalogProof()),
      ).toEqual({ status: "VERIFIED" });
      expect(run).not.toHaveProperty("landingVerification");
    }
  });

  it.each([
    {
      dimension: "style ID",
      change: (intent: ExactLandingIntent): ExactLandingIntent => ({
        ...intent,
        displayedStyleId: "style-mismatched",
      }),
    },
    {
      dimension: "variant ID",
      change: (intent: ExactLandingIntent): ExactLandingIntent => ({
        ...intent,
        displayedVariantId: "variant-mismatched",
      }),
    },
    {
      dimension: "SKU namespace",
      change: (intent: ExactLandingIntent): ExactLandingIntent => ({
        ...intent,
        exactIdentity: {
          ...intent.exactIdentity,
          namespace: "UPC",
        },
      }),
    },
    {
      dimension: "SKU value",
      change: (intent: ExactLandingIntent): ExactLandingIntent => ({
        ...intent,
        exactIdentity: {
          ...intent.exactIdentity,
          canonicalValue: "SKU-MISMATCHED",
        },
      }),
    },
    {
      dimension: "fixture snapshot",
      change: (intent: ExactLandingIntent): ExactLandingIntent => ({
        ...intent,
        fixtureSnapshotVersion: "fixture-snapshot-mismatched",
      }),
    },
  ])("returns a visible $dimension mismatch without mutation", ({ change }) => {
    const run = runExactSkuFixtureSlice(exactSliceInput());
    if (run.status !== "ADMITTED") {
      throw new TypeError("Synthetic exact run must be admitted");
    }
    const mismatchedIntent = change(run.landingIntent);
    const before = JSON.stringify(mismatchedIntent);

    expect(verifyExactLanding(mismatchedIntent, catalogProof())).toEqual({
      status: "LANDING_INTEGRITY_MISMATCH",
      reason: "LANDING_INTEGRITY_MISMATCH",
    });
    expect(JSON.stringify(mismatchedIntent)).toBe(before);
  });
});

describe("default-off provisional event seam", () => {
  it("does not call an injected sink while disabled", () => {
    const received: ExactSliceEventPayload[] = [];
    const run = runExactSkuFixtureSlice(
      exactSliceInput({
        eventSeam: {
          enabled: false,
          sink: (event) => {
            received.push(event);
          },
        },
      }),
    );

    expect(run.eventDelivery).toEqual({ status: "DISABLED" });
    expect(received).toEqual([]);
  });

  it("returns truthful status when an injected sink returns", () => {
    const received: ExactSliceEventPayload[] = [];
    const input = exactSliceInput({
      eventSeam: {
        enabled: true,
        sink: (event) => {
          received.push(event);
        },
      },
    });
    const run = runExactSkuFixtureSlice(input);

    expect(run.eventDelivery).toEqual({
      status: "INJECTED_SINK_RETURNED",
    });
    expect(received).toHaveLength(1);
  });

  it("preserves admitted and non-admitted outcomes when an injected sink throws", () => {
    const throwingSeam = {
      enabled: true as const,
      sink: (): never => {
        throw new Error("synthetic-private-sink-error");
      },
    };
    const admitted = runExactSkuFixtureSlice(
      exactSliceInput({ eventSeam: throwingSeam }),
    );
    const nonAdmitted = runExactSkuFixtureSlice(
      exactSliceInput({
        parserResult: parserResult([]),
        eventSeam: throwingSeam,
      }),
    );

    expect(admitted.status).toBe("ADMITTED");
    expect(admitted.eventDelivery).toEqual({
      status: "INJECTED_SINK_THREW",
    });
    expect(nonAdmitted).toMatchObject({
      status: "REQUEST_NOT_APPLICABLE",
      reason: "NO_EXACT_IDENTITY",
      eventDelivery: { status: "INJECTED_SINK_THREW" },
    });
    expect(JSON.stringify([admitted, nonAdmitted])).not.toContain(
      "synthetic-private-sink-error",
    );
  });

  it("attributes request, miss, rejection, and admitted event outcomes exactly", () => {
    const exactKey = JSON.stringify([
      "d6-exact-retrieval-fixture/v0.1-provisional",
      "d6-exact-fixture-retriever/v0.1",
      "SKU",
      "SKU-EXACT-001",
      "variant-exact-001",
      "style-exact-001",
    ]);
    const missKey = JSON.stringify([
      "d6-exact-retrieval-fixture/v0.1-provisional",
      "d6-exact-fixture-retriever/v0.1",
      "SKU",
      "SKU-EXACT-001",
      null,
      null,
    ]);
    const d5Versions = {
      normalizer: "d5-conservative-normalizer/v0.1",
      parser: "d5-injected-span-parser/v0.1",
      constraintRules: "d5-constraint-decisions/v0.2",
      lexicon: "synthetic-lexicon/v0.1-provisional",
      ontology: "synthetic-ontology/v0.1-provisional",
    };
    const d6Versions = {
      candidateSource: "d6-exact-fixture-retriever/v0.1",
      admissionRules: "d6-exact-candidate-admission/v0.1",
      landingContract: "d6-exact-landing/v0.1",
      eventSchema: "d6-discovery-events/v0.1-provisional",
      fixtureSnapshot:
        "d6-exact-retrieval-fixture/v0.1-provisional",
    };
    const requestRejection = runWithCapturedEvent(
      exactSliceInput({ parserResult: parserResult([]) }),
    );
    const exactMiss = runWithCapturedEvent(
      exactSliceInput({ candidateSnapshot: candidateSnapshot([]) }),
    );
    const admissionRejection = runWithCapturedEvent(
      exactSliceInput({ eligibilitySummaries: [] }),
    );
    const admitted = runWithCapturedEvent(exactSliceInput());

    expect(requestRejection.event).toEqual({
      eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
      eventSchemaVersion: "d6-discovery-events/v0.1-provisional",
      outcome: "REQUEST_NOT_APPLICABLE",
      marketCode: "KR",
      d5Versions,
      d6Versions,
      exactLookupAccountabilityKey: null,
      displayedStyleId: null,
      displayedVariantId: null,
    });
    expect(exactMiss.event).toEqual({
      eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
      eventSchemaVersion: "d6-discovery-events/v0.1-provisional",
      outcome: "EXACT_NOT_FOUND",
      marketCode: "KR",
      d5Versions,
      d6Versions,
      exactLookupAccountabilityKey: missKey,
      displayedStyleId: null,
      displayedVariantId: null,
    });
    expect(admissionRejection.event).toEqual({
      eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
      eventSchemaVersion: "d6-discovery-events/v0.1-provisional",
      outcome: "ADMISSION_REJECTED",
      marketCode: "KR",
      d5Versions,
      d6Versions,
      exactLookupAccountabilityKey: exactKey,
      displayedStyleId: null,
      displayedVariantId: null,
    });
    expect(admitted.event).toEqual({
      eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
      eventSchemaVersion: "d6-discovery-events/v0.1-provisional",
      outcome: "ADMITTED",
      marketCode: "KR",
      d5Versions,
      d6Versions,
      exactLookupAccountabilityKey: exactKey,
      displayedStyleId: "style-exact-001",
      displayedVariantId: "variant-exact-001",
    });

    for (const fixture of [
      requestRejection,
      exactMiss,
      admissionRejection,
      admitted,
    ]) {
      expect(fixture.run.eventDelivery).toEqual({
        status: "INJECTED_SINK_RETURNED",
      });
      const serialized = JSON.stringify(fixture.event);
      expect(serialized).not.toContain(
        "synthetic exact query",
      );
      for (const prohibitedField of [
        "rawQuery",
        "userId",
        "accountId",
        "sessionId",
        "address",
        "payment",
        "image",
      ]) {
        expect(fixture.event).not.toHaveProperty(prohibitedField);
      }
    }
  });
});
