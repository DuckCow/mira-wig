import { describe, expect, it } from "vitest";

import { decideConstraint } from "../decide-constraint";
import type {
  CategoricalPolicyDisposition,
  CategoricalPolicyFixture,
  ConstraintDecision,
  DecideConstraintInput,
  InterpretedConstraint,
  ProductEvidenceFixture,
  ProductEvidenceFixtureState,
} from "../types";
import {
  createAudienceNamespace,
  createAutoQueryLanguage,
  createLocaleCode,
} from "../types";

const CONSTRAINT_ID = "constraint:style-shape";
const ATTRIBUTE_ID = "style:shape";
const REQUESTED_VALUE_ID = "style:bob";
const PRODUCT_ID = "fixture-product:one";
const POLICY_VERSION = "fixture:categorical-policy/v0.1-provisional";

const context = {
  marketCode: "KR",
  locale: createLocaleCode("ko-KR"),
  queryLanguage: createAutoQueryLanguage(),
  audienceNamespace: createAudienceNamespace("HUMAN"),
} as const;

function categoricalConstraint(
  options: {
    readonly constraintId?: string;
    readonly attributeId?: string;
    readonly confirmed?: boolean;
    readonly priorConstraintId?: string;
  } = {},
): InterpretedConstraint {
  const constraintId = options.constraintId ?? CONSTRAINT_ID;
  return {
    constraintId,
    value: {
      kind: "CATEGORICAL",
      attributeId: options.attributeId ?? ATTRIBUTE_ID,
      valueId: REQUESTED_VALUE_ID,
    },
    source:
      options.confirmed === true
        ? {
            kind: "USER_CONFIRMATION",
            priorConstraintId: options.priorConstraintId ?? constraintId,
          }
        : {
            kind: "QUERY_SPAN",
            spanId: "span:style-shape",
            lexiconEntryId: "fixture:style-shape",
            identityRecognizerId: null,
          },
    interpretationState: "DECLARED",
    attributeBand: "STYLISTIC",
    decisionProfile: "GOVERNED_STYLISTIC_CATEGORICAL",
  };
}

function setRuntimeValue<T extends object>(
  target: T,
  property: keyof T,
  value: unknown,
): T {
  Object.defineProperty(target, property, { value });
  return target;
}

function categoricalPolicy(
  disposition: CategoricalPolicyDisposition,
  overrides: Partial<CategoricalPolicyFixture> = {},
): CategoricalPolicyFixture {
  return {
    kind: "CATEGORICAL_POLICY",
    fixtureOnly: true,
    synthetic: true,
    targetConstraintId: CONSTRAINT_ID,
    attributeId: ATTRIBUTE_ID,
    disposition,
    policyVersion: POLICY_VERSION,
    ...overrides,
  };
}

function queryInput(
  disposition: CategoricalPolicyDisposition,
  options: {
    readonly constraint?: InterpretedConstraint;
    readonly policies?: readonly CategoricalPolicyFixture[];
  } = {},
): DecideConstraintInput {
  return {
    target: {
      kind: "INTERPRETED_CONSTRAINT",
      decisionLevel: "QUERY",
      constraint: options.constraint ?? categoricalConstraint(),
    },
    subject: { kind: "QUERY" },
    context,
    policies: options.policies ?? [categoricalPolicy(disposition)],
  };
}

function categoricalEvidence(
  state: ProductEvidenceFixtureState,
  overrides: Partial<ProductEvidenceFixture> = {},
): ProductEvidenceFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureProductId: PRODUCT_ID,
    attributeId: ATTRIBUTE_ID,
    value: { kind: "CATEGORICAL", valueId: REQUESTED_VALUE_ID },
    state,
    syntheticEvidenceRef: "fixture:evidence:style-shape",
    ...overrides,
  };
}

