import { describe, expect, it } from "vitest";

import { decideConstraint } from "../decide-constraint";
import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import {
  createAudienceNamespace,
  createDeclaredQueryLanguage,
  createLocaleCode,
  type DiscoveryContext,
  type FixtureProductConstraintDecisionTarget,
  type InterpretedConstraint,
  type ProductEvidenceFixture,
  type ProductEvidenceFixtureState,
  type QueryInterpretedConstraintDecisionTarget,
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

function fixtureTarget(
  constraint: InterpretedConstraint,
): FixtureProductConstraintDecisionTarget {
  return {
    kind: "INTERPRETED_CONSTRAINT",
    decisionLevel: "FIXTURE_PRODUCT",
    constraint,
  };
}

function queryTarget(
  constraint: InterpretedConstraint,
): QueryInterpretedConstraintDecisionTarget {
  return {
    kind: "INTERPRETED_CONSTRAINT",
    decisionLevel: "QUERY",
    constraint,
  };
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
        target: fixtureTarget(constraint),
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
      target: fixtureTarget(constraint),
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
      target: fixtureTarget(constraint),
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
      target: queryTarget(constraint),
      subject: { kind: "QUERY" },
      context: CONTEXT,
    });

    expect(decision.authorityOutcome).toEqual({
      kind: "PRESERVE_CALLER_CONTEXT",
      audienceNamespace: { value: "fixture:audience-current" },
    });
    if (decision.authorityOutcome.kind !== "PRESERVE_CALLER_CONTEXT") {
      throw new Error("Expected caller context preservation");
    }
    expect(decision.authorityOutcome.audienceNamespace).toBe(
      CONTEXT.audienceNamespace,
    );
    expect(decision.fallbackRoutes).toEqual(["AUDIENCE_SWITCH_OFFER"]);
  });

  it("matches canonical exact identity evidence for either raw query casing", () => {
    const evidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:canonical-sku",
      attributeId: "identity:sku",
      value: {
        kind: "EXACT_IDENTITY",
        namespace: "SKU",
        value: "SKU-EXACT-001",
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:canonical-sku",
    };

    for (const query of ["SKU-EXACT-001", "sku-exact-001"]) {
      const decision = decideConstraint({
        target: fixtureTarget(firstConstraint(query)),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
      });
      expect(decision).toMatchObject({
        gate: "ASSERT_MATCH",
        partition: "ASSERTED",
        reasons: [
          "EXACT_IDENTITY_MATCH",
          "EXACT_IDENTITY_NO_SUBSTITUTION",
        ],
      });
    }
  });

  it("explains an authoritative claim-bearing categorical mismatch", () => {
    const constraint = firstConstraint("human hair wig");
    const evidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:verified-synthetic-hair",
      attributeId: "material",
      value: {
        kind: "CATEGORICAL",
        valueId: "fixture:material:synthetic",
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:verified-synthetic-hair",
    };

    expect(
      decideConstraint({
        target: fixtureTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
      }),
    ).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "VIOLATING",
      reasons: ["EVIDENCE_QUALIFIED_MISMATCH"],
    });
  });

  it("explains an authoritative canonical exact-identity mismatch without substitution", () => {
    const constraint = firstConstraint("SKU-EXACT-001");
    const evidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:different-canonical-sku",
      attributeId: "identity:sku",
      value: {
        kind: "EXACT_IDENTITY",
        namespace: "SKU",
        value: "SKU-EXACT-002",
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:different-canonical-sku",
    };

    expect(
      decideConstraint({
        target: fixtureTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
      }),
    ).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "VIOLATING",
      fallbackRoutes: ["EXACT_IDENTITY_NOT_FOUND"],
      reasons: [
        "EXACT_IDENTITY_NO_SUBSTITUTION",
        "EVIDENCE_QUALIFIED_MISMATCH",
      ],
    });
  });

  it.each([
    "MISSING",
    "CONFLICTING",
    "MODEL_INFERRED",
    "NOT_REPRESENTABLE",
  ] satisfies readonly ProductEvidenceFixtureState[])(
    "does not label %s evidence as an evidence-qualified mismatch",
    (state) => {
      const constraint = firstConstraint("human hair wig");
      const evidence = materialEvidence(state);
      const decision = decideConstraint({
        target: fixtureTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
      });

      expect(decision.reasons).not.toContain(
        "EVIDENCE_QUALIFIED_MISMATCH",
      );
    },
  );

  it("rejects a contradiction decision for a fixture-product subject", () => {
    const contradiction = parse("인모 합성모").contradictions[0];
    if (contradiction === undefined) {
      throw new Error("Expected a contradiction fixture");
    }
    const invalidInput = {
      target: { kind: "CONTRADICTION", contradiction },
      subject: {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: "fixture:product:invalid",
      },
      context: CONTEXT,
    } as const;

    // @ts-expect-error Contradictions are query-level only.
    expect(() => decideConstraint(invalidInput)).toThrow(TypeError);
  });

  it("rejects query-only constraints for fixture-product subjects", () => {
    for (const query of ["humanoid wig", "항암 치료 중 쓸 가발"]) {
      const constraint = firstConstraint(query);
      const invalidInput = {
        target: queryTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:invalid",
        },
        context: CONTEXT,
        policies:
          constraint.value.kind === "OUTCOME_INTENT"
            ? [
                {
                  kind: "CLAIM_AUTHORITY",
                  synthetic: true,
                  status: "UNAVAILABLE",
                },
              ]
            : [],
      } as const;

      // @ts-expect-error Query targets cannot use fixture-product subjects.
      expect(() => decideConstraint(invalidInput)).toThrow(TypeError);
    }
  });

  it("rejects fixture-product constraints at query level", () => {
    for (const query of ["human hair wig", "SKU-EXACT-001"]) {
      const constraint = firstConstraint(query);
      expect(() =>
        decideConstraint({
          target: queryTarget(constraint),
          subject: { kind: "QUERY" },
          context: CONTEXT,
        }),
      ).toThrow(TypeError);
    }
  });

  it("rejects unimplemented profile, kind, and band combinations", () => {
    const stylisticConstraint: InterpretedConstraint = {
      constraintId: "constraint:stylistic",
      value: {
        kind: "CATEGORICAL",
        attributeId: "style",
        valueId: "fixture:style:bob",
      },
      source: {
        kind: "QUERY_SPAN",
        spanId: "span:stylistic",
        lexiconEntryId: "fixture:lexicon:style",
        identityRecognizerId: null,
      },
      interpretationState: "DERIVED",
      attributeBand: "STYLISTIC",
      decisionProfile: null,
    };
    const genericOutcome: InterpretedConstraint = {
      constraintId: "constraint:generic-outcome",
      value: {
        kind: "OUTCOME_INTENT",
        conceptId: "fixture:outcome:generic",
      },
      source: {
        kind: "QUERY_SPAN",
        spanId: "span:generic-outcome",
        lexiconEntryId: "fixture:lexicon:generic-outcome",
        identityRecognizerId: null,
      },
      interpretationState: "BRIDGED",
      attributeBand: "OUTCOME_INTENT",
      decisionProfile: null,
    };
    const exactWrongBand: InterpretedConstraint = {
      ...firstConstraint("SKU-EXACT-001"),
      attributeBand: "STYLISTIC",
    };
    const continuousWrongBand: InterpretedConstraint = {
      ...firstConstraint("12 inch wig"),
      attributeBand: "DIMENSIONAL_CATEGORICAL",
    };
    const resolvedUnsupported: InterpretedConstraint = {
      ...firstConstraint("시스루뱅 가발"),
      interpretationState: "DERIVED",
    };
    const unsupportedWrongBand: InterpretedConstraint = {
      ...firstConstraint("시스루뱅 가발"),
      attributeBand: "STRUCTURAL_FUNCTIONAL",
    };

    expect(() =>
      decideConstraint({
        target: fixtureTarget(stylisticConstraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:style",
        },
        context: CONTEXT,
        evidence: {
          fixtureOnly: true,
          synthetic: true,
          fixtureProductId: "fixture:product:style",
          attributeId: "style",
          value: { kind: "CATEGORICAL", valueId: "fixture:style:bob" },
          state: "VERIFIED_OR_MEASURED",
          syntheticEvidenceRef: "fixture:evidence:style",
        },
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: queryTarget(genericOutcome),
        subject: { kind: "QUERY" },
        context: CONTEXT,
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: fixtureTarget(exactWrongBand),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:exact",
        },
        context: CONTEXT,
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: fixtureTarget(continuousWrongBand),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:length",
        },
        context: CONTEXT,
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: fixtureTarget(resolvedUnsupported),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:unsupported",
        },
        context: CONTEXT,
        evidence: {
          fixtureOnly: true,
          synthetic: true,
          fixtureProductId: "fixture:product:unsupported",
          attributeId: "style",
          value: null,
          state: "NOT_REPRESENTABLE",
          syntheticEvidenceRef: null,
        },
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: queryTarget(unsupportedWrongBand),
        subject: { kind: "QUERY" },
        context: CONTEXT,
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: fixtureTarget(unsupportedWrongBand),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: "fixture:product:unsupported-wrong-band",
        },
        context: CONTEXT,
        evidence: {
          fixtureOnly: true,
          synthetic: true,
          fixtureProductId: "fixture:product:unsupported-wrong-band",
          attributeId: "style",
          value: null,
          state: "NOT_REPRESENTABLE",
          syntheticEvidenceRef: null,
        },
      }),
    ).toThrow(TypeError);
  });

  it("requires exactly one unavailable claim-authority fixture for sensitive use context", () => {
    const constraint = firstConstraint("항암 치료 중 쓸 가발");
    const baseInput = {
      target: queryTarget(constraint),
      subject: { kind: "QUERY" },
      context: CONTEXT,
    } satisfies Parameters<typeof decideConstraint>[0];
    const unavailablePolicy = {
      kind: "CLAIM_AUTHORITY",
      synthetic: true,
      status: "UNAVAILABLE",
    } as const;

    expect(() => decideConstraint(baseInput)).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        ...baseInput,
        policies: [unavailablePolicy, unavailablePolicy],
      }),
    ).toThrow(TypeError);
    expect(
      decideConstraint({ ...baseInput, policies: [unavailablePolicy] }),
    ).toMatchObject({
      authorityOutcome: { kind: "OUTSIDE_DISCOVERY_AUTHORITY" },
      gate: "ROUTE_ONLY",
      reasons: ["CLAIM_AUTHORITY_UNAVAILABLE_ROUTE"],
    });
  });

  it("rejects claim-authority policy on unrelated profiles", () => {
    const constraint = firstConstraint("human hair wig");
    const evidence = materialEvidence("VERIFIED_OR_MEASURED");

    expect(() =>
      decideConstraint({
        target: fixtureTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
        policies: [
          {
            kind: "CLAIM_AUTHORITY",
            synthetic: true,
            status: "UNAVAILABLE",
          },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("rejects duplicate synthetic policies by semantic key", () => {
    const material = firstConstraint("human hair wig");
    const materialFixture = materialEvidence("APPROVED_VENDOR_ATTESTED");
    const length = firstConstraint("12 inch wig");
    const lengthEvidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:length-policy",
      attributeId: "hair-length",
      value: {
        kind: "MEASURED_QUANTITY",
        quantity: { value: 12, unitId: "inch" },
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:length-policy",
    };
    const vendorPolicy = {
      kind: "VENDOR_ATTESTATION",
      synthetic: true,
      permitted: true,
      policyVersion: "fixture:policy:vendor/v0",
    } as const;
    const tolerancePolicy = {
      kind: "CONTINUOUS_TOLERANCE",
      synthetic: true,
      dimensionId: "hair-length",
      unitId: "inch",
      lowerDelta: 0,
      upperDelta: 0,
      policyVersion: "fixture:policy:length/v0",
    } as const;

    expect(() =>
      decideConstraint({
        target: fixtureTarget(material),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: materialFixture.fixtureProductId,
        },
        context: CONTEXT,
        evidence: materialFixture,
        policies: [vendorPolicy, vendorPolicy],
      }),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint({
        target: fixtureTarget(length),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: lengthEvidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence: lengthEvidence,
        policies: [tolerancePolicy, tolerancePolicy],
      }),
    ).toThrow(TypeError);

    const differentKeyPolicy = {
      kind: "CONTINUOUS_TOLERANCE",
      synthetic: true,
      dimensionId: "cap-size",
      unitId: "cm",
      lowerDelta: 0,
      upperDelta: 0,
      policyVersion: "fixture:policy:cap-size/v0",
    } as const;
    const baseInput = {
      target: fixtureTarget(length),
      subject: {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: lengthEvidence.fixtureProductId,
      },
      context: CONTEXT,
      evidence: lengthEvidence,
    } satisfies Parameters<typeof decideConstraint>[0];
    const forward = decideConstraint({
      ...baseInput,
      policies: [tolerancePolicy, differentKeyPolicy],
    });
    const reverse = decideConstraint({
      ...baseInput,
      policies: [differentKeyPolicy, tolerancePolicy],
    });

    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({
      gate: "ASSERT_MATCH",
      partition: "ASSERTED",
    });
  });

  it.each([
    [11.49, "VIOLATING", "CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE"],
    [13.01, "VIOLATING", "CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE"],
    [11.5, "ASSERTED", "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE"],
    [13, "ASSERTED", "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE"],
  ] as const)(
    "explains continuous evidence value %s against the synthetic tolerance",
    (evidenceValue, partition, reason) => {
      const constraint = firstConstraint("12 inch wig");
      const evidence: ProductEvidenceFixture = {
        fixtureOnly: true,
        synthetic: true,
        fixtureProductId: `fixture:product:length:${evidenceValue}`,
        attributeId: "hair-length",
        value: {
          kind: "MEASURED_QUANTITY",
          quantity: { value: evidenceValue, unitId: "inch" },
        },
        state: "VERIFIED_OR_MEASURED",
        syntheticEvidenceRef: "fixture:evidence:length-boundary",
      };
      const input = {
        target: fixtureTarget(constraint),
        subject: {
          kind: "FIXTURE_PRODUCT",
          fixtureProductId: evidence.fixtureProductId,
        },
        context: CONTEXT,
        evidence,
        policies: [
          {
            kind: "CONTINUOUS_TOLERANCE",
            synthetic: true,
            dimensionId: "hair-length",
            unitId: "inch",
            lowerDelta: 0.5,
            upperDelta: 1,
            policyVersion: "fixture:policy:length-boundary/v0",
          },
        ],
      } satisfies Parameters<typeof decideConstraint>[0];
      const first = decideConstraint(input);
      const second = decideConstraint(input);

      expect(first).toEqual(second);
      expect(first.partition).toBe(partition);
      expect(first.reasons).toEqual([reason]);
      expect(first.diagnostics).toEqual(["SYNTHETIC_TOLERANCE_APPLIED"]);
    },
  );

  it("keeps unit mismatch and missing tolerance distinct from out-of-tolerance", () => {
    const constraint = firstConstraint("12 inch wig");
    const evidence: ProductEvidenceFixture = {
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:length-unit-mismatch",
      attributeId: "hair-length",
      value: {
        kind: "MEASURED_QUANTITY",
        quantity: { value: 12, unitId: "cm" },
      },
      state: "VERIFIED_OR_MEASURED",
      syntheticEvidenceRef: "fixture:evidence:length-unit-mismatch",
    };
    const baseInput = {
      target: fixtureTarget(constraint),
      subject: {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: evidence.fixtureProductId,
      },
      context: CONTEXT,
      evidence,
    } satisfies Parameters<typeof decideConstraint>[0];

    expect(decideConstraint(baseInput).reasons).toEqual([
      "SYNTHETIC_TOLERANCE_REQUIRED",
    ]);
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
      }).reasons,
    ).toEqual(["SYNTHETIC_TOLERANCE_REQUIRED"]);
  });

  it("deduplicates plural axes deterministically and does not mutate inputs", () => {
    const constraint = firstConstraint("항암 치료 중 쓸 가발");
    const input = {
      target: queryTarget(constraint),
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

  it("does not mutate frozen context, evidence, or synthetic policy inputs", () => {
    const constraint = Object.freeze({
      ...firstConstraint("human hair wig"),
      value: Object.freeze({
        kind: "CATEGORICAL" as const,
        attributeId: "material",
        valueId: "fixture:material:human-hair",
      }),
      source: Object.freeze({
        kind: "QUERY_SPAN" as const,
        spanId: "span:frozen",
        lexiconEntryId: "fixture:lexicon:material-human-en-long",
        identityRecognizerId: null,
      }),
    });
    const target = Object.freeze(fixtureTarget(constraint));
    const queryLanguage = createDeclaredQueryLanguage("en");
    if (queryLanguage.mode !== "DECLARED") {
      throw new Error("Expected declared query language");
    }
    Object.freeze(queryLanguage.languageTag);
    Object.freeze(queryLanguage);
    const context: DiscoveryContext = Object.freeze({
      marketCode: "US",
      locale: Object.freeze(createLocaleCode("en-US")),
      queryLanguage,
      audienceNamespace: Object.freeze(
        createAudienceNamespace("fixture:audience-frozen"),
      ),
    });
    const evidence = Object.freeze({
      fixtureOnly: true,
      synthetic: true,
      fixtureProductId: "fixture:product:frozen",
      attributeId: "material",
      value: Object.freeze({
        kind: "CATEGORICAL" as const,
        valueId: "fixture:material:human-hair",
      }),
      state: "APPROVED_VENDOR_ATTESTED" as const,
      syntheticEvidenceRef: "fixture:evidence:frozen",
    });
    const policy = Object.freeze({
      kind: "VENDOR_ATTESTATION" as const,
      synthetic: true,
      permitted: true,
      policyVersion: "fixture:policy:frozen/v0",
    });
    const input = Object.freeze({
      target,
      subject: Object.freeze({
        kind: "FIXTURE_PRODUCT" as const,
        fixtureProductId: evidence.fixtureProductId,
      }),
      context,
      evidence,
      policies: Object.freeze([policy]),
    }) satisfies Parameters<typeof decideConstraint>[0];

    const first = decideConstraint(input);
    const second = decideConstraint(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      gate: "ASSERT_MATCH",
      partition: "ASSERTED",
      diagnostics: ["SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED"],
    });
  });
});
