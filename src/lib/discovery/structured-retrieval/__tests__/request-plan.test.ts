import { describe, expect, it } from "vitest";

import type { InterpretedConstraint } from "../../types";
import { buildStructuredRequestPlan } from "../request-plan";
import {
  categoricalPolicy,
  COLOR_ATTRIBUTE_ID,
  governedConstraint,
  parserResult,
  syntheticContext,
  TEXTURE_ATTRIBUTE_ID,
} from "./fixtures";

function exactConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:exact",
    value: {
      kind: "EXACT_IDENTITY",
      namespace: "SKU",
      value: "fixture:sku:one",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:exact",
      lexiconEntryId: null,
      identityRecognizerId: "fixture:sku-recognizer",
    },
    interpretationState: "DECLARED",
    attributeBand: "IDENTITY",
    decisionProfile: null,
  };
}

function continuousConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:length",
    value: {
      kind: "CONTINUOUS",
      dimensionId: "fixture:length",
      quantity: { value: 12, unitId: "fixture:inch" },
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:length",
      lexiconEntryId: "fixture:lexicon:length",
      identityRecognizerId: null,
    },
    interpretationState: "DECLARED",
    attributeBand: "DIMENSIONAL_CONTINUOUS",
    decisionProfile: null,
  };
}

function outcomeConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:outcome",
    value: {
      kind: "OUTCOME_INTENT",
      conceptId: "fixture:outcome:comfortable",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:outcome",
      lexiconEntryId: "fixture:lexicon:outcome",
      identityRecognizerId: null,
    },
    interpretationState: "DECLARED",
    attributeBand: "OUTCOME_INTENT",
    decisionProfile: "SENSITIVE_USE_CONTEXT",
  };
}

function routeConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:route",
    value: {
      kind: "AUTHORITY_ROUTE",
      conceptId: "fixture:audience:other",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:route",
      lexiconEntryId: "fixture:lexicon:route",
      identityRecognizerId: null,
    },
    interpretationState: "DECLARED",
    attributeBand: "AUTHORITY_ROUTE",
    decisionProfile: null,
  };
}

function unsupportedConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:unsupported",
    value: {
      kind: "UNKNOWN_OR_UNSUPPORTED",
      conceptId: "fixture:unsupported",
      state: "UNSUPPORTED",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:unsupported",
      lexiconEntryId: "fixture:lexicon:unsupported",
      identityRecognizerId: null,
    },
    interpretationState: "UNRESOLVED",
    attributeBand: "STYLISTIC",
    decisionProfile: null,
  };
}

function claimConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:material",
    value: {
      kind: "CATEGORICAL",
      attributeId: "fixture:claim:material",
      valueId: "fixture:material:human",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:material",
      lexiconEntryId: "fixture:lexicon:material",
      identityRecognizerId: null,
    },
    interpretationState: "DECLARED",
    attributeBand: "CLAIM_BEARING",
    decisionProfile: "CLAIM_BEARING_MATERIAL",
  };
}

