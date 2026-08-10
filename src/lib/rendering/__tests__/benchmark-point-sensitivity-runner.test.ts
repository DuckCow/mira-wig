import { describe, expect, it } from "vitest";
import { POINT_SENSITIVITY_SEED, type PointSensitivityInput } from "../benchmark-point-sensitivity-input";
import type {
  BenchmarkAggregateStageObserver,
  BenchmarkAnimationFrameScheduler,
  BenchmarkMonotonicClock,
  RendererBenchmarkStage,
} from "../benchmark-measurement";
import { executePointSensitivityBenchmark, type PointSensitivityExecutionDependencies } from "../benchmark-point-sensitivity-runner";
import type { BenchmarkCandidateHost, BenchmarkEnvironmentObservation, BenchmarkRunnerPlatform } from "../benchmark-runner-core";
import type { BenchmarkOperatorDeclaration, BenchmarkStopReason } from "../benchmark-result";
import type {
  RendererBenchmarkBackend,
  RendererBenchmarkBackendObservation,
  RendererBenchmarkPreGeometryGuard,
  RendererBackendCallbacks,
  RendererBackendOptions,
} from "../renderer-backend";

class Clock implements BenchmarkMonotonicClock {
  value = 0;
  now(): number { return this.value; }
  advance(value: number): void { this.value += value; }
}

class ScriptedAdvanceClock extends Clock {
  private endpointIndex = 0;

  constructor(private readonly endpoints: readonly number[]) {
    super();
    this.value = Number.MIN_VALUE;
  }

  override advance(value: number): void {
    if (value === 0 || this.endpointIndex >= this.endpoints.length) {
      super.advance(value);
      return;
    }
    const next = this.endpoints[this.endpointIndex];
    if (next === undefined || next < this.value) {
      throw new Error("Scripted benchmark clock endpoint is not monotonic.");
    }
    this.endpointIndex += 1;
    this.value = next;
  }
}

class Frames implements BenchmarkAnimationFrameScheduler {
  request(callback: () => void): number { callback(); return 1; }
  cancel(): void {}
}

const controlledOperator: BenchmarkOperatorDeclaration = {
  browserEngine: "CHROMIUM_FAMILY",
  browserMajor: 140,
  osFamily: "MACOS",
  architecture: "ARM64",
  deviceClass: "PRIMARY_REFERENCE",
  powerMode: "AC_POWER",
  lowPowerState: "OFF",
};

interface Call {
  readonly strandCount: number;
  readonly pointsPerStrand: number;
  readonly stages: RendererBenchmarkStage[];
}

interface Options {
  readonly actualBackend?: (callNumber: number) => "WEBGPU" | "WEBGL2";
  readonly stageDuration?: (stage: RendererBenchmarkStage, callNumber: number) => number;
  readonly invalidate?: (stage: RendererBenchmarkStage) => BenchmarkStopReason | null;
  readonly abort?: (stage: RendererBenchmarkStage) => boolean;
  readonly observation?: (callNumber: number) => Partial<RendererBenchmarkBackendObservation>;
  readonly cleanupLeak?: boolean;
  readonly backendFailureAfter?: RendererBenchmarkStage;
  readonly throwAtStage?: RendererBenchmarkStage;
  readonly rendererInitFailure?: boolean;
  readonly beforeObservationGuard?: (callNumber: number) => BenchmarkStopReason | null;
  readonly hideAtQuietBoundary?: boolean;
  readonly environment?: Partial<BenchmarkEnvironmentObservation>;
  readonly frameScheduler?: BenchmarkAnimationFrameScheduler;
  readonly clock?: Clock;
}

interface HarnessBackendContext {
  readonly options: Options;
  readonly clock: Clock;
  readonly controller: AbortController;
  readonly call: Call;
  readonly callNumber: number;
  readonly invalidate: (reason: BenchmarkStopReason) => void;
  readonly callbacks: RendererBackendCallbacks;
}

function stageDuration(
  options: Options,
  stage: RendererBenchmarkStage,
  callNumber: number,
): number {
  return options.stageDuration?.(stage, callNumber) ?? 1;
}

