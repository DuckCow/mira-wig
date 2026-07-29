import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DISCOVERY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "types.ts": ["@/lib/market/types"],
  "versions.ts": ["./types"],
  "normalize-query.ts": ["./types"],
  "parse-query.ts": ["./normalize-query", "./types", "./versions"],
  "decide-constraint.ts": ["./types"],
};

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /\bimport\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

describe("D5 source boundary", () => {
  it("has the reviewed production import graph and no runtime boundary imports", () => {
    const productionFiles = readdirSync(DISCOVERY_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(productionFiles).toEqual(Object.keys(ALLOWED_IMPORTS).sort());

    for (const fileName of productionFiles) {
      const source = readFileSync(join(DISCOVERY_ROOT, fileName), "utf8");
      const actual = importSpecifiers(source).sort();
      const expected = [...(ALLOWED_IMPORTS[fileName] ?? [])].sort();
      expect(actual, fileName).toEqual(expected);
    }
  });
});
