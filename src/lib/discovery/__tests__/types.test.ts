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
  type ConstraintReasonCode,
  type ConstraintValue,
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

const GATE_DECISIONS = exhaustiveValues<GateDecision>()([
  "ASSERT_MATCH",
  "DO_NOT_GATE",
  "REQUIRE_CLARIFICATION",
  "ROUTE_ONLY",
  "UNSUPPORTED",
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

const DISCOVERY_REASON_CODES = exhaustiveValues<DiscoveryReasonCode>()([
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

describe("D5 freeze-ready source vocabulary", () => {
  it("exhaustively retains the adjudicated durable serialized literals", () => {
    expect([
      ATTRIBUTE_BANDS.length,
      INTERPRETATION_STATES.length,
      CONSTRAINT_VALUE_KINDS.length,
      QUERY_SPAN_OWNERS.length,
      NORMALIZATION_FORMS.length,
      COORDINATE_SYSTEMS.length,
      NORMALIZED_INPUT_STATES.length,
      AUTHORITY_OUTCOMES.length,
      GATE_DECISIONS.length,
      SCORE_DECISIONS.length,
      EVIDENCE_PARTITIONS.length,
      FALLBACK_ROUTES.length,
      SPEECH_REQUIREMENTS.length,
      RELAXATION_DECISIONS.length,
      DISCOVERY_REASON_CODES.length,
    ]).toEqual([6, 4, 6, 6, 1, 1, 2, 3, 5, 2, 5, 5, 4, 3, 12]);
  });

  it("keeps fixture reasons and diagnostics separate from durable vocabulary", () => {
    const combinedReasons: readonly ConstraintReasonCode[] = [
      ...DISCOVERY_REASON_CODES,
      ...FIXTURE_REASON_CODES,
    ];
    // @ts-expect-error Fixture reasons are not durable discovery reason codes.
    const fixtureReasonAsDurable: DiscoveryReasonCode = FIXTURE_REASON_CODES[0];
    // @ts-expect-error Parser diagnostics are not fixture decision diagnostics.
    const parserDiagnosticAsFixture: FixtureDecisionDiagnostic = "EMPTY_QUERY";

    expect(combinedReasons).toHaveLength(15);
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

  it("uses the exact stable and provisional component registry identifiers", () => {
    expect(DISCOVERY_COMPONENT_VERSIONS).toEqual({
      requestSchema: "d5-source-only-request/v0.2-provisional",
      normalizer: "d5-conservative-normalizer/v0.1",
      parser: "d5-injected-span-parser/v0.1",
      constraintRules: "d5-constraint-decisions/v0.1",
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
