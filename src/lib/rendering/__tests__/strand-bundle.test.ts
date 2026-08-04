import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createProceduralStrandSource } from "../procedural-strand-source";
import {
  STRAND_BUNDLE_MANIFEST_MAX_BYTES,
  canonicalizeStrandAssetForBundle,
  createStrandBundleManifest,
  decodeCanonicalStrandBundleManifest,
  decodeStrandBundleBinary,
  encodeCanonicalStrandBundleManifest,
  normalizeStrandBundleManifest,
  packStrandAsset,
  strandBundleBinaryByteLength,
} from "../strand-bundle";
import { selectStrandsForTier } from "../visual-state";

const FIXTURE_INPUT = {
  seed: 20_260_804,
  columns: 9,
  rows: 8,
  controlPointCount: 6,
  defaultWidth: 0.028,
};
const FIXTURE_DIRECTORY = resolve(
  process.cwd(),
  "src/lib/rendering/fixtures/r2-diagnostic-v1",
);
const trackedManifestBytes = new Uint8Array(
  readFileSync(resolve(FIXTURE_DIRECTORY, "manifest.json")),
);
const trackedBinaryBytes = new Uint8Array(
  readFileSync(resolve(FIXTURE_DIRECTORY, "strands.bin")),
);

function sourceAsset() {
  return createProceduralStrandSource(FIXTURE_INPUT).createAsset();
}

function trackedManifest() {
  return decodeCanonicalStrandBundleManifest(trackedManifestBytes);
}

function manifestWithEscapedIds(backslashCount: number) {
  const manifest = trackedManifest();
  const strandCount = 96;
  const controlPointCount = 288;
  return normalizeStrandBundleManifest({
    ...manifest,
    strandCount,
    controlPointCount,
    strandIds: Array.from(
      { length: strandCount },
      (_, index) => `id-${index.toString().padStart(2, "0")}-${"\\".repeat(backslashCount)}`,
    ),
    buffer: {
      ...manifest.buffer,
      byteLength: strandBundleBinaryByteLength(strandCount, controlPointCount),
    },
  });
}

function changedBytes(bytes: Uint8Array, mutate: (copy: Uint8Array) => void): Uint8Array {
  const copy = new Uint8Array(bytes);
  mutate(copy);
  return copy;
}

function areStrictlyIncreasing(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined || current <= previous) return false;
  }
  return true;
}

function changeFloat32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  return changedBytes(bytes, (copy) => {
    new DataView(copy.buffer).setFloat32(offset, value, true);
  });
}

