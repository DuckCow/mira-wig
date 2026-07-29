import { describe, expect, it } from "vitest";

import {
  mapNormalizedRangeToRaw,
  normalizeQuery,
} from "../normalize-query";
import {
  createAudienceNamespace,
  createDeclaredQueryLanguage,
  createLocaleCode,
} from "../types";

describe("normalizeQuery", () => {
  it.each(["", "   ", "\t\n  "])(
    "represents empty comparison input explicitly for %j",
    (text) => {
      expect(normalizeQuery({ text })).toMatchObject({
        rawText: text,
        comparisonText: "",
        inputState: "EMPTY",
        normalizationForm: "NFC",
        coordinateSystem: "UTF16_CODE_UNIT",
      });
    },
  );

  it("preserves raw text while applying NFC, case folding, and comparison whitespace", () => {
    const rawText = "  Cafe\u0301 \t SKU-EXACT-001  ";
    const normalized = normalizeQuery({ text: rawText });

    expect(normalized.rawText).toBe(rawText);
    expect(normalized.comparisonText).toBe("café sku-exact-001");
    expect(normalized.inputState).toBe("NON_EMPTY");

    const normalizedCafeRange = {
      startInclusive: 0,
      endExclusive: "café".length,
    };
    const rawCafeRange = mapNormalizedRangeToRaw(normalized, normalizedCafeRange);
    expect(rawCafeRange).toEqual({ startInclusive: 2, endExclusive: 7 });
    expect(
      rawCafeRange === null
        ? null
        : rawText.slice(rawCafeRange.startInclusive, rawCafeRange.endExclusive),
    ).toBe("Cafe\u0301");
  });

  it("maps collapsed comparison whitespace back to the complete raw run", () => {
    const normalized = normalizeQuery({ text: "인모 \t\n 12 inch" });
    const comparisonSpace = normalized.offsetMap.find(
      (entry) =>
        normalized.comparisonText.slice(
          entry.normalizedRange.startInclusive,
          entry.normalizedRange.endExclusive,
        ) === " ",
    );

    expect(comparisonSpace).toEqual({
      normalizedRange: { startInclusive: 2, endExclusive: 3 },
      rawRange: { startInclusive: 2, endExclusive: 6 },
    });
    expect(
      comparisonSpace === undefined
        ? null
        : normalized.rawText.slice(
            comparisonSpace.rawRange.startInclusive,
            comparisonSpace.rawRange.endExclusive,
          ),
    ).toBe(" \t\n ");
  });

  it("is deterministic across repeated normalization", () => {
    const input = { text: "  인모  12 INCH  " };

    expect(normalizeQuery(input)).toEqual(normalizeQuery(input));
  });

  it("rejects blank or padded opaque context tokens", () => {
    expect(() => createLocaleCode(" en-US")).toThrow(RangeError);
    expect(() => createAudienceNamespace("")).toThrow(RangeError);
    expect(() => createDeclaredQueryLanguage("en ")).toThrow(RangeError);
  });
});
