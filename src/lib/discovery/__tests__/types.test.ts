import { describe, expect, it } from "vitest";

import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import {
  createAudienceNamespace,
  createLanguageTag,
  createLocaleCode,
  type AttributeBand,
  type AudienceNamespace,
  type AuthorityOutcome,
  type CategoricalPolicyDisposition,
  type CategoricalPolicyFixture,
  type ConstraintDecision,
  type ConstraintReasonCode,
  type ConstraintValue,
  type D5DecisionProfile,
  type DecisionPolicyFixture,
  type DiscoveryReasonCode,
  type EvidencePartition,
  type FallbackRoute,
  type FixtureDecisionDiagnostic,
  type FixtureReasonCode,
  type GateDecision,
  type InterpretationState,
  type LanguageTag,
  type LocaleCode,
  type NormalizedQuery,
  type QuerySpanOwner,
  type RelaxationDecision,
  type ScoreDecision,
  type SpeechRequirement,
} from "../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../versions";

function exhaustiveValues<T>() {
  return <const Values extends readonly T[]>(
    values: Values & ([T] extends [Values[number]] ? unknown : never),
  ): Values => values;
}

const ATTRIBUTE_BANDS = exhaustiveValues<AttributeBand>()([
  "IDENTITY",
  "CLAIM_BEARING",
  "DIMENSIONAL_CONTINUOUS",
  "STYLISTIC",
  "OUTCOME_INTENT",
  "AUTHORITY_ROUTE",
]);

const INTERPRETATION_STATES = exhaustiveValues<InterpretationState>()([
  "DECLARED",
  "DERIVED",
  "BRIDGED",
  "UNRESOLVED",
]);

const CONSTRAINT_VALUE_KINDS = exhaustiveValues<ConstraintValue["kind"]>()([
  "EXACT_IDENTITY",
  "CATEGORICAL",
  "CONTINUOUS",
  "OUTCOME_INTENT",
  "UNKNOWN_OR_UNSUPPORTED",
  "AUTHORITY_ROUTE",
]);

const QUERY_SPAN_OWNERS = exhaustiveValues<QuerySpanOwner>()([
  "EXACT_IDENTITY",
  "CONCEPT",
  "NUMBER_WITH_UNIT",
  "OUTCOME_INTENT",
  "AUDIENCE_ROUTE",
  "UNSUPPORTED",
]);

const NORMALIZATION_FORMS = exhaustiveValues<
  NormalizedQuery["normalizationForm"]
>()(["NFC"]);

const COORDINATE_SYSTEMS = exhaustiveValues<
  NormalizedQuery["coordinateSystem"]
>()(["UTF16_CODE_UNIT"]);

const NORMALIZED_INPUT_STATES = exhaustiveValues<
  NormalizedQuery["inputState"]
>()(["EMPTY", "NON_EMPTY"]);

const AUTHORITY_OUTCOMES = exhaustiveValues<AuthorityOutcome["kind"]>()([
  "PRESERVE_CALLER_CONTEXT",
  "OUTSIDE_DISCOVERY_AUTHORITY",
  "NOT_APPLICABLE",
]);

const INHERITED_V0_1_D5_DECISION_PROFILES = [
  "CLAIM_BEARING_MATERIAL",
  "SENSITIVE_USE_CONTEXT",
] as const satisfies readonly D5DecisionProfile[];

const FINAL_V0_2_D5_DECISION_PROFILES = [
  "GOVERNED_STYLISTIC_CATEGORICAL",
] as const satisfies readonly D5DecisionProfile[];

const D5_DECISION_PROFILES = exhaustiveValues<D5DecisionProfile>()([
  ...INHERITED_V0_1_D5_DECISION_PROFILES,
  ...FINAL_V0_2_D5_DECISION_PROFILES,
]);

const FINAL_V0_2_CATEGORICAL_POLICY_DISPOSITIONS = [
  "REQUIRED",
  "PREFERENCE",
  "ROUTE",
  "CLARIFICATION",
  "UNSUPPORTED",
] as const satisfies readonly CategoricalPolicyDisposition[];

const CATEGORICAL_POLICY_DISPOSITIONS =
  exhaustiveValues<CategoricalPolicyDisposition>()(
    FINAL_V0_2_CATEGORICAL_POLICY_DISPOSITIONS,
  );

