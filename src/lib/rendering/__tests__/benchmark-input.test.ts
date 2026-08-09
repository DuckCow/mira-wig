import { describe, expect, it } from "vitest";
import {
  RENDERER_BENCHMARK_INPUT_SCHEMA,
  RENDERER_BENCHMARK_POINTS_PER_STRAND,
  RENDERER_BENCHMARK_SEED,
  RENDERER_BENCHMARK_STRAND_LEVELS,
  constructRendererBenchmarkCandidate,
  generateRendererBenchmarkInput,
  validateRendererBenchmarkInput,
} from "../benchmark-input";

const request = { seed: RENDERER_BENCHMARK_SEED, strandCount: 72 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} record.`);
  }
  return value;
}

function unknownArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} array.`);
  return value;
}

function repeatSecondStrand(strands: readonly unknown[]): readonly unknown[] {
  return strands.map((strand, index) => index === 1 ? strands[0] : strand);
}

function shareFirstPoint(strands: readonly unknown[]): readonly unknown[] {
  const first = record(strands[0], "first strand");
  const points = unknownArray(first.controlPoints, "control points");
  const sharedPoint = points[0];
  return strands.map((strand, strandIndex) => {
    if (strandIndex !== 0) return strand;
    return {
      ...record(strand, "strand"),
      controlPoints: points.map((point, pointIndex) =>
        pointIndex === 1 ? sharedPoint : point,
      ),
    };
  });
}

describe("RendererBenchmarkInput v0.3 boundary", () => {
  it("generates deterministic six-point BENCHMARK_ONLY data at only the fixed levels", () => {
    const first = generateRendererBenchmarkInput(request);
    const second = generateRendererBenchmarkInput(request);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.schema).toBe(RENDERER_BENCHMARK_INPUT_SCHEMA);
    expect(first.canonicalR2BBundle).toBe(false);
    expect(first.pointsPerStrand).toBe(RENDERER_BENCHMARK_POINTS_PER_STRAND);
    expect(first.strands).toHaveLength(72);
    expect(new Set(first.strands).size).toBe(72);
    expect(new Set(first.strands.flatMap((strand) => strand.controlPoints)).size).toBe(
      72 * 6,
    );

    for (const strandCount of RENDERER_BENCHMARK_STRAND_LEVELS) {
      expect(generateRendererBenchmarkInput({
        seed: RENDERER_BENCHMARK_SEED,
        strandCount,
      }).strands).toHaveLength(strandCount);
    }
  });

  it("rejects every removed axis and malformed bounded field", () => {
    const candidate = constructRendererBenchmarkCandidate(request);
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error("Expected object candidate.");
    }

    expect(() => validateRendererBenchmarkInput({ ...candidate, strandCount: 2304 })).toThrow(
      /v0\.3/,
    );
    expect(() => validateRendererBenchmarkInput({ ...candidate, pointsPerStrand: 3 })).toThrow(
      /exactly 6/,
    );
    expect(() => validateRendererBenchmarkInput({ ...candidate, seed: 7 })).toThrow(/seed/);
    expect(() => validateRendererBenchmarkInput({ ...candidate, productId: "forbidden" })).toThrow(
      /exact benchmark shape/,
    );
    expect(() => validateRendererBenchmarkInput({
      ...candidate,
      schema: "mira.render-lab.strand-asset",
    })).toThrow(/masquerade/);
  });

  it("rejects aliased strand and point identities before producing immutable evidence", () => {
    const candidate = record(constructRendererBenchmarkCandidate(request), "candidate");
    const candidateStrands = unknownArray(candidate.strands, "candidate strands");
    const repeatedStrands = repeatSecondStrand(candidateStrands);
    expect(() => validateRendererBenchmarkInput({
      ...candidate,
      strands: repeatedStrands,
    })).toThrow(/identities/);
    const sharedPoints = shareFirstPoint(candidateStrands);
    expect(() => validateRendererBenchmarkInput({
      ...candidate,
      strands: sharedPoints,
    })).toThrow(/tuple identities/);
  });

  it("deeply freezes every validated nested reference", () => {
    const input = generateRendererBenchmarkInput(request);

    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.coordinateSystem)).toBe(true);
    expect(Object.isFrozen(input.strands)).toBe(true);
    expect(Object.isFrozen(input.strands[0])).toBe(true);
    expect(Object.isFrozen(input.strands[0].controlPoints)).toBe(true);
    expect(Object.isFrozen(input.strands[0].controlPoints[0])).toBe(true);
    expect(Object.isFrozen(input.bounds)).toBe(true);
    expect(Object.isFrozen(input.bounds.min)).toBe(true);
    expect(Reflect.set(input.strands[0], "width", 1)).toBe(false);
    expect(Reflect.set(input.strands[0].controlPoints[0], "0", 99)).toBe(false);
  });
});
