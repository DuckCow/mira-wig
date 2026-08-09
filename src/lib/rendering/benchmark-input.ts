export const RENDERER_BENCHMARK_INPUT_SCHEMA =
  "mira.render-lab.r2ca-benchmark-input";
export const RENDERER_BENCHMARK_INPUT_VERSION = 1;
export const RENDERER_BENCHMARK_GENERATOR_VERSION =
  "r2ca-synthetic-generator/v1";
export const RENDERER_BENCHMARK_GEOMETRY_RECIPE = "RADIAL_CROWN_FALL_V1";
export const RENDERER_BENCHMARK_SEED = 20_260_808;
export const RENDERER_BENCHMARK_POINTS_PER_STRAND = 6;

export const RENDERER_BENCHMARK_STRAND_LEVELS = [
  72,
  144,
  288,
  576,
  1152,
] as const;

export type RendererBenchmarkStrandCount =
  (typeof RENDERER_BENCHMARK_STRAND_LEVELS)[number];
export type RendererBenchmarkPoint = readonly [number, number, number];

export interface RendererBenchmarkStrand {
  readonly id: string;
  readonly controlPoints: readonly RendererBenchmarkPoint[];
  readonly width: number;
  readonly densityRank: number;
  readonly importanceRank: number;
  readonly materialGroup: "PREVIEW";
}

export interface RendererBenchmarkBounds {
  readonly min: RendererBenchmarkPoint;
  readonly max: RendererBenchmarkPoint;
}

export interface RendererBenchmarkInput {
  readonly schema: typeof RENDERER_BENCHMARK_INPUT_SCHEMA;
  readonly version: typeof RENDERER_BENCHMARK_INPUT_VERSION;
  readonly classification: "BENCHMARK_ONLY";
  readonly canonicalR2BBundle: false;
  readonly generatorVersion: typeof RENDERER_BENCHMARK_GENERATOR_VERSION;
  readonly geometryRecipe: typeof RENDERER_BENCHMARK_GEOMETRY_RECIPE;
  readonly seed: typeof RENDERER_BENCHMARK_SEED;
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly pointsPerStrand: typeof RENDERER_BENCHMARK_POINTS_PER_STRAND;
  readonly coordinateSystem: {
    readonly handedness: "RIGHT_HANDED";
    readonly upAxis: "Y";
    readonly unit: "SCENE_UNIT";
  };
  readonly defaultWidth: number;
  readonly strands: readonly RendererBenchmarkStrand[];
  readonly bounds: RendererBenchmarkBounds;
}

export interface RendererBenchmarkGenerationRequest {
  readonly seed: number;
  readonly strandCount: RendererBenchmarkStrandCount;
}

const ROOT_KEYS = [
  "schema",
  "version",
  "classification",
  "canonicalR2BBundle",
  "generatorVersion",
  "geometryRecipe",
  "seed",
  "strandCount",
  "pointsPerStrand",
  "coordinateSystem",
  "defaultWidth",
  "strands",
  "bounds",
] as const;
const STRAND_KEYS = [
  "id",
  "controlPoints",
  "width",
  "densityRank",
  "importanceRank",
  "materialGroup",
] as const;
const MAX_COORDINATE_MAGNITUDE = 10;
const MAX_STRAND_WIDTH = 0.08;
const BOUNDS_EPSILON = 0.000_001;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
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
    throw new Error(`${label} must have the exact benchmark shape.`);
  }
}

function readFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function readCoordinate(value: unknown, label: string): number {
  const coordinate = readFinite(value, label);
  if (Math.abs(coordinate) > MAX_COORDINATE_MAGNITUDE) {
    throw new Error(`${label} exceeds the bounded benchmark scene range.`);
  }
  return coordinate;
}

