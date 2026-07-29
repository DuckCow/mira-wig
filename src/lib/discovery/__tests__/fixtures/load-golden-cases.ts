import { readFileSync } from "node:fs";

import { isMarketCode } from "@/lib/market/types";

import {
  createAudienceNamespace,
  createAutoQueryLanguage,
  createDeclaredQueryLanguage,
  createLocaleCode,
  type ConstraintValue,
  type DecisionPolicyFixture,
  type DecisionSubject,
  type DiscoveryContext,
  type ProductEvidenceFixture,
  type ProductEvidenceFixtureState,
  type ProductEvidenceValue,
  type QueryConfirmation,
} from "../../types";

type ExpectedRecord = Readonly<Record<string, unknown>>;

export interface GoldenParserExpectation {
  readonly spans: readonly ExpectedRecord[];
  readonly unsupported: readonly ExpectedRecord[];
  readonly contradictions: readonly ExpectedRecord[];
  readonly diagnostics: readonly string[];
}

export type GoldenDecisionTargetRef =
  | { readonly kind: "CONSTRAINT"; readonly constraintId: string }
  | { readonly kind: "CONTRADICTION"; readonly contradictionId: string };

export interface GoldenDecisionCase {
  readonly target: GoldenDecisionTargetRef;
  readonly subject: DecisionSubject;
  readonly evidence?: ProductEvidenceFixture;
  readonly policies: readonly DecisionPolicyFixture[];
  readonly expected: ExpectedRecord;
}

export interface GoldenCase {
  readonly caseId: string;
  readonly query: string;
  readonly context: DiscoveryContext;
  readonly confirmation?: QueryConfirmation;
  readonly expectedParser: GoldenParserExpectation;
  readonly decisions: readonly GoldenDecisionCase[];
}

export interface GoldenCasesFixture {
  readonly schemaVersion: string;
  readonly taskClassification: "SOURCE_ONLY";
  readonly productionActivationAuthorized: false;
  readonly fixtureOnly: true;
  readonly cases: readonly GoldenCase[];
}

