import type {
  CategoricalPolicyFixture,
  Contradiction,
  DiscoveryContext,
  InterpretedConstraint,
  ParserResult,
  ProductEvidenceFixtureState,
  QuerySpan,
} from "../../types";
import {
  createAudienceNamespace,
  createAutoQueryLanguage,
  createLocaleCode,
} from "../../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../../versions";
import type {
  GovernedCategoricalConstraint,
  GovernedFixtureAttributeId,
  RunStructuredCategoricalFixtureSliceInput,
  Stage0AuthorityUniverseFixture,
  StructuredCandidateFixture,
  StructuredCandidateFixtureSnapshot,
  StructuredEligibilitySummaryFixture,
  StructuredProductEvidenceFixture,
} from "../types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "../versions";

export const COLOR_ATTRIBUTE_ID =
  "fixture:governed-color-family";
export const TEXTURE_ATTRIBUTE_ID =
  "fixture:governed-texture-family";
export const COLOR_VALUE_ID = "fixture:color-family:dark";
export const TEXTURE_VALUE_ID = "fixture:texture-family:wavy";
export const POLICY_VERSION =
  "fixture:d6-b1-categorical-policy/v0.1-provisional";

export const VARIANT_A = "fixture:variant:a";
export const STYLE_A = "fixture:style:a";
export const VARIANT_B = "fixture:variant:b";
export const STYLE_B = "fixture:style:b";

export function syntheticContext(): DiscoveryContext {
  return {
    marketCode: "KR",
    locale: createLocaleCode("ko-KR"),
    queryLanguage: createAutoQueryLanguage(),
    audienceNamespace: createAudienceNamespace("HUMAN"),
  };
}

interface ConstraintOptions {
  readonly constraintId?: string;
  readonly valueId?: string;
  readonly confirmed?: boolean;
}

export function governedConstraint(
  attributeId: GovernedFixtureAttributeId = COLOR_ATTRIBUTE_ID,
  options: ConstraintOptions = {},
): GovernedCategoricalConstraint {
  const color = attributeId === COLOR_ATTRIBUTE_ID;
  const constraintId =
    options.constraintId ??
    (color ? "constraint:color" : "constraint:texture");
  return {
    constraintId,
    value: {
      kind: "CATEGORICAL",
      attributeId,
      valueId:
        options.valueId ??
        (color ? COLOR_VALUE_ID : TEXTURE_VALUE_ID),
    },
    source:
      options.confirmed === true
        ? {
            kind: "USER_CONFIRMATION",
            priorConstraintId: constraintId,
          }
        : {
            kind: "QUERY_SPAN",
            spanId: color ? "span:color" : "span:texture",
            lexiconEntryId: color
              ? "fixture:lexicon:color"
              : "fixture:lexicon:texture",
            identityRecognizerId: null,
          },
    interpretationState: "DECLARED",
    attributeBand: "STYLISTIC",
    decisionProfile: "GOVERNED_STYLISTIC_CATEGORICAL",
  };
}

function querySpan(
  constraint: GovernedCategoricalConstraint,
): QuerySpan | null {
  if (constraint.source.kind !== "QUERY_SPAN") {
    return null;
  }
  const color = constraint.value.attributeId === COLOR_ATTRIBUTE_ID;
  return {
    spanId: constraint.source.spanId,
    constraintId: constraint.constraintId,
    rawRange: color
      ? { startInclusive: 0, endExclusive: 5 }
      : { startInclusive: 6, endExclusive: 13 },
    normalizedRange: color
      ? { startInclusive: 0, endExclusive: 5 }
      : { startInclusive: 6, endExclusive: 13 },
    rawText: color ? "color" : "texture",
    normalizedText: color ? "color" : "texture",
    owner: "CONCEPT",
    conceptId: constraint.value.attributeId,
    lexiconEntryId: constraint.source.lexiconEntryId,
    identityRecognizerId: null,
    languageTag: null,
    interpretationState: "DECLARED",
  };
}

export function parserResult(
  constraints: readonly InterpretedConstraint[] = [governedConstraint()],
  overrides: Partial<ParserResult> = {},
): ParserResult {
  const governed = constraints.filter(
    (constraint): constraint is GovernedCategoricalConstraint =>
      constraint.value.kind === "CATEGORICAL" &&
      (constraint.value.attributeId === COLOR_ATTRIBUTE_ID ||
        constraint.value.attributeId === TEXTURE_ATTRIBUTE_ID),
  );
  const spans = governed
    .map(querySpan)
    .filter((span): span is QuerySpan => span !== null);
  return {
    normalizedQuery: {
      rawText: "color texture",
      comparisonText: "color texture",
      normalizationForm: "NFC",
      coordinateSystem: "UTF16_CODE_UNIT",
      inputState: "NON_EMPTY",
      offsetMap: [],
    },
    spans,
    constraints,
    unsupported: [],
    contradictions: [],
    diagnostics: [],
    parserVersion: DISCOVERY_COMPONENT_VERSIONS.parser,
    lexiconVersion: "fixture:d6-b1-lexicon/v0.1-provisional",
    ontologyVersion: "fixture:d6-b1-ontology/v0.1-provisional",
    ...overrides,
  };
}

