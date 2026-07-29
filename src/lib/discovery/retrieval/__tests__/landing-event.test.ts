import { describe, expect, it } from "vitest";

import { runExactSkuFixtureSlice } from "../exact-slice";
import { verifyExactLanding } from "../landing";
import type {
  ExactLandingIntent,
  ExactSliceEventPayload,
} from "../types";
import {
  catalogProof,
  exactSliceInput,
} from "./fixtures/synthetic-fixtures";

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
      expect(run.landingVerification).toEqual({ status: "VERIFIED" });
    }
  });

  it("returns a visible mismatch without rewriting the intent", () => {
    const run = runExactSkuFixtureSlice(exactSliceInput());
    if (run.status !== "ADMITTED") {
      throw new TypeError("Synthetic exact run must be admitted");
    }
    const mismatchedIntent: ExactLandingIntent = {
      ...run.landingIntent,
      displayedStyleId: "style-mismatched",
    };
    const before = JSON.stringify(mismatchedIntent);

    expect(verifyExactLanding(mismatchedIntent, catalogProof())).toEqual({
      status: "LANDING_INTEGRITY_MISMATCH",
      reason: "LANDING_INTEGRITY_MISMATCH",
    });
    expect(JSON.stringify(mismatchedIntent)).toBe(before);
    expect(mismatchedIntent.displayedStyleId).toBe("style-mismatched");
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

  it("delivers only a sanitized provisional payload to an enabled memory sink", () => {
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
      status: "DELIVERED_TO_IN_MEMORY_SINK",
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      eventName: "D6_EXACT_SLICE_EVALUATED_PROVISIONAL",
      eventSchemaVersion: "d6-discovery-events/v0.1-provisional",
      outcome: "ADMITTED",
      marketCode: "KR",
      displayedStyleId: "style-exact-001",
      displayedVariantId: "variant-exact-001",
    });

    const serialized = JSON.stringify(received[0]);
    expect(serialized).not.toContain(input.parserResult.normalizedQuery.rawText);
    expect(serialized).not.toMatch(
      /user|account|session|address|payment|image/iu,
    );
  });
});