function productInput(
  disposition: CategoricalPolicyDisposition,
  evidence?: ProductEvidenceFixture,
  options: {
    readonly constraint?: InterpretedConstraint;
    readonly policies?: readonly CategoricalPolicyFixture[];
  } = {},
): DecideConstraintInput {
  return {
    target: {
      kind: "INTERPRETED_CONSTRAINT",
      decisionLevel: "FIXTURE_PRODUCT",
      constraint: options.constraint ?? categoricalConstraint(),
    },
    subject: { kind: "FIXTURE_PRODUCT", fixtureProductId: PRODUCT_ID },
    context,
    policies: options.policies ?? [categoricalPolicy(disposition)],
    ...(evidence === undefined ? {} : { evidence }),
  };
}

const QUERY_CASES = [
  {
    disposition: "REQUIRED",
    expected: {
      authorityOutcome: { kind: "NOT_APPLICABLE" },
      gate: "REQUIRE_MATCH",
      score: "NONE",
      speechRequirements: ["NO_PRODUCT_ASSERTION"],
      partition: "NOT_APPLICABLE",
      relaxation: "NEVER",
      fallbackRoutes: [],
      reasons: ["CATEGORICAL_REQUIRED_BY_POLICY"],
      diagnostics: [],
    },
  },
  {
    disposition: "PREFERENCE",
    expected: {
      authorityOutcome: { kind: "NOT_APPLICABLE" },
      gate: "DO_NOT_GATE",
      score: "PREFERENCE_ALLOWED",
      speechRequirements: ["NO_PRODUCT_ASSERTION"],
      partition: "NOT_APPLICABLE",
      relaxation: "NOT_APPLICABLE",
      fallbackRoutes: [],
      reasons: ["CATEGORICAL_PREFERENCE_BY_POLICY"],
      diagnostics: [],
    },
  },
  {
    disposition: "ROUTE",
    expected: {
      authorityOutcome: { kind: "OUTSIDE_DISCOVERY_AUTHORITY" },
      gate: "ROUTE_ONLY",
      score: "NONE",
      speechRequirements: [
        "NO_PRODUCT_ASSERTION",
        "DISCLOSE_ROUTE_LIMITATION",
      ],
      partition: "NOT_APPLICABLE",
      relaxation: "NOT_APPLICABLE",
      fallbackRoutes: ["EDUCATION_OR_CONSULTATION"],
      reasons: ["CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE"],
      diagnostics: [],
    },
  },
  {
    disposition: "CLARIFICATION",
    expected: {
      authorityOutcome: { kind: "NOT_APPLICABLE" },
      gate: "REQUIRE_CLARIFICATION",
      score: "NONE",
      speechRequirements: [
        "NO_PRODUCT_ASSERTION",
        "DISCLOSE_ROUTE_LIMITATION",
      ],
      partition: "NOT_APPLICABLE",
      relaxation: "NOT_APPLICABLE",
      fallbackRoutes: ["CLARIFICATION"],
      reasons: ["CATEGORICAL_CLARIFICATION_REQUIRED"],
      diagnostics: [],
    },
  },
  {
    disposition: "UNSUPPORTED",
    expected: {
      authorityOutcome: { kind: "NOT_APPLICABLE" },
      gate: "UNSUPPORTED",
      score: "NONE",
      speechRequirements: [
        "NO_PRODUCT_ASSERTION",
        "DISCLOSE_ROUTE_LIMITATION",
      ],
      partition: "UNKNOWN",
      relaxation: "NOT_APPLICABLE",
      fallbackRoutes: ["EXPLICIT_UNSUPPORTED"],
      reasons: ["CATEGORICAL_UNSUPPORTED_BY_POLICY"],
      diagnostics: [],
    },
  },
] as const satisfies readonly {
  readonly disposition: CategoricalPolicyDisposition;
  readonly expected: Omit<ConstraintDecision, "constraintId" | "subject">;
}[];

