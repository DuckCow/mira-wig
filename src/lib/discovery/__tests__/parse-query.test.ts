import { describe, expect, it } from "vitest";

import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import {
  createLanguageTag,
  type ParseQueryInput,
  type QueryLexicon,
} from "../types";
import { TEST_IDENTITY_RECOGNIZERS } from "./fixtures/test-identity-recognizers";
import { TEST_QUERY_LEXICON } from "./fixtures/test-lexicon";

function parse(
  text: string,
  lexicon: QueryLexicon = TEST_QUERY_LEXICON,
  identityRecognizers: ParseQueryInput["identityRecognizers"] = TEST_IDENTITY_RECOGNIZERS,
) {
  return parseQuery({
    normalizedQuery: normalizeQuery({ text }),
    lexicon,
    identityRecognizers,
  });
}

describe("parseQuery", () => {
  it("selects the longest unambiguous injected surface", () => {
    const result = parse("human hair wig");

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({
      rawText: "human hair",
      lexiconEntryId: "fixture:lexicon:material-human-en-long",
      interpretationState: "DERIVED",
    });
  });

  it("keeps stable left-to-right non-overlapping ownership", () => {
    const first = parse("인모 합성모");
    const second = parse("인모 합성모");

    expect(first).toEqual(second);
    expect(first.spans.map((span) => span.rawText)).toEqual(["인모", "합성모"]);
    expect(
      first.spans.every(
        (span) =>
          first.normalizedQuery.rawText.slice(
            span.rawRange.startInclusive,
            span.rawRange.endExclusive,
          ) === span.rawText,
      ),
    ).toBe(true);
  });

  it("makes same-precedence semantic overlap unresolved", () => {
    const languageTag = createLanguageTag("en");
    const ambiguousLexicon: QueryLexicon = {
      version: "fixture:ambiguous-lexicon/v0",
      ontologyVersion: "fixture:ambiguous-ontology/v0",
      units: [],
      entries: [
        {
          entryId: "fixture:ambiguous:a",
          surface: "ambiguous",
          languageTag,
          owner: "CONCEPT",
          conceptId: "fixture:concept:a",
          attributeBand: "STYLISTIC",
          interpretationState: "DERIVED",
          value: {
            kind: "CATEGORICAL",
            attributeId: "fixture:attribute",
            valueId: "fixture:value:a",
          },
          mutualExclusionGroup: null,
        },
        {
          entryId: "fixture:ambiguous:b",
          surface: "ambiguous",
          languageTag,
          owner: "CONCEPT",
          conceptId: "fixture:concept:b",
          attributeBand: "STYLISTIC",
          interpretationState: "DERIVED",
          value: {
            kind: "CATEGORICAL",
            attributeId: "fixture:attribute",
            valueId: "fixture:value:b",
          },
          mutualExclusionGroup: null,
        },
      ],
    };

    const result = parse("ambiguous", ambiguousLexicon, []);

    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0]).toMatchObject({
      interpretationState: "UNRESOLVED",
      value: {
        kind: "UNKNOWN_OR_UNSUPPORTED",
        state: "AMBIGUOUS",
      },
    });
    expect(result.diagnostics).toEqual([
      {
        code: "AMBIGUOUS_SAME_PRECEDENCE_OVERLAP",
        spanIds: ["span:0"],
      },
    ]);
  });

  it("gives an injected exact identity recognizer precedence over lexicon content", () => {
    const overlappingLexicon: QueryLexicon = {
      ...TEST_QUERY_LEXICON,
      entries: [
        ...TEST_QUERY_LEXICON.entries,
        {
          entryId: "fixture:lexicon:overlapping-code",
          surface: "SKU-EXACT-001",
          languageTag: null,
          owner: "CONCEPT",
          conceptId: "fixture:not-an-identity",
          attributeBand: "STYLISTIC",
          interpretationState: "DERIVED",
          value: {
            kind: "CATEGORICAL",
            attributeId: "fixture:code-lookalike",
            valueId: "fixture:value",
          },
          mutualExclusionGroup: null,
        },
      ],
    };

    const result = parse("SKU-EXACT-001", overlappingLexicon);

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({
      owner: "EXACT_IDENTITY",
      rawText: "SKU-EXACT-001",
      identityRecognizerId: "fixture:identity-recognizer:sku",
      lexiconEntryId: null,
    });
  });

  it("does not interpret categorical 13x4 text as a continuous quantity", () => {
    const result = parse("13x4 lace wig");

    expect(result.constraints).toEqual([]);
    expect(result.spans).toEqual([]);
  });

  it("resolves mixed script by owned spans without lowering interpretation state", () => {
    const result = parse("인모 12 inch SKU-ML-001");

    expect(result.constraints.map((constraint) => constraint.interpretationState)).toEqual([
      "DERIVED",
      "DERIVED",
      "DECLARED",
    ]);
    expect(result.spans.map((span) => span.languageTag?.value ?? null)).toEqual([
      "ko",
      "en",
      null,
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "MIXED_LANGUAGE_SPANS_RESOLVED",
    ]);
  });

  it("does not mutate normalized, lexicon, or confirmation inputs", () => {
    const normalizedQuery = normalizeQuery({ text: "human hair wig" });
    const confirmations = [
      {
        confirmed: true,
        value: {
          kind: "CATEGORICAL",
          attributeId: "material",
          valueId: "fixture:material:human-hair",
        },
      },
    ] satisfies ParseQueryInput["confirmations"];
    const before = JSON.stringify({
      normalizedQuery,
      lexicon: TEST_QUERY_LEXICON,
      confirmations,
    });

    parseQuery({
      normalizedQuery,
      lexicon: TEST_QUERY_LEXICON,
      identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
      confirmations,
    });

    expect(
      JSON.stringify({ normalizedQuery, lexicon: TEST_QUERY_LEXICON, confirmations }),
    ).toBe(before);
  });
});
