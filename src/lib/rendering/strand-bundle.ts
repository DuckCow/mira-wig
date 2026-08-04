import {
  STRAND_ASSET_SCHEMA,
  STRAND_ASSET_VERSION,
  deriveStrandBounds,
  validateStrandAsset,
  type StrandAsset,
  type StrandPoint,
  type StrandRecord,
} from "./strand-asset";

export const STRAND_BUNDLE_SCHEMA = "mira.rendering.strand-bundle";
export const STRAND_BUNDLE_SCHEMA_VERSION = 1;
export const STRAND_BUNDLE_CLASSIFICATION = "VISUAL_ONLY";
export const STRAND_BUNDLE_BINARY_URI = "strands.bin";
export const STRAND_BUNDLE_MANIFEST_MAX_BYTES = 8_192;
export const STRAND_BUNDLE_BINARY_MAX_BYTES = 16_384;
export const STRAND_BUNDLE_MAX_STRANDS = 96;
export const STRAND_BUNDLE_MAX_CONTROL_POINTS = 768;

const MIN_CONTROL_POINTS_PER_STRAND = 3;
const MAX_CONTROL_POINTS_PER_STRAND = 8;
const MAX_COORDINATE_MAGNITUDE = 10;
const MAX_WIDTH = 0.08;
const MAX_IDENTITY_BYTES = 64;
const IDENTITY_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

export interface StrandBundleManifest {
  readonly schema: typeof STRAND_BUNDLE_SCHEMA;
  readonly schemaVersion: typeof STRAND_BUNDLE_SCHEMA_VERSION;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly classification: typeof STRAND_BUNDLE_CLASSIFICATION;
  readonly coordinateSystem: {
    readonly handedness: "RIGHT_HANDED";
    readonly upAxis: "Y";
    readonly unit: "SCENE_UNIT";
  };
  readonly binaryEndianness: "LITTLE_ENDIAN";
  readonly strandCount: number;
  readonly controlPointCount: number;
  readonly materialGroup: "PREVIEW";
  readonly defaultWidth: number;
  readonly strandIds: readonly string[];
  readonly buffer: {
    readonly uri: typeof STRAND_BUNDLE_BINARY_URI;
    readonly byteLength: number;
    readonly sha256: string;
  };
}

export interface PackedStrandBundleData {
  readonly asset: StrandAsset;
  readonly bytes: Uint8Array;
}

interface ManifestInput {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly asset: StrandAsset;
  readonly sha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    throw new Error(`${label} must contain only the schema-v1 members.`);
  }
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function readLiteral<T extends string | number>(
  value: unknown,
  literal: T,
  label: string,
): T {
  if (value !== literal) throw new Error(`${label} is unsupported.`);
  return literal;
}

function readInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < min || value > max) {
    throw new Error(`${label} must be an integer in the range ${min}-${max}.`);
  }
  return value;
}

function readWidth(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_WIDTH) {
    throw new Error(`${label} must be finite, greater than 0, and at most ${MAX_WIDTH}.`);
  }
  return value;
}

function readIdentity(value: unknown, label: string): string {
  const identity = readString(value, label);
  if (!IDENTITY_PATTERN.test(identity) || textEncoder.encode(identity).byteLength > MAX_IDENTITY_BYTES) {
    throw new Error(`${label} must be a bounded technical identity.`);
  }
  return identity;
}

function containsControlCharacter(value: string): boolean {
  return /\p{Cc}/u.test(value);
}