function invalid(path: string): never {
  throw new TypeError(`Invalid D5 golden fixture at ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  return isRecord(value) ? value : invalid(path);
}

function readString(value: unknown, path: string): string {
  return typeof value === "string" ? value : invalid(path);
}

function readFiniteNumber(value: unknown, path: string): number {
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(path);
}

function readNonnegativeNumber(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  return number >= 0 ? number : invalid(path);
}

function readStringOrNull(value: unknown, path: string): string | null {
  return value === null ? null : readString(value, path);
}

function readStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    return invalid(path);
  }

  return value.map((entry, index) => readString(entry, `${path}[${index}]`));
}

function readRecordArray(value: unknown, path: string): ExpectedRecord[] {
  if (!Array.isArray(value)) {
    return invalid(path);
  }

  return value.map((entry, index) => readRecord(entry, `${path}[${index}]`));
}

function parseContext(value: unknown, path: string): DiscoveryContext {
  const record = readRecord(value, path);
  const marketCode = readString(record.marketCode, `${path}.marketCode`);
  if (!isMarketCode(marketCode)) {
    return invalid(`${path}.marketCode`);
  }

  const queryLanguageRecord = readRecord(
    record.queryLanguage,
    `${path}.queryLanguage`,
  );
  const mode = readString(queryLanguageRecord.mode, `${path}.queryLanguage.mode`);
  const queryLanguage =
    mode === "AUTO"
      ? createAutoQueryLanguage()
      : createDeclaredQueryLanguage(
          mode === "DECLARED"
            ? readString(
                queryLanguageRecord.languageTag,
                `${path}.queryLanguage.languageTag`,
              )
            : invalid(`${path}.queryLanguage.mode`),
        );

  return {
    marketCode,
    locale: createLocaleCode(readString(record.locale, `${path}.locale`)),
    queryLanguage,
    audienceNamespace: createAudienceNamespace(
      readString(record.audienceNamespace, `${path}.audienceNamespace`),
    ),
  };
}

function parseConstraintValue(value: unknown, path: string): ConstraintValue {
  const record = readRecord(value, path);
  const kind = readString(record.kind, `${path}.kind`);

  switch (kind) {
    case "EXACT_IDENTITY":
      return {
        kind,
        namespace: readString(record.namespace, `${path}.namespace`),
        value: readString(record.value, `${path}.value`),
      };
    case "CATEGORICAL":
      return {
        kind,
        attributeId: readString(record.attributeId, `${path}.attributeId`),
        valueId: readString(record.valueId, `${path}.valueId`),
      };
    case "CONTINUOUS": {
      const quantity = readRecord(record.quantity, `${path}.quantity`);
      return {
        kind,
        dimensionId: readString(record.dimensionId, `${path}.dimensionId`),
        quantity: {
          value: readNonnegativeNumber(quantity.value, `${path}.quantity.value`),
          unitId: readString(quantity.unitId, `${path}.quantity.unitId`),
        },
      };
    }
    case "OUTCOME_INTENT":
      return {
        kind,
        conceptId: readString(record.conceptId, `${path}.conceptId`),
      };
    case "AUTHORITY_ROUTE":
      return {
        kind,
        conceptId: readString(record.conceptId, `${path}.conceptId`),
      };
    case "UNKNOWN_OR_UNSUPPORTED": {
      const state = readString(record.state, `${path}.state`);
      if (state !== "UNSUPPORTED" && state !== "AMBIGUOUS") {
        return invalid(`${path}.state`);
      }
      return {
        kind,
        conceptId: readStringOrNull(record.conceptId, `${path}.conceptId`),
        state,
      };
    }
    default:
      return invalid(`${path}.kind`);
  }
}

function parseEvidenceValue(value: unknown, path: string): ProductEvidenceValue | null {
  if (value === null) {
    return null;
  }

  const record = readRecord(value, path);
  const kind = readString(record.kind, `${path}.kind`);

  if (kind === "EXACT_IDENTITY") {
    return {
      kind,
      namespace: readString(record.namespace, `${path}.namespace`),
      value: readString(record.value, `${path}.value`),
    };
  }
  if (kind === "CATEGORICAL") {
    return {
      kind,
      valueId: readString(record.valueId, `${path}.valueId`),
    };
  }
  if (kind === "MEASURED_QUANTITY") {
    const quantity = readRecord(record.quantity, `${path}.quantity`);
    return {
      kind,
      quantity: {
        value: readNonnegativeNumber(quantity.value, `${path}.quantity.value`),
        unitId: readString(quantity.unitId, `${path}.quantity.unitId`),
      },
    };
  }

  return invalid(`${path}.kind`);
}

function parseEvidenceState(value: unknown, path: string): ProductEvidenceFixtureState {
  switch (value) {
    case "VERIFIED_OR_MEASURED":
    case "APPROVED_VENDOR_ATTESTED":
    case "UNAPPROVED_VENDOR_DECLARATION":
    case "HUMAN_CURATED_FROM_EVIDENCE":
    case "MODEL_INFERRED":
    case "MISSING":
    case "CONFLICTING":
    case "NOT_REPRESENTABLE":
    case "UNKNOWN_AUTHORITY":
      return value;
    default:
      return invalid(path);
  }
}

function parseEvidence(value: unknown, path: string): ProductEvidenceFixture {
  const record = readRecord(value, path);
  if (record.fixtureOnly !== true || record.synthetic !== true) {
    return invalid(`${path}.fixtureOnly/synthetic`);
  }

  return {
    fixtureOnly: true,
    synthetic: true,
    fixtureProductId: readString(
      record.fixtureProductId,
      `${path}.fixtureProductId`,
    ),
    attributeId: readString(record.attributeId, `${path}.attributeId`),
    value: parseEvidenceValue(record.value, `${path}.value`),
    state: parseEvidenceState(record.state, `${path}.state`),
    syntheticEvidenceRef: readStringOrNull(
      record.syntheticEvidenceRef,
      `${path}.syntheticEvidenceRef`,
    ),
  };
}

function parsePolicy(value: unknown, path: string): DecisionPolicyFixture {
  const record = readRecord(value, path);
  if (record.synthetic !== true) {
    return invalid(`${path}.synthetic`);
  }

  const kind = readString(record.kind, `${path}.kind`);
  if (kind === "CLAIM_AUTHORITY") {
    if (record.status !== "UNAVAILABLE") {
      return invalid(`${path}.status`);
    }
    return { kind, synthetic: true, status: "UNAVAILABLE" };
  }
  if (kind === "CONTINUOUS_TOLERANCE") {
    return {
      kind,
      synthetic: true,
      dimensionId: readString(record.dimensionId, `${path}.dimensionId`),
      unitId: readString(record.unitId, `${path}.unitId`),
      lowerDelta: readNonnegativeNumber(record.lowerDelta, `${path}.lowerDelta`),
      upperDelta: readNonnegativeNumber(record.upperDelta, `${path}.upperDelta`),
      policyVersion: readString(record.policyVersion, `${path}.policyVersion`),
    };
  }
  if (kind === "VENDOR_ATTESTATION") {
    if (typeof record.permitted !== "boolean") {
      return invalid(`${path}.permitted`);
    }
    return {
      kind,
      synthetic: true,
      permitted: record.permitted,
      policyVersion: readString(record.policyVersion, `${path}.policyVersion`),
    };
  }

  return invalid(`${path}.kind`);
}

function parsePolicies(value: unknown, path: string): DecisionPolicyFixture[] {
  if (!Array.isArray(value)) {
    return invalid(path);
  }

  return value.map((entry, index) => parsePolicy(entry, `${path}[${index}]`));
}

function parseSubject(value: unknown, path: string): DecisionSubject {
  const record = readRecord(value, path);
  const kind = readString(record.kind, `${path}.kind`);
  if (kind === "QUERY") {
    return { kind };
  }
  if (kind === "FIXTURE_PRODUCT") {
    return {
      kind,
      fixtureProductId: readString(
        record.fixtureProductId,
        `${path}.fixtureProductId`,
      ),
    };
  }

  return invalid(`${path}.kind`);
}

function validateExpectedDecision(value: unknown, path: string): ExpectedRecord {
  const record = readRecord(value, path);
  readString(record.constraintId, `${path}.constraintId`);
  parseSubject(record.subject, `${path}.subject`);
  readRecord(record.authorityOutcome, `${path}.authorityOutcome`);
  readString(record.gate, `${path}.gate`);
  readString(record.score, `${path}.score`);
  readStringArray(record.speechRequirements, `${path}.speechRequirements`);
  readString(record.partition, `${path}.partition`);
  readString(record.relaxation, `${path}.relaxation`);
  readStringArray(record.fallbackRoutes, `${path}.fallbackRoutes`);
  readStringArray(record.reasons, `${path}.reasons`);
  readStringArray(record.diagnostics, `${path}.diagnostics`);
  return record;
}

function parseDecision(value: unknown, path: string): GoldenDecisionCase {
  const record = readRecord(value, path);
  const constraintId =
    typeof record.targetConstraintId === "string" ? record.targetConstraintId : null;
  const contradictionId =
    typeof record.targetContradictionId === "string"
      ? record.targetContradictionId
      : null;
  if ((constraintId === null) === (contradictionId === null)) {
    return invalid(`${path}.target`);
  }

  const target: GoldenDecisionTargetRef =
    constraintId !== null
      ? { kind: "CONSTRAINT", constraintId }
      : {
          kind: "CONTRADICTION",
          contradictionId:
            contradictionId ?? invalid(`${path}.targetContradictionId`),
        };
  const evidence =
    record.evidence === undefined
      ? undefined
      : parseEvidence(record.evidence, `${path}.evidence`);

  return {
    target,
    subject: parseSubject(record.subject, `${path}.subject`),
    ...(evidence === undefined ? {} : { evidence }),
    policies: parsePolicies(record.policies, `${path}.policies`),
    expected: validateExpectedDecision(record.expected, `${path}.expected`),
  };
}

function validateExpectedParser(value: unknown, path: string): GoldenParserExpectation {
  const record = readRecord(value, path);
  const spans = readRecordArray(record.spans, `${path}.spans`);
  for (const [index, span] of spans.entries()) {
    readString(span.constraintId, `${path}.spans[${index}].constraintId`);
    readString(span.owner, `${path}.spans[${index}].owner`);
    readString(span.rawText, `${path}.spans[${index}].rawText`);
    readString(span.interpretationState, `${path}.spans[${index}].interpretationState`);
    readStringOrNull(span.languageTag, `${path}.spans[${index}].languageTag`);
    readRecord(span.value, `${path}.spans[${index}].value`);
  }

  return {
    spans,
    unsupported: readRecordArray(record.unsupported, `${path}.unsupported`),
    contradictions: readRecordArray(
      record.contradictions,
      `${path}.contradictions`,
    ),
    diagnostics: readStringArray(record.diagnostics, `${path}.diagnostics`),
  };
}

function parseConfirmation(value: unknown, path: string): QueryConfirmation {
  const record = readRecord(value, path);
  if (typeof record.confirmed !== "boolean") {
    return invalid(`${path}.confirmed`);
  }

  return {
    confirmed: record.confirmed,
    value: parseConstraintValue(record.value, `${path}.value`),
  };
}

function parseCase(value: unknown, path: string): GoldenCase {
  const record = readRecord(value, path);
  if (!Array.isArray(record.decisions)) {
    return invalid(`${path}.decisions`);
  }

  const confirmation =
    record.confirmation === undefined
      ? undefined
      : parseConfirmation(record.confirmation, `${path}.confirmation`);

  return {
    caseId: readString(record.caseId, `${path}.caseId`),
    query: readString(record.query, `${path}.query`),
    context: parseContext(record.context, `${path}.context`),
    ...(confirmation === undefined ? {} : { confirmation }),
    expectedParser: validateExpectedParser(
      record.expectedParser,
      `${path}.expectedParser`,
    ),
    decisions: record.decisions.map((decision, index) =>
      parseDecision(decision, `${path}.decisions[${index}]`),
    ),
  };
}

export function parseGoldenCasesFixture(parsed: unknown): GoldenCasesFixture {
  const record = readRecord(parsed, "$");
  if (
    record.taskClassification !== "SOURCE_ONLY" ||
    record.productionActivationAuthorized !== false ||
    record.fixtureOnly !== true ||
    !Array.isArray(record.cases)
  ) {
    return invalid("$");
  }

  const cases = record.cases.map((entry, index) => parseCase(entry, `$.cases[${index}]`));
  if (cases.length !== 10 || new Set(cases.map((entry) => entry.caseId)).size !== 10) {
    return invalid("$.cases");
  }

  return {
    schemaVersion: readString(record.schemaVersion, "$.schemaVersion"),
    taskClassification: "SOURCE_ONLY",
    productionActivationAuthorized: false,
    fixtureOnly: true,
    cases,
  };
}

export function loadGoldenCases(): GoldenCasesFixture {
  const source = readFileSync(
    new URL("./golden-cases.v0.provisional.json", import.meta.url),
    "utf8",
  );
  const parsed: unknown = JSON.parse(source);
  return parseGoldenCasesFixture(parsed);
}
