import { normalizeQuery } from "../../../normalize-query";
import type {
  Contradiction,
  DiscoveryContext,
  InterpretedConstraint,
  InterpretationState,
  ParserResult,
} from "../../../types";
import {
  createAudienceNamespace,
  createAutoQueryLanguage,
  createLocaleCode,
} from "../../../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../../../versions";
import type {
  CatalogIdentityProofFixture,
  EligibilitySummaryFixture,
  ExactCandidateFixture,
  ExactCandidateFixtureSnapshot,
  RunExactSkuFixtureSliceInput,
} from "../../types";
import { D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS } from "../../versions";

export const EXACT_SKU = "SKU-EXACT-001";
export const EXACT_VARIANT_ID = "variant-exact-001";
export const EXACT_STYLE_ID = "style-exact-001";

export function syntheticContext(): DiscoveryContext {
  return {
    marketCode: "KR",
    locale: createLocaleCode("ko-KR"),
    queryLanguage: createAutoQueryLanguage(),
    audienceNamespace: createAudienceNamespace("HUMAN"),
  };
}

interface ExactConstraintOptions {
  readonly constraintId?: string;
  readonly namespace?: string;
  readonly value?: string;
  readonly interpretationState?: InterpretationState;
}

export function exactConstraint(
  options: ExactConstraintOptions = {},
): InterpretedConstraint {
  return {
    constraintId: options.constraintId ?? "constraint:exact",
    value: {
      kind: "EXACT_IDENTITY",
      namespace: options.namespace ?? "SKU",
      value: options.value ?? EXACT_SKU,
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:exact",
      lexiconEntryId: null,
      identityRecognizerId: "synthetic-sku-recognizer",
    },
    interpretationState: options.interpretationState ?? "DECLARED",
    attributeBand: "IDENTITY",
    decisionProfile: null,
  };
}

export function nonExactConstraint(): InterpretedConstraint {
  return {
    constraintId: "constraint:style",
    value: {
      kind: "CATEGORICAL",
      attributeId: "style-shape",
      valueId: "synthetic-bob",
    },
    source: {
      kind: "QUERY_SPAN",
      spanId: "span:style",
      lexiconEntryId: "synthetic-style-entry",
      identityRecognizerId: null,
    },
    interpretationState: "DERIVED",
    attributeBand: "STYLISTIC",
    decisionProfile: null,
  };
}

export function exactContradiction(
  constraintId = "constraint:exact",
): Contradiction {
  return {
    constraintId: "contradiction:exact",
    leftConstraintId: constraintId,
    rightConstraintId: "constraint:other",
    attributeId: "identity:sku",
    kind: "MUTUALLY_EXCLUSIVE_VALUES",
  };
}

export function parserResult(
  constraints: readonly InterpretedConstraint[] = [exactConstraint()],
  contradictions: readonly Contradiction[] = [],
): ParserResult {
  return {
    normalizedQuery: normalizeQuery({ text: "synthetic exact query" }),
    spans: [],
    constraints,
    unsupported: [],
    contradictions,
    diagnostics: [],
    parserVersion: DISCOVERY_COMPONENT_VERSIONS.parser,
    lexiconVersion: "synthetic-lexicon/v0.1-provisional",
    ontologyVersion: "synthetic-ontology/v0.1-provisional",
  };
}

export function candidateFixture(
  overrides: Partial<ExactCandidateFixture> = {},
): ExactCandidateFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    candidateSourceVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.candidateSource,
    variantId: EXACT_VARIANT_ID,
    canonicalStyleId: EXACT_STYLE_ID,
    identity: { namespace: "SKU", canonicalValue: EXACT_SKU },
    ...overrides,
  };
}

export function candidateSnapshot(
  candidates: readonly ExactCandidateFixture[] = [candidateFixture()],
): ExactCandidateFixtureSnapshot {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    candidateSourceVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.candidateSource,
    candidates,
  };
}

export function catalogProof(
  overrides: Partial<CatalogIdentityProofFixture> = {},
): CatalogIdentityProofFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    syntheticEvidenceRef: "synthetic-evidence:exact-001",
    variantId: EXACT_VARIANT_ID,
    canonicalStyleId: EXACT_STYLE_ID,
    identity: { namespace: "SKU", canonicalValue: EXACT_SKU },
    optionFacts: {
      color: "synthetic-black",
      lengthLabel: "synthetic-medium",
    },
    ...overrides,
  };
}

export function eligibilitySummary(
  overrides: Partial<EligibilitySummaryFixture> = {},
): EligibilitySummaryFixture {
  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureSnapshotVersion:
      D6_EXACT_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
    variantId: EXACT_VARIANT_ID,
    marketCode: "KR",
    outcome: "ADMISSIBLE_FIXTURE",
    fixtureReason: "synthetic-fixture-admissible",
    selectedVariantAmount: 85000,
    currency: "KRW",
    ...overrides,
  };
}

export function exactSliceInput(
  overrides: Partial<RunExactSkuFixtureSliceInput> = {},
): RunExactSkuFixtureSliceInput {
  return {
    parserResult: parserResult(),
    context: syntheticContext(),
    candidateSnapshot: candidateSnapshot(),
    catalogProofs: [catalogProof()],
    eligibilitySummaries: [eligibilitySummary()],
    ...overrides,
  };
}