describe("strand bundle deterministic codec", () => {
  it("packs the accepted fixture into exact little-endian regions and decodes all semantic data", () => {
    const first = packStrandAsset(sourceAsset());
    const second = packStrandAsset(sourceAsset());
    const manifest = trackedManifest();
    const decoded = decodeStrandBundleBinary(manifest, trackedBinaryBytes);

    expect(first.bytes).toEqual(second.bytes);
    expect(first.bytes).toEqual(trackedBinaryBytes);
    expect(first.bytes).toHaveLength(6_340);
    expect(strandBundleBinaryByteLength(72, 432)).toBe(6_340);
    expect(decoded).toEqual(first.asset);
    expect(decoded.strands.map((strand) => strand.id)).toEqual(
      first.asset.strands.map((strand) => strand.id),
    );
    expect(decoded.strands.map((strand) => strand.controlPoints)).toEqual(
      first.asset.strands.map((strand) => strand.controlPoints),
    );
    expect(decoded.strands.map((strand) => strand.width)).toEqual(
      first.asset.strands.map((strand) => strand.width),
    );
    expect(decoded.bounds).toEqual(first.asset.bounds);
    expect(selectStrandsForTier(decoded, "LOW")).toHaveLength(24);
    expect(selectStrandsForTier(decoded, "MEDIUM")).toHaveLength(54);
    expect(selectStrandsForTier(decoded, "HIGH")).toHaveLength(72);
    const importance = decoded.strands.map((strand) => strand.importanceRank);
    expect(new Set(importance).size).toBe(72);
    expect(areStrictlyIncreasing(importance)).toBe(true);
  });

  it("explicitly canonicalizes every encoded number through Float32", () => {
    const source = sourceAsset();
    const canonical = canonicalizeStrandAssetForBundle(source);
    const firstSourcePoint = source.strands[0]?.controlPoints[0]?.[0];
    const firstCanonicalPoint = canonical.strands[0]?.controlPoints[0]?.[0];

    expect(firstSourcePoint).toBeDefined();
    expect(firstCanonicalPoint).toBe(Math.fround(firstSourcePoint ?? Number.NaN));
    expect(canonical.defaultWidth).toBe(Math.fround(source.defaultWidth));
    for (const strand of canonical.strands) {
      expect(strand.width).toBe(Math.fround(strand.width));
      expect(strand.densityRank).toBe(Math.fround(strand.densityRank));
      expect(strand.importanceRank).toBe(Math.fround(strand.importanceRank));
    }
  });

  it("constructs and round-trips only canonical schema-v1 manifest bytes", () => {
    const packed = packStrandAsset(sourceAsset());
    const manifest = createStrandBundleManifest({
      assetId: "render-lab.r2-diagnostic",
      assetVersion: "1",
      asset: packed.asset,
      sha256: trackedManifest().buffer.sha256,
    });

    const encoded = encodeCanonicalStrandBundleManifest(manifest);
    expect(encoded).toHaveLength(2_017);
    expect(encoded).toEqual(trackedManifestBytes);
    expect(decodeCanonicalStrandBundleManifest(trackedManifestBytes)).toEqual(manifest);
  });

  it("accepts canonical escaped IDs when encoded bytes remain within the ceiling", () => {
    const manifest = manifestWithEscapedIds(20);
    const encoded = encodeCanonicalStrandBundleManifest(manifest);

    expect(encoded.byteLength).toBeLessThanOrEqual(STRAND_BUNDLE_MANIFEST_MAX_BYTES);
    expect(decodeCanonicalStrandBundleManifest(encoded)).toEqual(manifest);
  });

  it("rejects a field-valid manifest whose escaped IDs exceed the encoded ceiling", () => {
    const manifest = manifestWithEscapedIds(58);

    expect(() => encodeCanonicalStrandBundleManifest(manifest)).toThrow(
      /byte length is outside the diagnostic limit/,
    );
  });
});

