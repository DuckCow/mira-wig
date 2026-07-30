import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runStructuredCategoricalFixtureSlice } from "../structured-slice";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "../versions";
import { structuredInput } from "./fixtures";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "types.ts": ["../types"],
  "versions.ts": ["./types"],
  "request-plan.ts": [
    "../decide-constraint",
    "../types",
    "../versions",
    "./types",
    "./versions",
  ],
  "authority-universe.ts": ["../types", "./types", "./versions"],
  "fixture-candidate-source.ts": ["./types", "./versions"],
  "evidence-evaluation.ts": [
    "../decide-constraint",
    "../types",
    "./types",
    "./versions",
  ],
  "candidate-admission.ts": [
    "../types",
    "./landing",
    "./types",
    "./versions",
  ],
  "landing.ts": ["./types", "./versions"],
  "structured-slice.ts": [
    "../versions",
    "./authority-universe",
    "./candidate-admission",
    "./evidence-evaluation",
    "./fixture-candidate-source",
    "./request-plan",
    "./types",
    "./versions",
  ],
};

const PROHIBITED_SOURCE: readonly RegExp[] = [
  /@prisma/iu,
  /\bPrisma\b/u,
  /\bsrc\/app\b/u,
  /\bsrc\/pages\b/u,
  /(?:^|[/.-])route(?:s|[/.-]|$)/imu,
  /\bcart\b/iu,
  /\bcheckout\b/iu,
  /\bpayment\b/iu,
  /\bfetch\s*\(/u,
  /\baxios\b/iu,
  /\bDate\.now\b/u,
  /\bnew\s+Date\b/u,
  /\bMath\.random\b/u,
  /\bnode:fs\b/u,
  /\bnode:net\b/u,
  /\banalytics\b/iu,
  /\bevent-seam\b/iu,
  /\.\.\/retrieval\//u,
  /\bprocess\.env\b/u,
];

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /\bimport\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

describe("D6-B1 source boundary", () => {
  it("contains only additive reviewed files and the approved import graph", () => {
    const files = readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(files).toEqual(Object.keys(ALLOWED_IMPORTS).sort());
    expect(files).not.toContain("index.ts");
    for (const fileName of files) {
      const source = readFileSync(join(ROOT, fileName), "utf8");
      expect(importSpecifiers(source).sort(), fileName).toEqual(
        [...(ALLOWED_IMPORTS[fileName] ?? [])].sort(),
      );
    }
  });

  it("has no production, nondeterministic, D6-A, or event dependency", () => {
    for (const fileName of Object.keys(ALLOWED_IMPORTS)) {
      const source = readFileSync(join(ROOT, fileName), "utf8");
      for (const pattern of PROHIBITED_SOURCE) {
        expect(source, `${fileName}: ${pattern.source}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("keeps every new component name explicitly provisional", () => {
    expect(D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS).toEqual({
      requestPlan: "d6-b1-structured-request-plan/v0.1-provisional",
      stage0Scope:
        "d6-b1-stage-0-authority-universe/v0.1-provisional",
      candidateSource:
        "d6-b1-categorical-fixture-candidate-source/v0.1-provisional",
      admissionRules:
        "d6-b1-structured-candidate-admission/v0.1-provisional",
      landingContract: "d6-b1-structured-landing/v0.1-provisional",
      fixtureSnapshot:
        "d6-b1-categorical-retrieval-fixture/v0.1-provisional",
      eligibilitySnapshot:
        "d6-b1-eligibility-fixture/v0.1-provisional",
    });
    const versions: readonly string[] = [
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.requestPlan,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.stage0Scope,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.candidateSource,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.admissionRules,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.landingContract,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot,
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.eligibilitySnapshot,
    ];
    expect(versions.every((value) => value.endsWith("-provisional"))).toBe(
      true,
    );
  });

  it("produces no event field or delivery claim", () => {
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput(),
    );
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain("event");
    expect(result).not.toHaveProperty("eventDelivery");
  });
});
