import { describe, expect, it } from "vitest";
import {
  RENDERER_BENCHMARK_SEED,
  type RendererBenchmarkInput,
} from "../benchmark-input";
import type {
  BenchmarkAggregateStageObserver,
  BenchmarkAnimationFrameScheduler,
  BenchmarkMonotonicClock,
  RendererBenchmarkStage,
} from "../benchmark-measurement";
import type {
  BenchmarkOperatorDeclaration,
  BenchmarkStopReason,
} from "../benchmark-result";
import type { BenchmarkSourceProvenance } from "../benchmark-provenance.server";
import {
  executeRendererBenchmark,
  type BenchmarkCandidateHost,
  type BenchmarkEnvironmentObservation,
  type BenchmarkExecutionDependencies,
  type BenchmarkRunnerPlatform,
} from "../benchmark-runner";
import type {
  RendererBenchmarkBackend,
  RendererBenchmarkBackendObservation,
  RendererBenchmarkPreGeometryGuard,
  RendererBackendCallbacks,
  RendererBackendOptions,
} from "../renderer-backend";

class ControlledClock implements BenchmarkMonotonicClock {
  private value = 0;
  now(): number {
    return this.value;
  }
  advance(durationMs: number): void {
    this.value += durationMs;
  }
}

class ImmediateFrameScheduler implements BenchmarkAnimationFrameScheduler {
  private handle = 0;
  request(callback: () => void): number {
    this.handle += 1;
    callback();
    return this.handle;
  }
  cancel(): void {}
}

const operator: BenchmarkOperatorDeclaration = {
  browserEngine: "CHROMIUM_FAMILY",
  browserMajor: 140,
  osFamily: "MACOS",
  architecture: "ARM64",
  deviceClass: "PRIMARY_REFERENCE",
  powerMode: "AC_POWER",
  lowPowerState: "OFF",
};

