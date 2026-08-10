import { describe, expect, it } from "vitest";
import {
  CONTROL_POINT_TESSELLATION_SEED,
  type ControlPointTessellationInput,
} from "../benchmark-control-point-tessellation-input";
import { CONTROL_POINT_TESSELLATION_CELL_ORDER } from "../benchmark-control-point-tessellation-result";
import {
  executeControlPointTessellationBenchmark,
  type ControlPointTessellationExecutionDependencies,
  type ControlPointTessellationProgress,
} from "../benchmark-control-point-tessellation-runner";
import type {
  BenchmarkAggregateStageObserver,
  BenchmarkAnimationFrameScheduler,
  BenchmarkMonotonicClock,
  RendererBenchmarkStage,
} from "../benchmark-measurement";
import type {
  BenchmarkCandidateHost,
  BenchmarkEnvironmentObservation,
  BenchmarkRunnerPlatform,
} from "../benchmark-runner-core";
import type { BenchmarkStopReason } from "../benchmark-result";
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

class Frames implements BenchmarkAnimationFrameScheduler {
  request(callback: () => void): number { callback(); return 1; }
  cancel(): void {}
}

const chromeUa = "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36";

const operator = {
  browserEngine: "CHROMIUM_FAMILY" as const,
  declaredBrowserProduct: "CHROME" as const,
  declaredBrowserMajor: 151,
  osFamily: "MACOS" as const,
  architecture: "ARM64" as const,
  deviceClass: "PRIMARY_REFERENCE" as const,
  powerMode: "AC_POWER" as const,
  lowPowerState: "OFF" as const,
};

interface Call {
  readonly strandCount: number;
  readonly points: number;
  readonly tubularSegments: number;
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
    if (context.options.abort?.(stage) === true) context.controller.abort();
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
  return observation === undefined ? fallback : read(observation) ?? fallback;
}

function harnessObservation(context: HarnessBackendContext): RendererBenchmarkBackendObservation {
  const changed = context.options.observation?.(context.callNumber);
  const defaultBackend = context.options.actualBackend?.(context.callNumber) ?? "WEBGPU";
  return {
    actualBackend: observedOr(changed, (value) => value.actualBackend, defaultBackend),
    drawingBufferWidth: observedOr(changed, (value) => value.drawingBufferWidth, 1600),
    drawingBufferHeight: observedOr(changed, (value) => value.drawingBufferHeight, 1200),
    rendererPixelRatio: observedOr(changed, (value) => value.rendererPixelRatio, 2),
  };
}

