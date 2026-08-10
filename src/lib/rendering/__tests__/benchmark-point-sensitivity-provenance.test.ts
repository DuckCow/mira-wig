import { beforeEach, describe, expect, it, vi } from "vitest";
import { POINT_SENSITIVITY_SEED } from "../benchmark-point-sensitivity-input";

const mocks = vi.hoisted(() => ({ readParent: vi.fn() }));

vi.mock("../benchmark-provenance.server", () => ({
  readBenchmarkSourceProvenance: mocks.readParent,
}));

import { readPointSensitivitySourceProvenance } from "../benchmark-point-sensitivity-provenance.server";

const parent = {
  source: {
    kind: "LOCAL_GIT" as const,
    commit: "a".repeat(40),
    branch: "main",
    treeState: "CLEAN" as const,
    observedAt: "2026-08-09T00:00:00.000Z",
    nextVersion: "16.2.7",
    threeVersion: "0.185.1",
    generatorVersion: "r2ca-synthetic-generator/v1" as const,
    geometryRecipe: "RADIAL_CROWN_FALL_V1" as const,
    seed: POINT_SENSITIVITY_SEED,
  },
  currentMain: true,
};

describe("S1 provenance adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readParent.mockResolvedValue(parent);
  });

  it("preserves Git/package/current-main facts without mutating parent identity", async () => {
    const snapshot = structuredClone(parent);
    const result = await readPointSensitivitySourceProvenance(POINT_SENSITIVITY_SEED);
    expect(mocks.readParent).toHaveBeenCalledWith(POINT_SENSITIVITY_SEED);
    expect(parent).toEqual(snapshot);
    expect(result).toEqual({
      source: {
        ...parent.source,
        generatorVersion: "r2ca-s1-synthetic-generator/v1",
      },
      currentMain: true,
    });
    expect(result.source).not.toBe(parent.source);
    expect(Object.isFrozen(result.source)).toBe(true);
  });

  it("propagates parent probe errors truthfully", async () => {
    mocks.readParent.mockRejectedValue(new Error("git unavailable"));
    await expect(readPointSensitivitySourceProvenance(POINT_SENSITIVITY_SEED))
      .rejects.toThrow("git unavailable");
  });
});
