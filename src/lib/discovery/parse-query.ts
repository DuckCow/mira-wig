import { mapNormalizedRangeToRaw, normalizeQuery } from "./normalize-query";
import type {
  AttributeBand,
  ConstraintValue,
  Contradiction,
  ExactIdentityRecognition,
  InterpretedConstraint,
  LanguageTag,
  ParseQueryInput,
  ParserDiagnostic,
  ParserResult,
  QueryLexiconEntry,
  QuerySpan,
  QuerySpanOwner,
  QueryUnitEntry,
  TextRange,
  UnsupportedConcept,
} from "./types";
import { DISCOVERY_COMPONENT_VERSIONS } from "./versions";

interface ExactCandidate {
  readonly kind: "EXACT";
  readonly normalizedRange: TextRange;
  readonly rawRange: TextRange;
  readonly namespace: string;
  readonly recognizerId: string;
}

interface LexiconCandidate {
  readonly kind: "LEXICON";
  readonly normalizedRange: TextRange;
  readonly rawRange: TextRange;
  readonly entry: QueryLexiconEntry;
}

interface ContinuousCandidate {
  readonly kind: "CONTINUOUS";
  readonly normalizedRange: TextRange;
  readonly rawRange: TextRange;
  readonly entry: QueryUnitEntry;
  readonly quantity: number;
}

interface AmbiguousCandidate {
  readonly kind: "AMBIGUOUS";
  readonly normalizedRange: TextRange;
  readonly rawRange: TextRange;
  readonly attributeBand: AttributeBand;
}

type SelectedCandidate =
  | ExactCandidate
  | LexiconCandidate
  | ContinuousCandidate
  | AmbiguousCandidate;

interface ConstraintRecord {
  readonly span: QuerySpan;
  readonly constraint: InterpretedConstraint;
  readonly mutualExclusionGroup: string | null;
}

function rangeLength(range: TextRange): number {
  return range.endExclusive - range.startInclusive;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.startInclusive < right.endExclusive && right.startInclusive < left.endExclusive;
}

function isValidRecognition(
  recognition: ExactIdentityRecognition,
  comparisonText: string,
): boolean {
  return (
    Number.isInteger(recognition.normalizedRange.startInclusive) &&
    Number.isInteger(recognition.normalizedRange.endExclusive) &&
    recognition.normalizedRange.startInclusive >= 0 &&
    recognition.normalizedRange.endExclusive > recognition.normalizedRange.startInclusive &&
    recognition.normalizedRange.endExclusive <= comparisonText.length &&
    recognition.namespace.trim().length > 0
  );
}

function collectExactCandidates(input: ParseQueryInput): ExactCandidate[] {
  const candidates: ExactCandidate[] = [];

  for (const recognizer of input.identityRecognizers) {
    const recognitions = recognizer.recognize(input.normalizedQuery.comparisonText);

    for (const recognition of recognitions) {
      if (!isValidRecognition(recognition, input.normalizedQuery.comparisonText)) {
        continue;
      }

      const rawRange = mapNormalizedRangeToRaw(
        input.normalizedQuery,
        recognition.normalizedRange,
      );
      if (rawRange === null) {
        continue;
      }

      candidates.push({
        kind: "EXACT",
        normalizedRange: recognition.normalizedRange,
        rawRange,
        namespace: recognition.namespace,
        recognizerId: recognizer.recognizerId,
      });
    }
  }

  return candidates;
}

function selectStableNonOverlapping<T extends { readonly normalizedRange: TextRange }>(
  candidates: readonly T[],
): T[] {
  const selected: T[] = [];
  const ordered = [...candidates].sort((left, right) => {
    const startDifference =
      left.normalizedRange.startInclusive - right.normalizedRange.startInclusive;
    if (startDifference !== 0) {
      return startDifference;
    }

    return rangeLength(right.normalizedRange) - rangeLength(left.normalizedRange);
  });

  for (const candidate of ordered) {
    if (selected.some((current) => rangesOverlap(current.normalizedRange, candidate.normalizedRange))) {
      continue;
    }

    selected.push(candidate);
  }

  return selected;
}

