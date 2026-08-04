export const STRAND_ASSET_SCHEMA = "mira.render-lab.strand-asset";
export const STRAND_ASSET_VERSION = 1;

const MAX_STRANDS = 96;
const MIN_CONTROL_POINTS = 3;
const MAX_CONTROL_POINTS = 8;
const MAX_COORDINATE_MAGNITUDE = 10;
const MAX_STRAND_WIDTH = 0.08;
const BOUNDS_EPSILON = 0.000_001;

export type StrandPoint = readonly [number, number, number];

export interface StrandRecord {
  readonly id: string;
  readonly controlPoints: readonly StrandPoint[];
  readonly width: number;
  readonly densityRank: number;
  readonly importanceRank: number;
  readonly materialGroup: "PREVIEW";
}

export interface StrandBounds {
  readonly min: StrandPoint;
  readonly max: StrandPoint;
}

export interface StrandAsset {
  readonly schema: typeof STRAND_ASSET_SCHEMA;
  readonly version: typeof STRAND_ASSET_VERSION;
  readonly coordinateSystem: {
    readonly handedness: "RIGHT_HANDED";
    readonly upAxis: "Y";
    readonly unit: "SCENE_UNIT";
  };
  readonly defaultWidth: number;
  readonly strands: readonly StrandRecord[];
  readonly bounds: StrandBounds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function readBoundedCoordinate(value: unknown, label: string): number {
  const coordinate = readFiniteNumber(value, label);
  if (Math.abs(coordinate) > MAX_COORDINATE_MAGNITUDE) {
    throw new Error(`${label} exceeds the bounded scene range.`);
  }
  return coordinate;
}

function readRank(value: unknown, label: string): number {
  const rank = readFiniteNumber(value, label);
  if (rank < 0 || rank >= 1) {
    throw new Error(`${label} must be in the range [0, 1).`);
  }
  return rank;
}

function readWidth(value: unknown, label: string): number {
  const width = readFiniteNumber(value, label);
  if (width <= 0 || width > MAX_STRAND_WIDTH) {
    throw new Error(`${label} must be greater than 0 and at most ${MAX_STRAND_WIDTH}.`);
  }
  return width;
}

function readPoint(value: unknown, label: string): StrandPoint {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must contain exactly three coordinates.`);
  }
  return [
    readBoundedCoordinate(value[0], `${label}[0]`),
    readBoundedCoordinate(value[1], `${label}[1]`),
    readBoundedCoordinate(value[2], `${label}[2]`),
  ];
}

function readStrand(value: unknown, index: number): StrandRecord {
  if (!isRecord(value)) {
    throw new Error(`strands[${index}] must be an object.`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error(`strands[${index}].id must be a non-empty string.`);
  }
  if (!Array.isArray(value.controlPoints)) {
    throw new Error(`strands[${index}].controlPoints must be an array.`);
  }
  if (
    value.controlPoints.length < MIN_CONTROL_POINTS ||
    value.controlPoints.length > MAX_CONTROL_POINTS
  ) {
    throw new Error(
      `strands[${index}].controlPoints must contain ${MIN_CONTROL_POINTS}-${MAX_CONTROL_POINTS} points.`,
    );
  }
  if (value.materialGroup !== "PREVIEW") {
    throw new Error(`strands[${index}].materialGroup is unsupported.`);
  }
  return {
    id: value.id,
    controlPoints: value.controlPoints.map((point, pointIndex) =>
      readPoint(point, `strands[${index}].controlPoints[${pointIndex}]`),
    ),
    width: readWidth(value.width, `strands[${index}].width`),
    densityRank: readRank(value.densityRank, `strands[${index}].densityRank`),
    importanceRank: readRank(value.importanceRank, `strands[${index}].importanceRank`),
    materialGroup: "PREVIEW",
  };
}

export function deriveStrandBounds(strands: readonly StrandRecord[]): StrandBounds {
  if (strands.length === 0) {
    throw new Error("A StrandAsset must contain at least one strand.");
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const strand of strands) {
    for (const [x, y, z] of strand.controlPoints) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }

  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function boundsMatch(left: StrandBounds, right: StrandBounds): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(left.min[index] - right.min[index]) > BOUNDS_EPSILON) return false;
    if (Math.abs(left.max[index] - right.max[index]) > BOUNDS_EPSILON) return false;
  }
  return true;
}

function validateCoordinateSystem(value: unknown): void {
  if (!isRecord(value)) throw new Error("StrandAsset coordinateSystem is required.");
  if (
    value.handedness !== "RIGHT_HANDED" ||
    value.upAxis !== "Y" ||
    value.unit !== "SCENE_UNIT"
  ) {
    throw new Error("StrandAsset coordinateSystem is unsupported.");
  }
}

function readStrands(value: unknown): readonly StrandRecord[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("StrandAsset must contain at least one strand.");
  }
  if (value.length > MAX_STRANDS) {
    throw new Error(`StrandAsset cannot exceed ${MAX_STRANDS} strands.`);
  }
  const strands = value.map(readStrand);
  const ids = new Set(strands.map((strand) => strand.id));
  if (ids.size !== strands.length) throw new Error("Strand ids must be unique.");
  return strands;
}

function readAndValidateBounds(value: unknown, strands: readonly StrandRecord[]): StrandBounds {
  if (!isRecord(value)) throw new Error("StrandAsset bounds are required.");
  const suppliedBounds = {
    min: readPoint(value.min, "bounds.min"),
    max: readPoint(value.max, "bounds.max"),
  };
  const derivedBounds = deriveStrandBounds(strands);
  if (!boundsMatch(suppliedBounds, derivedBounds)) {
    throw new Error("StrandAsset bounds must match its control points.");
  }
  return derivedBounds;
}

export function validateStrandAsset(value: unknown): StrandAsset {
  if (!isRecord(value)) throw new Error("StrandAsset must be an object.");
  if (value.schema !== STRAND_ASSET_SCHEMA || value.version !== STRAND_ASSET_VERSION) {
    throw new Error("StrandAsset schema/version is unsupported.");
  }
  validateCoordinateSystem(value.coordinateSystem);
  const strands = readStrands(value.strands);
  const derivedBounds = readAndValidateBounds(value.bounds, strands);

  return {
    schema: STRAND_ASSET_SCHEMA,
    version: STRAND_ASSET_VERSION,
    coordinateSystem: {
      handedness: "RIGHT_HANDED",
      upAxis: "Y",
      unit: "SCENE_UNIT",
    },
    defaultWidth: readWidth(value.defaultWidth, "defaultWidth"),
    strands,
    bounds: derivedBounds,
  };
}
