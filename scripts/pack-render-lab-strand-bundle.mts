import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createStrandBundleManifest,
  encodeCanonicalStrandBundleManifest,
  packStrandAsset,
} from "../src/lib/rendering/strand-bundle";
import { createProceduralStrandSource } from "../src/lib/rendering/procedural-strand-source";
import { validateStrandAsset } from "../src/lib/rendering/strand-asset";
import { selectStrandsForTier } from "../src/lib/rendering/visual-state";

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
const MANIFEST_PATH = resolve(FIXTURE_DIRECTORY, "manifest.json");
const BINARY_PATH = resolve(FIXTURE_DIRECTORY, "strands.bin");

interface GeneratedFixture {
  readonly manifestBytes: Uint8Array;
  readonly binaryBytes: Uint8Array;
}

function areStrictlyIncreasing(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined || current <= previous) return false;
  }
  return true;
}

function generateFixture(): GeneratedFixture {
  const sourceAsset = validateStrandAsset(
    createProceduralStrandSource(FIXTURE_INPUT).createAsset(),
  );
  const packed = packStrandAsset(sourceAsset);
  validateStrandAsset(packed.asset);
  if (packed.bytes.byteLength !== 6_340) {
    throw new Error(`Expected a 6,340-byte fixture, received ${packed.bytes.byteLength}.`);
  }
  const densityCounts = ["LOW", "MEDIUM", "HIGH"].map((tier) => {
    if (tier === "LOW" || tier === "MEDIUM" || tier === "HIGH") {
      return selectStrandsForTier(packed.asset, tier).length;
    }
    throw new Error("Density tier invariant failed.");
  });
  if (densityCounts[0] !== 24 || densityCounts[1] !== 54 || densityCounts[2] !== 72) {
    throw new Error(`Expected density counts 24/54/72, received ${densityCounts.join("/")}.`);
  }
  const importanceRanks = packed.asset.strands.map((strand) => strand.importanceRank);
  if (
    new Set(importanceRanks).size !== importanceRanks.length ||
    !areStrictlyIncreasing(importanceRanks)
  ) {
    throw new Error("Float32 importance ranks must remain unique and strictly ordered.");
  }
  const sha256 = createHash("sha256").update(packed.bytes).digest("hex");
  const manifest = createStrandBundleManifest({
    assetId: "render-lab.r2-diagnostic",
    assetVersion: "1",
    asset: packed.asset,
    sha256,
  });
  return {
    manifestBytes: encodeCanonicalStrandBundleManifest(manifest),
    binaryBytes: packed.bytes,
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function requireDeterministicGeneration(): GeneratedFixture {
  const first = generateFixture();
  const second = generateFixture();
  if (
    !equalBytes(first.manifestBytes, second.manifestBytes) ||
    !equalBytes(first.binaryBytes, second.binaryBytes)
  ) {
    throw new Error("Independent fixture generations were not byte-identical.");
  }
  return first;
}

function checkTrackedFixture(generated: GeneratedFixture): void {
  const trackedManifest = readFileSync(MANIFEST_PATH);
  const trackedBinary = readFileSync(BINARY_PATH);
  if (!equalBytes(generated.manifestBytes, trackedManifest)) {
    throw new Error("Tracked manifest.json is not the deterministic compiler output.");
  }
  if (!equalBytes(generated.binaryBytes, trackedBinary)) {
    throw new Error("Tracked strands.bin is not the deterministic compiler output.");
  }
}

function writeTrackedFixture(generated: GeneratedFixture): void {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, generated.manifestBytes);
  writeFileSync(BINARY_PATH, generated.binaryBytes);
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  throw new Error("Usage: pack-render-lab-strand-bundle.mts [--check]");
}

const generated = requireDeterministicGeneration();
if (args[0] === "--check") checkTrackedFixture(generated);
else writeTrackedFixture(generated);
