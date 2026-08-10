import { describe, expect, it } from "vitest";
import {
  classifyControlPointTessellationDirection,
  controlPointTessellationDisposition,
  createControlPointTessellationAnalysis,
  type ControlPointTessellationDirection,
  type ControlPointTessellationLevelAnalysis,
  type ControlPointTessellationMeasuredCellEvidence,
} from "../benchmark-control-point-tessellation-analysis";

function cells(values: readonly [number, number, number, number]):
readonly ControlPointTessellationMeasuredCellEvidence[] {
  return ([576, 1152] as const).flatMap((strandCount) => [
    { strandCount, pointsPerStrand: 3 as const, tubularSegments: 6 as const, geometryCreateCpuMs: [values[0], values[0], values[0], values[0], values[0]] },
    { strandCount, pointsPerStrand: 3 as const, tubularSegments: 21 as const, geometryCreateCpuMs: [values[1], values[1], values[1], values[1], values[1]] },
    { strandCount, pointsPerStrand: 8 as const, tubularSegments: 6 as const, geometryCreateCpuMs: [values[2], values[2], values[2], values[2], values[2]] },
    { strandCount, pointsPerStrand: 8 as const, tubularSegments: 21 as const, geometryCreateCpuMs: [values[3], values[3], values[3], values[3], values[3]] },
  ]);
}

function level(
  strandCount: 576 | 1152,
  pointAtT6: ControlPointTessellationDirection,
  pointAtT21: ControlPointTessellationDirection,
  tessellationAtP3: ControlPointTessellationDirection,
  tessellationAtP8: ControlPointTessellationDirection,
): ControlPointTessellationLevelAnalysis {
  const pointCrossover = pointAtT6 === "ROBUST_POSITIVE" && pointAtT21 === "ROBUST_NEGATIVE"
    ? "POS_TO_NEG" as const
    : pointAtT6 === "ROBUST_NEGATIVE" && pointAtT21 === "ROBUST_POSITIVE"
      ? "NEG_TO_POS" as const
      : null;
  const tessellationCrossover =
    tessellationAtP3 === "ROBUST_POSITIVE" && tessellationAtP8 === "ROBUST_NEGATIVE"
      ? "POS_TO_NEG" as const
      : tessellationAtP3 === "ROBUST_NEGATIVE" && tessellationAtP8 === "ROBUST_POSITIVE"
        ? "NEG_TO_POS" as const
        : null;
  const zeroRange = { minimum: 0, maximum: 0 };
  return {
    strandCount,
    geometryCreateMedians: { y36: 1, y321: 1, y86: 1, y821: 1 },
    geometryCreateRanges: { p3t6: zeroRange, p3t21: zeroRange, p8t6: zeroRange, p8t21: zeroRange },
    simpleEffects: { pointAtT6: 0, pointAtT21: 0, tessellationAtP3: 0, tessellationAtP8: 0 },
    simpleEffectRanges: { pointAtT6: zeroRange, pointAtT21: zeroRange, tessellationAtP3: zeroRange, tessellationAtP8: zeroRange },
    directions: { pointAtT6, pointAtT21, tessellationAtP3, tessellationAtP8 },
    pointMainEffect: 0,
    tessellationMainEffect: 0,
    interaction: 0,
    interactionRange: zeroRange,
    interactionDirection: "DIRECTION_UNSTABLE",
    grandMean: 1,
    normalized: { pointMainOverGrandMean: 0, tessellationMainOverGrandMean: 0, interactionOverGrandMean: 0 },
    pointCrossover,
    tessellationCrossover,
  };
}

type Directions = readonly [
  ControlPointTessellationDirection,
  ControlPointTessellationDirection,
  ControlPointTessellationDirection,
  ControlPointTessellationDirection,
];

function disposition(
  first: Directions,
  second: Directions = first,
) {
  return controlPointTessellationDisposition([
    level(576, ...first),
    level(1152, ...second),
  ]);
}

const P = "ROBUST_POSITIVE" as const;
const N = "ROBUST_NEGATIVE" as const;
const U = "DIRECTION_UNSTABLE" as const;

describe("R2C-A-S2 factorial analysis", () => {
  it("computes medians, conservative ranges, main effects, interaction, and normalization", () => {
    const analysis = createControlPointTessellationAnalysis(cells([10, 20, 30, 50]));
    const first = analysis.levels[0];
    expect(first.geometryCreateMedians).toEqual({ y36: 10, y321: 20, y86: 30, y821: 50 });
    expect(first.simpleEffects).toEqual({
      pointAtT6: 20,
      pointAtT21: 30,
      tessellationAtP3: 10,
      tessellationAtP8: 20,
    });
    expect(first.pointMainEffect).toBe(25);
    expect(first.tessellationMainEffect).toBe(15);
    expect(first.interaction).toBe(10);
    expect(first.grandMean).toBe(27.5);
    expect(first.interactionRange).toEqual({ minimum: 10, maximum: 10 });
    expect(analysis.disposition).toBe("BOTH_FACTORS");
  });

  it("classifies zero endpoints as direction unstable", () => {
    expect(classifyControlPointTessellationDirection({ minimum: 0, maximum: 4 }))
      .toBe("DIRECTION_UNSTABLE");
    expect(classifyControlPointTessellationDirection({ minimum: -4, maximum: 0 }))
      .toBe("DIRECTION_UNSTABLE");
  });

  it.each([
    [[P, P, P, P] as const, "BOTH_FACTORS"],
    [[P, N, P, P] as const, "INTERACTION_OR_NONADDITIVE"],
    [[N, P, P, P] as const, "INTERACTION_OR_NONADDITIVE"],
    [[P, P, P, N] as const, "INTERACTION_OR_NONADDITIVE"],
    [[P, P, N, P] as const, "INTERACTION_OR_NONADDITIVE"],
    [[P, P, U, U] as const, "CONTROL_POINT_SIDE"],
    [[U, U, P, P] as const, "TESSELLATION_SIDE"],
    [[P, P, N, N] as const, "UNRESOLVED"],
    [[P, P, P, U] as const, "UNRESOLVED"],
  ] as const)("implements the frozen disposition family %#", (directions, expected) => {
    expect(disposition(directions)).toBe(expected);
  });

  it("does not upgrade one-strand or incompatible crossover orientations", () => {
    expect(disposition([P, N, U, U], [P, P, U, U])).toBe("UNRESOLVED");
    expect(disposition([P, N, U, U], [N, P, U, U])).toBe("UNRESOLVED");
  });

  it("fails instrumentation when either grand mean is nonpositive", () => {
    expect(() => createControlPointTessellationAnalysis(cells([0, 0, 0, 0])))
      .toThrow("INSTRUMENTATION_FAILURE");
  });
});