const DECISION_POLICY_KINDS = exhaustiveValues<
  DecisionPolicyFixture["kind"]
>()([
  "CONTINUOUS_TOLERANCE",
  "CLAIM_AUTHORITY",
  "VENDOR_ATTESTATION",
  "CATEGORICAL_POLICY",
]);

const INHERITED_V0_1_GATE_DECISIONS = [
  "ASSERT_MATCH",
  "DO_NOT_GATE",
  "REQUIRE_CLARIFICATION",
  "ROUTE_ONLY",
  "UNSUPPORTED",
] as const satisfies readonly GateDecision[];

const FINAL_V0_2_GATE_DECISIONS = [
  "REQUIRE_MATCH",
] as const satisfies readonly GateDecision[];

const GATE_DECISIONS = exhaustiveValues<GateDecision>()([
  ...INHERITED_V0_1_GATE_DECISIONS,
  ...FINAL_V0_2_GATE_DECISIONS,
]);

const SCORE_DECISIONS = exhaustiveValues<ScoreDecision>()([
  "NONE",
  "PREFERENCE_ALLOWED",
]);

const EVIDENCE_PARTITIONS = exhaustiveValues<EvidencePartition>()([
  "ASSERTED",
  "UNKNOWN",
  "VIOLATING",
  "WITHHELD",
  "NOT_APPLICABLE",
]);

const FALLBACK_ROUTES = exhaustiveValues<FallbackRoute>()([
  "CLARIFICATION",
  "EDUCATION_OR_CONSULTATION",
  "AUDIENCE_SWITCH_OFFER",
  "EXPLICIT_UNSUPPORTED",
  "EXACT_IDENTITY_NOT_FOUND",
]);

const SPEECH_REQUIREMENTS = exhaustiveValues<SpeechRequirement>()([
  "NO_PRODUCT_ASSERTION",
  "DISCLOSE_EVIDENCE_BASIS",
  "DISCLOSE_UNKNOWN",
  "DISCLOSE_ROUTE_LIMITATION",
]);

const RELAXATION_DECISIONS = exhaustiveValues<RelaxationDecision>()([
  "NEVER",
  "CONFIRMATION_REQUIRED",
  "NOT_APPLICABLE",
]);

const INHERITED_V0_1_DISCOVERY_REASON_CODES = [
  "EXACT_IDENTITY_MATCH",
  "EXACT_IDENTITY_NO_SUBSTITUTION",
  "EVIDENCE_QUALIFIED_MATCH",
  "EVIDENCE_QUALIFIED_MISMATCH",
  "PRODUCT_EVIDENCE_UNKNOWN",
  "PRODUCT_EVIDENCE_CONFLICT",
  "CLAIM_AUTHORITY_UNAVAILABLE_ROUTE",
  "UNSUPPORTED_CONCEPT",
  "CONTRADICTORY_QUERY",
  "CONFIRMATION_CHANGED_INTENT_ONLY",
  "AUDIENCE_NAMESPACE_PRESERVED",
  "MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY",
] as const satisfies readonly DiscoveryReasonCode[];

const FINAL_V0_2_DISCOVERY_REASON_CODES = [
  "CATEGORICAL_REQUIRED_BY_POLICY",
  "CATEGORICAL_PREFERENCE_BY_POLICY",
  "CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE",
  "CATEGORICAL_CLARIFICATION_REQUIRED",
  "CATEGORICAL_UNSUPPORTED_BY_POLICY",
  "MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY",
] as const satisfies readonly DiscoveryReasonCode[];

const DISCOVERY_REASON_CODES = exhaustiveValues<DiscoveryReasonCode>()([
  ...INHERITED_V0_1_DISCOVERY_REASON_CODES,
  ...FINAL_V0_2_DISCOVERY_REASON_CODES,
]);

const FIXTURE_REASON_CODES = exhaustiveValues<FixtureReasonCode>()([
  "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE",
  "CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE",
  "SYNTHETIC_TOLERANCE_REQUIRED",
]);

const FIXTURE_DECISION_DIAGNOSTICS =
  exhaustiveValues<FixtureDecisionDiagnostic>()([
    "SYNTHETIC_TOLERANCE_APPLIED",
    "SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED",
  ]);