describe("D6-B1 structured request plan", () => {
  it.each([
    {
      name: "color",
      constraints: [governedConstraint(COLOR_ATTRIBUTE_ID)],
    },
    {
      name: "texture",
      constraints: [governedConstraint(TEXTURE_ATTRIBUTE_ID)],
    },
    {
      name: "compatible pair",
      constraints: [
        governedConstraint(TEXTURE_ATTRIBUTE_ID),
        governedConstraint(COLOR_ATTRIBUTE_ID),
      ],
    },
    {
      name: "confirmed declared color",
      constraints: [
        governedConstraint(COLOR_ATTRIBUTE_ID, { confirmed: true }),
      ],
    },
  ])("accepts $name and preserves exact D5 required decisions", ({ constraints }) => {
    const plan = buildStructuredRequestPlan(
      parserResult(constraints),
      syntheticContext(),
      constraints.map((constraint) => categoricalPolicy(constraint)),
    );

    expect(plan.status).toBe("APPLICABLE");
    if (plan.status === "APPLICABLE") {
      expect(plan.constraints).toHaveLength(constraints.length);
      expect(plan.queryDecisions).toHaveLength(constraints.length);
      for (const decision of plan.queryDecisions) {
        expect(decision).toMatchObject({
          subject: { kind: "QUERY" },
          authorityOutcome: { kind: "NOT_APPLICABLE" },
          gate: "REQUIRE_MATCH",
          score: "NONE",
          speechRequirements: ["NO_PRODUCT_ASSERTION"],
          partition: "NOT_APPLICABLE",
          relaxation: "NEVER",
          fallbackRoutes: [],
          diagnostics: [],
        });
        expect(Object.keys(decision)).toHaveLength(11);
      }
    }
  });

  it.each([
    { name: "zero constraints", constraints: [] },
    {
      name: "more than two constraints",
      constraints: [
        governedConstraint(COLOR_ATTRIBUTE_ID),
        governedConstraint(TEXTURE_ATTRIBUTE_ID),
        exactConstraint(),
      ],
    },
    { name: "exact", constraints: [exactConstraint()] },
    {
      name: "mixed exact plus structured",
      constraints: [
        exactConstraint(),
        governedConstraint(COLOR_ATTRIBUTE_ID),
      ],
    },
    { name: "continuous", constraints: [continuousConstraint()] },
    { name: "claim-bearing", constraints: [claimConstraint()] },
    { name: "outcome", constraints: [outcomeConstraint()] },
    { name: "authority route", constraints: [routeConstraint()] },
    { name: "unsupported", constraints: [unsupportedConstraint()] },
  ])("rejects $name outside the whole-request predicate", ({ constraints }) => {
    const policies = constraints
      .filter(
        (
          constraint,
        ): constraint is ReturnType<typeof governedConstraint> =>
          constraint.value.kind === "CATEGORICAL" &&
          (constraint.value.attributeId === COLOR_ATTRIBUTE_ID ||
            constraint.value.attributeId === TEXTURE_ATTRIBUTE_ID),
      )
      .map((constraint) => categoricalPolicy(constraint));

    expect(
      buildStructuredRequestPlan(
        parserResult(constraints),
        syntheticContext(),
        policies,
      ).status,
    ).toBe("REQUEST_REJECTED");
  });

  it("rejects derived governed input and malformed query-span provenance", () => {
    const constraint = governedConstraint();
    const derived: InterpretedConstraint = {
      ...constraint,
      interpretationState: "DERIVED",
    };
    const malformedSpan = parserResult([constraint], { spans: [] });

    expect(
      buildStructuredRequestPlan(
        parserResult([derived]),
        syntheticContext(),
        [categoricalPolicy(constraint)],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "OUTSIDE_GOVERNED_CATEGORICAL_SLICE",
    });
    expect(
      buildStructuredRequestPlan(
        malformedSpan,
        syntheticContext(),
        [categoricalPolicy(constraint)],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "INVALID_CONSTRAINT_SOURCE",
    });
  });

  it.each([
    "PREFERENCE",
    "ROUTE",
    "CLARIFICATION",
    "UNSUPPORTED",
  ] satisfies readonly Parameters<typeof categoricalPolicy>[1][])(
    "rejects non-required %s policy before Stage 0",
    (disposition) => {
      const constraint = governedConstraint();
      expect(
        buildStructuredRequestPlan(
          parserResult([constraint]),
          syntheticContext(),
          [categoricalPolicy(constraint, disposition)],
        ),
      ).toMatchObject({
        status: "REQUEST_REJECTED",
        reason: "NON_REQUIRED_POLICY",
      });
    },
  );

  it("rejects missing, duplicate, orphan, wrong-target, and wrong-attribute policies", () => {
    const color = governedConstraint(COLOR_ATTRIBUTE_ID);
    const texture = governedConstraint(TEXTURE_ATTRIBUTE_ID);
    const baseline = parserResult([color, texture]);
    const cases = [
      [categoricalPolicy(color)],
      [categoricalPolicy(color), categoricalPolicy(color)],
      [
        categoricalPolicy(color),
        categoricalPolicy(texture, "REQUIRED", {
          targetConstraintId: "constraint:orphan",
        }),
      ],
      [
        categoricalPolicy(color, "REQUIRED", {
          targetConstraintId: texture.constraintId,
        }),
        categoricalPolicy(texture),
      ],
      [
        categoricalPolicy(color, "REQUIRED", {
          attributeId: TEXTURE_ATTRIBUTE_ID,
        }),
        categoricalPolicy(texture),
      ],
    ];

    for (const policies of cases) {
      expect(
        buildStructuredRequestPlan(
          baseline,
          syntheticContext(),
          policies,
        ).status,
      ).toBe("REQUEST_REJECTED");
    }
  });

  it("rejects runtime-invalid policy markers and incompatible D5 attribution", () => {
    const constraint = governedConstraint();
    const policy = categoricalPolicy(constraint);
    Object.defineProperty(policy, "fixtureOnly", { value: false });

    expect(
      buildStructuredRequestPlan(
        parserResult([constraint]),
        syntheticContext(),
        [policy],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "POLICY_PROVENANCE_INVALID",
    });
    expect(
      buildStructuredRequestPlan(
        parserResult([constraint], {
          parserVersion: "d5-incompatible-parser/v9",
        }),
        syntheticContext(),
        [categoricalPolicy(constraint)],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "INCOMPATIBLE_D5_PARSER_VERSION",
    });
  });

  it("rejects duplicate governed attributes and affecting contradictions", () => {
    const first = governedConstraint(COLOR_ATTRIBUTE_ID);
    const second = governedConstraint(COLOR_ATTRIBUTE_ID, {
      constraintId: "constraint:color:second",
      valueId: "fixture:color-family:light",
    });

    expect(
      buildStructuredRequestPlan(
        parserResult([first, second]),
        syntheticContext(),
        [categoricalPolicy(first), categoricalPolicy(second)],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "DUPLICATE_GOVERNED_ATTRIBUTE",
    });
    expect(
      buildStructuredRequestPlan(
        parserResult([first, second], {
          contradictions: [
            {
              constraintId: "contradiction:color",
              leftConstraintId: first.constraintId,
              rightConstraintId: second.constraintId,
              attributeId: COLOR_ATTRIBUTE_ID,
              kind: "MUTUALLY_EXCLUSIVE_VALUES",
            },
          ],
        }),
        syntheticContext(),
        [categoricalPolicy(first), categoricalPolicy(second)],
      ),
    ).toMatchObject({
      status: "REQUEST_REJECTED",
      reason: "AFFECTING_CONTRADICTION",
    });
  });
});
