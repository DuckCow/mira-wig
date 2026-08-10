import {
  POINT_SENSITIVITY_DEFAULT_WIDTH,
  POINT_SENSITIVITY_GEOMETRY_RECIPE,
  POINT_SENSITIVITY_SEED,
  constructPointSensitivityCandidate,
  validatePointSensitivityInput,
  type PointSensitivityBounds,
  type PointSensitivityInput,
  type PointSensitivityPoint,
  type PointSensitivityStrand,
} from "./benchmark-point-sensitivity-input";

export const CONTROL_POINT_TESSELLATION_INPUT_SCHEMA =
  "mira.render-lab.r2ca-s2-benchmark-input";
export const CONTROL_POINT_TESSELLATION_INPUT_VERSION = 1;
export const CONTROL_POINT_TESSELLATION_GENERATOR_VERSION =
  "r2ca-s2-synthetic-generator/v1";
export const CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE =
  POINT_SENSITIVITY_GEOMETRY_RECIPE;
export const CONTROL_POINT_TESSELLATION_SEED = POINT_SENSITIVITY_SEED;
export const CONTROL_POINT_TESSELLATION_DEFAULT_WIDTH =
  POINT_SENSITIVITY_DEFAULT_WIDTH;
export const CONTROL_POINT_TESSELLATION_STRAND_LEVELS = [576, 1152] as const;
export const CONTROL_POINT_TESSELLATION_POINT_LEVELS = [3, 8] as const;
export const CONTROL_POINT_TESSELLATION_TESSELLATION_LEVELS = [6, 21] as const;

export type ControlPointTessellationStrandCount =
  (typeof CONTROL_POINT_TESSELLATION_STRAND_LEVELS)[number];
export type ControlPointTessellationPointsPerStrand =
  (typeof CONTROL_POINT_TESSELLATION_POINT_LEVELS)[number];
export type ControlPointTessellationTubularSegments =
  (typeof CONTROL_POINT_TESSELLATION_TESSELLATION_LEVELS)[number];
export type ControlPointTessellationPoint = PointSensitivityPoint;
export type ControlPointTessellationStrand = PointSensitivityStrand;
export type ControlPointTessellationBounds = PointSensitivityBounds;

export interface ControlPointTessellationInput {
  readonly schema: typeof CONTROL_POINT_TESSELLATION_INPUT_SCHEMA;
  readonly version: typeof CONTROL_POINT_TESSELLATION_INPUT_VERSION;
  readonly classification: "BENCHMARK_ONLY";
  readonly canonicalR2BBundle: false;
  readonly generatorVersion: typeof CONTROL_POINT_TESSELLATION_GENERATOR_VERSION;
  readonly geometryRecipe: typeof CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE;
  readonly seed: typeof CONTROL_POINT_TESSELLATION_SEED;
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly pointsPerStrand: ControlPointTessellationPointsPerStrand;
  readonly tubularSegments: ControlPointTessellationTubularSegments;
  readonly coordinateSystem: PointSensitivityInput["coordinateSystem"];
  readonly defaultWidth: typeof CONTROL_POINT_TESSELLATION_DEFAULT_WIDTH;
  readonly strands: readonly ControlPointTessellationStrand[];
  readonly bounds: ControlPointTessellationBounds;
}

export interface ControlPointTessellationGenerationRequest {
  readonly seed: number;
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly pointsPerStrand: ControlPointTessellationPointsPerStrand;
  readonly tubularSegments: ControlPointTessellationTubularSegments;
}

const ROOT_KEYS = [
  "schema", "version", "classification", "canonicalR2BBundle",
  "generatorVersion", "geometryRecipe", "seed", "strandCount",
  "pointsPerStrand", "tubularSegments", "coordinateSystem", "defaultWidth",
  "strands", "bounds",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>): void {
  const actual = Object.keys(value).sort();
  const expected = [...ROOT_KEYS].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error("ControlPointTessellationInput must have the exact S2 shape.");
  }
}

export function readControlPointTessellationStrandCount(
  value: unknown,
): ControlPointTessellationStrandCount {
  if (value === 576 || value === 1152) return value;
  throw new Error("strandCount is not an admitted R2C-A-S2 level.");
}

export function readControlPointTessellationPointsPerStrand(
  value: unknown,
): ControlPointTessellationPointsPerStrand {
  if (value === 3 || value === 8) return value;
  throw new Error("pointsPerStrand is not an admitted R2C-A-S2 level.");
}