function readStrandIds(value: unknown, strandCount: number): readonly string[] {
  if (!Array.isArray(value) || value.length !== strandCount) {
    throw new Error("strandIds must contain exactly strandCount entries.");
  }
  const ids = value.map((entry, index) => {
    const id = readString(entry, `strandIds[${index}]`);
    if (
      id.trim().length === 0 ||
      containsControlCharacter(id) ||
      textEncoder.encode(id).byteLength > MAX_IDENTITY_BYTES
    ) {
      throw new Error(`strandIds[${index}] is invalid.`);
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error("strandIds must be unique.");
  return ids;
}

function readCoordinateSystem(value: unknown): StrandBundleManifest["coordinateSystem"] {
  if (!isRecord(value)) throw new Error("coordinateSystem must be an object.");
  requireExactKeys(value, ["handedness", "upAxis", "unit"], "coordinateSystem");
  return {
    handedness: readLiteral(value.handedness, "RIGHT_HANDED", "coordinateSystem.handedness"),
    upAxis: readLiteral(value.upAxis, "Y", "coordinateSystem.upAxis"),
    unit: readLiteral(value.unit, "SCENE_UNIT", "coordinateSystem.unit"),
  };
}

export function strandBundleBinaryByteLength(
  strandCount: number,
  controlPointCount: number,
): number {
  return 12 * controlPointCount + 16 * strandCount + 4;
}

function readBuffer(
  value: unknown,
  strandCount: number,
  controlPointCount: number,
): StrandBundleManifest["buffer"] {
  if (!isRecord(value)) throw new Error("buffer must be an object.");
  requireExactKeys(value, ["uri", "byteLength", "sha256"], "buffer");
  const byteLength = readInteger(
    value.byteLength,
    "buffer.byteLength",
    1,
    STRAND_BUNDLE_BINARY_MAX_BYTES,
  );
  const expectedLength = strandBundleBinaryByteLength(strandCount, controlPointCount);
  if (byteLength !== expectedLength) {
    throw new Error("buffer.byteLength does not match the schema-v1 byte formula.");
  }
  const sha256 = readString(value.sha256, "buffer.sha256");
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error("buffer.sha256 must be a lowercase SHA-256 digest.");
  }
  return {
    uri: readLiteral(value.uri, STRAND_BUNDLE_BINARY_URI, "buffer.uri"),
    byteLength,
    sha256,
  };
}

export function normalizeStrandBundleManifest(value: unknown): StrandBundleManifest {
  if (!isRecord(value)) throw new Error("Strand bundle manifest must be an object.");
  requireExactKeys(
    value,
    [
      "schema",
      "schemaVersion",
      "assetId",
      "assetVersion",
      "classification",
      "coordinateSystem",
      "binaryEndianness",
      "strandCount",
      "controlPointCount",
      "materialGroup",
      "defaultWidth",
      "strandIds",
      "buffer",
    ],
    "Strand bundle manifest",
  );
  const strandCount = readInteger(value.strandCount, "strandCount", 1, STRAND_BUNDLE_MAX_STRANDS);
  const controlPointCount = readInteger(
    value.controlPointCount,
    "controlPointCount",
    MIN_CONTROL_POINTS_PER_STRAND,
    STRAND_BUNDLE_MAX_CONTROL_POINTS,
  );
  if (
    controlPointCount < strandCount * MIN_CONTROL_POINTS_PER_STRAND ||
    controlPointCount > strandCount * MAX_CONTROL_POINTS_PER_STRAND
  ) {
    throw new Error("controlPointCount is incompatible with the points-per-strand limits.");
  }
  return {
    schema: readLiteral(value.schema, STRAND_BUNDLE_SCHEMA, "schema"),
    schemaVersion: readLiteral(value.schemaVersion, STRAND_BUNDLE_SCHEMA_VERSION, "schemaVersion"),
    assetId: readIdentity(value.assetId, "assetId"),
    assetVersion: readIdentity(value.assetVersion, "assetVersion"),
    classification: readLiteral(
      value.classification,
      STRAND_BUNDLE_CLASSIFICATION,
      "classification",
    ),
    coordinateSystem: readCoordinateSystem(value.coordinateSystem),
    binaryEndianness: readLiteral(
      value.binaryEndianness,
      "LITTLE_ENDIAN",
      "binaryEndianness",
    ),
    strandCount,
    controlPointCount,
    materialGroup: readLiteral(value.materialGroup, "PREVIEW", "materialGroup"),
    defaultWidth: readWidth(value.defaultWidth, "defaultWidth"),
    strandIds: readStrandIds(value.strandIds, strandCount),
    buffer: readBuffer(value.buffer, strandCount, controlPointCount),
  };
}

export function encodeCanonicalStrandBundleManifest(
  manifest: StrandBundleManifest,
): Uint8Array {
  const normalized = normalizeStrandBundleManifest(manifest);
  const bytes = textEncoder.encode(`${JSON.stringify(normalized)}\n`);
  requireManifestByteLength(bytes);
  return bytes;
}

function requireManifestByteLength(bytes: Uint8Array): void {
  if (bytes.byteLength < 1 || bytes.byteLength > STRAND_BUNDLE_MANIFEST_MAX_BYTES) {
    throw new Error("Manifest byte length is outside the diagnostic limit.");
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function decodeCanonicalStrandBundleManifest(bytes: Uint8Array): StrandBundleManifest {
  requireManifestByteLength(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("Manifest is not valid UTF-8.", { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Manifest is not valid JSON.", { cause: error });
  }
  const normalized = normalizeStrandBundleManifest(parsed);
  const canonicalBytes = encodeCanonicalStrandBundleManifest(normalized);
  if (!bytesEqual(bytes, canonicalBytes)) {
    throw new Error("Manifest bytes are not canonical schema-v1 JSON.");
  }
  return normalized;
}

function float32(value: number): number {
  return Math.fround(value);
}

function canonicalizePoint(point: StrandPoint): StrandPoint {
  return [float32(point[0]), float32(point[1]), float32(point[2])];
}

function canonicalizeStrand(strand: StrandRecord): StrandRecord {
  return {
    id: strand.id,
    controlPoints: strand.controlPoints.map(canonicalizePoint),
    width: float32(strand.width),
    densityRank: float32(strand.densityRank),
    importanceRank: float32(strand.importanceRank),
    materialGroup: "PREVIEW",
  };
}

export function canonicalizeStrandAssetForBundle(value: StrandAsset): StrandAsset {
  const source = validateStrandAsset(value);
  const strands = source.strands.map(canonicalizeStrand);
  return validateStrandAsset({
    schema: STRAND_ASSET_SCHEMA,
    version: STRAND_ASSET_VERSION,
    coordinateSystem: {
      handedness: "RIGHT_HANDED",
      upAxis: "Y",
      unit: "SCENE_UNIT",
    },
    defaultWidth: float32(source.defaultWidth),
    strands,
    bounds: deriveStrandBounds(strands),
  });
}

export function packStrandAsset(value: StrandAsset): PackedStrandBundleData {
  const asset = canonicalizeStrandAssetForBundle(value);
  const strandCount = asset.strands.length;
  const controlPointCount = asset.strands.reduce(
    (count, strand) => count + strand.controlPoints.length,
    0,
  );
  const bytes = new Uint8Array(strandBundleBinaryByteLength(strandCount, controlPointCount));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteOffset = 0;
  for (const strand of asset.strands) {
    for (const point of strand.controlPoints) {
      for (const coordinate of point) {
        view.setFloat32(byteOffset, coordinate, true);
        byteOffset += 4;
      }
    }
  }
  let pointOffset = 0;
  view.setUint32(byteOffset, pointOffset, true);
  byteOffset += 4;
  for (const strand of asset.strands) {
    pointOffset += strand.controlPoints.length;
    view.setUint32(byteOffset, pointOffset, true);
    byteOffset += 4;
  }
  for (const strand of asset.strands) {
    view.setFloat32(byteOffset, strand.width, true);
    byteOffset += 4;
  }
  for (const strand of asset.strands) {
    view.setFloat32(byteOffset, strand.densityRank, true);
    byteOffset += 4;
  }
  for (const strand of asset.strands) {
    view.setFloat32(byteOffset, strand.importanceRank, true);
    byteOffset += 4;
  }
  if (byteOffset !== bytes.byteLength) throw new Error("Binary encoder length invariant failed.");
  return { asset, bytes };
}

export function createStrandBundleManifest(input: ManifestInput): StrandBundleManifest {
  const asset = validateStrandAsset(input.asset);
  const controlPointCount = asset.strands.reduce(
    (count, strand) => count + strand.controlPoints.length,
    0,
  );
  return normalizeStrandBundleManifest({
    schema: STRAND_BUNDLE_SCHEMA,
    schemaVersion: STRAND_BUNDLE_SCHEMA_VERSION,
    assetId: input.assetId,
    assetVersion: input.assetVersion,
    classification: STRAND_BUNDLE_CLASSIFICATION,
    coordinateSystem: {
      handedness: "RIGHT_HANDED",
      upAxis: "Y",
      unit: "SCENE_UNIT",
    },
    binaryEndianness: "LITTLE_ENDIAN",
    strandCount: asset.strands.length,
    controlPointCount,
    materialGroup: "PREVIEW",
    defaultWidth: asset.defaultWidth,
    strandIds: asset.strands.map((strand) => strand.id),
    buffer: {
      uri: STRAND_BUNDLE_BINARY_URI,
      byteLength: strandBundleBinaryByteLength(asset.strands.length, controlPointCount),
      sha256: input.sha256,
    },
  });
}

function readDecodedFloat(view: DataView, byteOffset: number, label: string): number {
  const value = view.getFloat32(byteOffset, true);
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function decodePositions(
  view: DataView,
  controlPointCount: number,
): { readonly positions: readonly StrandPoint[]; readonly nextByteOffset: number } {
  const positions: StrandPoint[] = [];
  let byteOffset = 0;
  for (let pointIndex = 0; pointIndex < controlPointCount; pointIndex += 1) {
    const x = readDecodedFloat(view, byteOffset, `positions[${pointIndex}].x`);
    const y = readDecodedFloat(view, byteOffset + 4, `positions[${pointIndex}].y`);
    const z = readDecodedFloat(view, byteOffset + 8, `positions[${pointIndex}].z`);
    if (
      Math.abs(x) > MAX_COORDINATE_MAGNITUDE ||
      Math.abs(y) > MAX_COORDINATE_MAGNITUDE ||
      Math.abs(z) > MAX_COORDINATE_MAGNITUDE
    ) {
      throw new Error(`positions[${pointIndex}] exceeds the bounded scene range.`);
    }
    positions.push([x, y, z]);
    byteOffset += 12;
  }
  return { positions, nextByteOffset: byteOffset };
}

function decodeOffsets(
  view: DataView,
  byteOffset: number,
  strandCount: number,
  controlPointCount: number,
): { readonly offsets: readonly number[]; readonly nextByteOffset: number } {
  const offsets: number[] = [];
  let nextByteOffset = byteOffset;
  for (let index = 0; index <= strandCount; index += 1) {
    offsets.push(view.getUint32(nextByteOffset, true));
    nextByteOffset += 4;
  }
  if (offsets[0] !== 0 || offsets[offsets.length - 1] !== controlPointCount) {
    throw new Error("Strand offsets must start at zero and end at controlPointCount.");
  }
  for (let index = 1; index < offsets.length; index += 1) {
    const previous = offsets[index - 1];
    const current = offsets[index];
    if (previous === undefined || current === undefined) throw new Error("Strand offsets are incomplete.");
    const pointCount = current - previous;
    if (
      current <= previous ||
      pointCount < MIN_CONTROL_POINTS_PER_STRAND ||
      pointCount > MAX_CONTROL_POINTS_PER_STRAND
    ) {
      throw new Error("Strand offsets must be strictly increasing in bounded point spans.");
    }
  }
  return { offsets, nextByteOffset };
}

function decodeFloatRegion(
  view: DataView,
  byteOffset: number,
  count: number,
  label: string,
  reader: (view: DataView, byteOffset: number, label: string) => number,
): { readonly values: readonly number[]; readonly nextByteOffset: number } {
  const values: number[] = [];
  let nextByteOffset = byteOffset;
  for (let index = 0; index < count; index += 1) {
    values.push(reader(view, nextByteOffset, `${label}[${index}]`));
    nextByteOffset += 4;
  }
  return { values, nextByteOffset };
}

function reconstructStrands(
  manifest: StrandBundleManifest,
  positions: readonly StrandPoint[],
  offsets: readonly number[],
  widths: readonly number[],
  densityRanks: readonly number[],
  importanceRanks: readonly number[],
): readonly StrandRecord[] {
  return manifest.strandIds.map((id, index): StrandRecord => {
    const start = offsets[index];
    const end = offsets[index + 1];
    const width = widths[index];
    const densityRank = densityRanks[index];
    const importanceRank = importanceRanks[index];
    if (
      start === undefined ||
      end === undefined ||
      width === undefined ||
      densityRank === undefined ||
      importanceRank === undefined
    ) {
      throw new Error("Decoded strand regions are incomplete.");
    }
    return {
      id,
      controlPoints: positions.slice(start, end),
      width,
      densityRank,
      importanceRank,
      materialGroup: "PREVIEW",
    };
  });
}

function readDecodedRank(view: DataView, byteOffset: number, label: string): number {
  const rank = readDecodedFloat(view, byteOffset, label);
  if (rank < 0 || rank >= 1) throw new Error(`${label} must be in the range [0, 1).`);
  return rank;
}

function readDecodedWidth(view: DataView, byteOffset: number, label: string): number {
  return readWidth(readDecodedFloat(view, byteOffset, label), label);
}

export function decodeStrandBundleBinary(
  manifest: StrandBundleManifest,
  bytes: Uint8Array,
): StrandAsset {
  const normalized = normalizeStrandBundleManifest(manifest);
  const expectedLength = strandBundleBinaryByteLength(
    normalized.strandCount,
    normalized.controlPointCount,
  );
  if (bytes.byteLength !== normalized.buffer.byteLength || bytes.byteLength !== expectedLength) {
    throw new Error("Binary byte length does not match the manifest and schema-v1 formula.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positionsRegion = decodePositions(view, normalized.controlPointCount);
  const offsetsRegion = decodeOffsets(
    view,
    positionsRegion.nextByteOffset,
    normalized.strandCount,
    normalized.controlPointCount,
  );
  const widthsRegion = decodeFloatRegion(
    view,
    offsetsRegion.nextByteOffset,
    normalized.strandCount,
    "widths",
    readDecodedWidth,
  );
  const densityRegion = decodeFloatRegion(
    view,
    widthsRegion.nextByteOffset,
    normalized.strandCount,
    "densityRanks",
    readDecodedRank,
  );
  const importanceRegion = decodeFloatRegion(
    view,
    densityRegion.nextByteOffset,
    normalized.strandCount,
    "importanceRanks",
    readDecodedRank,
  );
  if (importanceRegion.nextByteOffset !== bytes.byteLength) {
    throw new Error("Binary payload contains trailing bytes.");
  }
  const strands = reconstructStrands(
    normalized,
    positionsRegion.positions,
    offsetsRegion.offsets,
    widthsRegion.values,
    densityRegion.values,
    importanceRegion.values,
  );
  return validateStrandAsset({
    schema: STRAND_ASSET_SCHEMA,
    version: STRAND_ASSET_VERSION,
    coordinateSystem: normalized.coordinateSystem,
    defaultWidth: normalized.defaultWidth,
    strands,
    bounds: deriveStrandBounds(strands),
  });
}
