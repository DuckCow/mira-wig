import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";
import { CONTROL_POINT_TESSELLATION_SEED } from "@/lib/rendering/benchmark-control-point-tessellation-input";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  readProvenance: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/rendering/benchmark-control-point-tessellation-provenance.server", () => ({
  readControlPointTessellationSourceProvenance: mocks.readProvenance,
}));

import { startControlPointTessellationProvenance } from "./control-point-tessellation-actions";

const provenance = {
  source: {
    kind: "LOCAL_GIT" as const,
    commit: "a".repeat(40),
    branch: "main",
    treeState: "CLEAN" as const,
    observedAt: "2026-08-10T00:00:00.000Z",
    nextVersion: "16.2.7",
    threeVersion: "0.185.1",
    generatorVersion: "r2ca-s2-synthetic-generator/v1" as const,
    geometryRecipe: "RADIAL_CROWN_FALL_V1" as const,
    seed: CONTROL_POINT_TESSELLATION_SEED,
  },
  currentMain: true,
};

describe("guarded S2 provenance action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      success: true,
      session: { user: { id: "admin", role: "ADMIN" }, expires: "2099-01-01" },
    });
    mocks.readProvenance.mockResolvedValue(provenance);
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "fails %s before seed validation and provenance I/O",
    async (errorCode) => {
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });
      await expect(startControlPointTessellationProvenance("bad")).resolves.toEqual({
        success: false,
        errorCode,
      });
      expect(mocks.readProvenance).not.toHaveBeenCalled();
    },
  );

  it("validates the seed and returns only S2 source/current-main evidence", async () => {
    await expect(startControlPointTessellationProvenance(
      CONTROL_POINT_TESSELLATION_SEED,
    )).resolves.toEqual({ success: true, ...provenance });
    expect(mocks.readProvenance).toHaveBeenCalledWith(CONTROL_POINT_TESSELLATION_SEED);
  });
});