async function initializeHarnessBackend(
  context: HarnessBackendContext,
  input: ControlPointTessellationInput,
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
  const clock = new Clock();
  const controller = new AbortController();
  const calls: Call[] = [];
  const order: string[] = [];
  const progress: number[] = [];
  let invalidator: ((reason: BenchmarkStopReason) => void) | null = null;
  let reveals = 0;
  const currentEnvironment = {
    rawUserAgent: chromeUa,
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
    captureEnvironment: () => {
      order.push("core-session");
      return { ...currentEnvironment };
    },
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
    nowDate: () => new Date("2026-08-10T00:00:00.000Z"),
  };

  const createBackend = (
    _container: object,
    _backendOptions: RendererBackendOptions,
    callbacks: RendererBackendCallbacks,
  ): RendererBenchmarkBackend<ControlPointTessellationInput> => {
    let disposed = false;
    let geometry = false;
    return {
      async initialize(input, _visual, observer, guard) {
        const call: Call = {
          strandCount: input.strandCount,
          points: input.pointsPerStrand,
          tubularSegments: input.tubularSegments,
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

  const dependencies: ControlPointTessellationExecutionDependencies = {
    root: { clientWidth: 800, clientHeight: 600 },
    signal: controller.signal,
    platform,
    createBackend,
    captureBrowserVersionEvidence: () => {
      order.push("browser-admission");
      return {
        userAgent: chromeUa,
        userAgentDataBrands: [
          { brand: "Chromium", version: "151" },
          { brand: "Google Chrome", version: "151" },
        ],
      };
    },
    readProvenance: () => {
      order.push("provenance");
      return Promise.resolve({
        success: true,
        source: {
          kind: "LOCAL_GIT",
          commit: "a".repeat(40),
          branch: "main",
          treeState: "CLEAN",
          observedAt: "2026-08-10T00:00:00.000Z",
          nextVersion: "16.2.7",
          threeVersion: "0.185.1",
          generatorVersion: "r2ca-s2-synthetic-generator/v1",
          geometryRecipe: "RADIAL_CROWN_FALL_V1",
          seed: CONTROL_POINT_TESSELLATION_SEED,
        },
        currentMain: true,
      });
    },
    onProgress: (value) => progress.push(value.completedCells),
  };
  return { calls, dependencies, order, progress, reveals: () => reveals };
}

async function execute(test: ReturnType<typeof harness>) {
  return executeControlPointTessellationBenchmark({
    operator,
    seed: CONTROL_POINT_TESSELLATION_SEED,
  }, test.dependencies);
}

function expectTerminalEvidence(
  result: Awaited<ReturnType<typeof execute>>,
  reason: BenchmarkStopReason,
): void {
  expect(result.stopReason).toBe(reason);
  expect(result.cells.at(-1)?.cellStopReason).toBe(reason);
  expect(result.analysis.disposition).toBeNull();
  expect(result.analysis.nextInvestigationClass).toBeNull();
  expect(result.cells.slice(0, -1).every((cell) => cell.cellOutcome === "COMPLETE"))
    .toBe(true);
}

describe("R2C-A-S2 runner", () => {
  it("runs the exact runtime-immutable eight-cell AUTO schedule at 1+5", async () => {
    const test = harness();
    const result = await execute(test);
    expect(result.outcome).toBe("COMPLETE");
    expect(result.cells.map((cell) => [
      cell.strandCount,
      cell.pointsPerStrand,
      cell.tubularSegmentsPerStrand,
    ])).toEqual([
      [576, 3, 6], [1152, 8, 21], [1152, 3, 21], [576, 8, 6],
      [1152, 8, 6], [576, 3, 21], [576, 8, 21], [1152, 3, 6],
    ]);
    expect(test.calls).toHaveLength(48);
    expect(test.calls.filter((_call, index) => index % 6 === 0).map((call) => ({
      strandCount: call.strandCount,
      pointsPerStrand: call.points,
      tubularSegments: call.tubularSegments,
    }))).toEqual(CONTROL_POINT_TESSELLATION_CELL_ORDER);
    expect(result.cells.every((cell) => cell.rawMeasuredSamples.length === 5)).toBe(true);
    expect(result.cells.every((cell) => cell.cleanupOutcome.finalOwnedResources === 0)).toBe(true);
    expect(result.analysis.disposition).not.toBeNull();
    expect(test.progress.at(-1)).toBe(8);
  });

  it("does not let hostile progress mutation alter later cells or runner order", async () => {
    const test = harness();
    const mutationResults: boolean[] = [];
    const hostileProgress = (progress: ControlPointTessellationProgress): void => {
      mutationResults.push(Reflect.set(progress, "completedCells", 99));
      if (progress.currentCell !== null) {
        mutationResults.push(Reflect.set(progress.currentCell, "strandCount", 1152));
        mutationResults.push(Reflect.set(progress.currentCell, "tubularSegments", 21));
      }
    };
    const result = await executeControlPointTessellationBenchmark({
      operator,
      seed: CONTROL_POINT_TESSELLATION_SEED,
    }, { ...test.dependencies, onProgress: hostileProgress });
    expect(mutationResults.every((changed) => !changed)).toBe(true);
    expect(result.cells.map((cell) => [
      cell.strandCount,
      cell.pointsPerStrand,
      cell.tubularSegmentsPerStrand,
    ])).toEqual(CONTROL_POINT_TESSELLATION_CELL_ORDER.map((entry) => [
      entry.strandCount,
      entry.pointsPerStrand,
      entry.tubularSegments,
    ]));
    expect(test.calls).toHaveLength(48);
  });

  it("completes browser and provenance admission before core session/workload", async () => {
    const test = harness();
    await execute(test);
    expect(test.order.slice(0, 3)).toEqual([
      "browser-admission",
      "provenance",
      "core-session",
    ]);
  });

  it.each([
    [{ ...operator, declaredBrowserMajor: 150 }, {
      userAgent: chromeUa,
      userAgentDataBrands: [
        { brand: "Chromium", version: "151" },
        { brand: "Google Chrome", version: "151" },
      ],
    }],
    [operator, {
      userAgent: `${chromeUa} Vivaldi/7.7.3851.61`,
      userAgentDataBrands: null,
    }],
    [operator, {
      userAgent: `${chromeUa} Edg/151x`,
      userAgentDataBrands: null,
    }],
  ] as const)("rejects browser mismatch/hostile evidence before provenance and core creation", async (
    declaredOperator,
    evidence,
  ) => {
    const test = harness();
    const dependencies = {
      ...test.dependencies,
      captureBrowserVersionEvidence: () => evidence,
    };
    await expect(executeControlPointTessellationBenchmark({
      operator: declaredOperator,
      seed: CONTROL_POINT_TESSELLATION_SEED,
    }, dependencies)).rejects.toThrow();
    expect(test.order).toEqual([]);
    expect(test.calls).toEqual([]);
  });

  it.each([
    ["warm-up", "WEBGPU", "WEBGL2", 7],
    ["warm-up", "WEBGL2", "WEBGPU", 7],
    ["measured", "WEBGPU", "WEBGL2", 2],
    ["measured", "WEBGL2", "WEBGPU", 2],
  ] as const)(
    "retains rejected %s drift from %s to %s without changing accepted authority",
    async (phase, acceptedBackend, reportedBackend, driftCall) => {
      const test = harness({
        actualBackend: (callNumber) => callNumber < driftCall
          ? acceptedBackend
          : reportedBackend,
      });
      const result = await execute(test);
      expectTerminalEvidence(result, "AUTO_BACKEND_DRIFT");
      expect(test.calls).toHaveLength(driftCall);
      expect(test.calls.at(-1)?.stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
      const terminalCell = result.cells.at(-1);
      if (terminalCell === undefined) throw new Error("Terminal drift cell is missing.");
      if (phase === "warm-up") {
        expect(terminalCell.warmupStatus).toBe("STOPPED");
        expect(terminalCell.actualBackend).toBe(reportedBackend);
        expect(terminalCell.rawMeasuredSamples).toEqual([]);
      } else {
        const terminalSample = terminalCell.rawMeasuredSamples.at(-1);
        expect(terminalCell.warmupStatus).toBe("VALID");
        expect(terminalCell.actualBackend).toBe(acceptedBackend);
        expect(terminalSample?.actualBackend).toBe(reportedBackend);
        expect(terminalSample?.timings.rendererInitWallMs).not.toBeNull();
        expect(terminalSample?.timings.geometrySelectCpuMs).toBeNull();
      }
      expect(result.warnings).toEqual(
        acceptedBackend === "WEBGL2" ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [],
      );
      expect(terminalCell.cleanupOutcome.finalOwnedResources).toBe(0);
    },
  );

  it.each([
    ["page hidden", "PAGE_HIDDEN"],
    ["viewport", "CSS_VIEWPORT_CHANGED"],
    ["DPR", "DEVICE_PIXEL_RATIO_CHANGED"],
  ] as const)("invalidates a %s change and retains only exact partial evidence", async (
    _label,
    reason,
  ) => {
    const test = harness({
      invalidate: (stage) => stage === "SCENE_SETUP" ? reason : null,
    });
    const result = await execute(test);
    expectTerminalEvidence(result, reason);
    expect(result.cells).toHaveLength(1);
    expect(test.calls).toHaveLength(1);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it.each([
    ["drawing buffer", { drawingBufferWidth: 1599 }, "DRAWING_BUFFER_CHANGED"],
    ["renderer pixel ratio", { rendererPixelRatio: 1 }, "RENDERER_PIXEL_RATIO_CHANGED"],
  ] as const)("invalidates changed %s evidence before geometry", async (
    _label,
    changed,
    reason,
  ) => {
    const test = harness({ observation: (call) => call === 2 ? changed : {} });
    const result = await execute(test);
    expectTerminalEvidence(result, reason);
    expect(test.calls).toHaveLength(2);
    expect(test.calls[1].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(result.cells[0].rawMeasuredSamples.at(-1)?.actualBackend).toBe("WEBGPU");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("retains operator cancellation and stops all later cells", async () => {
    const test = harness({ abort: (stage) => stage === "SCENE_SETUP" });
    const result = await execute(test);
    expectTerminalEvidence(result, "CANCELLED_BY_OPERATOR");
    expect(result.outcome).toBe("CANCELLED");
    expect(result.cells).toHaveLength(1);
    expect(test.calls).toHaveLength(1);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it.each([
    ["renderer initialization", { rendererInitFailure: true }, "RENDERER_INIT_FAILURE"],
    ["device callback", { backendFailureAfter: "GEOMETRY_CREATE" }, "BACKEND_PROFILE_FAILURE"],
  ] as const)("fails closed for %s failure", async (_label, options, reason) => {
    const test = harness(options);
    const result = await execute(test);
    expectTerminalEvidence(result, reason);
    expect(result.cells).toHaveLength(1);
    expect(test.calls).toHaveLength(1);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("stops a synchronous stage ceiling before prohibited geometry work", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "GEOMETRY_SELECT" ? 1000 : 1,
    });
    const result = await execute(test);
    expectTerminalEvidence(result, "SYNC_STAGE_CEILING");
    expect(test.calls[0].stages).not.toContain("GEOMETRY_CREATE");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("stops at the candidate-to-logical-ready ceiling before geometry acceptance", async () => {
    const test = harness({
      stageDuration: (stage) => stage === "RENDERER_INIT" ? 3000 : 1,
    });
    const result = await execute(test);
    expectTerminalEvidence(result, "LOGICAL_READY_CEILING");
    expect(test.calls[0].stages).toEqual(["SCENE_SETUP", "RENDERER_INIT"]);
    expect(test.reveals()).toBe(0);
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("gives cleanup failure final-cause precedence and reports retained resources", async () => {
    const result = await execute(harness({
      beforeObservationGuard: () => "PAGE_HIDDEN",
      cleanupLeak: true,
    }));
    expectTerminalEvidence(result, "CLEANUP_INVARIANT_FAILURE");
    expect(result.cells[0].cleanupOutcome.status).toBe("NONZERO");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBeGreaterThan(0);
  });

  it("preserves the first terminal cause after successful cleanup", async () => {
    const result = await execute(harness({
      beforeObservationGuard: () => "PAGE_HIDDEN",
    }));
    expectTerminalEvidence(result, "PAGE_HIDDEN");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
  });

  it("emits and validates quiet-boundary instrumentation failure evidence", async () => {
    const failingFrames: BenchmarkAnimationFrameScheduler = {
      request: () => { throw new Error("frame instrumentation failed"); },
      cancel: () => undefined,
    };
    const test = harness({ frameScheduler: failingFrames });
    const result = await execute(test);
    expectTerminalEvidence(result, "INSTRUMENTATION_FAILURE");
    expect(result.cells[0].rawMeasuredSamples[0].stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
    expect(result.cells[0].cleanupOutcome.finalOwnedResources).toBe(0);
    expect(test.calls).toHaveLength(1);
  });
});
