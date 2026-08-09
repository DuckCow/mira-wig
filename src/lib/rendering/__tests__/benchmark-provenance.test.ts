import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";
import { RENDERER_BENCHMARK_SEED } from "../benchmark-input";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  readProvenance: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/rendering/benchmark-provenance.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/rendering/benchmark-provenance.server")
  >();
  return { ...actual, readBenchmarkSourceProvenance: mocks.readProvenance };
});

import { startBenchmarkProvenance } from "@/app/admin/render-lab/performance/actions";

const { readBenchmarkSourceProvenance } = await vi.importActual<
  typeof import("../benchmark-provenance.server")
>("../benchmark-provenance.server");

const source = {
  kind: "LOCAL_GIT" as const,
  commit: "a".repeat(40),
  branch: "feat/benchmark",
  treeState: "CLEAN" as const,
  observedAt: "2026-08-09T00:00:00.000Z",
  nextVersion: "16.2.7",
  threeVersion: "0.185.1",
  generatorVersion: "r2ca-synthetic-generator/v1" as const,
  geometryRecipe: "RADIAL_CROWN_FALL_V1" as const,
  seed: RENDERER_BENCHMARK_SEED,
};

describe("guarded run-start benchmark provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      success: true,
      session: {
        user: { id: "admin", role: "ADMIN" },
        expires: "2099-01-01",
      },
    });
    mocks.readProvenance.mockResolvedValue({ source, currentMain: true });
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "fails %s before seed validation or Git I/O",
    async (errorCode) => {
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });

      await expect(startBenchmarkProvenance("invalid")).resolves.toEqual({
        success: false,
        errorCode,
      });
      expect(mocks.readProvenance).not.toHaveBeenCalled();
    },
  );

  it("orders authorization, seed validation, and the one local provenance read", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementation(() => {
      order.push("auth");
      return Promise.resolve({
        success: true,
        session: { user: { id: "admin", role: "ADMIN" }, expires: "2099-01-01" },
      });
    });
    mocks.readProvenance.mockImplementation(() => {
      order.push("git");
      return Promise.resolve({ source, currentMain: true });
    });

    await expect(startBenchmarkProvenance(RENDERER_BENCHMARK_SEED)).resolves.toEqual({
      success: true,
      source,
      currentMain: true,
    });
    expect(order).toEqual(["auth", "git"]);
    expect(mocks.readProvenance).toHaveBeenCalledOnce();
  });

  it("rejects a non-contract seed before Git I/O", async () => {
    await expect(startBenchmarkProvenance(7)).rejects.toThrow(/seed/);
    expect(mocks.readProvenance).not.toHaveBeenCalled();
  });
});

describe("local Git provenance probe", () => {
  it("probes Git before attaching package versions and records clean source", async () => {
    const calls: string[] = [];
    const values = ["b".repeat(40), "feat/benchmark", "", "b".repeat(40)];
    const snapshot = await readBenchmarkSourceProvenance(RENDERER_BENCHMARK_SEED, {
      cwd: "/repo",
      runGit: (args, cwd) => {
        calls.push(`git:${cwd}:${args.join(" ")}`);
        return Promise.resolve(values.shift() ?? "");
      },
      readPackageJson: () => {
        calls.push("package");
        return Promise.resolve({ dependencies: { next: "16.2.7", three: "0.185.1" } });
      },
      now: () => new Date("2026-08-09T01:02:03.000Z"),
    });

    expect(calls).toEqual([
      "git:/repo:rev-parse HEAD",
      "git:/repo:rev-parse --abbrev-ref HEAD",
      "git:/repo:status --porcelain=v1 --untracked-files=all",
      "git:/repo:rev-parse refs/remotes/origin/main",
      "package",
    ]);
    expect(snapshot).toEqual({
      source: {
        ...source,
        commit: "b".repeat(40),
        observedAt: "2026-08-09T01:02:03.000Z",
      },
      currentMain: true,
    });
  });

  it("marks dirty or non-current source without fetching and fails closed when Git is unavailable", async () => {
    const values = [
      "c".repeat(40), "feat/benchmark", " M file.ts", "d".repeat(40),
    ];
    await expect(readBenchmarkSourceProvenance(RENDERER_BENCHMARK_SEED, {
      runGit: () => Promise.resolve(values.shift() ?? ""),
      readPackageJson: () => Promise.resolve({
        dependencies: { next: "16.2.7", three: "0.185.1" },
      }),
      now: () => new Date("2026-08-09T00:00:00.000Z"),
    })).resolves.toMatchObject({
      source: { treeState: "DIRTY" },
      currentMain: false,
    });

    await expect(readBenchmarkSourceProvenance(RENDERER_BENCHMARK_SEED, {
      runGit: () => Promise.reject(new Error("git missing")),
    })).rejects.toThrow(/unavailable/);
  });
});
