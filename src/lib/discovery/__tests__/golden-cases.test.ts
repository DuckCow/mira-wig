import { describe, expect, it } from "vitest";

import { decideConstraint } from "../decide-constraint";
import { normalizeQuery } from "../normalize-query";
import { parseQuery } from "../parse-query";
import type {
  ConstraintDecisionTarget,
  ParserResult,
  QueryConfirmation,
} from "../types";
import {
  loadGoldenCases,
  parseGoldenCasesFixture,
  type GoldenCase,
  type GoldenDecisionCase,
} from "./fixtures/load-golden-cases";
import { TEST_IDENTITY_RECOGNIZERS } from "./fixtures/test-identity-recognizers";
import { TEST_QUERY_LEXICON } from "./fixtures/test-lexicon";

const fixture = loadGoldenCases();

function parseGoldenCase(goldenCase: GoldenCase): ParserResult {
  const confirmations: readonly QueryConfirmation[] =
    goldenCase.confirmation === undefined ? [] : [goldenCase.confirmation];

  return parseQuery({
    normalizedQuery: normalizeQuery({ text: goldenCase.query }),
    lexicon: TEST_QUERY_LEXICON,
    identityRecognizers: TEST_IDENTITY_RECOGNIZERS,
    confirmations,
  });
}

function projectParser(result: ParserResult) {
  return {
    spans: result.spans.map((span) => {
      const constraint = result.constraints.find(
        (candidate) => candidate.constraintId === span.constraintId,
      );
      if (constraint === undefined) {
        throw new Error(`Missing constraint for ${span.constraintId}`);
      }

      return {
        constraintId: span.constraintId,
        owner: span.owner,
        rawText: span.rawText,
        languageTag: span.languageTag?.value ?? null,
        interpretationState: span.interpretationState,
        value: constraint.value,
      };
    }),
    unsupported: result.unsupported.map((entry) => ({
      constraintId: entry.constraintId,
      conceptId: entry.conceptId,
      state: entry.state,
    })),
    contradictions: result.contradictions,
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
  };
}

function resolveTarget(
  result: ParserResult,
  decisionCase: GoldenDecisionCase,
): ConstraintDecisionTarget {
  const targetRef = decisionCase.target;
  if (targetRef.kind === "CONSTRAINT") {
    const constraint = result.constraints.find(
      (candidate) => candidate.constraintId === targetRef.constraintId,
    );
    if (constraint === undefined) {
      throw new Error(
        `Missing golden constraint ${targetRef.constraintId}`,
      );
    }
    return { kind: "INTERPRETED_CONSTRAINT", constraint };
  }

  const contradiction = result.contradictions.find(
    (candidate) => candidate.constraintId === targetRef.contradictionId,
  );
  if (contradiction === undefined) {
    throw new Error(
      `Missing golden contradiction ${targetRef.contradictionId}`,
    );
  }
  return { kind: "CONTRADICTION", contradiction };
}

describe("D5 source-only golden cases", () => {
  it("keeps the fixture explicitly synthetic and production-disabled", () => {
    expect(fixture).toMatchObject({
      schemaVersion: "d5-golden-cases/v0.1-provisional",
      taskClassification: "SOURCE_ONLY",
      productionActivationAuthorized: false,
      fixtureOnly: true,
    });
    expect(fixture.cases).toHaveLength(10);
  });

  it.each(fixture.cases)("$caseId parses and decides deterministically", (goldenCase) => {
    const first = parseGoldenCase(goldenCase);
    const second = parseGoldenCase(goldenCase);

    expect(first).toEqual(second);
    expect(projectParser(first)).toEqual(goldenCase.expectedParser);
    expect(
      first.spans.every(
        (span) =>
          first.normalizedQuery.rawText.slice(
            span.rawRange.startInclusive,
            span.rawRange.endExclusive,
          ) === span.rawText,
      ),
    ).toBe(true);

    for (const decisionCase of goldenCase.decisions) {
      const decision = decideConstraint({
        target: resolveTarget(first, decisionCase),
        subject: decisionCase.subject,
        context: goldenCase.context,
        ...(decisionCase.evidence === undefined
          ? {}
          : { evidence: decisionCase.evidence }),
        policies: decisionCase.policies,
      });

      expect(decision).toEqual(decisionCase.expected);
      expect(decision.constraintId).not.toBe("");
    }
  });

  it("keeps mixed-language product decisions independent per constraint", () => {
    const mixed = fixture.cases.find(
      (goldenCase) =>
        goldenCase.caseId === "D5-G06-MIXED-LANGUAGE-MULTI-SEGMENT",
    );
    if (mixed === undefined) {
      throw new Error("Missing mixed-language golden case");
    }

    expect(
      mixed.decisions.map((decision) =>
        decision.target.kind === "CONSTRAINT"
          ? decision.target.constraintId
          : decision.target.contradictionId,
      ),
    ).toEqual(["constraint:0", "constraint:1", "constraint:2"]);
    expect(
      mixed.decisions.map((decision) => decision.subject),
    ).toEqual([
      {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: "fixture:product:mixed-match",
      },
      {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: "fixture:product:mixed-match",
      },
      {
        kind: "FIXTURE_PRODUCT",
        fixtureProductId: "fixture:product:mixed-match",
      },
    ]);
  });

  it("changes confirmation source and intent without changing missing evidence", () => {
    const confirmation = fixture.cases.find(
      (goldenCase) =>
        goldenCase.caseId ===
        "D5-G08-CONFIRMATION-CHANGES-INTENT-NOT-EVIDENCE",
    );
    if (confirmation === undefined) {
      throw new Error("Missing confirmation golden case");
    }

    const parsed = parseGoldenCase(confirmation);
    expect(parsed.constraints[0]).toMatchObject({
      interpretationState: "DECLARED",
      source: {
        kind: "USER_CONFIRMATION",
        priorConstraintId: "constraint:0",
      },
    });
    expect(confirmation.decisions[0]?.evidence?.state).toBe("MISSING");
  });

  it("rejects malformed untrusted JSON fixture data", () => {
    expect(() =>
      parseGoldenCasesFixture({
        schemaVersion: "broken",
        taskClassification: "SOURCE_ONLY",
        productionActivationAuthorized: false,
        fixtureOnly: true,
        cases: [],
      }),
    ).toThrow(TypeError);

    expect(() =>
      parseGoldenCasesFixture({
        schemaVersion: "broken",
        taskClassification: "SOURCE_ONLY",
        productionActivationAuthorized: false,
        fixtureOnly: true,
        cases: [{ caseId: 123 }],
      }),
    ).toThrow(TypeError);
  });
});
