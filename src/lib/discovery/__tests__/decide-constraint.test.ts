import { describe, expect, it } from "vitest";

import { decideConstraint } from "../decide-constraint";
import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import {
  createAudienceNamespace,
  createDeclaredQueryLanguage,
  createLocaleCode,
  type ConstraintDecisionTarget,
  type DiscoveryContext,
  type InterpretedConstraint,
  type ProductEvidenceFixture,
  type ProductEvidenceFixtureState,
} from "../types";
import { TEST_IDENTITY_RECOGNIZERS } from "./fixtures/test-identity-recognizers";
import { TEST_QUERY_LEXICON } from "./fixtures/test-lexicon";

const CONTEXT: DiscoveryContext = {
  marketCode: "US",
  locale: createLocaleCode("en-US"),
  queryLanguage: createDeclaredQueryLanguage("en"),
  audienceNamespace: createAudienceNamespace("fixture:audience-current"),
};

function parse(text: string) {
  return parseQuery({
    normalizedQuery: normalizeQuery({ text }),
    lexicon: TEST_QUERY_LEXICON,
    identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
  });
}

function firstConstraint(text: string): InterpretedConstraint {
  const constraint = parse(text).constraints[0];
  if (constraint === undefined) {
    throw new Error(`Expected a constraint for fixture query: ${text}`);
  }
  return constraint;
}

function target(constraint: InterpretedConstraint): ConstraintDecisionTarget {
  return { kind: "INTERPRETED_CONSTRAINT", constraint };
}

function materialEvidence(
  state: ProductEvidenceFixtureState,
): ProductEvidenceFixture {
  const noValue =
    state === "MISSING" ||
    state === "CONFLICTING" ||
    state === "NOT_REPRESENTABLE";

  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureProductId: `fixture:product:state:${state.toLowerCase()}`,
    attributeId: "material",
    value: noValue
      ? null
      : {
          kind: "CATEGORICAL",
          valueId: "fixture:material:human-hair",
        },
    state,
    syntheticEvidenceRef: noValue ? null : `fixture:evidence:${state.toLowerCase()}`,
  };
}

