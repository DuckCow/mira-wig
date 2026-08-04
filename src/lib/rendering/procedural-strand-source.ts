import {
  STRAND_ASSET_SCHEMA,
  STRAND_ASSET_VERSION,
  deriveStrandBounds,
  validateStrandAsset,
  type StrandAsset,
  type StrandPoint,
  type StrandRecord,
} from "./strand-asset";
import type { StrandSource } from "./strand-source";

const MAX_GRID_CELLS = 96;
const UINT32_RANGE = 4_294_967_296;

export interface ProceduralStrandSourceInput {
  readonly seed: number;
  readonly columns: number;
  readonly rows: number;
  readonly controlPointCount: number;
  readonly defaultWidth: number;
}

function requireBoundedInteger(value: number, label: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer in the range ${min}-${max}.`);
  }
}

function hashUnit(seed: number, row: number, column: number, channel: number): number {
  let value = seed ^ Math.imul(row + 1, 0x9e37_79b1);
  value ^= Math.imul(column + 1, 0x85eb_ca77);
  value ^= Math.imul(channel + 1, 0xc2b2_ae3d);
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return ((value ^ (value >>> 16)) >>> 0) / UINT32_RANGE;
}

function buildControlPoints(
  input: ProceduralStrandSourceInput,
  row: number,
  column: number,
): readonly StrandPoint[] {
  const horizontal = input.columns === 1 ? 0.5 : column / (input.columns - 1);
  const vertical = input.rows === 1 ? 0.5 : row / (input.rows - 1);
  const azimuth = (horizontal - 0.5) * 2.25;
  const polar = 0.28 + vertical * 0.82;
  const radius = 1.02;
  const rootX = Math.sin(polar) * Math.sin(azimuth) * radius;
  const rootY = Math.cos(polar) * radius - 0.15;
  const rootZ = Math.sin(polar) * Math.cos(azimuth) * radius * 0.78;
  const length = 0.86 + hashUnit(input.seed, row, column, 0) * 0.42;
  const side = (hashUnit(input.seed, row, column, 1) - 0.5) * 0.24;
  const depth = (hashUnit(input.seed, row, column, 2) - 0.5) * 0.16;
  const points: StrandPoint[] = [];

  for (let index = 0; index < input.controlPointCount; index += 1) {
    const progress = index / (input.controlPointCount - 1);
    const fall = progress * progress;
    const wave = Math.sin(progress * Math.PI * 1.35 + horizontal * 2.1) * 0.045 * progress;
    points.push([
      rootX + rootX * 0.12 * progress + side * fall + wave,
      rootY + 0.08 * progress - length * (0.2 * progress + 0.8 * fall),
      rootZ + rootZ * 0.1 * progress + depth * fall,
    ]);
  }
  return points;
}

function buildStrands(input: ProceduralStrandSourceInput): readonly StrandRecord[] {
  const strands: StrandRecord[] = [];
  const total = input.rows * input.columns;
  for (let row = 0; row < input.rows; row += 1) {
    for (let column = 0; column < input.columns; column += 1) {
      const ordinal = row * input.columns + column;
      const widthVariation = 0.84 + hashUnit(input.seed, row, column, 3) * 0.25;
      strands.push({
        id: `fixture-strand-${row}-${column}`,
        controlPoints: buildControlPoints(input, row, column),
        width: input.defaultWidth * widthVariation,
        densityRank: hashUnit(input.seed, row, column, 4),
        importanceRank: ordinal / total,
        materialGroup: "PREVIEW",
      });
    }
  }
  return strands;
}

class ProceduralStrandSource implements StrandSource {
  constructor(private readonly input: ProceduralStrandSourceInput) {}

  createAsset(): StrandAsset {
    const strands = buildStrands(this.input);
    return validateStrandAsset({
      schema: STRAND_ASSET_SCHEMA,
      version: STRAND_ASSET_VERSION,
      coordinateSystem: {
        handedness: "RIGHT_HANDED",
        upAxis: "Y",
        unit: "SCENE_UNIT",
      },
      defaultWidth: this.input.defaultWidth,
      strands,
      bounds: deriveStrandBounds(strands),
    });
  }
}

export function createProceduralStrandSource(
  input: ProceduralStrandSourceInput,
): StrandSource {
  requireBoundedInteger(input.seed, "seed", 0, 2_147_483_647);
  requireBoundedInteger(input.columns, "columns", 1, MAX_GRID_CELLS);
  requireBoundedInteger(input.rows, "rows", 1, MAX_GRID_CELLS);
  requireBoundedInteger(input.controlPointCount, "controlPointCount", 3, 8);
  if (input.columns * input.rows > MAX_GRID_CELLS) {
    throw new Error(`The procedural fixture cannot exceed ${MAX_GRID_CELLS} strands.`);
  }
  return new ProceduralStrandSource({ ...input });
}
