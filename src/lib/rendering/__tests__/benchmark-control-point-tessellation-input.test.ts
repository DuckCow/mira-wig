import { describe, expect, it } from "vitest";
import { generatePointSensitivityInput } from "../benchmark-point-sensitivity-input";
import {
  CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
  CONTROL_POINT_TESSELLATION_INPUT_SCHEMA,
  CONTROL_POINT_TESSELLATION_POINT_LEVELS,
  CONTROL_POINT_TESSELLATION_SEED,
  CONTROL_POINT_TESSELLATION_STRAND_LEVELS,
  CONTROL_POINT_TESSELLATION_TESSELLATION_LEVELS,
  constructControlPointTessellationCandidate,
  generateControlPointTessellationInput,
  validateControlPointTessellationInput,
} from "../benchmark-control-point-tessellation-input";

function candidate() {
  return constructControlPointTessellationCandidate({
    seed: CONTROL_POINT_TESSELLATION_SEED,
    strandCount: 576,
    pointsPerStrand: 3,
    tubularSegments: 6,
  });
}

describe("R2C-A-S2 benchmark input", () => {
  it("admits only the frozen independent axes and distinct identity", () => {
    for (const strandCount of CONTROL_POINT_TESSELLATION_STRAND_LEVELS) {
      for (const pointsPerStrand of CONTROL_POINT_TESSELLATION_POINT_LEVELS) {
        for (const tubularSegments of CONTROL_POINT_TESSELLATION_TESSELLATION_LEVELS) {
          const input = generateControlPointTessellationInput({
            seed: CONTROL_POINT_TESSELLATION_SEED,
            strandCount,
            pointsPerStrand,
            tubularSegments,
          });
          expect(input).toMatchObject({
            schema: CONTROL_POINT_TESSELLATION_INPUT_SCHEMA,
            version: 1,
            generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
            classification: "BENCHMARK_ONLY",
            canonicalR2BBundle: false,
            strandCount,
            pointsPerStrand,
            tubularSegments,
          });
        }
      }
    }
    const base = candidate();
    if (typeof base !== "object" || base === null || Array.isArray(base)) {
      throw new Error("Expected S2 candidate object.");
    }
    expect(() => validateControlPointTessellationInput({ ...base, pointsPerStrand: 6 })).toThrow(/S2/);
    expect(() => validateControlPointTessellationInput({ ...base, tubularSegments: 15 })).toThrow(/S2/);
    expect(() => validateControlPointTessellationInput({ ...base, tubularSegments: 0 })).toThrow(/positive/);
    expect(() => validateControlPointTessellationInput({ ...base, extra: true })).toThrow(/exact/);
  });

  it("keeps the generated graph deeply identical when only tessellation changes", () => {
    const low = generateControlPointTessellationInput({
      seed: CONTROL_POINT_TESSELLATION_SEED,
      strandCount: 576,
      pointsPerStrand: 8,
      tubularSegments: 6,
    });
    const high = generateControlPointTessellationInput({
      seed: CONTROL_POINT_TESSELLATION_SEED,
      strandCount: 576,
      pointsPerStrand: 8,
      tubularSegments: 21,
    });
    expect(low.strands).toEqual(high.strands);
    expect(low.bounds).toEqual(high.bounds);
    expect(low.coordinateSystem).toEqual(high.coordinateSystem);
    expect(Object.isFrozen(low.strands[0].controlPoints[0])).toBe(true);
  });

  it.each(CONTROL_POINT_TESSELLATION_STRAND_LEVELS)(
    "matches live S1 shared fields for P3/P8 at %i strands",
    (strandCount) => {
      for (const pointsPerStrand of CONTROL_POINT_TESSELLATION_POINT_LEVELS) {
        const s1 = generatePointSensitivityInput({
          seed: CONTROL_POINT_TESSELLATION_SEED,
          strandCount,
          pointsPerStrand,
        });
        const s2 = generateControlPointTessellationInput({
          seed: CONTROL_POINT_TESSELLATION_SEED,
          strandCount,
          pointsPerStrand,
          tubularSegments: 21,
        });
        expect(s2.schema).not.toBe(s1.schema);
        expect(s2.generatorVersion).not.toBe(s1.generatorVersion);
        expect(s2.strands).toEqual(s1.strands);
        expect(s2.coordinateSystem).toEqual(s1.coordinateSystem);
        expect(s2.defaultWidth).toBe(s1.defaultWidth);
        expect(s2.bounds).toEqual(s1.bounds);
      }
    },
  );
});
