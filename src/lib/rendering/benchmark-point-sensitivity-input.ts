export const POINT_SENSITIVITY_INPUT_SCHEMA =
  "mira.render-lab.r2ca-s1-benchmark-input";
export const POINT_SENSITIVITY_INPUT_VERSION = 1;
export const POINT_SENSITIVITY_GENERATOR_VERSION =
  "r2ca-s1-synthetic-generator/v1";
export const POINT_SENSITIVITY_GEOMETRY_RECIPE = "RADIAL_CROWN_FALL_V1";
export const POINT_SENSITIVITY_SEED = 20_260_808;
export const POINT_SENSITIVITY_DEFAULT_WIDTH = 0.028;
export const POINT_SENSITIVITY_STRAND_LEVELS = [576, 1152] as const;
export const POINT_SENSITIVITY_POINT_LEVELS = [3, 6, 8] as const;

export type PointSensitivityStrandCount =
  (typeof POINT_SENSITIVITY_STRAND_LEVELS)[number];
export type PointSensitivityPointsPerStrand =
  (typeof POINT_SENSITIVITY_POINT_LEVELS)[number];
export type PointSensitivityPoint = readonly [number, number, number];

export interface PointSensitivityStrand {
  readonly id: string;
  readonly controlPoints: readonly PointSensitivityPoint[];
  readonly width: number;
  readonly densityRank: number;
  readonly importanceRank: number;
  readonly materialGroup: "PREVIEW";
}

export interface PointSensitivityBounds {
  readonly min: PointSensitivityPoint;
  readonly max: PointSensitivityPoint;
}

export interface PointSensitivityInput {
  readonly schema: typeof POINT_SENSITIVITY_INPUT_SCHEMA;
  readonly version: typeof POINT_SENSITIVITY_INPUT_VERSION;
  readonly classification: "BENCHMARK_ONLY";
  readonly canonicalR2BBundle: false;
  readonly generatorVersion: typeof POINT_SENSITIVITY_GENERATOR_VERSION;
  readonly geometryRecipe: typeof POINT_SENSITIVITY_GEOMETRY_RECIPE;
  readonly seed: typeof POINT_SENSITIVITY_SEED;
  readonly strandCount: PointSensitivityStrandCount;
  readonly pointsPerStrand: PointSensitivityPointsPerStrand;
  readonly coordinateSystem: {
    readonly handedness: "RIGHT_HANDED";
    readonly upAxis: "Y";
    readonly unit: "SCENE_UNIT";
  };
  readonly defaultWidth: typeof POINT_SENSITIVITY_DEFAULT_WIDTH;
  readonly strands: readonly PointSensitivityStrand[];
  readonly bounds: PointSensitivityBounds;
}

export interface PointSensitivityGenerationRequest {
  readonly seed: number;
  readonly strandCount: PointSensitivityStrandCount;
  readonly pointsPerStrand: PointSensitivityPointsPerStrand;
}

const ROOT_KEYS = [
  "schema", "version", "classification", "canonicalR2BBundle",
  "generatorVersion", "geometryRecipe", "seed", "strandCount",
  "pointsPerStrand", "coordinateSystem", "defaultWidth", "strands", "bounds",
] as const;
const STRAND_KEYS = [
  "id", "controlPoints", "width", "densityRank", "importanceRank", "materialGroup",
] as const;
const MAX_COORDINATE_MAGNITUDE = 10;
const MAX_STRAND_WIDTH = 0.08;
const BOUNDS_EPSILON = 0.000_001;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} must have the exact S1 benchmark shape.`);
  }
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function coordinate(value: unknown, label: string): number {
  const result = finite(value, label);
  if (Math.abs(result) > MAX_COORDINATE_MAGNITUDE) {
    throw new Error(`${label} exceeds the bounded S1 scene range.`);
  }
  return result;
}

function point(
  value: unknown,
  label: string,
  identities: WeakSet<object>,
): PointSensitivityPoint {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must contain exactly three coordinates.`);
  }
  if (identities.has(value)) {
    throw new Error("S1 control-point tuple identities must be unique.");
  }
  identities.add(value);
  return Object.freeze([
    coordinate(value[0], `${label}[0]`),
    coordinate(value[1], `${label}[1]`),
    coordinate(value[2], `${label}[2]`),
  ]);
}

function width(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result <= 0 || result > MAX_STRAND_WIDTH) {
    throw new Error(`${label} must be greater than 0 and at most 0.08.`);
  }
  return result;
}

function rank(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0 || result >= 1) throw new Error(`${label} must be in [0, 1).`);
  return result;
}

export function readPointSensitivityStrandCount(
  value: unknown,
): PointSensitivityStrandCount {
  if (value === 576 || value === 1152) return value;
  throw new Error("strandCount is not an admitted R2C-A-S1 level.");
}

