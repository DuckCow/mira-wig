import type {
  NormalizedOffsetMapEntry,
  NormalizedQuery,
  RawQueryInput,
  TextRange,
} from "./types";

interface RawRun {
  readonly text: string;
  readonly rawRange: TextRange;
  readonly whitespace: boolean;
}

interface MappedCodePoint {
  readonly text: string;
  readonly rawRange: TextRange;
}

function toRawRuns(rawText: string): RawRun[] {
  const runs: RawRun[] = [];
  let cursor = 0;

  for (const codePoint of rawText) {
    const startInclusive = cursor;
    cursor += codePoint.length;
    const whitespace = /^\s$/u.test(codePoint);
    const previous = runs.at(-1);

    if (previous !== undefined && whitespace === previous.whitespace) {
      runs[runs.length - 1] = {
        text: previous.text + codePoint,
        rawRange: {
          startInclusive: previous.rawRange.startInclusive,
          endExclusive: cursor,
        },
        whitespace,
      };
      continue;
    }

    runs.push({
      text: codePoint,
      rawRange: { startInclusive, endExclusive: cursor },
      whitespace,
    });
  }

  return runs;
}

function comparisonForm(value: string): string {
  return value.toLowerCase().normalize("NFC");
}

function mergeRawRanges(
  mapped: readonly MappedCodePoint[],
  addedRange: TextRange,
): TextRange {
  return {
    startInclusive: Math.min(
      addedRange.startInclusive,
      ...mapped.map((entry) => entry.rawRange.startInclusive),
    ),
    endExclusive: Math.max(
      addedRange.endExclusive,
      ...mapped.map((entry) => entry.rawRange.endExclusive),
    ),
  };
}

function reconcileMappedPrefix(
  previous: readonly MappedCodePoint[],
  nextText: string,
  addedRange: TextRange,
): MappedCodePoint[] {
  const nextCodePoints = [...nextText];
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < previous.length &&
    commonPrefixLength < nextCodePoints.length &&
    previous[commonPrefixLength]?.text === nextCodePoints[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let commonSuffixLength = 0;
  while (
    commonSuffixLength < previous.length - commonPrefixLength &&
    commonSuffixLength < nextCodePoints.length - commonPrefixLength &&
    previous[previous.length - commonSuffixLength - 1]?.text ===
      nextCodePoints[nextCodePoints.length - commonSuffixLength - 1]
  ) {
    commonSuffixLength += 1;
  }

  const replacedPrevious = previous.slice(
    commonPrefixLength,
    previous.length - commonSuffixLength,
  );
  const contributingRawRange = mergeRawRanges(replacedPrevious, addedRange);
  const replacement = nextCodePoints
    .slice(commonPrefixLength, nextCodePoints.length - commonSuffixLength)
    .map((text) => ({ text, rawRange: contributingRawRange }));
  const suffix =
    commonSuffixLength === 0
      ? []
      : previous.slice(previous.length - commonSuffixLength);

  return [
    ...previous.slice(0, commonPrefixLength),
    ...replacement,
    ...suffix,
  ];
}

function normalizeRawRun(run: RawRun): MappedCodePoint[] {
  const mapped: MappedCodePoint[] = [];
  let rawPrefix = "";
  let rawCursor = run.rawRange.startInclusive;

  for (const codePoint of run.text) {
    const rawRange = {
      startInclusive: rawCursor,
      endExclusive: rawCursor + codePoint.length,
    };
    rawCursor = rawRange.endExclusive;
    rawPrefix += codePoint;
    const reconciled = reconcileMappedPrefix(
      mapped,
      comparisonForm(rawPrefix),
      rawRange,
    );
    mapped.splice(0, mapped.length, ...reconciled);
  }

  return mapped;
}

function appendMappedCodePoint(
  comparisonParts: string[],
  offsetMap: NormalizedOffsetMapEntry[],
  mappedCodePoint: MappedCodePoint,
  rawRange: TextRange,
): void {
  const startInclusive = comparisonParts.join("").length;
  comparisonParts.push(mappedCodePoint.text);
  offsetMap.push({
    normalizedRange: {
      startInclusive,
      endExclusive: startInclusive + mappedCodePoint.text.length,
    },
    rawRange,
  });
}

export function normalizeQuery(input: RawQueryInput): NormalizedQuery {
  const comparisonParts: string[] = [];
  const offsetMap: NormalizedOffsetMapEntry[] = [];
  let pendingWhitespace: TextRange | null = null;

  for (const run of toRawRuns(input.text)) {
    if (run.whitespace) {
      const whitespaceStart: number =
        pendingWhitespace === null
          ? run.rawRange.startInclusive
          : pendingWhitespace.startInclusive;
      pendingWhitespace = {
        startInclusive: whitespaceStart,
        endExclusive: run.rawRange.endExclusive,
      };
      continue;
    }

    if (pendingWhitespace !== null && comparisonParts.length > 0) {
      appendMappedCodePoint(
        comparisonParts,
        offsetMap,
        { text: " ", rawRange: pendingWhitespace },
        pendingWhitespace,
      );
    }

    pendingWhitespace = null;
    for (const mappedCodePoint of normalizeRawRun(run)) {
      appendMappedCodePoint(
        comparisonParts,
        offsetMap,
        mappedCodePoint,
        mappedCodePoint.rawRange,
      );
    }
  }

  const comparisonText = comparisonParts.join("");
  if (comparisonText !== comparisonText.normalize("NFC")) {
    throw new Error("Comparison text normalization invariant failed");
  }

  return {
    rawText: input.text,
    comparisonText,
    normalizationForm: "NFC",
    coordinateSystem: "UTF16_CODE_UNIT",
    inputState: comparisonText.length === 0 ? "EMPTY" : "NON_EMPTY",
    offsetMap,
  };
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.startInclusive < right.endExclusive && right.startInclusive < left.endExclusive;
}

export function mapNormalizedRangeToRaw(
  normalizedQuery: NormalizedQuery,
  normalizedRange: TextRange,
): TextRange | null {
  if (
    normalizedRange.startInclusive < 0 ||
    normalizedRange.endExclusive <= normalizedRange.startInclusive ||
    normalizedRange.endExclusive > normalizedQuery.comparisonText.length
  ) {
    return null;
  }

  const matchingEntries = normalizedQuery.offsetMap.filter((entry) =>
    rangesOverlap(entry.normalizedRange, normalizedRange),
  );
  const first = matchingEntries.at(0);
  const last = matchingEntries.at(-1);

  if (first === undefined || last === undefined) {
    return null;
  }

  return {
    startInclusive: first.rawRange.startInclusive,
    endExclusive: last.rawRange.endExclusive,
  };
}
