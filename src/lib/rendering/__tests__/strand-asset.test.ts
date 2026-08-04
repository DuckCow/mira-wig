import { describe, expect, it } from "vitest";
import { createProceduralStrandSource } from "../procedural-strand-source";
import { validateStrandAsset } from "../strand-asset";

const FIXTURE_INPUT = {
  seed: 20_260_804,
  columns: 9,
  rows: 8,
  controlPointCount: 6,
  defaultWidth: 0.028,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRendererNeutralData(value: unknown): void {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    for (const item of value) expectRendererNeutralData(item);
    return;
  }
  if (!isRecord(value)) throw new Error("Fixture contains a non-data runtime value.");
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  for (const item of Object.values(value)) expectRendererNeutralData(item);
}

describe("procedural StrandSource", () => {
  it("produces deterministic, validated in-memory data for fixed inputs", () => {
    const first = createProceduralStrandSource(FIXTURE_INPUT).createAsset();
    const second = createProceduralStrandSource(FIXTURE_INPUT).createAsset();

    expect(second).toEqual(first);
    expect(first.strands).toHaveLength(72);
    expect(first.strands.every((strand) => strand.controlPoints.length === 6)).toBe(true);
    expect(validateStrandAsset(first)).toEqual(first);
  });

  it("returns renderer-neutral plain data without Three.js runtime objects", () => {
    const asset = createProceduralStrandSource(FIXTURE_INPUT).createAsset();

    expectRendererNeutralData(asset);
    expect(JSON.parse(JSON.stringify(asset))).toEqual(asset);
  });

  it("changes deterministic output when the bounded seed changes", () => {
    const first = createProceduralStrandSource(FIXTURE_INPUT).createAsset();
    const second = createProceduralStrandSource({ ...FIXTURE_INPUT, seed: 7 }).createAsset();

    expect(second.strands.map((strand) => strand.densityRank)).not.toEqual(
      first.strands.map((strand) => strand.densityRank),
    );
  });
});

describe("StrandAsset structural validation", () => {
  it("rejects malformed control points, ranks, widths, and derived bounds", () => {
    const asset = createProceduralStrandSource(FIXTURE_INPUT).createAsset();
    const first = asset.strands[0];
    if (first === undefined) throw new Error("Fixture must contain a strand.");

    expect(() =>
      validateStrandAsset({
        ...asset,
        strands: [{ ...first, controlPoints: [[0, 0, 0]] }, ...asset.strands.slice(1)],
      }),
    ).toThrow(/controlPoints/);
    expect(() =>
      validateStrandAsset({
        ...asset,
        strands: [{ ...first, densityRank: 1 }, ...asset.strands.slice(1)],
      }),
    ).toThrow(/densityRank/);
    expect(() =>
      validateStrandAsset({
        ...asset,
        strands: [{ ...first, width: 0 }, ...asset.strands.slice(1)],
      }),
    ).toThrow(/width/);
    expect(() =>
      validateStrandAsset({ ...asset, bounds: { min: [0, 0, 0], max: [1, 1, 1] } }),
    ).toThrow(/bounds/);
  });

  it("rejects duplicate strand identities and oversized fixtures", () => {
    const asset = createProceduralStrandSource(FIXTURE_INPUT).createAsset();
    const first = asset.strands[0];
    if (first === undefined) throw new Error("Fixture must contain a strand.");

    expect(() =>
      validateStrandAsset({ ...asset, strands: [first, first] }),
    ).toThrow(/unique/);
    expect(() =>
      createProceduralStrandSource({ ...FIXTURE_INPUT, columns: 12, rows: 9 }),
    ).toThrow(/cannot exceed/);
  });
});