function readPoint(
  value: unknown,
  label: string,
  identities: WeakSet<object>,
): RendererBenchmarkPoint {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must contain exactly three coordinates.`);
  }
  if (identities.has(value)) {
    throw new Error("Benchmark control-point tuple identities must be unique.");
  }
  identities.add(value);
  return Object.freeze([
    readCoordinate(value[0], `${label}[0]`),
    readCoordinate(value[1], `${label}[1]`),
    readCoordinate(value[2], `${label}[2]`),
  ]);
}

function readWidth(value: unknown, label: string): number {
  const width = readFinite(value, label);
  if (width <= 0 || width > MAX_STRAND_WIDTH) {
    throw new Error(`${label} must be greater than 0 and at most 0.08.`);
  }
  return width;
}

function readRank(value: unknown, label: string): number {
  const rank = readFinite(value, label);
  if (rank < 0 || rank >= 1) throw new Error(`${label} must be in [0, 1).`);
  return rank;
}

export function readRendererBenchmarkStrandCount(
  value: unknown,
): RendererBenchmarkStrandCount {
  if (
    value === 72 ||
    value === 144 ||
    value === 288 ||
    value === 576 ||
    value === 1152
  ) {
    return value;
  }
  throw new Error("strandCount is not an admitted v0.3 benchmark level.");
}

export function validateRendererBenchmarkSeed(
  value: unknown,
): typeof RENDERER_BENCHMARK_SEED {
  if (value !== RENDERER_BENCHMARK_SEED) {
    throw new Error(`seed must be ${RENDERER_BENCHMARK_SEED}.`);
  }
  return RENDERER_BENCHMARK_SEED;
}

function readCoordinateSystem(
  value: unknown,
): RendererBenchmarkInput["coordinateSystem"] {
  if (!isRecord(value)) throw new Error("coordinateSystem is required.");
  requireExactKeys(value, ["handedness", "upAxis", "unit"], "coordinateSystem");
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
  strandCount: RendererBenchmarkStrandCount,
): readonly RendererBenchmarkStrand[] {
  if (!Array.isArray(value) || value.length !== strandCount) {
    throw new Error("strands must match strandCount exactly.");
  }
  const strandIdentities = new WeakSet<object>();
  const pointIdentities = new WeakSet<object>();
  const ids = new Set<string>();
  const strands = value.map((candidate, strandIndex) => {
    if (!isRecord(candidate)) {
      throw new Error(`strands[${strandIndex}] must be an object.`);
    }
    if (strandIdentities.has(candidate)) {
      throw new Error("Benchmark strand object identities must be unique.");
    }
    strandIdentities.add(candidate);
    requireExactKeys(candidate, STRAND_KEYS, `strands[${strandIndex}]`);
    if (
      typeof candidate.id !== "string" ||
      !/^r2ca-[0-9]{6}$/.test(candidate.id)
    ) {
      throw new Error(`strands[${strandIndex}].id is not a benchmark-local id.`);
    }
    if (ids.has(candidate.id)) throw new Error("Benchmark strand ids must be unique.");
    ids.add(candidate.id);
    if (
      !Array.isArray(candidate.controlPoints) ||
      candidate.controlPoints.length !== RENDERER_BENCHMARK_POINTS_PER_STRAND
    ) {
      throw new Error("Every benchmark strand must contain exactly 6 points.");
    }
    if (candidate.materialGroup !== "PREVIEW") {
      throw new Error(`strands[${strandIndex}].materialGroup is unsupported.`);
    }
    return Object.freeze({
      id: candidate.id,
      controlPoints: Object.freeze(
        candidate.controlPoints.map((point, pointIndex) =>
          readPoint(
            point,
            `strands[${strandIndex}].controlPoints[${pointIndex}]`,
            pointIdentities,
          ),
        ),
      ),
      width: readWidth(candidate.width, `strands[${strandIndex}].width`),
      densityRank: readRank(
        candidate.densityRank,
        `strands[${strandIndex}].densityRank`,
      ),
      importanceRank: readRank(
        candidate.importanceRank,
        `strands[${strandIndex}].importanceRank`,
      ),
      materialGroup: "PREVIEW" as const,
    });
  });
  return Object.freeze(strands);
}

export function deriveRendererBenchmarkBounds(
  strands: readonly RendererBenchmarkStrand[],
): RendererBenchmarkBounds {
  if (strands.length === 0) throw new Error("Benchmark input must contain strands.");
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const strand of strands) {
    for (const point of strand.controlPoints) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], point[axis]);
        maximum[axis] = Math.max(maximum[axis], point[axis]);
      }
    }
  }
  const min: RendererBenchmarkPoint = Object.freeze([
    minimum[0],
    minimum[1],
    minimum[2],
  ]);
  const max: RendererBenchmarkPoint = Object.freeze([
    maximum[0],
    maximum[1],
    maximum[2],
  ]);
  return Object.freeze({ min, max });
}

function readBounds(
  value: unknown,
  strands: readonly RendererBenchmarkStrand[],
): RendererBenchmarkBounds {
  if (!isRecord(value)) throw new Error("bounds is required.");
  requireExactKeys(value, ["min", "max"], "bounds");
  const identities = new WeakSet<object>();
  const supplied = {
    min: readPoint(value.min, "bounds.min", identities),
    max: readPoint(value.max, "bounds.max", identities),
  };
  const derived = deriveRendererBenchmarkBounds(strands);
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      Math.abs(supplied.min[axis] - derived.min[axis]) > BOUNDS_EPSILON ||
      Math.abs(supplied.max[axis] - derived.max[axis]) > BOUNDS_EPSILON
    ) {
      throw new Error("bounds must match benchmark control points.");
    }
  }
  return derived;
}

export function validateRendererBenchmarkInput(
  value: unknown,
): RendererBenchmarkInput {
  if (!isRecord(value)) throw new Error("RendererBenchmarkInput must be an object.");
  if (value.schema === "mira.render-lab.strand-asset") {
    throw new Error("Canonical StrandAsset cannot masquerade as benchmark input.");
  }
  requireExactKeys(value, ROOT_KEYS, "RendererBenchmarkInput");
  if (
    value.schema !== RENDERER_BENCHMARK_INPUT_SCHEMA ||
    value.version !== RENDERER_BENCHMARK_INPUT_VERSION
  ) {
    throw new Error("RendererBenchmarkInput schema/version is unsupported.");
  }
  if (value.classification !== "BENCHMARK_ONLY") {
    throw new Error("classification must be BENCHMARK_ONLY.");
  }
  if (value.canonicalR2BBundle !== false) {
    throw new Error("canonicalR2BBundle must be false.");
  }
  if (value.generatorVersion !== RENDERER_BENCHMARK_GENERATOR_VERSION) {
    throw new Error("generatorVersion is unsupported.");
  }
  if (value.geometryRecipe !== RENDERER_BENCHMARK_GEOMETRY_RECIPE) {
    throw new Error("geometryRecipe is unsupported.");
  }
  const seed = validateRendererBenchmarkSeed(value.seed);
  const strandCount = readRendererBenchmarkStrandCount(value.strandCount);
  if (value.pointsPerStrand !== RENDERER_BENCHMARK_POINTS_PER_STRAND) {
    throw new Error("pointsPerStrand must be exactly 6.");
  }
  const strands = readStrands(value.strands, strandCount);
  return Object.freeze({
    schema: RENDERER_BENCHMARK_INPUT_SCHEMA,
    version: RENDERER_BENCHMARK_INPUT_VERSION,
    classification: "BENCHMARK_ONLY",
    canonicalR2BBundle: false,
    generatorVersion: RENDERER_BENCHMARK_GENERATOR_VERSION,
    geometryRecipe: RENDERER_BENCHMARK_GEOMETRY_RECIPE,
    seed,
    strandCount,
    pointsPerStrand: RENDERER_BENCHMARK_POINTS_PER_STRAND,
    coordinateSystem: readCoordinateSystem(value.coordinateSystem),
    defaultWidth: readWidth(value.defaultWidth, "defaultWidth"),
    strands,
    bounds: readBounds(value.bounds, strands),
  });
}

function seededUnit(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

/** Produces an untrusted candidate so construction and validation can be timed separately. */
export function constructRendererBenchmarkCandidate(
  request: RendererBenchmarkGenerationRequest,
): unknown {
  const seed = validateRendererBenchmarkSeed(request.seed);
  const strandCount = readRendererBenchmarkStrandCount(request.strandCount);
  const strands: RendererBenchmarkStrand[] = [];
  for (let strandIndex = 0; strandIndex < strandCount; strandIndex += 1) {
    const angle = (strandIndex / strandCount) * Math.PI * 2;
    const crownRadius = 0.68 + seededUnit(seed, strandIndex) * 0.24;
    const length = 1.35 + seededUnit(seed, strandIndex + strandCount) * 0.55;
    const controlPoints: RendererBenchmarkPoint[] = [];
    for (
      let pointIndex = 0;
      pointIndex < RENDERER_BENCHMARK_POINTS_PER_STRAND;
      pointIndex += 1
    ) {
      const progress = pointIndex / (RENDERER_BENCHMARK_POINTS_PER_STRAND - 1);
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
      width: 0.028,
      densityRank: strandIndex / strandCount,
      importanceRank: ((strandIndex * 4051) % strandCount) / strandCount,
      materialGroup: "PREVIEW",
    });
  }
  return {
    schema: RENDERER_BENCHMARK_INPUT_SCHEMA,
    version: RENDERER_BENCHMARK_INPUT_VERSION,
    classification: "BENCHMARK_ONLY",
    canonicalR2BBundle: false,
    generatorVersion: RENDERER_BENCHMARK_GENERATOR_VERSION,
    geometryRecipe: RENDERER_BENCHMARK_GEOMETRY_RECIPE,
    seed,
    strandCount,
    pointsPerStrand: RENDERER_BENCHMARK_POINTS_PER_STRAND,
    coordinateSystem: {
      handedness: "RIGHT_HANDED",
      upAxis: "Y",
      unit: "SCENE_UNIT",
    },
    defaultWidth: 0.028,
    strands,
    bounds: deriveRendererBenchmarkBounds(strands),
  };
}

export function generateRendererBenchmarkInput(
  request: RendererBenchmarkGenerationRequest,
): RendererBenchmarkInput {
  return validateRendererBenchmarkInput(constructRendererBenchmarkCandidate(request));
}
