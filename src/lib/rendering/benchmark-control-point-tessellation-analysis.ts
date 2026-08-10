import type {
  ControlPointTessellationPointsPerStrand,
  ControlPointTessellationStrandCount,
  ControlPointTessellationTubularSegments,
} from "./benchmark-control-point-tessellation-input";

export type ControlPointTessellationDirection =
  | "ROBUST_POSITIVE"
  | "ROBUST_NEGATIVE"
  | "DIRECTION_UNSTABLE";

export type ControlPointTessellationDisposition =
  | "CONTROL_POINT_SIDE"
  | "TESSELLATION_SIDE"
  | "BOTH_FACTORS"
  | "INTERACTION_OR_NONADDITIVE"
  | "UNRESOLVED";

export type ControlPointTessellationNextInvestigationClass =
  | "CONTROL_POINT_REPRESENTATION_CURVE_SIDE"
  | "LONGITUDINAL_TESSELLATION_STRATEGY"
  | "BOTH_FACTOR_SIDES"
  | "CONTROL_POINT_TESSELLATION_INTERACTION"
  | "NONE";

export interface ControlPointTessellationRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ControlPointTessellationMeasuredCellEvidence {
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly pointsPerStrand: ControlPointTessellationPointsPerStrand;
  readonly tubularSegments: ControlPointTessellationTubularSegments;
  readonly geometryCreateCpuMs: readonly number[];
}

export interface ControlPointTessellationLevelAnalysis {
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly geometryCreateMedians: {
    readonly y36: number;
    readonly y321: number;
    readonly y86: number;
    readonly y821: number;
  };
  readonly geometryCreateRanges: {
    readonly p3t6: ControlPointTessellationRange;
    readonly p3t21: ControlPointTessellationRange;
    readonly p8t6: ControlPointTessellationRange;
    readonly p8t21: ControlPointTessellationRange;
  };
  readonly simpleEffects: {
    readonly pointAtT6: number;
    readonly pointAtT21: number;
    readonly tessellationAtP3: number;
    readonly tessellationAtP8: number;
  };
  readonly simpleEffectRanges: {
    readonly pointAtT6: ControlPointTessellationRange;
    readonly pointAtT21: ControlPointTessellationRange;
    readonly tessellationAtP3: ControlPointTessellationRange;
    readonly tessellationAtP8: ControlPointTessellationRange;
  };
  readonly directions: {
    readonly pointAtT6: ControlPointTessellationDirection;
    readonly pointAtT21: ControlPointTessellationDirection;
    readonly tessellationAtP3: ControlPointTessellationDirection;
    readonly tessellationAtP8: ControlPointTessellationDirection;
  };
  readonly pointMainEffect: number;
  readonly tessellationMainEffect: number;
  readonly interaction: number;
  readonly interactionRange: ControlPointTessellationRange;
  readonly interactionDirection: ControlPointTessellationDirection;
  readonly grandMean: number;
  readonly normalized: {
    readonly pointMainOverGrandMean: number;
    readonly tessellationMainOverGrandMean: number;
    readonly interactionOverGrandMean: number;
  };
  readonly pointCrossover: "POS_TO_NEG" | "NEG_TO_POS" | null;
  readonly tessellationCrossover: "POS_TO_NEG" | "NEG_TO_POS" | null;
}

export interface ControlPointTessellationAnalysis {
  readonly levels: readonly ControlPointTessellationLevelAnalysis[];
  readonly pointPositiveAcross: boolean;
  readonly tessellationPositiveAcross: boolean;
  readonly pointCrossoverAcross: boolean;
  readonly tessellationCrossoverAcross: boolean;
  readonly qualitativeInteractionAcross: boolean;
  readonly disposition: ControlPointTessellationDisposition | null;
  readonly nextInvestigationClass: ControlPointTessellationNextInvestigationClass | null;
}

export const EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS:
ControlPointTessellationAnalysis = Object.freeze({
  levels: Object.freeze([]),
  pointPositiveAcross: false,
  tessellationPositiveAcross: false,
  pointCrossoverAcross: false,
  tessellationCrossoverAcross: false,
  qualitativeInteractionAcross: false,
  disposition: null,
  nextInvestigationClass: null,
});

function finiteEvidence(values: readonly number[]): readonly number[] {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("S2 analysis requires finite nonnegative raw evidence.");
  }
  return values;
}

