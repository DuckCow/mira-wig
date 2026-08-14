import { describe, expect, it } from "vitest";
import { messageDictionaries, messagesFor } from "../messages";

describe("critical storefront message dictionaries", () => {
  it("has the exact same required key shape for ko, en, and ja", () => {
    const dictionaries = messageDictionaries();
    const expected = leafPaths(dictionaries.ko);
    expect(leafPaths(dictionaries.en)).toEqual(expected);
    expect(leafPaths(dictionaries.ja)).toEqual(expected);
  });

  it.each(["en", "ja"] as const)("contains no Korean fallback in the %s critical projection", (locale) => {
    expect(allStrings(messagesFor(locale)).join("\n")).not.toMatch(/[가-힣]/u);
  });

  it("keeps locale-only projections independent from commerce facts", () => {
    const facts = { marketCode: "US", amount: 2_999, currency: "USD", published: true, confirmed: true };
    for (const locale of ["ko", "en", "ja"] as const) {
      expect({ ...facts, label: messagesFor(locale).cart.subtotal }).toMatchObject(facts);
    }
  });
});

function leafPaths<T extends object>(value: T, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, rawEntry] of Object.entries(value)) {
    const entry: unknown = rawEntry;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(entry)) paths.push(...leafPaths(entry, path));
    else paths.push(path);
  }
  return paths.sort();
}

function allStrings<T extends object>(value: T): string[] {
  return Object.values(value).flatMap((rawEntry) => {
    const entry: unknown = rawEntry;
    if (typeof entry === "string") return [entry];
    return isRecord(entry) ? allStrings(entry) : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
