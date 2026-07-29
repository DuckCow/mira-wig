import { describe, expect, it } from "vitest";

import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import {
  createLanguageTag,
  type ExactIdentityRecognizer,
  type ParseQueryInput,
  type QueryConfirmation,
  type QueryLexicon,
  type QueryLexiconEntry,
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

const AMBIGUITY_METADATA_BASE_ENTRY: QueryLexiconEntry = {
  entryId: "fixture:ambiguity-metadata:a",
  surface: "policy",
  matchPolicy: "WORD_LIKE_BOUNDARIES",
  languageTag: createLanguageTag("en"),
  owner: "CONCEPT",
  conceptId: "fixture:concept:policy",
  attributeBand: "CLAIM_BEARING",
  decisionProfile: "CLAIM_BEARING_MATERIAL",
  interpretationState: "DERIVED",
  value: {
    kind: "CATEGORICAL",
    attributeId: "material",
    valueId: "fixture:material:human-hair",
  },
  mutualExclusionGroup: "fixture:mutex:material",
};

function ambiguityMetadataLexicon(
  entries: readonly QueryLexiconEntry[],
): QueryLexicon {
  return {
    version: "fixture:ambiguity-metadata-lexicon/v0",
    ontologyVersion: "fixture:ambiguity-metadata-ontology/v0",
    entries,
    units: [],
  };
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
          matchPolicy: "WORD_LIKE_BOUNDARIES",
          languageTag,
          owner: "CONCEPT",
          conceptId: "fixture:concept:a",
          attributeBand: "STYLISTIC",
          decisionProfile: null,
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
          matchPolicy: "WORD_LIKE_BOUNDARIES",
          languageTag,
          owner: "CONCEPT",
          conceptId: "fixture:concept:b",
          attributeBand: "STYLISTIC",
          decisionProfile: null,
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

  it.each([
    {
      label: "decision profile",
      changedEntry: {
        ...AMBIGUITY_METADATA_BASE_ENTRY,
        entryId: "fixture:ambiguity-metadata:b-profile",
        decisionProfile: null,
      },
    },
    {
      label: "attribute band",
      changedEntry: {
        ...AMBIGUITY_METADATA_BASE_ENTRY,
        entryId: "fixture:ambiguity-metadata:b-band",
        attributeBand: "STYLISTIC",
      },
    },
    {
      label: "mutual-exclusion group",
      changedEntry: {
        ...AMBIGUITY_METADATA_BASE_ENTRY,
        entryId: "fixture:ambiguity-metadata:b-mutex",
        mutualExclusionGroup: null,
      },
    },
  ] satisfies ReadonlyArray<{
    readonly label: string;
    readonly changedEntry: QueryLexiconEntry;
  }>)(
    "makes equal-value overlap unresolved when $label differs",
    ({ changedEntry }) => {
      const result = parse(
        "policy",
        ambiguityMetadataLexicon([
          AMBIGUITY_METADATA_BASE_ENTRY,
          changedEntry,
        ]),
        [],
      );

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
    },
  );

  it("deduplicates semantically identical lexicon entries independently of input order", () => {
    const duplicate: QueryLexiconEntry = {
      ...AMBIGUITY_METADATA_BASE_ENTRY,
      entryId: "fixture:ambiguity-metadata:b",
    };
    const forward = parse(
      "policy",
      ambiguityMetadataLexicon([
        AMBIGUITY_METADATA_BASE_ENTRY,
        duplicate,
      ]),
      [],
    );
    const reverse = parse(
      "policy",
      ambiguityMetadataLexicon([
        duplicate,
        AMBIGUITY_METADATA_BASE_ENTRY,
      ]),
      [],
    );

    expect(forward).toEqual(reverse);
    expect(forward.constraints[0]).toMatchObject({
      interpretationState: "DERIVED",
      decisionProfile: "CLAIM_BEARING_MATERIAL",
      value: AMBIGUITY_METADATA_BASE_ENTRY.value,
    });
    expect(forward.spans[0]?.lexiconEntryId).toBe(
      "fixture:ambiguity-metadata:a",
    );
    expect(forward.diagnostics).toEqual([]);
  });

  it("gives an injected exact identity recognizer precedence over lexicon content", () => {
    const overlappingLexicon: QueryLexicon = {
      ...TEST_QUERY_LEXICON,
      entries: [
        ...TEST_QUERY_LEXICON.entries,
        {
          entryId: "fixture:lexicon:overlapping-code",
          surface: "SKU-EXACT-001",
          matchPolicy: "WORD_LIKE_BOUNDARIES",
          languageTag: null,
          owner: "CONCEPT",
          conceptId: "fixture:not-an-identity",
          attributeBand: "STYLISTIC",
          decisionProfile: null,
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

  it("uses explicit English boundaries without imposing them on Korean compounds", () => {
    expect(parse("inhuman wig").constraints).toEqual([]);
    expect(parse("human wig").spans.map((span) => span.rawText)).toEqual([
      "human",
    ]);
    expect(parse("human hair wig").spans.map((span) => span.rawText)).toEqual([
      "human hair",
    ]);
    expect(parse("고급인모가발").spans.map((span) => span.rawText)).toEqual([
      "인모",
    ]);
  });

  it("keeps exact identity raw surfaces while using recognizer-owned canonical values", () => {
    const uppercase = parse("SKU-EXACT-001");
    const lowercase = parse("sku-exact-001");

    expect(uppercase.constraints[0]?.value).toEqual(
      lowercase.constraints[0]?.value,
    );
    expect(uppercase.constraints[0]?.value).toEqual({
      kind: "EXACT_IDENTITY",
      namespace: "SKU",
      value: "SKU-EXACT-001",
    });
    expect(uppercase.spans[0]?.rawText).toBe("SKU-EXACT-001");
    expect(lowercase.spans[0]?.rawText).toBe("sku-exact-001");
  });

  it("deduplicates equivalent exact recognitions independently of recognizer order", () => {
    const recognizers: readonly ExactIdentityRecognizer[] = [
      {
        recognizerId: "fixture:identity-recognizer:b",
        version: "fixture:identity-recognizer:b/v0",
        recognize: () => [
          {
            normalizedRange: { startInclusive: 0, endExclusive: 13 },
            namespace: "SKU",
            canonicalValue: "SKU-EXACT-001",
          },
        ],
      },
      {
        recognizerId: "fixture:identity-recognizer:a",
        version: "fixture:identity-recognizer:a/v0",
        recognize: () => [
          {
            normalizedRange: { startInclusive: 0, endExclusive: 13 },
            namespace: "SKU",
            canonicalValue: "SKU-EXACT-001",
          },
        ],
      },
    ];

    const forward = parse("SKU-EXACT-001", TEST_QUERY_LEXICON, recognizers);
    const reverse = parse(
      "SKU-EXACT-001",
      TEST_QUERY_LEXICON,
      [...recognizers].reverse(),
    );

    expect(forward).toEqual(reverse);
    expect(forward.spans[0]?.identityRecognizerId).toBe(
      "fixture:identity-recognizer:a",
    );
  });

  it("rejects conflicting exact recognitions independently of recognizer order", () => {
    const recognizers: readonly ExactIdentityRecognizer[] = [
      {
        recognizerId: "fixture:identity-recognizer:sku",
        version: "fixture:identity-recognizer:sku/v0",
        recognize: () => [
          {
            normalizedRange: { startInclusive: 0, endExclusive: 13 },
            namespace: "SKU",
            canonicalValue: "SKU-EXACT-001",
          },
        ],
      },
      {
        recognizerId: "fixture:identity-recognizer:vendor",
        version: "fixture:identity-recognizer:vendor/v0",
        recognize: () => [
          {
            normalizedRange: { startInclusive: 0, endExclusive: 13 },
            namespace: "VENDOR_CODE",
            canonicalValue: "SKU-EXACT-001",
          },
        ],
      },
    ];

    expect(() =>
      parse("SKU-EXACT-001", TEST_QUERY_LEXICON, recognizers),
    ).toThrow(TypeError);
    expect(() =>
      parse(
        "SKU-EXACT-001",
        TEST_QUERY_LEXICON,
        [...recognizers].reverse(),
      ),
    ).toThrow(TypeError);
  });

  it("targets confirmation by constraint identity and semantic value", () => {
    const normalizedQuery = normalizeQuery({ text: "human human" });
    const confirmation: QueryConfirmation = {
      confirmed: true,
      targetConstraintId: "constraint:1",
      value: {
        kind: "CATEGORICAL",
        attributeId: "material",
        valueId: "fixture:material:human-hair",
      },
    };
    const result = parseQuery({
      normalizedQuery,
      lexicon: TEST_QUERY_LEXICON,
      identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
      confirmations: [confirmation],
    });

    expect(
      result.constraints.map((constraint) => ({
        state: constraint.interpretationState,
        source: constraint.source,
      })),
    ).toEqual([
      {
        state: "DERIVED",
        source: {
          kind: "QUERY_SPAN",
          spanId: "span:0",
          lexiconEntryId: "fixture:lexicon:material-human-en-short",
          identityRecognizerId: null,
        },
      },
      {
        state: "DECLARED",
        source: {
          kind: "USER_CONFIRMATION",
          priorConstraintId: "constraint:1",
        },
      },
    ]);
  });

  it.each([
    {
      label: "wrong value for a known target",
      confirmation: {
        confirmed: true,
        targetConstraintId: "constraint:0",
        value: {
          kind: "CATEGORICAL",
          attributeId: "material",
          valueId: "fixture:material:synthetic",
        },
      },
      spanIds: ["span:0"],
    },
    {
      label: "nonexistent target",
      confirmation: {
        confirmed: true,
        targetConstraintId: "constraint:missing",
        value: {
          kind: "CATEGORICAL",
          attributeId: "material",
          valueId: "fixture:material:human-hair",
        },
      },
      spanIds: [],
    },
  ] satisfies ReadonlyArray<{
    readonly label: string;
    readonly confirmation: QueryConfirmation;
    readonly spanIds: readonly string[];
  }>)("does not confirm for $label", ({ confirmation, spanIds }) => {
    const result = parseQuery({
      normalizedQuery: normalizeQuery({ text: "human hair wig" }),
      lexicon: TEST_QUERY_LEXICON,
      identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
      confirmations: [confirmation],
    });

    expect(result.constraints[0]?.interpretationState).toBe("DERIVED");
    expect(result.diagnostics).toContainEqual({
      code: "CONFIRMATION_TARGET_OR_VALUE_MISMATCH",
      spanIds,
    });
  });

  it("ignores an unconfirmed targeted value without a mismatch diagnostic", () => {
    const result = parseQuery({
      normalizedQuery: normalizeQuery({ text: "human hair wig" }),
      lexicon: TEST_QUERY_LEXICON,
      identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
      confirmations: [
        {
          confirmed: false,
          targetConstraintId: "constraint:0",
          value: {
            kind: "CATEGORICAL",
            attributeId: "material",
            valueId: "fixture:material:human-hair",
          },
        },
      ],
    });

    expect(result.constraints[0]?.interpretationState).toBe("DERIVED");
    expect(result.diagnostics).toEqual([]);
  });

  it("does not mutate frozen recognizer, lexicon, or confirmation inputs", () => {
    const recognition = Object.freeze({
      normalizedRange: Object.freeze({
        startInclusive: 0,
        endExclusive: 13,
      }),
      namespace: "SKU",
      canonicalValue: "SKU-EXACT-001",
    });
    const recognizer: ExactIdentityRecognizer = Object.freeze({
      recognizerId: "fixture:identity-recognizer:frozen",
      version: "fixture:identity-recognizer:frozen/v0",
      recognize: () => Object.freeze([recognition]),
    });
    const lexicon: QueryLexicon = Object.freeze({
      ...TEST_QUERY_LEXICON,
      entries: Object.freeze(
        TEST_QUERY_LEXICON.entries.map((entry) =>
          Object.freeze({
            ...entry,
            value: Object.freeze({ ...entry.value }),
          }),
        ),
      ),
      units: Object.freeze(
        TEST_QUERY_LEXICON.units.map((entry) => Object.freeze({ ...entry })),
      ),
    });
    const confirmation: QueryConfirmation = Object.freeze({
      confirmed: true,
      targetConstraintId: "constraint:1",
      value: Object.freeze({
        kind: "CATEGORICAL",
        attributeId: "material",
        valueId: "fixture:material:human-hair",
      }),
    });
    const input: ParseQueryInput = Object.freeze({
      normalizedQuery: Object.freeze(
        normalizeQuery({ text: "SKU-EXACT-001 human" }),
      ),
      lexicon,
      identityRecognizers: Object.freeze([recognizer]),
      confirmations: Object.freeze([confirmation]),
    });

    const first = parseQuery(input);
    const second = parseQuery(input);

    expect(first).toEqual(second);
    expect(first.constraints[1]).toMatchObject({
      interpretationState: "DECLARED",
      source: {
        kind: "USER_CONFIRMATION",
        priorConstraintId: "constraint:1",
      },
    });
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
        targetConstraintId: "constraint:0",
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