function median(values: readonly number[]): number {
  const sorted = [...finiteEvidence(values)].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function range(values: readonly number[]): ControlPointTessellationRange {
  finiteEvidence(values);
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

export function classifyControlPointTessellationDirection(
  value: ControlPointTessellationRange,
): ControlPointTessellationDirection {
  if (!Number.isFinite(value.minimum) || !Number.isFinite(value.maximum) ||
      value.minimum > value.maximum) {
    throw new Error("Direction classification requires a finite ordered range.");
  }
  if (value.minimum > 0) return "ROBUST_POSITIVE";
  if (value.maximum < 0) return "ROBUST_NEGATIVE";
  return "DIRECTION_UNSTABLE";
}

function contrastRange(
  positive: ControlPointTessellationRange,
  negative: ControlPointTessellationRange,
): ControlPointTessellationRange {
  return {
    minimum: positive.minimum - negative.maximum,
    maximum: positive.maximum - negative.minimum,
  };
}

function crossover(
  first: ControlPointTessellationDirection,
  second: ControlPointTessellationDirection,
): "POS_TO_NEG" | "NEG_TO_POS" | null {
  if (first === "ROBUST_POSITIVE" && second === "ROBUST_NEGATIVE") {
    return "POS_TO_NEG";
  }
  if (first === "ROBUST_NEGATIVE" && second === "ROBUST_POSITIVE") {
    return "NEG_TO_POS";
  }
  return null;
}

function cellEvidence(
  cells: readonly ControlPointTessellationMeasuredCellEvidence[],
  strandCount: ControlPointTessellationStrandCount,
  pointsPerStrand: ControlPointTessellationPointsPerStrand,
  tubularSegments: ControlPointTessellationTubularSegments,
): readonly number[] {
  const matches = cells.filter((cell) =>
    cell.strandCount === strandCount &&
    cell.pointsPerStrand === pointsPerStrand &&
    cell.tubularSegments === tubularSegments,
  );
  if (matches.length !== 1) throw new Error("S2 analysis requires every cell exactly once.");
  return finiteEvidence(matches[0].geometryCreateCpuMs);
}

function analyzeLevel(
  cells: readonly ControlPointTessellationMeasuredCellEvidence[],
  strandCount: ControlPointTessellationStrandCount,
): ControlPointTessellationLevelAnalysis {
  const p3t6Values = cellEvidence(cells, strandCount, 3, 6);
  const p3t21Values = cellEvidence(cells, strandCount, 3, 21);
  const p8t6Values = cellEvidence(cells, strandCount, 8, 6);
  const p8t21Values = cellEvidence(cells, strandCount, 8, 21);
  const y36 = median(p3t6Values);
  const y321 = median(p3t21Values);
  const y86 = median(p8t6Values);
  const y821 = median(p8t21Values);
  const p3t6 = range(p3t6Values);
  const p3t21 = range(p3t21Values);
  const p8t6 = range(p8t6Values);
  const p8t21 = range(p8t21Values);
  const pointAtT6 = contrastRange(p8t6, p3t6);
  const pointAtT21 = contrastRange(p8t21, p3t21);
  const tessellationAtP3 = contrastRange(p3t21, p3t6);
  const tessellationAtP8 = contrastRange(p8t21, p8t6);
  const directions = {
    pointAtT6: classifyControlPointTessellationDirection(pointAtT6),
    pointAtT21: classifyControlPointTessellationDirection(pointAtT21),
    tessellationAtP3: classifyControlPointTessellationDirection(tessellationAtP3),
    tessellationAtP8: classifyControlPointTessellationDirection(tessellationAtP8),
  } as const;
  const interactionRange = {
    minimum: p8t21.minimum - p8t6.maximum - p3t21.maximum + p3t6.minimum,
    maximum: p8t21.maximum - p8t6.minimum - p3t21.minimum + p3t6.maximum,
  };
  const pointMainEffect = ((y86 + y821) - (y36 + y321)) / 2;
  const tessellationMainEffect = ((y321 + y821) - (y36 + y86)) / 2;
  const interaction = y821 - y86 - y321 + y36;
  const grandMean = (y36 + y321 + y86 + y821) / 4;
  if (grandMean <= 0) throw new Error("INSTRUMENTATION_FAILURE");
  return {
    strandCount,
    geometryCreateMedians: { y36, y321, y86, y821 },
    geometryCreateRanges: { p3t6, p3t21, p8t6, p8t21 },
    simpleEffects: {
      pointAtT6: y86 - y36,
      pointAtT21: y821 - y321,
      tessellationAtP3: y321 - y36,
      tessellationAtP8: y821 - y86,
    },
    simpleEffectRanges: { pointAtT6, pointAtT21, tessellationAtP3, tessellationAtP8 },
    directions,
    pointMainEffect,
    tessellationMainEffect,
    interaction,
    interactionRange,
    interactionDirection: classifyControlPointTessellationDirection(interactionRange),
    grandMean,
    normalized: {
      pointMainOverGrandMean: pointMainEffect / grandMean,
      tessellationMainOverGrandMean: tessellationMainEffect / grandMean,
      interactionOverGrandMean: interaction / grandMean,
    },
    pointCrossover: crossover(directions.pointAtT6, directions.pointAtT21),
    tessellationCrossover: crossover(
      directions.tessellationAtP3,
      directions.tessellationAtP8,
    ),
  };
}

function everyDirection(
  levels: readonly ControlPointTessellationLevelAnalysis[],
  keys: readonly (keyof ControlPointTessellationLevelAnalysis["directions"])[],
  expected: ControlPointTessellationDirection,
): boolean {
  return levels.every((level) => keys.every((key) => level.directions[key] === expected));
}

function sameCrossoverAcross(
  levels: readonly ControlPointTessellationLevelAnalysis[],
  side: "pointCrossover" | "tessellationCrossover",
): boolean {
  return levels[0][side] !== null && levels[0][side] === levels[1][side];
}

function oneSidedDisposition(
  pointPositive: boolean,
  tessellationPositive: boolean,
  pointUnstable: boolean,
  tessellationUnstable: boolean,
): ControlPointTessellationDisposition {
  if (pointPositive && tessellationPositive) return "BOTH_FACTORS";
  if (pointPositive && tessellationUnstable) return "CONTROL_POINT_SIDE";
  if (tessellationPositive && pointUnstable) return "TESSELLATION_SIDE";
  return "UNRESOLVED";
}

export function controlPointTessellationDisposition(
  levels: readonly ControlPointTessellationLevelAnalysis[],
): ControlPointTessellationDisposition {
  if (levels.length !== 2) throw new Error("S2 disposition requires both strand levels.");
  const samePointCrossover = sameCrossoverAcross(levels, "pointCrossover");
  const sameTessellationCrossover = sameCrossoverAcross(
    levels,
    "tessellationCrossover",
  );
  if (samePointCrossover || sameTessellationCrossover) {
    return "INTERACTION_OR_NONADDITIVE";
  }
  const pointKeys = ["pointAtT6", "pointAtT21"] as const;
  const tessellationKeys = ["tessellationAtP3", "tessellationAtP8"] as const;
  const pointPositive = everyDirection(levels, pointKeys, "ROBUST_POSITIVE");
  const tessellationPositive = everyDirection(
    levels,
    tessellationKeys,
    "ROBUST_POSITIVE",
  );
  return oneSidedDisposition(
    pointPositive,
    tessellationPositive,
    everyDirection(levels, pointKeys, "DIRECTION_UNSTABLE"),
    everyDirection(levels, tessellationKeys, "DIRECTION_UNSTABLE"),
  );
}

function target(
  disposition: ControlPointTessellationDisposition,
): ControlPointTessellationNextInvestigationClass {
  if (disposition === "CONTROL_POINT_SIDE") return "CONTROL_POINT_REPRESENTATION_CURVE_SIDE";
  if (disposition === "TESSELLATION_SIDE") return "LONGITUDINAL_TESSELLATION_STRATEGY";
  if (disposition === "BOTH_FACTORS") return "BOTH_FACTOR_SIDES";
  if (disposition === "INTERACTION_OR_NONADDITIVE") {
    return "CONTROL_POINT_TESSELLATION_INTERACTION";
  }
  return "NONE";
}

export function createControlPointTessellationAnalysis(
  cells: readonly ControlPointTessellationMeasuredCellEvidence[],
): ControlPointTessellationAnalysis {
  const levels = [analyzeLevel(cells, 576), analyzeLevel(cells, 1152)] as const;
  const pointKeys = ["pointAtT6", "pointAtT21"] as const;
  const tessellationKeys = ["tessellationAtP3", "tessellationAtP8"] as const;
  const pointPositiveAcross = everyDirection(levels, pointKeys, "ROBUST_POSITIVE");
  const tessellationPositiveAcross = everyDirection(
    levels,
    tessellationKeys,
    "ROBUST_POSITIVE",
  );
  const pointCrossoverAcross = sameCrossoverAcross(levels, "pointCrossover");
  const tessellationCrossoverAcross = sameCrossoverAcross(
    levels,
    "tessellationCrossover",
  );
  const qualitativeInteractionAcross = pointCrossoverAcross || tessellationCrossoverAcross;
  const disposition = controlPointTessellationDisposition(levels);
  return {
    levels,
    pointPositiveAcross,
    tessellationPositiveAcross,
    pointCrossoverAcross,
    tessellationCrossoverAcross,
    qualitativeInteractionAcross,
    disposition,
    nextInvestigationClass: target(disposition),
  };
}
