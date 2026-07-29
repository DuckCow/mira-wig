import type {
  NormalizedOffsetMapEntry,
  NormalizedQuery,
  RawQueryInput,
  TextRange,
} from "./types";

interface RawSegment {
  readonly text: string;
  readonly rawRange: TextRange;
  readonly whitespace: boolean;
}

function isCombiningMark(value: string): boolean {
  return /^\p{Mark}$/u.test(value);
}

function toRawSegments(rawText: string): RawSegment[] {
  const segments: RawSegment[] = [];
  let cursor = 0;

  for (const codePoint of rawText) {
    const startInclusive = cursor;
    cursor += codePoint.length;
    const whitespace = /^\s$/u.test(codePoint);
    const previous = segments.at(-1);

    if (previous !== undefined && whitespace && previous.whitespace) {
      segments[segments.length - 1] = {
        text: previous.text + codePoint,
        rawRange: {
          startInclusive: previous.rawRange.startInclusive,
          endExclusive: cursor,
        },
        whitespace: true,
      };
      continue;
    }

    if (previous !== undefined && !whitespace && !previous.whitespace && isCombiningMark(codePoint)) {
      segments[segments.length - 1] = {
        text: previous.text + codePoint,
        rawRange: {
          startInclusive: previous.rawRange.startInclusive,
          endExclusive: cursor,
        },
        whitespace: false,
      };
      continue;
    }

    segments.push({
      text: codePoint,
      rawRange: { startInclusive, endExclusive: cursor },
      whitespace,
    });
  }

  return segments;
}

function appendNormalizedSegment(
  comparisonParts: string[],
  offsetMap: NormalizedOffsetMapEntry[],
  normalizedText: string,
  rawRange: TextRange,
): void {
  const startInclusive = comparisonParts.join("").length;
  comparisonParts.push(normalizedText);
  offsetMap.push({
    normalizedRange: {
      startInclusive,
      endExclusive: startInclusive + normalizedText.length,
    },
    rawRange,
  });
}

export function normalizeQuery(input: RawQueryInput): NormalizedQuery {
  const comparisonParts: string[] = [];
  const offsetMap: NormalizedOffsetMapEntry[] = [];
  let pendingWhitespace: TextRange | null = null;

  for (const segment of toRawSegments(input.text)) {
    if (segment.whitespace) {
      const whitespaceStart: number =
        pendingWhitespace === null
          ? segment.rawRange.startInclusive
          : pendingWhitespace.startInclusive;
      pendingWhitespace = {
        startInclusive: whitespaceStart,
        endExclusive: segment.rawRange.endExclusive,
      };
      continue;
    }

    if (pendingWhitespace !== null && comparisonParts.length > 0) {
      appendNormalizedSegment(comparisonParts, offsetMap, " ", pendingWhitespace);
    }

    pendingWhitespace = null;
    appendNormalizedSegment(
      comparisonParts,
      offsetMap,
      segment.text.normalize("NFC").toLowerCase(),
      segment.rawRange,
    );
  }

  const comparisonText = comparisonParts.join("");

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