describe("decideConstraint", () => {
  it.each([
    ["VERIFIED_OR_MEASURED", "ASSERT_MATCH", "ASSERTED"],
    ["APPROVED_VENDOR_ATTESTED", "DO_NOT_GATE", "UNKNOWN"],
    ["UNAPPROVED_VENDOR_DECLARATION", "DO_NOT_GATE", "UNKNOWN"],
    ["HUMAN_CURATED_FROM_EVIDENCE", "ASSERT_MATCH", "ASSERTED"],
    ["MODEL_INFERRED", "DO_NOT_GATE", "UNKNOWN"],
    ["MISSING", "DO_NOT_GATE", "UNKNOWN"],
    ["CONFLICTING", "DO_NOT_GATE", "WITHHELD"],
    ["NOT_REPRESENTABLE", "UNSUPPORTED", "UNKNOWN"],
    ["UNKNOWN_AUTHORITY", "DO_NOT_GATE", "UNKNOWN"],
  ] satisfies ReadonlyArray<
    readonly [ProductEvidenceFixtureState, string, string]
  >)(
    "fails closed for %s evidence",
    (state, expectedGate, expectedPartition) => {
      const constraint = firstConstraint("human hair wig");
      const evidence = materialEvidence(state);
      const decision = decideConstraint({
        target: target(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
      });

      expect(decision.gate).toBe(expectedGate);
      expect(decision.partition).toBe(expectedPartition);
      if (state === "MODEL_INFERRED") {
        expect(decision.score).toBe("NONE");
        expect(decision.speechRequirements).toContain("NO_PRODUCT_ASSERTION");
        expect(decision.reasons).toContain(
          "MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY",
        );
      }
    },
  );

  it("uses approved vendor attestation only with an explicit synthetic policy", () => {
    const constraint = firstConstraint("human hair wig");
    const evidence = materialEvidence("APPROVED_VENDOR_ATTESTED");
    const decision = decideConstraint({
      target: target(constraint),
      subject: {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: evidence.fixtureProductId,
      },
      context: CONTEXT,
      evidence,
      policies: [
        {
          kind: "VENDOR_ATTESTATION",
          synthetic: true,
          permitted: true,
          policyVersion: "fixture:policy:vendor-attestation/v0",
        },
      ],
    });

    expect(decision).toMatchObject({
      gate: "ASSERT_MATCH",
      partition: "ASSERTED",
      diagnostics: ["SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED"],
    });
  });

  it("does not inspect product evidence when deciding a query contradiction", () => {
    const result = parse("인모 합성모");
    const contradiction = result.contradictions[0];
    if (contradiction === undefined) {
      throw new Error("Expected a contradiction fixture");
    }

    const unreadableEvidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:must-not-be-read",
      attributeId: "material",
      value: null,
      get state(): ProductEvidenceFixtureState {
        throw new Error("Product evidence was evaluated");
      },
      syntheticEvidenceRef: null,
    };

    expect(() =>
      decideConstraint({
        target: { kind: "CONTRADICTION", contradiction },
        subject: { kind: "QUERY" },
        context: CONTEXT,
        evidence: unreadableEvidence,
      }),
    ).not.toThrow();
  });

  it("requires explicit synthetic tolerance before asserting continuous evidence", () => {
    const constraint = firstConstraint("12 inch wig");
    const evidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:length",
      attributeId: "hair-length",
      value: {
        kind: "MEASURED_QUANTITY",
        quantity: { value: 12, unitId: "inch" },
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:length",
    };
    const baseInput = {
      target: target(constraint),
      subject: {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: evidence.fixtureProductId,
      },
      context: CONTEXT,
      evidence,
    } satisfies Parameters<typeof decideConstraint>[0];

    expect(decideConstraint(baseInput)).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "UNKNOWN",
      reasons: ["SYNTHETIC_TOLERANCE_REQUIRED"],
    });
    expect(
      decideConstraint({
        ...baseInput,
        policies: [
          {
            kind: "CONTINUOUS_TOLERANCE",
            synthetic: true,
            dimensionId: "hair-length",
            unitId: "inch",
            lowerDelta: 0,
            upperDelta: 0,
            policyVersion: "fixture:policy:length/v0",
          },
        ],
      }),
    ).toMatchObject({
      gate: "ASSERT_MATCH",
      score: "PREFERENCE_ALLOWED",
      partition: "ASSERTED",
    });
  });

  it("preserves the opaque caller audience and never derives it from query text", () => {
    const constraint = firstConstraint("humanoid wig");
    const decision = decideConstraint({
      target: target(constraint),
      subject: { kind: "QUERY" },
      context: CONTEXT,
    });

    expect(decision.authorityOutcome).toEqual({
      kind: "PRESERVE_CALLER_CONTEXT",
      audienceNamespace: { value: "fixture:audience-current" },
    });
    expect(decision.fallbackRoutes).toEqual(["AUDIENCE_SWITCH_OFFER"]);
  });

  it("deduplicates plural axes deterministically and does not mutate inputs", () => {
    const constraint = firstConstraint("항암 치료 중 쓸 가발");
    const input = {
      target: target(constraint),
      subject: { kind: "QUERY" },
      context: CONTEXT,
      policies: [
        {
          kind: "CLAIM_AUTHORITY",
          synthetic: true,
          status: "UNAVAILABLE",
        },
      ],
    } satisfies Parameters<typeof decideConstraint>[0];
    const before = JSON.stringify(input);
    const first = decideConstraint(input);
    const second = decideConstraint(input);

    expect(first).toEqual(second);
    expect(new Set(first.speechRequirements).size).toBe(
      first.speechRequirements.length,
    );
    expect(new Set(first.fallbackRoutes).size).toBe(first.fallbackRoutes.length);
    expect(new Set(first.reasons).size).toBe(first.reasons.length);
    expect(JSON.stringify(input)).toBe(before);
  });
});