describe("opaque discovery context tokens", () => {
  it("requires validated factories at the TypeScript boundary", () => {
    // @ts-expect-error LocaleCode must not be structurally constructible.
    const locale: LocaleCode = { value: "en-US" };
    // @ts-expect-error LanguageTag must not be structurally constructible.
    const language: LanguageTag = { value: "en" };
    // @ts-expect-error AudienceNamespace must not be structurally constructible.
    const audience: AudienceNamespace = { value: "fixture:audience" };

    expect([locale.value, language.value, audience.value]).toEqual([
      "en-US",
      "en",
      "fixture:audience",
    ]);
  });

  it("keeps factory values serializable and runtime validated", () => {
    expect(JSON.stringify(createLocaleCode("en-US"))).toBe('{"value":"en-US"}');
    expect(JSON.stringify(createLanguageTag("en"))).toBe('{"value":"en"}');
    expect(JSON.stringify(createAudienceNamespace("fixture:audience"))).toBe(
      '{"value":"fixture:audience"}',
    );

    expect(() => createLocaleCode(" en-US")).toThrow(RangeError);
    expect(() => createLanguageTag("")).toThrow(RangeError);
    expect(() => createAudienceNamespace("fixture:audience ")).toThrow(
      RangeError,
    );
  });
});

describe("D5 source vocabulary", () => {
  it("exhaustively retains frozen and provisional serialized literals", () => {
    expect([
      ATTRIBUTE_BANDS.length,
      INTERPRETATION_STATES.length,
      CONSTRAINT_VALUE_KINDS.length,
      QUERY_SPAN_OWNERS.length,
      NORMALIZATION_FORMS.length,
      COORDINATE_SYSTEMS.length,
      NORMALIZED_INPUT_STATES.length,
      AUTHORITY_OUTCOMES.length,
      D5_DECISION_PROFILES.length,
      CATEGORICAL_POLICY_DISPOSITIONS.length,
      DECISION_POLICY_KINDS.length,
      GATE_DECISIONS.length,
      SCORE_DECISIONS.length,
      EVIDENCE_PARTITIONS.length,
      FALLBACK_ROUTES.length,
      SPEECH_REQUIREMENTS.length,
      RELAXATION_DECISIONS.length,
      DISCOVERY_REASON_CODES.length,
    ]).toEqual([
      6, 4, 6, 6, 1, 1, 2, 3, 3, 5, 4, 6, 2, 5, 5, 4, 3, 18,
    ]);
  });

  it("classifies final v0.2 vocabulary separately from the provisional fixture carrier", () => {
    type DecisionFields = keyof ConstraintDecision;
    type ExpectedDecisionFields =
      | "constraintId"
      | "subject"
      | "authorityOutcome"
      | "gate"
      | "score"
      | "speechRequirements"
      | "partition"
      | "relaxation"
      | "fallbackRoutes"
      | "reasons"
      | "diagnostics";
    const decisionShapeIsExact: [DecisionFields] extends [
      ExpectedDecisionFields,
    ]
      ? [ExpectedDecisionFields] extends [DecisionFields]
        ? true
        : false
      : false = true;
    const policy: CategoricalPolicyFixture = {
      kind: "CATEGORICAL_POLICY",
      fixtureOnly: true,
      synthetic: true,
      targetConstraintId: "constraint:style",
      attributeId: "style:shape",
      disposition: "REQUIRED",
      policyVersion: "fixture:categorical-policy/v0.1-provisional",
    };

    expect({
      decisionProfiles: FINAL_V0_2_D5_DECISION_PROFILES,
      gateDecisions: FINAL_V0_2_GATE_DECISIONS,
      categoricalPolicyDispositions:
        FINAL_V0_2_CATEGORICAL_POLICY_DISPOSITIONS,
      discoveryReasonCodes: FINAL_V0_2_DISCOVERY_REASON_CODES,
    }).toEqual({
      decisionProfiles: ["GOVERNED_STYLISTIC_CATEGORICAL"],
      gateDecisions: ["REQUIRE_MATCH"],
      categoricalPolicyDispositions: [
        "REQUIRED",
        "PREFERENCE",
        "ROUTE",
        "CLARIFICATION",
        "UNSUPPORTED",
      ],
      discoveryReasonCodes: [
        "CATEGORICAL_REQUIRED_BY_POLICY",
        "CATEGORICAL_PREFERENCE_BY_POLICY",
        "CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE",
        "CATEGORICAL_CLARIFICATION_REQUIRED",
        "CATEGORICAL_UNSUPPORTED_BY_POLICY",
        "MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY",
      ],
    });
    expect(decisionShapeIsExact).toBe(true);
    expect(Object.keys(policy).sort()).toEqual([
      "attributeId",
      "disposition",
      "fixtureOnly",
      "kind",
      "policyVersion",
      "synthetic",
      "targetConstraintId",
    ]);
  });

  it("keeps fixture reasons and diagnostics separate from discovery reasons", () => {
    const combinedReasons: readonly ConstraintReasonCode[] = [
      ...DISCOVERY_REASON_CODES,
      ...FIXTURE_REASON_CODES,
    ];
    // @ts-expect-error Fixture reasons are not durable discovery reason codes.
    const fixtureReasonAsDurable: DiscoveryReasonCode = FIXTURE_REASON_CODES[0];
    // @ts-expect-error Parser diagnostics are not fixture decision diagnostics.
    const parserDiagnosticAsFixture: FixtureDecisionDiagnostic = "EMPTY_QUERY";

    expect(combinedReasons).toHaveLength(21);
    expect(FIXTURE_DECISION_DIAGNOSTICS).toEqual([
      "SYNTHETIC_TOLERANCE_APPLIED",
      "SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED",
    ]);
    expect([fixtureReasonAsDurable, parserDiagnosticAsFixture]).toEqual([
      "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE",
      "EMPTY_QUERY",
    ]);
  });

  it("rejects the four removed literals at the TypeScript boundary", () => {
    // @ts-expect-error Structural/functional is not an active D5 source band.
    const structuralFunctional: AttributeBand = "STRUCTURAL_FUNCTIONAL";
    // @ts-expect-error Categorical dimensional behavior is not active in D5.
    const dimensionalCategorical: AttributeBand = "DIMENSIONAL_CATEGORICAL";
    // @ts-expect-error D5 does not emit a relaxation disclosure requirement.
    const discloseRelaxation: SpeechRequirement = "DISCLOSE_RELAXATION";
    // @ts-expect-error D5 does not perform disclosed automatic relaxation.
    const disclosedAutomatic: RelaxationDecision = "DISCLOSED_AUTOMATIC";

    expect([
      structuralFunctional,
      dimensionalCategorical,
      discloseRelaxation,
      disclosedAutomatic,
    ]).toEqual([
      "STRUCTURAL_FUNCTIONAL",
      "DIMENSIONAL_CATEGORICAL",
      "DISCLOSE_RELAXATION",
      "DISCLOSED_AUTOMATIC",
    ]);
  });

  it("rejects the superseded stylistic model reason at the TypeScript boundary", () => {
    // @ts-expect-error The v0.2 durable reason names denied assertion authority precisely.
    const supersededReason: DiscoveryReasonCode =
      "MODEL_INFERRED_STYLISTIC_HAS_NO_AUTHORITY";

    expect(supersededReason).toBe(
      "MODEL_INFERRED_STYLISTIC_HAS_NO_AUTHORITY",
    );
  });

  it("uses the exact final and provisional component registry identifiers", () => {
    expect(DISCOVERY_COMPONENT_VERSIONS).toEqual({
      requestSchema: "d5-source-only-request/v0.2-provisional",
      normalizer: "d5-conservative-normalizer/v0.1",
      parser: "d5-injected-span-parser/v0.1",
      constraintRules: "d5-constraint-decisions/v0.2",
      fixtureSnapshot: "d5-golden-cases/v0.2-provisional",
    });

    const parserResult = parseQuery({
      normalizedQuery: normalizeQuery({ text: "" }),
      lexicon: {
        version: "fixture:lexicon:empty",
        ontologyVersion: "fixture:ontology:empty",
        entries: [],
        units: [],
      },
      identityRecognizers: [],
    });

    expect(parserResult.parserVersion).toBe("d5-injected-span-parser/v0.1");
  });
});