function findSurfaceRanges(comparisonText: string, surface: string): TextRange[] {
  const ranges: TextRange[] = [];
  let cursor = 0;

  while (cursor <= comparisonText.length - surface.length) {
    const startInclusive = comparisonText.indexOf(surface, cursor);
    if (startInclusive < 0) {
      break;
    }

    ranges.push({
      startInclusive,
      endExclusive: startInclusive + surface.length,
    });
    cursor = startInclusive + 1;
  }

  return ranges;
}

function collectLexiconCandidates(input: ParseQueryInput): LexiconCandidate[] {
  const candidates: LexiconCandidate[] = [];

  for (const entry of input.lexicon.entries) {
    const normalizedSurface = normalizeQuery({ text: entry.surface }).comparisonText;
    if (normalizedSurface.length === 0) {
      continue;
    }

    for (const normalizedRange of findSurfaceRanges(
      input.normalizedQuery.comparisonText,
      normalizedSurface,
    )) {
      const rawRange = mapNormalizedRangeToRaw(input.normalizedQuery, normalizedRange);
      if (rawRange !== null) {
        candidates.push({ kind: "LEXICON", normalizedRange, rawRange, entry });
      }
    }
  }

  return candidates;
}

function constraintSemanticKey(value: QueryLexiconEntry["value"]): string {
  switch (value.kind) {
    case "CATEGORICAL":
      return JSON.stringify([value.kind, value.attributeId, value.valueId]);
    case "OUTCOME_INTENT":
    case "AUTHORITY_ROUTE":
      return JSON.stringify([value.kind, value.conceptId]);
    case "UNKNOWN_OR_UNSUPPORTED":
      return JSON.stringify([value.kind, value.conceptId, value.state]);
  }
}

function lexiconCandidateOrder(left: LexiconCandidate, right: LexiconCandidate): number {
  const lengthDifference =
    rangeLength(right.normalizedRange) - rangeLength(left.normalizedRange);
  if (lengthDifference !== 0) {
    return lengthDifference;
  }

  const startDifference =
    left.normalizedRange.startInclusive - right.normalizedRange.startInclusive;
  if (startDifference !== 0) {
    return startDifference;
  }

  return left.entry.entryId.localeCompare(right.entry.entryId);
}

function mergeRanges(candidates: readonly LexiconCandidate[]): TextRange {
  return {
    startInclusive: Math.min(
      ...candidates.map((candidate) => candidate.normalizedRange.startInclusive),
    ),
    endExclusive: Math.max(
      ...candidates.map((candidate) => candidate.normalizedRange.endExclusive),
    ),
  };
}

function selectLexiconCandidates(
  candidates: readonly LexiconCandidate[],
  occupied: readonly TextRange[],
  input: ParseQueryInput,
): Array<LexiconCandidate | AmbiguousCandidate> {
  const selected: Array<LexiconCandidate | AmbiguousCandidate> = [];
  let remaining = candidates.filter(
    (candidate) => !occupied.some((range) => rangesOverlap(range, candidate.normalizedRange)),
  );

  while (remaining.length > 0) {
    const ordered = [...remaining].sort(lexiconCandidateOrder);
    const best = ordered[0];
    if (best === undefined) {
      break;
    }

    const bestLength = rangeLength(best.normalizedRange);
    const samePrecedence = ordered.filter(
      (candidate) =>
        rangeLength(candidate.normalizedRange) === bestLength &&
        rangesOverlap(candidate.normalizedRange, best.normalizedRange),
    );
    const semanticKeys = new Set(
      samePrecedence.map((candidate) => constraintSemanticKey(candidate.entry.value)),
    );
    const ambiguous = semanticKeys.size > 1;
    const selectedRange = ambiguous ? mergeRanges(samePrecedence) : best.normalizedRange;

    if (ambiguous) {
      const rawRange = mapNormalizedRangeToRaw(input.normalizedQuery, selectedRange);
      if (rawRange !== null) {
        selected.push({
          kind: "AMBIGUOUS",
          normalizedRange: selectedRange,
          rawRange,
          attributeBand: best.entry.attributeBand,
        });
      }
    } else {
      selected.push(best);
    }

    remaining = remaining.filter(
      (candidate) => !rangesOverlap(candidate.normalizedRange, selectedRange),
    );
  }

  return selected;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWordLikeCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{Letter}\p{Number}_]/u.test(value);
}