export function readPointSensitivityPointsPerStrand(
  value: unknown,
): PointSensitivityPointsPerStrand {
  if (value === 3 || value === 6 || value === 8) return value;
  throw new Error("pointsPerStrand is not an admitted R2C-A-S1 level.");
}

export function validatePointSensitivitySeed(
  value: unknown,
): typeof POINT_SENSITIVITY_SEED {
  if (value !== POINT_SENSITIVITY_SEED) {
    throw new Error(`seed must be ${POINT_SENSITIVITY_SEED}.`);
  }
  return POINT_SENSITIVITY_SEED;
}

function coordinateSystem(
  value: unknown,
): PointSensitivityInput["coordinateSystem"] {
  if (!isRecord(value)) throw new Error("coordinateSystem is required.");
  exactKeys(value, ["handedness", "upAxis", "unit"], "coordinateSystem");
  if (
    value.handedness !== "RIGHT_HANDED" ||
    value.upAxis !== "Y" ||
    value.unit !== "SCENE_UNIT"
  ) {
    throw new Error("coordinateSystem is unsupported.");
  }
  return Object.freeze({
    handedness: "RIGHT_HANDED",
    upAxis: "Y",
    unit: "SCENE_UNIT",
  });
}

function readStrands(
  value: unknown,
  strandCount: PointSensitivityStrandCount,
  pointsPerStrand: PointSensitivityPointsPerStrand,
): readonly PointSensitivityStrand[] {
  if (!Array.isArray(value) || value.length !== strandCount) {
    throw new Error("strands must match strandCount exactly.");
  }
  const strandIdentities = new WeakSet<object>();
  const pointIdentities = new WeakSet<object>();
  const ids = new Set<string>();
  return Object.freeze(value.map((candidate, strandIndex) => {
    if (!isRecord(candidate)) {
      throw new Error(`strands[${strandIndex}] must be an object.`);
    }
    if (strandIdentities.has(candidate)) {
      throw new Error("S1 strand object identities must be unique.");
    }
    strandIdentities.add(candidate);
    exactKeys(candidate, STRAND_KEYS, `strands[${strandIndex}]`);
    if (
      typeof candidate.id !== "string" ||
      !/^r2ca-[0-9]{6}$/.test(candidate.id)
    ) {
      throw new Error(`strands[${strandIndex}].id is not benchmark-local.`);
    }
    if (ids.has(candidate.id)) throw new Error("S1 strand ids must be unique.");
    ids.add(candidate.id);
    if (
      !Array.isArray(candidate.controlPoints) ||
      candidate.controlPoints.length !== pointsPerStrand
    ) {
      throw new Error("Every S1 strand must match pointsPerStrand exactly.");
    }
    if (candidate.materialGroup !== "PREVIEW") {
      throw new Error(`strands[${strandIndex}].materialGroup is unsupported.`);
    }
    return Object.freeze({
      id: candidate.id,
      controlPoints: Object.freeze(candidate.controlPoints.map((entry, pointIndex) =>
        point(
          entry,
          `strands[${strandIndex}].controlPoints[${pointIndex}]`,
          pointIdentities,
        ),
      )),
      width: width(candidate.width, `strands[${strandIndex}].width`),
      densityRank: rank(candidate.densityRank, `strands[${strandIndex}].densityRank`),
      importanceRank: rank(
        candidate.importanceRank,
        `strands[${strandIndex}].importanceRank`,
      ),
      materialGroup: "PREVIEW" as const,
    });
  }));
}

export function derivePointSensitivityBounds(
  strands: readonly PointSensitivityStrand[],
): PointSensitivityBounds {
  if (strands.length === 0) throw new Error("S1 input must contain strands.");
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const strand of strands) {
    for (const controlPoint of strand.controlPoints) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], controlPoint[axis]);
        maximum[axis] = Math.max(maximum[axis], controlPoint[axis]);
      }
    }
  }
  const min: PointSensitivityPoint = Object.freeze([
    minimum[0], minimum[1], minimum[2],
  ]);
  const max: PointSensitivityPoint = Object.freeze([
    maximum[0], maximum[1], maximum[2],
  ]);
  return Object.freeze({ min, max });
}

function bounds(
  value: unknown,
  strands: readonly PointSensitivityStrand[],
): PointSensitivityBounds {
  if (!isRecord(value)) throw new Error("bounds is required.");
  exactKeys(value, ["min", "max"], "bounds");
  const identities = new WeakSet<object>();
  const supplied = {
    min: point(value.min, "bounds.min", identities),
    max: point(value.max, "bounds.max", identities),
  };
  const derived = derivePointSensitivityBounds(strands);
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      Math.abs(supplied.min[axis] - derived.min[axis]) > BOUNDS_EPSILON ||
      Math.abs(supplied.max[axis] - derived.max[axis]) > BOUNDS_EPSILON
    ) {
      throw new Error("bounds must match S1 control points.");
    }
  }
  return derived;
}