export function categoricalPolicy(
  constraint: GovernedCategoricalConstraint,
  disposition: CategoricalPolicyFixture["disposition"] = "REQUIRED",
  overrides: Partial<CategoricalPolicyFixture> = {},
): CategoricalPolicyFixture {
  return {
    kind: "CATEGORICAL_POLICY",
    fixtureOnly: true,
    synthetic: true,
    targetConstraintId: constraint.constraintId,
    attributeId: constraint.value.attributeId,
    disposition,
    policyVersion: POLICY_VERSION,
    ...overrides,
  };
}

export function contradiction(
  left: GovernedCategoricalConstraint,
  right: GovernedCategoricalConstraint,
): Contradiction {
  return {
    constraintId: "contradiction:governed",
    leftConstraintId: left.constraintId,
    rightConstraintId: right.constraintId,
    attributeId: left.value.attributeId,
    kind: "MUTUALLY_EXCLUSIVE_VALUES",
  };
}

export function candidateFixture(
  variantId = VARIANT_A,
  canonicalStyleId = STYLE_A,
  overrides: Partial<StructuredCandidateFixture> = {},
): StructuredCandidateFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    candidateSourceVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.candidateSource,
    variantId,
    canonicalStyleId,
    ...overrides,
  };
}

export function candidateSnapshot(
  candidates: readonly StructuredCandidateFixture[] = [
    candidateFixture(),
  ],
): StructuredCandidateFixtureSnapshot {
  const candidatesByVariantId: Record<
    string,
    readonly StructuredCandidateFixture[]
  > = {};
  for (const candidate of candidates) {
    candidatesByVariantId[candidate.variantId] = [candidate];
  }
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    candidateSourceVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.candidateSource,
    candidatesByVariantId,
  };
}

export function stage0Proof(
  pairs: readonly {
    readonly variantId: string;
    readonly canonicalStyleId: string;
  }[] = [{ variantId: VARIANT_A, canonicalStyleId: STYLE_A }],
  overrides: Partial<Stage0AuthorityUniverseFixture> = {},
): Stage0AuthorityUniverseFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    stage0ScopeVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.stage0Scope,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    context: {
      marketCode: "KR",
      locale: "ko-KR",
      queryLanguage: { mode: "AUTO" },
      audienceNamespace: "HUMAN",
    },
    allowedCanonicalPairs: pairs,
    ...overrides,
  };
}

export function evidenceFixture(
  candidate: StructuredCandidateFixture,
  constraint: GovernedCategoricalConstraint,
  state: ProductEvidenceFixtureState = "VERIFIED_OR_MEASURED",
  overrides: Partial<StructuredProductEvidenceFixture> = {},
): StructuredProductEvidenceFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    targetConstraintId: constraint.constraintId,
    fixtureProductId: candidate.variantId,
    attributeId: constraint.value.attributeId,
    value: {
      kind: "CATEGORICAL",
      valueId: constraint.value.valueId,
    },
    state,
    syntheticEvidenceRef: `fixture:evidence:${candidate.variantId}:${constraint.constraintId}`,
    ...overrides,
  };
}

export function eligibilitySummary(
  candidate: StructuredCandidateFixture = candidateFixture(),
  overrides: Partial<StructuredEligibilitySummaryFixture> = {},
): StructuredEligibilitySummaryFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    eligibilitySnapshotVersion:
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.eligibilitySnapshot,
    variantId: candidate.variantId,
    canonicalStyleId: candidate.canonicalStyleId,
    marketCode: "KR",
    outcome: "ADMISSIBLE_FIXTURE",
    fixtureReason: `fixture:eligible:${candidate.variantId}`,
    selectedVariantAmount: 85000,
    currency: "KRW",
    ...overrides,
  };
}

export function structuredInput(
  overrides: Partial<RunStructuredCategoricalFixtureSliceInput> = {},
): RunStructuredCategoricalFixtureSliceInput {
  const constraint = governedConstraint();
  const candidate = candidateFixture();
  return {
    parserResult: parserResult([constraint]),
    context: syntheticContext(),
    policies: [categoricalPolicy(constraint)],
    stage0Proof: stage0Proof(),
    candidateSnapshot: candidateSnapshot([candidate]),
    evidenceFixtures: [evidenceFixture(candidate, constraint)],
    eligibilitySummaries: [eligibilitySummary(candidate)],
    ...overrides,
  };
}