function continuousCandidateFromMatch(
  input: ParseQueryInput,
  entry: QueryUnitEntry,
  match: RegExpMatchArray,
): ContinuousCandidate | null {
  const matchedText = match[0];
  const startInclusive = match.index;
  if (startInclusive === undefined) {
    return null;
  }
  const endExclusive = startInclusive + matchedText.length;
  const comparisonText = input.normalizedQuery.comparisonText;
  if (
    hasWordLikeCharacter(comparisonText[startInclusive - 1]) ||
    hasWordLikeCharacter(comparisonText[endExclusive])
  ) {
    return null;
  }

  const numericSurface = /^\d+(?:\.\d+)?/u.exec(matchedText)?.[0];
  const quantity = numericSurface === undefined ? Number.NaN : Number(numericSurface);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return null;
  }

  const normalizedRange = { startInclusive, endExclusive };
  const rawRange = mapNormalizedRangeToRaw(input.normalizedQuery, normalizedRange);
  if (rawRange === null) {
    return null;
  }

  return {
    kind: "CONTINUOUS",
    normalizedRange,
    rawRange,
    entry,
    quantity,
  };
}

function collectContinuousCandidates(input: ParseQueryInput): ContinuousCandidate[] {
  const candidates: ContinuousCandidate[] = [];
  const comparisonText = input.normalizedQuery.comparisonText;

  for (const entry of input.lexicon.units) {
    const normalizedUnit = normalizeQuery({ text: entry.surface }).comparisonText;
    if (normalizedUnit.length === 0 || normalizedUnit.includes(" ")) {
      continue;
    }

    const pattern = new RegExp(
      `\\d+(?:\\.\\d+)?\\s*${escapeRegularExpression(normalizedUnit)}`,
      "gu",
    );

    for (const match of comparisonText.matchAll(pattern)) {
      const candidate = continuousCandidateFromMatch(input, entry, match);
      if (candidate !== null) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function candidateOwner(candidate: SelectedCandidate): QuerySpanOwner {
  if (candidate.kind === "EXACT") {
    return "EXACT_IDENTITY";
  }
  if (candidate.kind === "CONTINUOUS") {
    return "NUMBER_WITH_UNIT";
  }
  if (candidate.kind === "AMBIGUOUS") {
    return "CONCEPT";
  }
  return candidate.entry.owner;
}

function candidateValue(candidate: SelectedCandidate, rawText: string): ConstraintValue {
  if (candidate.kind === "EXACT") {
    return { kind: "EXACT_IDENTITY", namespace: candidate.namespace, value: rawText };
  }
  if (candidate.kind === "CONTINUOUS") {
    return {
      kind: "CONTINUOUS",
      dimensionId: candidate.entry.dimensionId,
      quantity: { value: candidate.quantity, unitId: candidate.entry.unitId },
    };
  }
  if (candidate.kind === "AMBIGUOUS") {
    return { kind: "UNKNOWN_OR_UNSUPPORTED", conceptId: null, state: "AMBIGUOUS" };
  }
  return candidate.entry.value;
}

function candidateAttributeBand(candidate: SelectedCandidate): AttributeBand {
  if (candidate.kind === "EXACT") {
    return "IDENTITY";
  }
  if (candidate.kind === "CONTINUOUS") {
    return "DIMENSIONAL_CONTINUOUS";
  }
  if (candidate.kind === "AMBIGUOUS") {
    return candidate.attributeBand;
  }
  return candidate.entry.attributeBand;
}

function candidateInterpretation(candidate: SelectedCandidate): InterpretedConstraint["interpretationState"] {
  if (candidate.kind === "EXACT") {
    return "DECLARED";
  }
  if (candidate.kind === "CONTINUOUS") {
    return "DERIVED";
  }
  if (candidate.kind === "AMBIGUOUS") {
    return "UNRESOLVED";
  }
  return candidate.entry.interpretationState;
}

function candidateLanguage(candidate: SelectedCandidate): LanguageTag | null {
  if (candidate.kind === "LEXICON") {
    return candidate.entry.languageTag;
  }
  if (candidate.kind === "CONTINUOUS") {
    return candidate.entry.languageTag;
  }
  return null;
}

function buildConstraintRecords(
  candidates: readonly SelectedCandidate[],
  input: ParseQueryInput,
): ConstraintRecord[] {
  return candidates.map((candidate, index) => {
    const spanId = `span:${index}`;
    const constraintId = `constraint:${index}`;
    const rawText = input.normalizedQuery.rawText.slice(
      candidate.rawRange.startInclusive,
      candidate.rawRange.endExclusive,
    );
    const normalizedText = input.normalizedQuery.comparisonText.slice(
      candidate.normalizedRange.startInclusive,
      candidate.normalizedRange.endExclusive,
    );
    const interpretationState = candidateInterpretation(candidate);
    const lexiconEntryId = candidate.kind === "LEXICON" ? candidate.entry.entryId : null;
    const identityRecognizerId = candidate.kind === "EXACT" ? candidate.recognizerId : null;
    const conceptId = candidate.kind === "LEXICON" ? candidate.entry.conceptId : null;
    const mutualExclusionGroup =
      candidate.kind === "LEXICON" ? candidate.entry.mutualExclusionGroup : null;

    return {
      span: {
        spanId,
        constraintId,
        rawRange: candidate.rawRange,
        normalizedRange: candidate.normalizedRange,
        rawText,
        normalizedText,
        owner: candidateOwner(candidate),
        conceptId,
        lexiconEntryId,
        identityRecognizerId,
        languageTag: candidateLanguage(candidate),
        interpretationState,
      },
      constraint: {
        constraintId,
        value: candidateValue(candidate, rawText),
        source: {
          kind: "QUERY_SPAN",
          spanId,
          lexiconEntryId,
          identityRecognizerId,
        },
        interpretationState,
        attributeBand: candidateAttributeBand(candidate),
      },
      mutualExclusionGroup,
    };
  });
}

function constraintValueKey(value: ConstraintValue): string {
  switch (value.kind) {
    case "EXACT_IDENTITY":
      return JSON.stringify([value.kind, value.namespace, value.value]);
    case "CATEGORICAL":
      return JSON.stringify([value.kind, value.attributeId, value.valueId]);
    case "CONTINUOUS":
      return JSON.stringify([
        value.kind,
        value.dimensionId,
        value.quantity.value,
        value.quantity.unitId,
      ]);
    case "OUTCOME_INTENT":
      return JSON.stringify([value.kind, value.conceptId]);
    case "AUTHORITY_ROUTE":
      return JSON.stringify([value.kind, value.conceptId]);
    case "UNKNOWN_OR_UNSUPPORTED":
      return JSON.stringify([value.kind, value.conceptId, value.state]);
  }
}

function constraintValuesEqual(left: ConstraintValue, right: ConstraintValue): boolean {
  return constraintValueKey(left) === constraintValueKey(right);
}

function applyConfirmations(
  records: readonly ConstraintRecord[],
  input: ParseQueryInput,
): ConstraintRecord[] {
  const confirmations = input.confirmations ?? [];

  return records.map((record) => {
    const confirmed = confirmations.some(
      (confirmation) =>
        confirmation.confirmed &&
        constraintValuesEqual(confirmation.value, record.constraint.value),
    );
    if (!confirmed) {
      return record;
    }

    return {
      ...record,
      span: { ...record.span, interpretationState: "DECLARED" },
      constraint: {
        ...record.constraint,
        source: {
          kind: "USER_CONFIRMATION",
          priorConstraintId: record.constraint.constraintId,
        },
        interpretationState: "DECLARED",
      },
    };
  });
}

function detectContradictions(records: readonly ConstraintRecord[]): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex];
    if (
      left === undefined ||
      left.mutualExclusionGroup === null ||
      left.constraint.value.kind !== "CATEGORICAL"
    ) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex];
      if (
        right === undefined ||
        right.mutualExclusionGroup !== left.mutualExclusionGroup ||
        right.constraint.value.kind !== "CATEGORICAL" ||
        right.constraint.value.valueId === left.constraint.value.valueId
      ) {
        continue;
      }

      contradictions.push({
        constraintId: `contradiction:${contradictions.length}`,
        leftConstraintId: left.constraint.constraintId,
        rightConstraintId: right.constraint.constraintId,
        attributeId: left.constraint.value.attributeId,
        kind: "MUTUALLY_EXCLUSIVE_VALUES",
      });
    }
  }

  return contradictions;
}