function runHarnessStage(
  context: HarnessBackendContext,
  observer: BenchmarkAggregateStageObserver,
  stage: RendererBenchmarkStage,
  work: () => void,
): void {
  observer.measureSynchronous(stage, () => {
    context.call.stages.push(stage);
    context.clock.advance(stageDuration(context.options, stage, context.callNumber));
    if (context.options.abort?.(stage) === true) context.controller.abort("ROUTE_EXIT");
    const reason = context.options.invalidate?.(stage) ?? null;
    if (reason !== null) context.invalidate(reason);
    if (context.options.throwAtStage === stage) throw new Error(`${stage} failed`);
    work();
    if (context.options.backendFailureAfter === stage) {
      context.callbacks.onFailure(new Error("backend failed"));
    }
  });
}

function observedOr<T>(
  observation: Partial<RendererBenchmarkBackendObservation> | undefined,
  read: (value: Partial<RendererBenchmarkBackendObservation>) => T | undefined,
  fallback: T,
): T {
  if (observation === undefined) return fallback;
  return read(observation) ?? fallback;
}

function harnessObservation(context: HarnessBackendContext): RendererBenchmarkBackendObservation {
  const changed = context.options.observation === undefined
    ? undefined
    : context.options.observation(context.callNumber);
  const defaultBackend = context.options.actualBackend === undefined
    ? "WEBGPU"
    : context.options.actualBackend(context.callNumber);
  return {
    actualBackend: observedOr(changed, (value) => value.actualBackend, defaultBackend),
    drawingBufferWidth: observedOr(changed, (value) => value.drawingBufferWidth, 1600),
    drawingBufferHeight: observedOr(changed, (value) => value.drawingBufferHeight, 1200),
    rendererPixelRatio: observedOr(changed, (value) => value.rendererPixelRatio, 2),
  };
}

async function initializeHarnessBackend(
  context: HarnessBackendContext,
  input: PointSensitivityInput,
  observer: BenchmarkAggregateStageObserver,
  guard: RendererBenchmarkPreGeometryGuard,
  ownGeometry: () => void,
) {
  runHarnessStage(context, observer, "SCENE_SETUP", () => undefined);
  await observer.measureAwaited("RENDERER_INIT", () => {
    context.call.stages.push("RENDERER_INIT");
    context.clock.advance(stageDuration(
      context.options,
      "RENDERER_INIT",
      context.callNumber,
    ));
    if (context.options.rendererInitFailure === true) {
      return Promise.reject(new Error("renderer init failed"));
    }
    return Promise.resolve();
  });
  const observation = harnessObservation(context);
  const beforeGuardReason = context.options.beforeObservationGuard?.(context.callNumber) ?? null;
  if (beforeGuardReason !== null) context.invalidate(beforeGuardReason);
  guard(observation);
  runHarnessStage(context, observer, "GEOMETRY_SELECT", () => undefined);
  runHarnessStage(context, observer, "GEOMETRY_CREATE", () => undefined);
  runHarnessStage(context, observer, "GEOMETRY_MERGE", () => undefined);
  runHarnessStage(context, observer, "GEOMETRY_FINALIZE", ownGeometry);
  runHarnessStage(context, observer, "RENDER_SUBMIT", () => undefined);
  return {
    diagnostics: {
      backend: observation.actualBackend,
      visibleStrandCount: input.strandCount,
      frameDurationMs: 1,
    },
    observation,
  };
}