export function validatePointSensitivityInput(value: unknown): PointSensitivityInput {
  if (!isRecord(value)) throw new Error("PointSensitivityInput must be an object.");
  if (value.schema === "mira.render-lab.strand-asset") {
    throw new Error("Canonical StrandAsset cannot masquerade as S1 input.");
  }
  exactKeys(value, ROOT_KEYS, "PointSensitivityInput");
  if (
    value.schema !== POINT_SENSITIVITY_INPUT_SCHEMA ||
    value.version !== POINT_SENSITIVITY_INPUT_VERSION
  ) {
    throw new Error("PointSensitivityInput schema/version is unsupported.");
  }
  if (value.classification !== "BENCHMARK_ONLY" || value.canonicalR2BBundle !== false) {
    throw new Error("S1 input must remain BENCHMARK_ONLY and noncanonical.");
  }
  if (value.generatorVersion !== POINT_SENSITIVITY_GENERATOR_VERSION) {
    throw new Error("generatorVersion is unsupported.");
  }
  if (value.geometryRecipe !== POINT_SENSITIVITY_GEOMETRY_RECIPE) {
    throw new Error("geometryRecipe is unsupported.");
  }
  const seed = validatePointSensitivitySeed(value.seed);
  const strandCount = readPointSensitivityStrandCount(value.strandCount);
  const pointsPerStrand = readPointSensitivityPointsPerStrand(value.pointsPerStrand);
  const strands = readStrands(value.strands, strandCount, pointsPerStrand);
  if (value.defaultWidth !== POINT_SENSITIVITY_DEFAULT_WIDTH) {
    throw new Error(`defaultWidth must be ${POINT_SENSITIVITY_DEFAULT_WIDTH}.`);
  }
  return Object.freeze({
    schema: POINT_SENSITIVITY_INPUT_SCHEMA,
    version: POINT_SENSITIVITY_INPUT_VERSION,
    classification: "BENCHMARK_ONLY",
    canonicalR2BBundle: false,
    generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
    geometryRecipe: POINT_SENSITIVITY_GEOMETRY_RECIPE,
    seed,
    strandCount,
    pointsPerStrand,
    coordinateSystem: coordinateSystem(value.coordinateSystem),
    defaultWidth: POINT_SENSITIVITY_DEFAULT_WIDTH,
    strands,
    bounds: bounds(value.bounds, strands),
  });
}

function seededUnit(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

/** Produces an untrusted S1 candidate so construction and validation are timed separately. */
export function constructPointSensitivityCandidate(
  request: PointSensitivityGenerationRequest,
): unknown {
  const seed = validatePointSensitivitySeed(request.seed);
  const strandCount = readPointSensitivityStrandCount(request.strandCount);
  const pointsPerStrand = readPointSensitivityPointsPerStrand(
    request.pointsPerStrand,
  );
  const strands: PointSensitivityStrand[] = [];
  for (let strandIndex = 0; strandIndex < strandCount; strandIndex += 1) {
    const angle = (strandIndex / strandCount) * Math.PI * 2;
    const crownRadius = 0.68 + seededUnit(seed, strandIndex) * 0.24;
    const length = 1.35 + seededUnit(seed, strandIndex + strandCount) * 0.55;
    const controlPoints: PointSensitivityPoint[] = [];
    for (let pointIndex = 0; pointIndex < pointsPerStrand; pointIndex += 1) {
      const progress = pointIndex / (pointsPerStrand - 1);
      const fall = Math.sin(progress * Math.PI) * 0.12;
      controlPoints.push([
        Math.cos(angle) * (crownRadius + fall),
        1.02 - progress * length,
        Math.sin(angle) * (crownRadius + fall) * 0.82,
      ]);
    }
    strands.push({
      id: `r2ca-${String(strandIndex).padStart(6, "0")}`,
      controlPoints,
      width: POINT_SENSITIVITY_DEFAULT_WIDTH,
      densityRank: strandIndex / strandCount,
      importanceRank: ((strandIndex * 4051) % strandCount) / strandCount,
      materialGroup: "PREVIEW",
    });
  }
  return {
    schema: POINT_SENSITIVITY_INPUT_SCHEMA,
    version: POINT_SENSITIVITY_INPUT_VERSION,
    classification: "BENCHMARK_ONLY",
    canonicalR2BBundle: false,
    generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
    geometryRecipe: POINT_SENSITIVITY_GEOMETRY_RECIPE,
    seed,
    strandCount,
    pointsPerStrand,
    coordinateSystem: {
      handedness: "RIGHT_HANDED",
      upAxis: "Y",
      unit: "SCENE_UNIT",
    },
    defaultWidth: POINT_SENSITIVITY_DEFAULT_WIDTH,
    strands,
    bounds: derivePointSensitivityBounds(strands),
  };
}

export function generatePointSensitivityInput(
  request: PointSensitivityGenerationRequest,
): PointSensitivityInput {
  return validatePointSensitivityInput(constructPointSensitivityCandidate(request));
}