function buildUnsupported(records: readonly ConstraintRecord[]): UnsupportedConcept[] {
  return records.flatMap((record) => {
    if (
      record.span.owner !== "UNSUPPORTED" ||
      record.constraint.value.kind !== "UNKNOWN_OR_UNSUPPORTED"
    ) {
      return [];
    }

    return [
      {
        constraintId: record.constraint.constraintId,
        conceptId: record.constraint.value.conceptId,
        spanId: record.span.spanId,
        state: "UNRESOLVED",
      },
    ];
  });
}

function buildDiagnostics(records: readonly ConstraintRecord[], empty: boolean): ParserDiagnostic[] {
  const diagnostics: ParserDiagnostic[] = [];

  if (empty) {
    diagnostics.push({ code: "EMPTY_QUERY", spanIds: [] });
  }

  for (const record of records) {
    if (
      record.constraint.value.kind === "UNKNOWN_OR_UNSUPPORTED" &&
      record.constraint.value.state === "AMBIGUOUS"
    ) {
      diagnostics.push({
        code: "AMBIGUOUS_SAME_PRECEDENCE_OVERLAP",
        spanIds: [record.span.spanId],
      });
    }
  }

  const languages = new Set(
    records.flatMap((record) =>
      record.span.languageTag === null ? [] : [record.span.languageTag.value],
    ),
  );
  if (languages.size > 1) {
    diagnostics.push({
      code: "MIXED_LANGUAGE_SPANS_RESOLVED",
      spanIds: records
        .filter((record) => record.span.languageTag !== null)
        .map((record) => record.span.spanId),
    });
  }

  return diagnostics;
}