function harness(options: Options = {}) {
  const clock = options.clock ?? new Clock();
  const controller = new AbortController();
  const calls: Call[] = [];
  let invalidator: ((reason: BenchmarkStopReason) => void) | null = null;
  let provenanceReads = 0;
  let reveals = 0;
  const currentEnvironment = {
    rawUserAgent: "test Chromium",
    cssViewportWidth: 800,
    cssViewportHeight: 600,
    devicePixelRatio: 2,
    pageVisible: true,
    ...options.environment,
  } satisfies BenchmarkEnvironmentObservation;
  const quietFrames: BenchmarkAnimationFrameScheduler = options.hideAtQuietBoundary === true
    ? {
      request(callback) {
        currentEnvironment.pageVisible = false;
        callback();
        return 1;
      },
      cancel: () => undefined,
    }
    : new Frames();
  const platform: BenchmarkRunnerPlatform = {
    clock,
    animationFrames: options.frameScheduler ?? quietFrames,
    captureEnvironment: () => ({ ...currentEnvironment }),
    observeEnvironment: (_root, invalidate) => {
      invalidator = invalidate;
      return () => { invalidator = null; };
    },
    createCandidateHost: () => {
      const host: BenchmarkCandidateHost = {
        element: {},
        reveal: () => { reveals += 1; },
        remove: () => undefined,
      };
      return host;
    },
    nowDate: () => new Date("2026-08-09T00:00:00.000Z"),
  };

  const createBackend = (
    _container: object,
    _backendOptions: RendererBackendOptions,
    callbacks: RendererBackendCallbacks,
  ): RendererBenchmarkBackend<PointSensitivityInput> => {
    let disposed = false;
    let geometry = false;
    return {
      async initialize(input, _state, observer, guard) {
        const call: Call = {
          strandCount: input.strandCount,
          pointsPerStrand: input.pointsPerStrand,
          stages: [],
        };
        calls.push(call);
        return initializeHarnessBackend({
          options,
          clock,
          controller,
          call,
          callNumber: calls.length,
          invalidate: (reason) => invalidator?.(reason),
          callbacks,
        }, input, observer, guard, () => { geometry = true; });
      },
      resize: () => undefined,
      dispose(observer) {
        observer.measureSynchronous("DISPOSE", () => {
          clock.advance(options.stageDuration?.("DISPOSE", calls.length) ?? 0);
          disposed = true;
          geometry = false;
        });
      },
      resourceSnapshot: () => ({
        canvases: disposed && !options.cleanupLeak ? 0 : 1,
        backends: disposed && !options.cleanupLeak ? 0 : 1,
        geometries: geometry || options.cleanupLeak ? 1 : 0,
      }),
    };
  };

  const dependencies: PointSensitivityExecutionDependencies = {
    root: { clientWidth: 800, clientHeight: 600 },
    signal: controller.signal,
    readProvenance: () => {
      provenanceReads += 1;
      return Promise.resolve({
        success: true,
        source: {
          kind: "LOCAL_GIT",
          commit: "a".repeat(40),
          branch: "main",
          treeState: "CLEAN",
          observedAt: "2026-08-09T00:00:00.000Z",
          nextVersion: "16.2.7",
          threeVersion: "0.185.1",
          generatorVersion: "r2ca-s1-synthetic-generator/v1",
          geometryRecipe: "RADIAL_CROWN_FALL_V1",
          seed: POINT_SENSITIVITY_SEED,
        },
        currentMain: true,
      });
    },
    platform,
    createBackend,
  };
  return { calls, clock, controller, dependencies, provenanceReads: () => provenanceReads, reveals: () => reveals };
}

async function execute(test: ReturnType<typeof harness>) {
  return executePointSensitivityBenchmark({
    operator: controlledOperator,
    seed: POINT_SENSITIVITY_SEED,
  }, test.dependencies);
}