describe("D5-S1 query categorical policy", () => {
  it.each(QUERY_CASES)(
    "returns the contracted $disposition tuple",
    ({ disposition, expected }) => {
      expect(decideConstraint(queryInput(disposition))).toEqual({
        constraintId: CONSTRAINT_ID,
        subject: { kind: "QUERY" },
        ...expected,
      });
    },
  );

  it("keeps required query intent distinct from product assertion", () => {
    const decision = decideConstraint(queryInput("REQUIRED"));

    expect(decision.gate).toBe("REQUIRE_MATCH");
    expect(decision.gate).not.toBe("ASSERT_MATCH");
    expect(decision.partition).toBe("NOT_APPLICABLE");
  });

  it("rejects out-of-scope categorical state, band, and profile combinations", () => {
    const baseline = categoricalConstraint();
    for (const constraint of [
      { ...baseline, interpretationState: "DERIVED" as const },
      { ...baseline, attributeBand: "CLAIM_BEARING" as const },
      { ...baseline, decisionProfile: "CLAIM_BEARING_MATERIAL" as const },
      { ...baseline, decisionProfile: null },
    ]) {
      expect(() =>
        decideConstraint(queryInput("REQUIRED", { constraint })),
      ).toThrow(TypeError);
    }
  });

  it("adds confirmation attribution without changing policy disposition", () => {
    const decision = decideConstraint(
      queryInput("REQUIRED", {
        constraint: categoricalConstraint({ confirmed: true }),
      }),
    );

    expect(decision).toMatchObject({
      gate: "REQUIRE_MATCH",
      relaxation: "NEVER",
      reasons: [
        "CONFIRMATION_CHANGED_INTENT_ONLY",
        "CATEGORICAL_REQUIRED_BY_POLICY",
      ],
    });
  });

  it("rejects a confirmation for a different request-local constraint", () => {
    expect(() =>
      decideConstraint(
        queryInput("REQUIRED", {
          constraint: categoricalConstraint({
            confirmed: true,
            priorConstraintId: "constraint:prior",
          }),
        }),
      ),
    ).toThrow(TypeError);
  });
});