export function parseQuery(input: ParseQueryInput): ParserResult {
  const exactCandidates = selectStableNonOverlapping(collectExactCandidates(input));
  const exactRanges = exactCandidates.map((candidate) => candidate.normalizedRange);
  const lexiconCandidates = selectLexiconCandidates(
    collectLexiconCandidates(input),
    exactRanges,
    input,
  );
  const occupiedRanges = [
    ...exactRanges,
    ...lexiconCandidates.map((candidate) => candidate.normalizedRange),
  ];
  const continuousCandidates = selectStableNonOverlapping(
    collectContinuousCandidates(input).filter(
      (candidate) =>
        !occupiedRanges.some((range) => rangesOverlap(range, candidate.normalizedRange)),
    ),
  );
  const selected: SelectedCandidate[] = [
    ...exactCandidates,
    ...lexiconCandidates,
    ...continuousCandidates,
  ].sort(
    (left, right) =>
      left.normalizedRange.startInclusive - right.normalizedRange.startInclusive,
  );
  const records = applyConfirmations(buildConstraintRecords(selected, input), input);

  return {
    normalizedQuery: input.normalizedQuery,
    spans: records.map((record) => record.span),
    constraints: records.map((record) => record.constraint),
    unsupported: buildUnsupported(records),
    contradictions: detectContradictions(records),
    diagnostics: buildDiagnostics(
      records,
      input.normalizedQuery.inputState === "EMPTY",
    ),
    parserVersion: DISCOVERY_COMPONENT_VERSIONS.parser,
    lexiconVersion: input.lexicon.version,
    ontologyVersion: input.lexicon.ontologyVersion,
  };
}