describe("R2C-A-S1 runner", () => {
  it("runs the exact counterbalanced AUTO-only schedule at exactly 1+5", async () => {
    const test = harness();
    const result = await execute(test);
    expect(result.outcome).toBe("COMPLETE");
    expect(result.cells.map((cell) => [cell.strandCount, cell.pointsPerStrand, cell.requestedBackend])).toEqual([
      [576, 3, "AUTO"], [576, 6, "AUTO"], [576, 8, "AUTO"],
      [1152, 8, "AUTO"], [1152, 6, "AUTO"], [1152, 3, "AUTO"],
    ]);
    expect(test.calls).toHaveLength(36);
    expect(result.cells.every((cell) => cell.rawMeasuredSamples.length === 5)).toBe(true);
    expect(result.cells.every((cell) => cell.cleanupOutcome.finalOwnedResources === 0)).toBe(true);
    expect(result.analysis.disposition).not.toBeNull();
  });

  it.each([
    ["WEBGPU", []],
    ["WEBGL2", ["AUTO_DID_NOT_SELECT_WEBGPU"]],
  ] as const)("keeps a stable %s backend with the exact warning policy", async (backend, warnings) => {
    const result = await execute(harness({ actualBackend: () => backend }));
    expect(new Set(result.cells.map((cell) => cell.actualBackend))).toEqual(new Set([backend]));
    expect(result.warnings).toEqual(warnings);
  });

  it("stops AUTO drift before geometry and retains partial evidence without disposition", async () => {
    const test = harness({ actualBackend: (callNumber) => callNumber < 3 ? "WEBGPU" : "WEBGL2" });
    const result = await execute(test);
    expect(result.stopReason).toBe("AUTO_BACKEND_DRIFT");
    expect(test.calls[2].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].rawMeasuredSamples).toHaveLength(2);
    expect(result.analysis.disposition).toBeNull();
  });

  it("accepts the runner's earliest executed PAGE_HIDDEN shape after a quiet boundary", async () => {
    const result = await execute(harness({ hideAtQuietBoundary: true }));
    const terminal = result.cells[0].rawMeasuredSamples[0];
    expect(result.stopReason).toBe("PAGE_HIDDEN");
    expect(terminal.actualBackend).toBeNull();
    expect(terminal.timings.inputConstructionCpuMs).toBeNull();
    expect(terminal.timings.teardownCpuMs).not.toBeNull();
    expect(terminal.timings.totalSampleWallMs).not.toBeNull();
  });

  it("keeps a reported backend preaccept when a higher-priority guard beats drift", async () => {
    const result = await execute(harness({
      actualBackend: (callNumber) => callNumber === 1 ? "WEBGPU" : "WEBGL2",
      beforeObservationGuard: (callNumber) => callNumber === 2 ? "PAGE_HIDDEN" : null,
    }));
    const terminal = result.cells[0].rawMeasuredSamples[0];
    expect(result.stopReason).toBe("PAGE_HIDDEN");
    expect(result.cells[0].actualBackend).toBe("WEBGPU");
    expect(terminal.actualBackend).toBe("WEBGL2");
    expect(terminal.timings.rendererInitWallMs).not.toBeNull();
    expect(terminal.timings.geometrySelectCpuMs).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("lets the preaccept session guard win at the logical-ready threshold", async () => {
    const result = await execute(harness({
      actualBackend: () => "WEBGPU",
      stageDuration: (stage) => stage === "RENDERER_INIT" ? 3000 : 1,
      beforeObservationGuard: () => "PAGE_HIDDEN",
    }));
    const terminal = result.cells[0];
    expect(result.stopReason).toBe("PAGE_HIDDEN");
    expect(terminal.cellStopReason).toBe("PAGE_HIDDEN");
    expect(terminal.actualBackend).toBe("WEBGPU");
    expect(terminal.warmupStatus).toBe("INVALIDATED");
  });

  it("retains accepted-observation authority for a terminal WEBGL2 warm-up", async () => {
    const result = await execute(harness({
      actualBackend: () => "WEBGL2",
      invalidate: (stage) => stage === "GEOMETRY_SELECT" ? "PAGE_HIDDEN" : null,
    }));
    expect(result.stopReason).toBe("PAGE_HIDDEN");
    expect(result.cells[0].warmupStatus).toBe("INVALIDATED");
    expect(result.cells[0].actualBackend).toBe("WEBGL2");
    expect(result.warnings).toEqual(["AUTO_DID_NOT_SELECT_WEBGPU"]);
    expect(result.environment.drawingBufferWidth).toBe(1600);
  });

  it("conforms pre-observation init and render-submit failures to Result-v1 validation", async () => {
    const initialization = await execute(harness({ rendererInitFailure: true }));
    expect(initialization.stopReason).toBe("RENDERER_INIT_FAILURE");
    expect(initialization.cells[0].actualBackend).toBeNull();
    expect(initialization.environment.drawingBufferWidth).toBe(0);

    const submission = await execute(harness({ throwAtStage: "RENDER_SUBMIT" }));
    expect(submission.stopReason).toBe("RENDER_SUBMIT_FAILURE");
    expect(submission.cells[0].actualBackend).toBe("WEBGPU");
  });

  it("rejects a nonmatching operator declaration before provenance or workload", async () => {
    const test = harness();
    await expect(executePointSensitivityBenchmark({
      operator: { ...controlledOperator, lowPowerState: "ON" },
      seed: POINT_SENSITIVITY_SEED,
    }, test.dependencies)).rejects.toThrow("S1_CONTROLLED_ENVIRONMENT_REQUIRED");
    expect(test.provenanceReads()).toBe(0);
    expect(test.calls).toEqual([]);
  });

  it("stops a 1000 ms synchronous stage before the next geometry stage", async () => {
    const test = harness({ stageDuration: (stage) => stage === "GEOMETRY_SELECT" ? 1000 : 1 });
    const result = await execute(test);
    expect(result.stopReason).toBe("SYNC_STAGE_CEILING");
    expect(test.calls[0].stages).not.toContain("GEOMETRY_CREATE");
  });

  it("stops at the 3000 ms logical-ready boundary before geometry", async () => {
    const test = harness({ stageDuration: (stage) => stage === "RENDERER_INIT" ? 3000 : 1 });
    const result = await execute(test);
    expect(result.stopReason).toBe("LOGICAL_READY_CEILING");
    expect(test.calls[0].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(test.reveals()).toBe(0);
  });

  it("validates the lawful floating-point family whose independent stage sum rounds to 3000", async () => {
    const sceneComplete = 726.5071203466575;
    const logicalGuardClock = 2999.9999999999995;
    const clock = new ScriptedAdvanceClock([sceneComplete, logicalGuardClock]);
    const test = harness({
      clock,
      actualBackend: (callNumber) => callNumber === 1 ? "WEBGPU" : "WEBGL2",
      stageDuration: (stage, callNumber) => {
        if (callNumber !== 2) return 0;
        if (stage === "SCENE_SETUP" || stage === "RENDERER_INIT") return 1;
        return 0;
      },
    });
    const result = await execute(test);
    const terminal = result.cells[0].rawMeasuredSamples[0];
    const independentStageSum =
      (terminal.timings.sceneSetupCpuMs ?? 0) +
      (terminal.timings.rendererInitWallMs ?? 0);

    expect(independentStageSum).toBe(3000);
    expect(terminal.timings.totalSampleWallMs).toBe(logicalGuardClock);
    expect(terminal.timings.candidateToLogicalReadyMs).toBeNull();
    expect(result.stopReason).toBe("AUTO_BACKEND_DRIFT");
  });

  it("keeps zero cleanup truth when successful dispose reaches its ceiling", async () => {
    const result = await execute(harness({
      stageDuration: (stage) => stage === "DISPOSE" ? 1000 : 1,
    }));
    expect(result.stopReason).toBe("SYNC_STAGE_CEILING");
    expect(result.cells[0].cleanupOutcome.status).toBe("ZERO");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it.each([
    ["hidden page", { pageVisible: false }, "PAGE_HIDDEN"],
    ["wrong initial viewport", { cssViewportWidth: 799 }, "CSS_VIEWPORT_CHANGED"],
  ] as const)("rejects %s before renderer workload", async (_label, environment, reason) => {
    const test = harness({ environment });
    await expect(execute(test)).rejects.toThrow(reason);
    expect(test.calls).toEqual([]);
  });

  it.each([
    ["PAGE_HIDDEN", "PAGE_HIDDEN"],
    ["CSS_VIEWPORT_CHANGED", "CSS_VIEWPORT_CHANGED"],
    ["DEVICE_PIXEL_RATIO_CHANGED", "DEVICE_PIXEL_RATIO_CHANGED"],
  ] as const)("invalidates %s before the next owned stage", async (reason, expected) => {
    const result = await execute(harness({ invalidate: (stage) => stage === "SCENE_SETUP" ? reason : null }));
    expect(result.stopReason).toBe(expected);
    expect(result.analysis.disposition).toBeNull();
  });

  it.each([
    ["drawing buffer", { drawingBufferWidth: 1599 }, "DRAWING_BUFFER_CHANGED"],
    ["renderer ratio", { rendererPixelRatio: 1 }, "RENDERER_PIXEL_RATIO_CHANGED"],
  ] as const)("invalidates a changed %s", async (_label, changed, reason) => {
    const result = await execute(harness({ observation: (call) => call === 2 ? changed : {} }));
    expect(result.stopReason).toBe(reason);
  });

  it("retains route cancellation and releases owned resources", async () => {
    const result = await execute(harness({ abort: (stage) => stage === "RENDER_SUBMIT" }));
    expect(result.stopReason).toBe("ROUTE_EXIT");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
    expect(result.analysis.disposition).toBeNull();
  });

  it("attributes backend failure and cleanup failure truthfully", async () => {
    const backend = await execute(harness({ backendFailureAfter: "GEOMETRY_CREATE" }));
    expect(backend.stopReason).toBe("BACKEND_PROFILE_FAILURE");
    const cleanup = await execute(harness({ cleanupLeak: true }));
    expect(cleanup.stopReason).toBe("CLEANUP_INVARIANT_FAILURE");
    expect(cleanup.cells[0].cleanupOutcome.status).toBe("NONZERO");
  });

  it("propagates cleanup final-cause override through sample, cell, and result", async () => {
    const result = await execute(harness({
      beforeObservationGuard: () => "PAGE_HIDDEN",
      cleanupLeak: true,
    }));
    expect(result.cells[0].cellStopReason).toBe("CLEANUP_INVARIANT_FAILURE");
    expect(result.stopReason).toBe("CLEANUP_INVARIANT_FAILURE");
    expect(result.cells[0].cleanupOutcome.status).toBe("NONZERO");
  });

  it("preserves the first interruption after successful or ceiling-bound teardown", async () => {
    const successfulCleanup = await execute(harness({
      beforeObservationGuard: () => "PAGE_HIDDEN",
    }));
    expect(successfulCleanup.cells[0].cellStopReason).toBe("PAGE_HIDDEN");
    expect(successfulCleanup.stopReason).toBe("PAGE_HIDDEN");

    const teardownCeiling = await execute(harness({
      beforeObservationGuard: () => "PAGE_HIDDEN",
      stageDuration: (stage) => stage === "DISPOSE" ? 1000 : 1,
    }));
    expect(teardownCeiling.cells[0].cellStopReason).toBe("PAGE_HIDDEN");
    expect(teardownCeiling.stopReason).toBe("PAGE_HIDDEN");
  });

  it("emits and validates a real quiet-boundary instrumentation failure", async () => {
    const failingFrames: BenchmarkAnimationFrameScheduler = {
      request: () => { throw new Error("frame instrumentation failed"); },
      cancel: () => undefined,
    };
    const result = await execute(harness({ frameScheduler: failingFrames }));
    expect(result.cells[0].rawMeasuredSamples[0].stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
    expect(result.cells[0].cellStopReason).toBe("INSTRUMENTATION_FAILURE");
    expect(result.stopReason).toBe("INSTRUMENTATION_FAILURE");
  });

  it("stops on the whole-session deadline at a quiet boundary", async () => {
    const test = harness();
    class DeadlineFrames implements BenchmarkAnimationFrameScheduler {
      request(callback: () => void): number { test.clock.advance(900_000); callback(); return 1; }
      cancel(): void {}
    }
    const platform = test.dependencies.platform;
    if (platform === undefined) throw new Error("platform required");
    const result = await executePointSensitivityBenchmark({
      operator: controlledOperator,
      seed: POINT_SENSITIVITY_SEED,
    }, { ...test.dependencies, platform: { ...platform, animationFrames: new DeadlineFrames() } });
    expect(result.stopReason).toBe("SESSION_DEADLINE");
  });
});
