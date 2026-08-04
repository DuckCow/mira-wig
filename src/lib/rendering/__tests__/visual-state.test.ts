import { describe, expect, it } from "vitest";
import { createProceduralStrandSource } from "../procedural-strand-source";
import {
  DEFAULT_VISUAL_STATE,
  canonicalizePreviewColor,
  canonicalizeViewRotation,
  canonicalizeVisualState,
  selectStrandsForTier,
  type VisualDensityTier,
} from "../visual-state";

const asset = createProceduralStrandSource({
  seed: 20_260_804,
  columns: 9,
  rows: 8,
  controlPointCount: 6,
  defaultWidth: 0.028,
}).createAsset();

function idsFor(tier: VisualDensityTier): readonly string[] {
  return selectStrandsForTier(asset, tier).map((strand) => strand.id);
}

describe("deterministic visual strand selection", () => {
  it("selects bounded, stable LOW ⊂ MEDIUM ⊂ HIGH subsets", () => {
    const low = idsFor("LOW");
    const medium = idsFor("MEDIUM");
    const high = idsFor("HIGH");

    expect(low.length).toBeGreaterThan(0);
    expect(low.length).toBeLessThan(medium.length);
    expect(medium.length).toBeLessThan(high.length);
    expect(high).toHaveLength(asset.strands.length);
    expect(low.every((id) => medium.includes(id))).toBe(true);
    expect(medium.every((id) => high.includes(id))).toBe(true);
    expect(idsFor("LOW")).toEqual(low);
    expect(idsFor("MEDIUM")).toEqual(medium);
  });

  it("never regenerates stored ranks when tiers or colours change", () => {
    const before = asset.strands.map(({ id, densityRank, importanceRank }) => ({
      id,
      densityRank,
      importanceRank,
    }));

    idsFor("LOW");
    idsFor("HIGH");
    canonicalizeVisualState({ ...DEFAULT_VISUAL_STATE, previewColor: "#abcdef" });

    expect(
      asset.strands.map(({ id, densityRank, importanceRank }) => ({
        id,
        densityRank,
        importanceRank,
      })),
    ).toEqual(before);
  });
});

describe("VisualState canonicalization", () => {
  it("normalizes preview colour deterministically and rejects malformed values", () => {
    expect(canonicalizePreviewColor(" #a0bc9f ")).toBe("#A0BC9F");
    expect(() => canonicalizePreviewColor("brown")).toThrow(/hexadecimal/);
    expect(() => canonicalizePreviewColor("#fff")).toThrow(/hexadecimal/);
  });

  it("clamps camera rotation to the bounded diagnostic view", () => {
    expect(canonicalizeViewRotation({ yaw: 99, pitch: -99 })).toEqual({
      yaw: 0.9,
      pitch: -0.38,
    });
    expect(() => canonicalizeViewRotation({ yaw: Number.NaN, pitch: 0 })).toThrow(
      /finite/,
    );
  });
});