describe("strand bundle manifest rejection", () => {
  it.each([
    ["C0 U+0000", "\u0000"],
    ["DEL U+007F", "\u007f"],
    ["C1 U+0085", "\u0085"],
    ["C1 U+009F", "\u009f"],
  ])("rejects %s in a strand ID", (_label, controlCharacter) => {
    const manifest = trackedManifest();
    const strandIds = [...manifest.strandIds];
    strandIds[0] = `fixture${controlCharacter}strand`;

    expect(() => normalizeStrandBundleManifest({ ...manifest, strandIds })).toThrow(
      /strandIds\[0\] is invalid/,
    );
  });

  it("retains bounded non-ASCII, non-control strand IDs", () => {
    const manifest = trackedManifest();
    const strandIds = [...manifest.strandIds];
    strandIds[0] = "가발-진단-한글";

    expect(normalizeStrandBundleManifest({ ...manifest, strandIds }).strandIds[0]).toBe(
      "가발-진단-한글",
    );
  });

  it("rejects over-limit manifest bytes before parsing", () => {
    const oversizedBytes = new Uint8Array(STRAND_BUNDLE_MANIFEST_MAX_BYTES + 1);

    expect(() => decodeCanonicalStrandBundleManifest(oversizedBytes)).toThrow(
      /byte length is outside the diagnostic limit/,
    );
  });

  it.each([
    ["BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...trackedManifestBytes])],
    ["malformed UTF-8", new Uint8Array([0xc3, 0x28])],
    ["alternate whitespace", new TextEncoder().encode(` ${new TextDecoder().decode(trackedManifestBytes)}`)],
    ["trailing bytes", new Uint8Array([...trackedManifestBytes, 0x0a])],
  ])("rejects %s", (_label, bytes) => {
    expect(() => decodeCanonicalStrandBundleManifest(bytes)).toThrow();
  });

  it("rejects unknown, duplicate, reordered, and alternate numeric JSON members", () => {
    const canonical = new TextDecoder().decode(trackedManifestBytes);
    const unknown = canonical.replace(
      '"schemaVersion":1,',
      '"schemaVersion":1,"unknown":true,',
    );
    const duplicate = canonical.replace(
      '"schemaVersion":1,',
      '"schemaVersion":1,"schemaVersion":1,',
    );
    const reordered = canonical.replace(
      '"schema":"mira.rendering.strand-bundle","schemaVersion":1',
      '"schemaVersion":1,"schema":"mira.rendering.strand-bundle"',
    );
    const alternateNumber = canonical.replace('"schemaVersion":1', '"schemaVersion":1e0');

    for (const text of [unknown, duplicate, reordered, alternateNumber]) {
      expect(() => decodeCanonicalStrandBundleManifest(new TextEncoder().encode(text))).toThrow();
    }
  });

  it("enforces literals, identity, IDs, limits, and exact byte formula", () => {
    const manifest = trackedManifest();
    const oversizedIds = [
      ...manifest.strandIds,
      ...Array.from({ length: 25 }, (_, index) => `x-${index}`),
    ];
    expect(() => normalizeStrandBundleManifest({ ...manifest, schemaVersion: 2 })).toThrow();
    expect(() => normalizeStrandBundleManifest({ ...manifest, assetId: "product/1" })).toThrow();
    expect(() =>
      normalizeStrandBundleManifest({
        ...manifest,
        strandIds: [manifest.strandIds[0], manifest.strandIds[0], ...manifest.strandIds.slice(2)],
      }),
    ).toThrow(/unique/);
    expect(() =>
      normalizeStrandBundleManifest({
        ...manifest,
        strandCount: 97,
        strandIds: oversizedIds,
      }),
    ).toThrow();
    expect(() =>
      normalizeStrandBundleManifest({
        ...manifest,
        buffer: { ...manifest.buffer, byteLength: manifest.buffer.byteLength + 1 },
      }),
    ).toThrow(/formula/);
  });
});

describe("strand bundle binary rejection", () => {
  it("rejects truncation, trailing bytes, and malformed offsets", () => {
    const manifest = trackedManifest();
    expect(() => decodeStrandBundleBinary(manifest, trackedBinaryBytes.slice(0, -1))).toThrow(/length/);
    expect(() =>
      decodeStrandBundleBinary(manifest, new Uint8Array([...trackedBinaryBytes, 0])),
    ).toThrow(/length/);

    const offsetsStart = 12 * manifest.controlPointCount;
    const badFirstOffset = changedBytes(trackedBinaryBytes, (bytes) => {
      new DataView(bytes.buffer).setUint32(offsetsStart, 1, true);
    });
    const nonIncreasingOffset = changedBytes(trackedBinaryBytes, (bytes) => {
      new DataView(bytes.buffer).setUint32(offsetsStart + 8, 6, true);
    });
    expect(() => decodeStrandBundleBinary(manifest, badFirstOffset)).toThrow(/offsets/);
    expect(() => decodeStrandBundleBinary(manifest, nonIncreasingOffset)).toThrow(/offsets/);
  });

  it("rejects non-finite and out-of-range positions, widths, and ranks", () => {
    const manifest = trackedManifest();
    const offsetsStart = 12 * manifest.controlPointCount;
    const widthsStart = offsetsStart + 4 * (manifest.strandCount + 1);
    const densityStart = widthsStart + 4 * manifest.strandCount;
    const importanceStart = densityStart + 4 * manifest.strandCount;
    const mutations: readonly [number, number][] = [
      [0, Number.NaN],
      [0, Number.POSITIVE_INFINITY],
      [0, 10.01],
      [widthsStart, 0],
      [widthsStart, 0.081],
      [densityStart, 1],
      [importanceStart, -0.1],
    ];
    for (const [offset, value] of mutations) {
      const invalid = changeFloat32(trackedBinaryBytes, offset, value);
      expect(() => decodeStrandBundleBinary(manifest, invalid)).toThrow();
    }
  });
});
