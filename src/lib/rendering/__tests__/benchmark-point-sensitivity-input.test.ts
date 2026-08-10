import { describe, expect, it } from "vitest";
import {
  RENDERER_BENCHMARK_SEED,
  generateRendererBenchmarkInput,
} from "../benchmark-input";
import {
  POINT_SENSITIVITY_GENERATOR_VERSION,
  POINT_SENSITIVITY_INPUT_SCHEMA,
  POINT_SENSITIVITY_POINT_LEVELS,
  POINT_SENSITIVITY_SEED,
  POINT_SENSITIVITY_STRAND_LEVELS,
  constructPointSensitivityCandidate,
  generatePointSensitivityInput,
  validatePointSensitivityInput,
} from "../benchmark-point-sensitivity-input";

function candidate(strandCount = 576 as const, pointsPerStrand = 3 as const) {
  return constructPointSensitivityCandidate({
    seed: POINT_SENSITIVITY_SEED,
    strandCount,
    pointsPerStrand,
  });
}

describe("R2C-A-S1 benchmark input", () => {
  it("admits exactly the frozen axes and distinct identity", () => {
    for (const strandCount of POINT_SENSITIVITY_STRAND_LEVELS) {
      for (const pointsPerStrand of POINT_SENSITIVITY_POINT_LEVELS) {
        const input = generatePointSensitivityInput({
          seed: POINT_SENSITIVITY_SEED,
          strandCount,
          pointsPerStrand,
        });
        expect(input).toMatchObject({
          schema: POINT_SENSITIVITY_INPUT_SCHEMA,
          version: 1,
          generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
          classification: "BENCHMARK_ONLY",
          canonicalR2BBundle: false,
          strandCount,
          pointsPerStrand,
          defaultWidth: 0.028,
        });
        expect(input.strands).toHaveLength(strandCount);
        expect(input.strands[0].controlPoints).toHaveLength(pointsPerStrand);
      }
    }
    const base = candidate();
    if (typeof base !== "object" || base === null || Array.isArray(base)) {
      throw new Error("Expected S1 candidate object.");
    }
    expect(() => validatePointSensitivityInput({ ...base, strandCount: 288 })).toThrow(/S1/);
    expect(() => validatePointSensitivityInput({ ...base, strandCount: 2304 })).toThrow(/S1/);
    expect(() => validatePointSensitivityInput({ ...base, pointsPerStrand: 4 })).toThrow(/S1/);
    expect(() => validatePointSensitivityInput({ ...base, seed: 7 })).toThrow(/seed/);
    expect(() => validatePointSensitivityInput({ ...base, extra: true })).toThrow(/exact/);
  });

  it("is deterministic, exact-shaped, uniquely identified, bounded, and deeply immutable", () => {
    const first = generatePointSensitivityInput({
      seed: POINT_SENSITIVITY_SEED,
      strandCount: 576,
      pointsPerStrand: 8,
    });
    const second = generatePointSensitivityInput({
      seed: POINT_SENSITIVITY_SEED,
      strandCount: 576,
      pointsPerStrand: 8,
    });
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(new Set(first.strands.map((strand) => strand.id)).size).toBe(576);
    expect(new Set(first.strands).size).toBe(576);
    expect(new Set(first.strands.flatMap((strand) => strand.controlPoints)).size).toBe(576 * 8);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.strands[0].controlPoints[0])).toBe(true);
    expect(Object.isFrozen(first.bounds.min)).toBe(true);
    for (const point of first.strands.flatMap((strand) => strand.controlPoints)) {
      expect(point.every((coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= 10)).toBe(true);
    }
    expect(first.bounds.min.every((value, axis) => value <= first.bounds.max[axis])).toBe(true);
  });

  it.each(POINT_SENSITIVITY_STRAND_LEVELS)(
    "matches the live parent P6 semantics at %i strands",
    (strandCount) => {
      const parent = generateRendererBenchmarkInput({
        seed: RENDERER_BENCHMARK_SEED,
        strandCount,
      });
      const s1 = generatePointSensitivityInput({
        seed: POINT_SENSITIVITY_SEED,
        strandCount,
        pointsPerStrand: 6,
      });
      expect(s1.generatorVersion).not.toBe(parent.generatorVersion);
      expect(s1.schema).not.toBe(parent.schema);
      expect(s1.strands).toEqual(parent.strands);
      expect(s1.coordinateSystem).toEqual(parent.coordinateSystem);
      expect(s1.defaultWidth).toBe(parent.defaultWidth);
      expect(s1.bounds).toEqual(parent.bounds);
    },
  );
});
