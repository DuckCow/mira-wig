import {
  createLanguageTag,
  type QueryLexicon,
  type QueryLexiconEntry,
} from "../../types";

const KOREAN = createLanguageTag("ko");
const ENGLISH = createLanguageTag("en");

const entries: readonly QueryLexiconEntry[] = [
  {
    entryId: "fixture:lexicon:material-human-ko",
    surface: "인모",
    languageTag: KOREAN,
    owner: "CONCEPT",
    conceptId: "fixture:material:human-hair",
    attributeBand: "CLAIM_BEARING",
    interpretationState: "DERIVED",
    value: {
      kind: "CATEGORICAL",
      attributeId: "material",
      valueId: "fixture:material:human-hair",
    },
    mutualExclusionGroup: "fixture:mutex:material",
  },
  {
    entryId: "fixture:lexicon:material-synthetic-ko",
    surface: "합성모",
    languageTag: KOREAN,
    owner: "CONCEPT",
    conceptId: "fixture:material:synthetic",
    attributeBand: "CLAIM_BEARING",
    interpretationState: "DERIVED",
    value: {
      kind: "CATEGORICAL",
      attributeId: "material",
      valueId: "fixture:material:synthetic",
    },
    mutualExclusionGroup: "fixture:mutex:material",
  },
  {
    entryId: "fixture:lexicon:material-human-en-long",
    surface: "human hair",
    languageTag: ENGLISH,
    owner: "CONCEPT",
    conceptId: "fixture:material:human-hair",
    attributeBand: "CLAIM_BEARING",
    interpretationState: "DERIVED",
    value: {
      kind: "CATEGORICAL",
      attributeId: "material",
      valueId: "fixture:material:human-hair",
    },
    mutualExclusionGroup: "fixture:mutex:material",
  },
  {
    entryId: "fixture:lexicon:material-human-en-short",
    surface: "human",
    languageTag: ENGLISH,
    owner: "CONCEPT",
    conceptId: "fixture:material:human-hair",
    attributeBand: "CLAIM_BEARING",
    interpretationState: "DERIVED",
    value: {
      kind: "CATEGORICAL",
      attributeId: "material",
      valueId: "fixture:material:human-hair",
    },
    mutualExclusionGroup: "fixture:mutex:material",
  },
  {
    entryId: "fixture:lexicon:oncology-use-context-ko",
    surface: "항암 치료 중",
    languageTag: KOREAN,
    owner: "OUTCOME_INTENT",
    conceptId: "fixture:sensitive-use-context:oncology-treatment",
    attributeBand: "OUTCOME_INTENT",
    interpretationState: "BRIDGED",
    value: {
      kind: "OUTCOME_INTENT",
      conceptId: "fixture:sensitive-use-context:oncology-treatment",
    },
    mutualExclusionGroup: null,
  },
  {
    entryId: "fixture:lexicon:unsupported-see-through-bangs-ko",
    surface: "시스루뱅",
    languageTag: KOREAN,
    owner: "UNSUPPORTED",
    conceptId: "fixture:style:bangs:see-through",
    attributeBand: "STYLISTIC",
    interpretationState: "UNRESOLVED",
    value: {
      kind: "UNKNOWN_OR_UNSUPPORTED",
      conceptId: "fixture:style:bangs:see-through",
      state: "UNSUPPORTED",
    },
    mutualExclusionGroup: null,
  },
  {
    entryId: "fixture:lexicon:alternate-audience-route-en",
    surface: "humanoid",
    languageTag: ENGLISH,
    owner: "AUDIENCE_ROUTE",
    conceptId: "fixture:alternate-audience-route",
    attributeBand: "AUTHORITY_ROUTE",
    interpretationState: "UNRESOLVED",
    value: {
      kind: "AUTHORITY_ROUTE",
      conceptId: "fixture:alternate-audience-route",
    },
    mutualExclusionGroup: null,
  },
];

export const TEST_QUERY_LEXICON: QueryLexicon = {
  version: "fixture:test-lexicon/v0.1",
  ontologyVersion: "fixture:test-ontology/v0.1",
  entries,
  units: [
    {
      entryId: "fixture:unit:inch",
      surface: "inch",
      languageTag: ENGLISH,
      dimensionId: "hair-length",
      unitId: "inch",
    },
    {
      entryId: "fixture:unit:inches",
      surface: "inches",
      languageTag: ENGLISH,
      dimensionId: "hair-length",
      unitId: "inch",
    },
  ],
};
