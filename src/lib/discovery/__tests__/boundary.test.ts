import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DISCOVERY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RETRIEVAL_ROOT = join(DISCOVERY_ROOT, "retrieval");

const D5_ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "types.ts": ["@/lib/market/types"],
  "versions.ts": ["./types"],
  "normalize-query.ts": ["./types"],
  "parse-query.ts": ["./normalize-query", "./types", "./versions"],
  "decide-constraint.ts": ["./types"],
};

const RETRIEVAL_ALLOWED_IMPORTS: Readonly<
  Record<string, readonly string[]>
> = {
  "types.ts": ["../types"],
  "versions.ts": ["./types"],
  "exact-fixture-retriever.ts": ["./types", "./versions"],
  "candidate-admission.ts": [
    "../decide-constraint",
    "../types",
    "./landing",
    "./types",
    "./versions",
  ],
  "landing.ts": ["./types"],
  "event-seam.ts": ["../types", "./types", "./versions"],
  "exact-slice.ts": [
    "../versions",
    "./candidate-admission",
    "./event-seam",
    "./exact-fixture-retriever",
    "./types",
  ],
};

const PROHIBITED_RETRIEVAL_SOURCE: readonly RegExp[] = [
  /@prisma\/client/u,
  /@\/lib\/db/u,
  /\bnext\//u,
  /\bsrc\/app\//u,
  /@\/lib\/catalog/u,
  /@\/lib\/cart/u,
  /@\/lib\/payment/u,
  /@\/lib\/fitting/u,
  /@\/lib\/storage/u,
  /\bfetch\s*\(/u,
  /\bDate\.now\b/u,
  /\bnew\s+Date\b/u,
  /\bMath\.random\b/u,
  /\brandomUUID\b/u,
  /\bprocess\.env\b/u,
  /__tests__/u,
];

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

    expect(productionFiles).toEqual(Object.keys(D5_ALLOWED_IMPORTS).sort());

    for (const fileName of productionFiles) {
      const source = readFileSync(join(DISCOVERY_ROOT, fileName), "utf8");
      const actual = importSpecifiers(source).sort();
      const expected = [...(D5_ALLOWED_IMPORTS[fileName] ?? [])].sort();
      expect(actual, fileName).toEqual(expected);
    }
  });
});

describe("D6-A1 retrieval source boundary", () => {
  it("has only the reviewed production files and exact import graph", () => {
    const productionFiles = readdirSync(RETRIEVAL_ROOT, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(productionFiles).toEqual(
      Object.keys(RETRIEVAL_ALLOWED_IMPORTS).sort(),
    );
    expect(productionFiles).not.toContain("index.ts");

    for (const fileName of productionFiles) {
      const source = readFileSync(join(RETRIEVAL_ROOT, fileName), "utf8");
      const actual = importSpecifiers(source).sort();
      const expected = [
        ...(RETRIEVAL_ALLOWED_IMPORTS[fileName] ?? []),
      ].sort();
      expect(actual, fileName).toEqual(expected);
    }
  });

  it("contains no prohibited runtime dependency or nondeterministic source", () => {
    for (const fileName of Object.keys(RETRIEVAL_ALLOWED_IMPORTS)) {
      const source = readFileSync(join(RETRIEVAL_ROOT, fileName), "utf8");

      for (const pattern of PROHIBITED_RETRIEVAL_SOURCE) {
        expect(source, `${fileName}: ${pattern.source}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps synthetic fixture data under the retrieval test tree", () => {
    const rootDirectories = readdirSync(RETRIEVAL_ROOT, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const fixtureFiles = readdirSync(
      join(RETRIEVAL_ROOT, "__tests__", "fixtures"),
      { withFileTypes: true },
    )
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name);

    expect(rootDirectories).toContain("__tests__");
    expect(rootDirectories).not.toContain("fixtures");
    expect(fixtureFiles).toEqual(["synthetic-fixtures.ts"]);
  });
});
