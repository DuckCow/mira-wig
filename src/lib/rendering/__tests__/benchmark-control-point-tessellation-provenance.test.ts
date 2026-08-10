import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readParent: vi.fn() }));
vi.mock("../benchmark-provenance.server", () => ({
  readBenchmarkSourceProvenance: mocks.readParent,
}));

import { CONTROL_POINT_TESSELLATION_SEED } from "../benchmark-control-point-tessellation-input";
import { readControlPointTessellationSourceProvenance } from "../benchmark-control-point-tessellation-provenance.server";

describe("R2C-A-S2 provenance adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readParent.mockResolvedValue({
      source: {
        kind: "LOCAL_GIT",
        commit: "a".repeat(40),
        branch: "main",
        treeState: "CLEAN",
        observedAt: "2026-08-10T00:00:00.000Z",
        nextVersion: "16.2.7",
        threeVersion: "0.185.1",
        generatorVersion: "r2ca-synthetic-generator/v1",
        geometryRecipe: "RADIAL_CROWN_FALL_V1",
        seed: CONTROL_POINT_TESSELLATION_SEED,
      },
      currentMain: true,
    });
  });

  it("reuses guarded provenance while replacing only the generator identity", async () => {
    await expect(readControlPointTessellationSourceProvenance(
      CONTROL_POINT_TESSELLATION_SEED,
    )).resolves.toMatchObject({
      source: {
        generatorVersion: "r2ca-s2-synthetic-generator/v1",
        geometryRecipe: "RADIAL_CROWN_FALL_V1",
        seed: CONTROL_POINT_TESSELLATION_SEED,
      },
      currentMain: true,
    });
    expect(mocks.readParent).toHaveBeenCalledWith(CONTROL_POINT_TESSELLATION_SEED);
  });

  it("rejects a wrong seed before provenance I/O", async () => {
    await expect(readControlPointTessellationSourceProvenance(7)).rejects.toThrow(/seed/);
    expect(mocks.readParent).not.toHaveBeenCalled();
  });
});