const cleanSource: BenchmarkSourceProvenance = {
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

interface BackendCall {
  readonly strandCount: number;
  readonly requested: "AUTO" | "WEBGL2";
  readonly stages: string[];
}

interface HarnessOptions {
  readonly dirty?: boolean;
  readonly currentMain?: boolean;
  readonly actualBackend?: (strandCount: number, requested: "AUTO" | "WEBGL2") => "WEBGPU" | "WEBGL2";
  readonly stageDuration?: (
    stage: Parameters<BenchmarkAggregateStageObserver["measureSynchronous"]>[0],
    strandCount: number,
    requested: "AUTO" | "WEBGL2",
  ) => number;
  readonly failStage?: (
    stage: Parameters<BenchmarkAggregateStageObserver["measureSynchronous"]>[0],
    strandCount: number,
    requested: "AUTO" | "WEBGL2",
  ) => Error | null;
  readonly abortAtStage?: (
    stage: Parameters<BenchmarkAggregateStageObserver["measureSynchronous"]>[0],
    strandCount: number,
    requested: "AUTO" | "WEBGL2",
  ) => boolean;
  readonly invalidateAtStage?: (
    stage: Parameters<BenchmarkAggregateStageObserver["measureSynchronous"]>[0],
  ) => BenchmarkStopReason | null;
  readonly observation?: (
    callNumber: number,
    strandCount: number,
    requested: "AUTO" | "WEBGL2",
  ) => Partial<RendererBenchmarkBackendObservation>;
  readonly cleanupLeak?: boolean;
  readonly disposeError?: Error;
  readonly hostCreationDuration?: number;
  readonly backendConstructionDuration?: number;
  readonly revealDuration?: number;
  readonly backendFailureAfterStage?: RendererBenchmarkStage;
}

interface HarnessStageContext {
  readonly options: HarnessOptions;
  readonly clock: ControlledClock;
  readonly controller: AbortController;
  readonly call: BackendCall;
  readonly invalidate: (reason: BenchmarkStopReason) => void;
  readonly reportBackendFailure: (error: Error) => void;
}

function harnessStageDuration(
  options: HarnessOptions,
  stage: RendererBenchmarkStage,
  call: BackendCall,
): number {
  if (options.stageDuration === undefined) return 0;
  return options.stageDuration(stage, call.strandCount, call.requested);
}

function harnessStageFailure(
  options: HarnessOptions,
  stage: RendererBenchmarkStage,
  call: BackendCall,
): Error | null {
  if (options.failStage === undefined) return null;
  return options.failStage(stage, call.strandCount, call.requested);
}

function definedOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function runHarnessStage(
  context: HarnessStageContext,
  stage: RendererBenchmarkStage,
  work: () => void,
): void {
  const { call, options } = context;
  call.stages.push(stage);
  context.clock.advance(harnessStageDuration(options, stage, call));
  if (options.abortAtStage?.(stage, call.strandCount, call.requested) === true) {
    context.controller.abort("ROUTE_EXIT");
  }
  const invalidation = options.invalidateAtStage?.(stage) ?? null;
  if (invalidation !== null) context.invalidate(invalidation);
  const failure = harnessStageFailure(options, stage, call);
  if (failure !== null) throw failure;
  work();
  if (options.backendFailureAfterStage === stage) {
    context.reportBackendFailure(new Error(`backend failed after ${stage}`));
  }
}

function measureHarnessStage(
  context: HarnessStageContext,
  observer: BenchmarkAggregateStageObserver,
  stage: RendererBenchmarkStage,
  work: () => void,
): void {
  observer.measureSynchronous(stage, () => runHarnessStage(context, stage, work));
}

function harnessObservation(
  context: HarnessStageContext,
  callNumber: number,
): RendererBenchmarkBackendObservation {
  const { call, options } = context;
  const actualBackend = options.actualBackend?.(call.strandCount, call.requested) ?? "WEBGL2";
  const observed = options.observation?.(
    callNumber,
    call.strandCount,
    call.requested,
  );
  return {
    actualBackend: definedOr(observed?.actualBackend, actualBackend),
    drawingBufferWidth: definedOr(observed?.drawingBufferWidth, 1600),
    drawingBufferHeight: definedOr(observed?.drawingBufferHeight, 1200),
    rendererPixelRatio: definedOr(observed?.rendererPixelRatio, 2),
  };
}

async function initializeHarnessBackend(
  context: HarnessStageContext,
  callNumber: number,
  input: RendererBenchmarkInput,
  observer: BenchmarkAggregateStageObserver,
  guard: RendererBenchmarkPreGeometryGuard,
  ownGeometry: () => void,
) {
  measureHarnessStage(context, observer, "SCENE_SETUP", () => undefined);
  await observer.measureAwaited("RENDERER_INIT", () => {
    runHarnessStage(context, "RENDERER_INIT", () => undefined);
    return Promise.resolve();
  });
  const observation = harnessObservation(context, callNumber);
  guard(observation);
  measureHarnessStage(context, observer, "GEOMETRY_SELECT", () => undefined);
  measureHarnessStage(context, observer, "GEOMETRY_CREATE", () => undefined);
  measureHarnessStage(context, observer, "GEOMETRY_MERGE", () => undefined);
  measureHarnessStage(context, observer, "GEOMETRY_FINALIZE", ownGeometry);
  measureHarnessStage(context, observer, "RENDER_SUBMIT", () => undefined);
  return {
    diagnostics: {
      backend: observation.actualBackend,
      visibleStrandCount: input.strandCount,
      frameDurationMs: 1,
    },
    observation,
  };
}

function harness(options: HarnessOptions = {}) {
  const calls: BackendCall[] = [];
  const clock = new ControlledClock();
  const currentEnvironment: BenchmarkEnvironmentObservation = {
    rawUserAgent: "test browser",
    cssViewportWidth: 800,
    cssViewportHeight: 600,
    devicePixelRatio: 2,
    pageVisible: true,
  };
  let environmentInvalidator: ((reason: BenchmarkStopReason) => void) | null = null;
  let revealCount = 0;
  let disposeCount = 0;
  let postDisposeSnapshotCount = 0;
  const platform: BenchmarkRunnerPlatform = {
    clock,
    animationFrames: new ImmediateFrameScheduler(),
    captureEnvironment: () => ({ ...currentEnvironment }),
    observeEnvironment: (_root, invalidate) => {
      environmentInvalidator = invalidate;
      return () => { environmentInvalidator = null; };
    },
    createCandidateHost: () => {
      clock.advance(options.hostCreationDuration ?? 0);
      let removed = false;
      const host: BenchmarkCandidateHost = {
        element: {},
        reveal: () => {
          revealCount += 1;
          clock.advance(options.revealDuration ?? 0);
        },
        remove: () => { removed = true; },
      };
      if (removed) throw new Error("unreachable");
      return host;
    },
    nowDate: () => new Date("2026-08-09T00:00:00.000Z"),
  };

  const controller = new AbortController();

  const createBackend = (
    _container: object,
    backendOptions: RendererBackendOptions,
    callbacks: RendererBackendCallbacks,
  ): RendererBenchmarkBackend => {
    clock.advance(options.backendConstructionDuration ?? 0);
    let disposed = false;
    let geometryOwned = false;
    let initializedStrandCount: number | null = null;
    const requested = backendOptions.forceWebGL ? "WEBGL2" : "AUTO";
    return {
      async initialize(input, _state, observer, guard) {
        initializedStrandCount = input.strandCount;
        const call: BackendCall = { strandCount: input.strandCount, requested, stages: [] };
        calls.push(call);
        return initializeHarnessBackend({
          options,
          clock,
          controller,
          call,
          invalidate: (reason) => environmentInvalidator?.(reason),
          reportBackendFailure: callbacks.onFailure,
        }, calls.length, input, observer, guard, () => { geometryOwned = true; });
      },
      resize: () => undefined,
      dispose(observer) {
        observer.measureSynchronous("DISPOSE", () => {
          if (initializedStrandCount !== null) {
            clock.advance(options.stageDuration?.(
              "DISPOSE",
              initializedStrandCount,
              requested,
            ) ?? 0);
          }
          if (options.disposeError !== undefined) throw options.disposeError;
          disposed = true;
          disposeCount += 1;
          geometryOwned = false;
        });
      },
      resourceSnapshot: () => {
        if (disposed) postDisposeSnapshotCount += 1;
        return {
          canvases: disposed && !options.cleanupLeak ? 0 : 1,
          backends: disposed && !options.cleanupLeak ? 0 : 1,
          geometries: geometryOwned || options.cleanupLeak ? 1 : 0,
        };
      },
    };
  };

  const dependencies: BenchmarkExecutionDependencies = {
    root: { clientWidth: 800, clientHeight: 600 },
    signal: controller.signal,
    readProvenance: () => Promise.resolve({
      success: true,
      source: { ...cleanSource, treeState: options.dirty ? "DIRTY" : "CLEAN" },
      currentMain: options.currentMain ?? true,
    }),
    platform,
    createBackend,
  };
  return {
    calls,
    clock,
    controller,
    dependencies,
    revealCount: () => revealCount,
    disposeCount: () => disposeCount,
    postDisposeSnapshotCount: () => postDisposeSnapshotCount,
    setEnvironment: (next: Partial<BenchmarkEnvironmentObservation>) => {
      Object.assign(currentEnvironment, next);
    },
  };
}

describe("minimal R2C-A v0.3 runner", () => {
  it("runs smoke at only 72×6 with at most one warm-up and one measured sample per profile", async () => {
    const test = harness({ dirty: true });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("COMPLETE");
    expect(result.sessionConfiguration.decisionBearing).toBe(false);
    expect(result.cells.map((cell) => [cell.strandCount, cell.requestedBackend])).toEqual([
      [72, "AUTO"],
      [72, "WEBGL2"],
    ]);
    expect(result.cells.every((cell) => cell.rawMeasuredSamples.length === 1)).toBe(true);
    expect(test.calls).toHaveLength(4);
    expect(new Set(test.calls.map((call) => call.strandCount))).toEqual(new Set([72]));
  });

  it("runs the exact alternating characterization schedule with 1+5 samples per cell", async () => {
    const test = harness();
    const result = await executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("COMPLETE");
    expect(result.cells.map((cell) => [cell.strandCount, cell.requestedBackend])).toEqual([
      [72, "AUTO"], [72, "WEBGL2"],
      [144, "WEBGL2"], [144, "AUTO"],
      [288, "AUTO"], [288, "WEBGL2"],
      [576, "WEBGL2"], [576, "AUTO"],
      [1152, "AUTO"], [1152, "WEBGL2"],
    ]);
    expect(result.cells.every((cell) => cell.rawMeasuredSamples.length === 5)).toBe(true);
    expect(test.calls).toHaveLength(60);
    expect(result.cells.every((cell) => cell.cleanupOutcome.finalOwnedResources === 0)).toBe(true);
  });

  it("stops drifting AUTO before geometry while the completed WEBGL2 profile advances", async () => {
    const test = harness({
      actualBackend: (strandCount, requested) =>
        requested === "AUTO" && strandCount >= 144 ? "WEBGPU" : "WEBGL2",
    });
    const result = await executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("STOPPED");
    expect(result.stopReason).toBe("AUTO_BACKEND_DRIFT");
    const stoppedAuto = result.cells.find((cell) =>
      cell.strandCount === 144 && cell.requestedBackend === "AUTO",
    );
    expect(stoppedAuto?.cellStopReason).toBe("AUTO_BACKEND_DRIFT");
    expect(result.cells.some((cell) => cell.strandCount === 1152 && cell.requestedBackend === "WEBGL2")).toBe(true);
    const driftCall = test.calls.find((call) => call.strandCount === 144 && call.requested === "AUTO");
    expect(driftCall?.stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(test.calls.some((call) => call.strandCount > 144 && call.requested === "AUTO")).toBe(false);
  });

  it("fails dirty characterization before constructing a renderer", async () => {
    const test = harness({ dirty: true });
    await expect(executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies)).rejects.toThrow("SOURCE_TREE_DIRTY");
    expect(test.calls).toEqual([]);
  });

  it("requires current local origin/main for characterization but permits unmerged smoke", async () => {
    const characterization = harness({ currentMain: false });
    await expect(executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, characterization.dependencies)).rejects.toThrow("SOURCE_NOT_CURRENT_MAIN");
    expect(characterization.calls).toEqual([]);

    const smoke = harness({ currentMain: false });
    await expect(executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, smoke.dependencies)).resolves.toMatchObject({ outcome: "COMPLETE" });
  });

  it("stops a 1000 ms synchronous stage before the next stage", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "GEOMETRY_SELECT" ? 1000 : 0,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("SYNC_STAGE_CEILING");
    expect(test.calls[0].stages).toContain("GEOMETRY_SELECT");
    expect(test.calls[0].stages).not.toContain("GEOMETRY_CREATE");
  });

  it("blocks geometry when renderer init alone reaches the logical-ready ceiling", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "RENDERER_INIT" ? 3000 : 0,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("LOGICAL_READY_CEILING");
    expect(test.calls[0].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(test.revealCount()).toBe(0);
    expect(result.cells[0].rawMeasuredSamples).toEqual([]);
  });

  it("blocks the next geometry stage after cumulative logical-ready time crosses", async () => {
    const timedStages = new Set([
      "SCENE_SETUP", "RENDERER_INIT", "GEOMETRY_SELECT", "GEOMETRY_CREATE",
    ]);
    const test = harness({
      stageDuration: (stage) => timedStages.has(stage) ? 900 : 0,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("LOGICAL_READY_CEILING");
    expect(test.calls[0].stages).toContain("GEOMETRY_CREATE");
    expect(test.calls[0].stages).not.toContain("GEOMETRY_MERGE");
  });

  it("does not reveal a candidate that crosses the logical-ready ceiling on submit", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "RENDER_SUBMIT" ? 600 : 400,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("LOGICAL_READY_CEILING");
    expect(test.calls[0].stages.at(-1)).toBe("RENDER_SUBMIT");
    expect(test.revealCount()).toBe(0);
  });

  it("excludes hidden host creation and includes reveal in candidate-to-ready timing", async () => {
    const test = harness({
      hostCreationDuration: 5000,
      backendConstructionDuration: 10,
      revealDuration: 15,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("COMPLETE");
    expect(result.cells[0].rawMeasuredSamples[0].timings.candidateToLogicalReadyMs).toBe(25);
  });

  it("stops after a reveal that pushes candidate-to-ready to exactly 3000 ms", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "RENDERER_INIT" ? 2999 : 0,
      revealDuration: 1,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("LOGICAL_READY_CEILING");
    expect(test.revealCount()).toBe(2);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it.each([
    ["route cancellation", { abortAtStage: (stage: RendererBenchmarkStage) => stage === "RENDER_SUBMIT" }, "ROUTE_EXIT"],
    ["environment invalidation", { invalidateAtStage: (stage: RendererBenchmarkStage) => stage === "RENDER_SUBMIT" ? "PAGE_HIDDEN" as const : null }, "PAGE_HIDDEN"],
  ])("prevents reveal after %s during first render", async (_label, interruption, reason) => {
    const test = harness(interruption);
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe(reason);
    expect(test.revealCount()).toBe(0);
  });

  it("retains and disposes a backend whose construction reaches the synchronous ceiling", async () => {
    const test = harness({ backendConstructionDuration: 1000 });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("SYNC_STAGE_CEILING");
    expect(test.disposeCount()).toBe(2);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("records zero cleanup before reporting a successful dispose at the synchronous ceiling", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "DISPOSE" ? 1000 : 0,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("STOPPED");
    expect(result.stopReason).toBe("SYNC_STAGE_CEILING");
    expect(result.cells.map((cell) => [cell.requestedBackend, cell.cellStopReason])).toEqual([
      ["AUTO", "SYNC_STAGE_CEILING"],
      ["WEBGL2", "SYNC_STAGE_CEILING"],
    ]);
    expect(result.cells.every((cell) => cell.warmupStatus === "STOPPED")).toBe(true);
    expect(result.cells.every((cell) => cell.cleanupOutcome.status === "ZERO")).toBe(true);
    expect(result.cells.every((cell) => cell.cleanupOutcome.finalOwnedResources === 0)).toBe(true);
    expect(test.disposeCount()).toBe(2);
    expect(test.postDisposeSnapshotCount()).toBe(2);
  });

  it("stops before the next owned stage after a sample-local backend failure", async () => {
    const test = harness({ backendFailureAfterStage: "GEOMETRY_CREATE" });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.stopReason).toBe("BACKEND_PROFILE_FAILURE");
    expect(test.calls[0].stages).toEqual([
      "SCENE_SETUP", "RENDERER_INIT", "GEOMETRY_SELECT", "GEOMETRY_CREATE",
    ]);
    expect(test.revealCount()).toBe(0);
  });

  it("preserves valid measured AUTO evidence before a later measured backend drift", async () => {
    const test = harness({
      observation: (callNumber, strandCount, requested) =>
        requested === "AUTO" && strandCount === 72 && callNumber === 3
          ? { actualBackend: "WEBGPU" }
          : {},
    });
    const result = await executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);
    const autoCell = result.cells[0];

    expect(result.stopReason).toBe("AUTO_BACKEND_DRIFT");
    expect(autoCell.actualBackend).toBe("WEBGL2");
    expect(autoCell.rawMeasuredSamples.map((entry) => [entry.status, entry.actualBackend])).toEqual([
      ["VALID", "WEBGL2"],
      ["STOPPED", "WEBGPU"],
    ]);
  });

  it.each([
    ["RENDERER_INIT", "RENDERER_INIT_FAILURE"],
    ["RENDER_SUBMIT", "RENDER_SUBMIT_FAILURE"],
  ] as const)("attributes a thrown %s stage truthfully", async (stage, reason) => {
    const test = harness({
      failStage: (candidate) => candidate === stage ? new Error(`${stage} failed`) : null,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.cells[0].cellStopReason).toBe(reason);
    expect(result.cells[0].cellOutcome).toBe("FAILED");
  });

  it.each([
    "PAGE_HIDDEN",
    "CSS_VIEWPORT_CHANGED",
    "DEVICE_PIXEL_RATIO_CHANGED",
  ] as const)("invalidates the session on %s before the next stage", async (reason) => {
    const test = harness({
      invalidateAtStage: (stage) => stage === "SCENE_SETUP" ? reason : null,
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("INVALIDATED");
    expect(result.stopReason).toBe(reason);
    expect(test.calls[0].stages).toEqual(["SCENE_SETUP"]);
  });

  it.each([
    ["drawing buffer", { drawingBufferWidth: 1599 }, "DRAWING_BUFFER_CHANGED"],
    ["renderer pixel ratio", { rendererPixelRatio: 1 }, "RENDERER_PIXEL_RATIO_CHANGED"],
  ] as const)("invalidates changed %s before measured geometry", async (_label, changed, reason) => {
    const test = harness({
      observation: (callNumber) => callNumber === 2 ? changed : {},
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("INVALIDATED");
    expect(result.stopReason).toBe(reason);
    expect(test.calls[1].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
  });

  it("fails the session when teardown leaves owned resources", async () => {
    const test = harness({ cleanupLeak: true });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("FAILED");
    expect(result.stopReason).toBe("CLEANUP_INVARIANT_FAILURE");
    expect(result.cells[0].cleanupOutcome.status).toBe("NONZERO");
  });

  it("retains cleanup-invariant failure when dispose itself throws", async () => {
    const test = harness({
      disposeError: new Error("dispose failed"),
    });
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.outcome).toBe("FAILED");
    expect(result.stopReason).toBe("CLEANUP_INVARIANT_FAILURE");
    expect(result.cells[0].cleanupOutcome.status).toBe("NONZERO");
    expect(test.disposeCount()).toBe(0);
    expect(test.postDisposeSnapshotCount()).toBe(0);
  });

  it("stops the session when the quiet boundary reaches its deadline", async () => {
    const test = harness();
    class DeadlineFrameScheduler implements BenchmarkAnimationFrameScheduler {
      request(callback: () => void): number {
        test.clock.advance(900_000);
        callback();
        return 1;
      }
      cancel(): void {}
    }
    const platform = test.dependencies.platform;
    if (platform === undefined) throw new Error("Expected test platform.");
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, {
      ...test.dependencies,
      platform: { ...platform, animationFrames: new DeadlineFrameScheduler() },
    });

    expect(result.outcome).toBe("STOPPED");
    expect(result.stopReason).toBe("SESSION_DEADLINE");
  });

  it("prefers a later session cancellation over an earlier profile failure", async () => {
    const test = harness({
      failStage: (stage, strandCount, requested) =>
        stage === "GEOMETRY_SELECT" && strandCount === 72 && requested === "AUTO"
          ? new Error("AUTO profile failed")
          : null,
      abortAtStage: (stage, strandCount, requested) =>
        stage === "SCENE_SETUP" && strandCount === 144 && requested === "WEBGL2",
    });
    const result = await executeRendererBenchmark({
      runKind: "CHARACTERIZATION",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, test.dependencies);

    expect(result.cells[0].cellStopReason).toBe("BACKEND_PROFILE_FAILURE");
    expect(result.outcome).toBe("CANCELLED");
    expect(result.stopReason).toBe("ROUTE_EXIT");
  });

  it("retains cancellation as a partial result and releases the owned frame", async () => {
    const test = harness();
    class CancellingFrameScheduler implements BenchmarkAnimationFrameScheduler {
      request(): number {
        test.controller.abort("ROUTE_EXIT");
        return 1;
      }
      cancel(): void {}
    }
    const platform = test.dependencies.platform;
    if (platform === undefined) throw new Error("Expected test platform.");
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, {
      ...test.dependencies,
      platform: { ...platform, animationFrames: new CancellingFrameScheduler() },
    });

    expect(result.outcome).toBe("CANCELLED");
    expect(result.stopReason).toBe("ROUTE_EXIT");
    expect(result.cells[0].rawMeasuredSamples[0].stopReason).toBe("ROUTE_EXIT");
    expect(result.cells[0].cleanupOutcome.animationFrames).toBe(0);
  });

  it("classifies a synchronous animation-frame request failure as instrumentation failure", async () => {
    const test = harness();
    const platform = test.dependencies.platform;
    if (platform === undefined) throw new Error("Expected test platform.");
    const result = await executeRendererBenchmark({
      runKind: "VERIFICATION_SMOKE",
      operator,
      seed: RENDERER_BENCHMARK_SEED,
    }, {
      ...test.dependencies,
      platform: {
        ...platform,
        animationFrames: {
          request: () => { throw new Error("request failed"); },
          cancel: () => undefined,
        },
      },
    });

    expect(result.outcome).toBe("FAILED");
    expect(result.stopReason).toBe("INSTRUMENTATION_FAILURE");
    expect(result.cells[0].cleanupOutcome.animationFrames).toBe(0);
  });
});