describe("D5-S1 request-local categorical policy validation", () => {
  it("rejects missing, duplicate, and conflicting policies", () => {
    expect(() =>
      decideConstraint(queryInput("REQUIRED", { policies: [] })),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint(
        queryInput("REQUIRED", {
          policies: [
            categoricalPolicy("REQUIRED"),
            categoricalPolicy("REQUIRED"),
          ],
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint(
        queryInput("REQUIRED", {
          policies: [
            categoricalPolicy("REQUIRED"),
            categoricalPolicy("ROUTE"),
          ],
        }),
      ),
    ).toThrow(TypeError);
  });

  it("rejects blank versions and mismatched target or attribute identities", () => {
    for (const policy of [
      categoricalPolicy("REQUIRED", { policyVersion: " " }),
      categoricalPolicy("REQUIRED", {
        targetConstraintId: "constraint:sibling",
      }),
      categoricalPolicy("REQUIRED", { attributeId: "style:texture" }),
    ]) {
      expect(() =>
        decideConstraint(
          queryInput("REQUIRED", {
            policies: [policy],
          }),
        ),
      ).toThrow(TypeError);
    }
  });

  it("rejects non-string and blank policy identity fields", () => {
    const invalidValues: readonly unknown[] = ["", " ", 0, 1, false, null, {}];
    for (const property of [
      "policyVersion",
      "targetConstraintId",
      "attributeId",
    ] as const) {
      for (const value of invalidValues) {
        const policy = setRuntimeValue(
          categoricalPolicy("REQUIRED"),
          property,
          value,
        );
        expect(() =>
          decideConstraint(queryInput("REQUIRED", { policies: [policy] })),
        ).toThrow(TypeError);
      }
    }
  });

  it("rejects unexpected policy kinds", () => {
    expect(() =>
      decideConstraint({
        ...queryInput("REQUIRED"),
        policies: [
          {
            kind: "VENDOR_ATTESTATION",
            synthetic: true,
            permitted: true,
            policyVersion: "fixture:vendor/v0.1",
          },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("requires policy fixture markers to be exactly boolean true", () => {
    const invalidValues: readonly unknown[] = [false, 0, 1, "", "yes"];
    for (const property of ["fixtureOnly", "synthetic"] as const) {
      for (const value of invalidValues) {
        const policy = setRuntimeValue(
          categoricalPolicy("REQUIRED"),
          property,
          value,
        );
        expect(() =>
          decideConstraint(queryInput("REQUIRED", { policies: [policy] })),
        ).toThrow(TypeError);
      }
    }
  });

  it("rejects unknown runtime dispositions before query or product dispatch", () => {
    const queryPolicy = setRuntimeValue(
      categoricalPolicy("REQUIRED"),
      "disposition",
      "INVALID",
    );
    const productPolicy = setRuntimeValue(
      categoricalPolicy("REQUIRED"),
      "disposition",
      "INVALID",
    );

    expect(() =>
      decideConstraint(
        queryInput("REQUIRED", {
          policies: [queryPolicy],
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED"),
          { policies: [productPolicy] },
        ),
      ),
    ).toThrow(TypeError);
  });

  it("allows separate request targets to govern the same attribute independently", () => {
    const siblingId = "constraint:style-shape-sibling";
    const first = decideConstraint(queryInput("REQUIRED"));
    const second = decideConstraint(
      queryInput("ROUTE", {
        constraint: categoricalConstraint({ constraintId: siblingId }),
        policies: [
          categoricalPolicy("ROUTE", { targetConstraintId: siblingId }),
        ],
      }),
    );

    expect(first.gate).toBe("REQUIRE_MATCH");
    expect(second.gate).toBe("ROUTE_ONLY");
  });

  it("does not let a sibling constraint reuse policy by attribute alone", () => {
    expect(() =>
      decideConstraint(
        queryInput("REQUIRED", {
          constraint: categoricalConstraint({
            constraintId: "constraint:sibling",
          }),
        }),
      ),
    ).toThrow(TypeError);
  });
});

describe("D5-S1 required-only fixture-product evidence", () => {
  it.each([
    "VERIFIED_OR_MEASURED",
    "HUMAN_CURATED_FROM_EVIDENCE",
  ] satisfies readonly ProductEvidenceFixtureState[])(
    "asserts matching authoritative %s evidence",
    (state) => {
      expect(
        decideConstraint(productInput("REQUIRED", categoricalEvidence(state))),
      ).toMatchObject({
        gate: "ASSERT_MATCH",
        score: "NONE",
        partition: "ASSERTED",
        reasons: ["EVIDENCE_QUALIFIED_MATCH"],
      });
    },
  );

  it("distinguishes wrong value, absent evidence, and conflict", () => {
    const wrongValue = decideConstraint(
      productInput(
        "REQUIRED",
        categoricalEvidence("VERIFIED_OR_MEASURED", {
          value: { kind: "CATEGORICAL", valueId: "style:pixie" },
        }),
      ),
    );
    const absent = decideConstraint(productInput("REQUIRED"));
    const conflict = decideConstraint(
      productInput("REQUIRED", categoricalEvidence("CONFLICTING")),
    );

    expect(wrongValue).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "VIOLATING",
      reasons: ["EVIDENCE_QUALIFIED_MISMATCH"],
    });
    expect(absent).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "UNKNOWN",
      reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
    });
    expect(conflict).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "WITHHELD",
      reasons: ["PRODUCT_EVIDENCE_CONFLICT"],
    });
  });

  it("rejects wrong-attribute and categorical NOT_REPRESENTABLE evidence", () => {
    expect(() =>
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED", {
            attributeId: "style:texture",
          }),
        ),
      ),
    ).toThrow(TypeError);
    expect(() =>
      decideConstraint(
        productInput("REQUIRED", categoricalEvidence("NOT_REPRESENTABLE")),
      ),
    ).toThrow(TypeError);
  });

  it("requires matching-product evidence markers to be exactly boolean true", () => {
    const invalidValues: readonly unknown[] = [
      false,
      0,
      1,
      "",
      "yes",
      [],
      {},
    ];
    for (const property of ["fixtureOnly", "synthetic"] as const) {
      for (const value of invalidValues) {
        const evidence = setRuntimeValue(
          categoricalEvidence("VERIFIED_OR_MEASURED"),
          property,
          value,
        );
        expect(() =>
          decideConstraint(productInput("REQUIRED", evidence)),
        ).toThrow(TypeError);
      }
    }
  });

  it("treats evidence for another fixture product as absent", () => {
    expect(
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED", {
            fixtureProductId: "fixture-product:other",
          }),
        ),
      ),
    ).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "UNKNOWN",
      reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
    });
  });

  it("rejects confirmation continuity mismatch for fixture-product decisions", () => {
    expect(() =>
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED"),
          {
            constraint: categoricalConstraint({
              confirmed: true,
              priorConstraintId: "constraint:prior",
            }),
          },
        ),
      ),
    ).toThrow(TypeError);
  });

  it("keeps confirmed required-product outcomes confirmation-required", () => {
    const confirmedConstraint = categoricalConstraint({ confirmed: true });
    const cases = [
      {
        evidence: categoricalEvidence("VERIFIED_OR_MEASURED"),
        expected: { gate: "ASSERT_MATCH", partition: "ASSERTED" },
      },
      {
        evidence: categoricalEvidence("VERIFIED_OR_MEASURED", {
          value: { kind: "CATEGORICAL", valueId: "style:pixie" },
        }),
        expected: { gate: "DO_NOT_GATE", partition: "VIOLATING" },
      },
      {
        evidence: undefined,
        expected: { gate: "DO_NOT_GATE", partition: "UNKNOWN" },
      },
      {
        evidence: categoricalEvidence("CONFLICTING"),
        expected: { gate: "DO_NOT_GATE", partition: "WITHHELD" },
      },
      {
        evidence: categoricalEvidence("MODEL_INFERRED"),
        expected: { gate: "DO_NOT_GATE", partition: "UNKNOWN" },
      },
    ] as const;

    for (const { evidence, expected } of cases) {
      expect(
        decideConstraint(
          productInput("REQUIRED", evidence, {
            constraint: confirmedConstraint,
          }),
        ),
      ).toMatchObject({
        ...expected,
        relaxation: "CONFIRMATION_REQUIRED",
      });
    }
  });

  it("does not grant assertion authority to vendor or model evidence", () => {
    const vendor = decideConstraint(
      productInput(
        "REQUIRED",
        categoricalEvidence("APPROVED_VENDOR_ATTESTED"),
      ),
    );
    const model = decideConstraint(
      productInput("REQUIRED", categoricalEvidence("MODEL_INFERRED")),
    );

    expect(vendor).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "UNKNOWN",
      reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
    });
    expect(model).toMatchObject({
      gate: "DO_NOT_GATE",
      partition: "UNKNOWN",
      reasons: ["MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY"],
    });
  });

  it.each([
    "APPROVED_VENDOR_ATTESTED",
    "UNAPPROVED_VENDOR_DECLARATION",
    "MISSING",
    "UNKNOWN_AUTHORITY",
  ] satisfies readonly ProductEvidenceFixtureState[])(
    "keeps matching-attribute %s evidence unknown",
    (state) => {
      expect(
        decideConstraint(productInput("REQUIRED", categoricalEvidence(state))),
      ).toMatchObject({
        gate: "DO_NOT_GATE",
        score: "NONE",
        partition: "UNKNOWN",
        reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
      });
    },
  );

  it.each([
    "PREFERENCE",
    "ROUTE",
    "CLARIFICATION",
    "UNSUPPORTED",
  ] satisfies readonly CategoricalPolicyDisposition[])(
    "rejects %s fixture-product evaluation",
    (disposition) => {
      expect(() =>
        decideConstraint(
          productInput(
            disposition,
            categoricalEvidence("VERIFIED_OR_MEASURED"),
          ),
        ),
      ).toThrow(TypeError);
    },
  );

  it("never emits query-only gate or preference score for a product", () => {
    const decisions = [
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED"),
        ),
      ),
      decideConstraint(
        productInput(
          "REQUIRED",
          categoricalEvidence("VERIFIED_OR_MEASURED", {
            value: { kind: "CATEGORICAL", valueId: "style:pixie" },
          }),
        ),
      ),
      decideConstraint(productInput("REQUIRED")),
      decideConstraint(
        productInput("REQUIRED", categoricalEvidence("CONFLICTING")),
      ),
    ];

    expect(decisions.every((decision) => decision.gate !== "REQUIRE_MATCH")).toBe(
      true,
    );
    expect(
      decisions.every((decision) => decision.score !== "PREFERENCE_ALLOWED"),
    ).toBe(true);
  });
});