export function readControlPointTessellationTubularSegments(
  value: unknown,
): ControlPointTessellationTubularSegments {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error("tubularSegments must be a positive safe integer.");
  }
  if (value === 6 || value === 21) return value;
  throw new Error("tubularSegments is not an admitted R2C-A-S2 level.");
}

export function validateControlPointTessellationSeed(
  value: unknown,
): typeof CONTROL_POINT_TESSELLATION_SEED {
  if (value !== CONTROL_POINT_TESSELLATION_SEED) {
    throw new Error(`seed must be ${CONTROL_POINT_TESSELLATION_SEED}.`);
  }
  return CONTROL_POINT_TESSELLATION_SEED;
}

function validateSharedGraph(
  value: Record<string, unknown>,
): PointSensitivityInput {
  return validatePointSensitivityInput({
    schema: "mira.render-lab.r2ca-s1-benchmark-input",
    version: 1,
    classification: value.classification,
    canonicalR2BBundle: value.canonicalR2BBundle,
    generatorVersion: "r2ca-s1-synthetic-generator/v1",
    geometryRecipe: value.geometryRecipe,
    seed: value.seed,
    strandCount: value.strandCount,
    pointsPerStrand: value.pointsPerStrand,
    coordinateSystem: value.coordinateSystem,
    defaultWidth: value.defaultWidth,
    strands: value.strands,
    bounds: value.bounds,
  });
}

export function validateControlPointTessellationInput(
  value: unknown,
): ControlPointTessellationInput {
  if (!isRecord(value)) {
    throw new Error("ControlPointTessellationInput must be an object.");
  }
  exactKeys(value);
  if (
    value.schema !== CONTROL_POINT_TESSELLATION_INPUT_SCHEMA ||
    value.version !== CONTROL_POINT_TESSELLATION_INPUT_VERSION
  ) {
    throw new Error("ControlPointTessellationInput schema/version is unsupported.");
  }
  if (
    value.classification !== "BENCHMARK_ONLY" ||
    value.canonicalR2BBundle !== false ||
    value.generatorVersion !== CONTROL_POINT_TESSELLATION_GENERATOR_VERSION ||
    value.geometryRecipe !== CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE ||
    value.defaultWidth !== CONTROL_POINT_TESSELLATION_DEFAULT_WIDTH
  ) {
    throw new Error("S2 input identity is unsupported.");
  }
  const seed = validateControlPointTessellationSeed(value.seed);
  const strandCount = readControlPointTessellationStrandCount(value.strandCount);
  const pointsPerStrand = readControlPointTessellationPointsPerStrand(
    value.pointsPerStrand,
  );
  const tubularSegments = readControlPointTessellationTubularSegments(
    value.tubularSegments,
  );
  const shared = validateSharedGraph(value);
  return Object.freeze({
    schema: CONTROL_POINT_TESSELLATION_INPUT_SCHEMA,
    version: CONTROL_POINT_TESSELLATION_INPUT_VERSION,
    classification: "BENCHMARK_ONLY",
    canonicalR2BBundle: false,
    generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
    geometryRecipe: CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE,
    seed,
    strandCount,
    pointsPerStrand,
    tubularSegments,
    coordinateSystem: shared.coordinateSystem,
    defaultWidth: CONTROL_POINT_TESSELLATION_DEFAULT_WIDTH,
    strands: shared.strands,
    bounds: shared.bounds,
  });
}

/** Produces an untrusted S2 candidate; tessellation never enters generation. */
export function constructControlPointTessellationCandidate(
  request: ControlPointTessellationGenerationRequest,
): unknown {
  const seed = validateControlPointTessellationSeed(request.seed);
  const strandCount = readControlPointTessellationStrandCount(request.strandCount);
  const pointsPerStrand = readControlPointTessellationPointsPerStrand(
    request.pointsPerStrand,
  );
  const tubularSegments = readControlPointTessellationTubularSegments(
    request.tubularSegments,
  );
  const shared = constructPointSensitivityCandidate({
    seed,
    strandCount,
    pointsPerStrand,
  });
  if (!isRecord(shared)) throw new Error("S1 generator returned an invalid candidate.");
  return {
    ...shared,
    schema: CONTROL_POINT_TESSELLATION_INPUT_SCHEMA,
    version: CONTROL_POINT_TESSELLATION_INPUT_VERSION,
    generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
    tubularSegments,
  };
}

export function generateControlPointTessellationInput(
  request: ControlPointTessellationGenerationRequest,
): ControlPointTessellationInput {
  return validateControlPointTessellationInput(
    constructControlPointTessellationCandidate(request),
  );
}
