import {
  RENDERER_BENCHMARK_POINTS_PER_STRAND,
  RENDERER_BENCHMARK_SEED,
  RENDERER_BENCHMARK_STRAND_LEVELS,
  constructRendererBenchmarkCandidate,
  validateRendererBenchmarkInput,
  validateRendererBenchmarkSeed,
  type RendererBenchmarkStrandCount,
} from "./benchmark-input";
import {
  BENCHMARK_LOGICAL_READY_CEILING_MS,
  BENCHMARK_SESSION_CEILING_MS,
  BENCHMARK_SYNC_STAGE_CEILING_MS,
  RENDERER_BENCHMARK_STAGES,
  BenchmarkSynchronousStageCeilingError,
  createBenchmarkAggregateStageObserver,
  measureBenchmarkSynchronousCpu,
  waitForBenchmarkAnimationFrame,
  type BenchmarkAggregateStageObserver,
  type BenchmarkAnimationFrameScheduler,
  type BenchmarkMonotonicClock,
  type RendererBenchmarkStage,
} from "./benchmark-measurement";
import type { BenchmarkSourceProvenance } from "./benchmark-provenance.server";
import {
  CHARACTERIZATION_PROFILE_ORDER,
  RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
  RENDERER_BENCHMARK_RESULT_SCHEMA,
  benchmarkTerminalOutcome,
  createBenchmarkMetricSummaries,
  validateRendererBenchmarkResult,
  type ActualRendererBackend,
  type BenchmarkCellOutcome,
  type BenchmarkCellResult,
  type BenchmarkCleanupOutcome,
  type BenchmarkEnvironment,
  type BenchmarkMeasuredSample,
  type BenchmarkOperatorDeclaration,
  type BenchmarkOwnedResources,
  type BenchmarkRunKind,
  type BenchmarkRunOutcome,
  type BenchmarkSampleStatus,
  type BenchmarkSampleTimings,
  type BenchmarkSessionConfiguration,
  type BenchmarkStopReason,
  type BenchmarkWarmupStatus,
  type BenchmarkWarning,
  type RequestedRendererBackend,
  type RendererBenchmarkResult,
} from "./benchmark-result";
import {
  createRendererBenchmarkBackend,
  enforceRendererBenchmarkBackendRequest,
  type RendererBenchmarkBackend,
  type RendererBenchmarkBackendObservation,
  type RendererBackendCallbacks,
  type RendererBackendOptions,
} from "./renderer-backend";
import type { VisualState } from "./visual-state";

const FIXED_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

export interface BenchmarkExecutionRequest {
  readonly runKind: BenchmarkRunKind;
  readonly operator: BenchmarkOperatorDeclaration;
  readonly seed: number;
}

export type BenchmarkProvenanceReader = (seed: number) => Promise<
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | {
      readonly success: true;
      readonly source: BenchmarkSourceProvenance;
      readonly currentMain: boolean;
    }
>;

export interface BenchmarkEnvironmentObservation {
  readonly rawUserAgent: string;
  readonly cssViewportWidth: number;
  readonly cssViewportHeight: number;
  readonly devicePixelRatio: number;
  readonly pageVisible: boolean;
}

export interface BenchmarkCandidateHost {
  readonly element: object;
  reveal(): void;
  remove(): void;
}

export interface BenchmarkRoot {
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface BenchmarkRunnerPlatform {
  readonly clock: BenchmarkMonotonicClock;
  readonly animationFrames?: BenchmarkAnimationFrameScheduler;
  captureEnvironment(root: BenchmarkRoot): BenchmarkEnvironmentObservation;
  observeEnvironment(
    root: BenchmarkRoot,
    invalidate: (reason: BenchmarkStopReason) => void,
  ): () => void;
  createCandidateHost(root: BenchmarkRoot): BenchmarkCandidateHost;
  nowDate(): Date;
}

export interface BenchmarkExecutionDependencies {
  readonly root: BenchmarkRoot;
  readonly signal: AbortSignal;
  readonly readProvenance: BenchmarkProvenanceReader;
  readonly platform?: BenchmarkRunnerPlatform;
  readonly createBackend?: (
    container: object,
    options: RendererBackendOptions,
    callbacks: RendererBackendCallbacks,
  ) => RendererBenchmarkBackend;
}

interface MutableOwnedResources {
  candidateHosts: number;
  activeHosts: number;
  canvases: number;
  observers: number;
  timers: number;
  animationFrames: number;
  backends: number;
  geometries: number;
}

interface MutableSessionState {
  readonly baseline: BenchmarkEnvironmentObservation;
  readonly startedClock: number;
  readonly startedAt: string;
  readonly resources: MutableOwnedResources;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  rendererPixelRatio: number;
  autoBackend: ActualRendererBackend | null;
  sessionStop: BenchmarkStopReason | null;
  firstProfileStop: BenchmarkStopReason | null;
}

interface SampleExecution {
  readonly sample: BenchmarkMeasuredSample;
  readonly actualBackend: ActualRendererBackend | null;
  readonly profileStop: boolean;
  readonly sessionStop: boolean;
}

interface MutableSampleState {
  readonly timings: {
    -readonly [K in keyof BenchmarkSampleTimings]: BenchmarkSampleTimings[K];
  };
  actualBackend: ActualRendererBackend | null;
  backend: RendererBenchmarkBackend | null;
  host: BenchmarkCandidateHost | null;
  removeEnvironmentObserver: (() => void) | null;
  failure: BenchmarkInterruption | null;
  backendFailure: Error | null;
  lastStage: RendererBenchmarkStage | null;
  logicalReadyStarted: number | null;
  logicallyReady: boolean;
}

class BenchmarkInterruption extends Error {
  constructor(
    readonly reason: BenchmarkStopReason,
    readonly scope: "PROFILE" | "SESSION",
  ) {
    super(reason);
    this.name = "BenchmarkInterruption";
  }
}

function browserPlatform(): BenchmarkRunnerPlatform {
  return {
    clock: performance,
    captureEnvironment: (root) => ({
      rawUserAgent: navigator.userAgent,
      cssViewportWidth: root.clientWidth,
      cssViewportHeight: root.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      pageVisible: document.visibilityState === "visible",
    }),
    observeEnvironment(root, invalidate) {
      if (!(root instanceof HTMLElement)) {
        throw new Error("Browser benchmark root must be an HTMLElement.");
      }
      const initialWidth = root.clientWidth;
      const initialHeight = root.clientHeight;
      const initialPixelRatio = window.devicePixelRatio || 1;
      const onVisibility = (): void => {
        if (document.visibilityState !== "visible") invalidate("PAGE_HIDDEN");
      };
      const onResize = (): void => {
        if ((window.devicePixelRatio || 1) !== initialPixelRatio) {
          invalidate("DEVICE_PIXEL_RATIO_CHANGED");
          return;
        }
        if (root.clientWidth !== initialWidth || root.clientHeight !== initialHeight) {
          invalidate("CSS_VIEWPORT_CHANGED");
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", onResize);
      const observer = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(onResize);
      observer?.observe(root);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("resize", onResize);
        observer?.disconnect();
      };
    },
    createCandidateHost(root) {
      if (!(root instanceof HTMLElement)) {
        throw new Error("Browser benchmark root must be an HTMLElement.");
      }
      const element = document.createElement("div");
      element.style.position = "absolute";
      element.style.inset = "0";
      element.style.visibility = "hidden";
      root.appendChild(element);
      return {
        element,
        reveal: () => { element.style.visibility = "visible"; },
        remove: () => element.remove(),
      };
    },
    nowDate: () => new Date(),
  };
}

function createBrowserRendererBackend(
  container: object,
  options: RendererBackendOptions,
  callbacks: RendererBackendCallbacks,
): RendererBenchmarkBackend {
  if (!(container instanceof HTMLElement)) {
    throw new Error("Browser benchmark host must be an HTMLElement.");
  }
  return createRendererBenchmarkBackend(container, options, callbacks);
}

export function benchmarkSessionConfiguration(
  runKind: BenchmarkRunKind,
): BenchmarkSessionConfiguration {
  const characterization = runKind === "CHARACTERIZATION";
  return {
    runKind,
    decisionBearing: characterization,
    strandLevels: characterization ? RENDERER_BENCHMARK_STRAND_LEVELS : [72],
    pointsPerStrand: RENDERER_BENCHMARK_POINTS_PER_STRAND,
    requestedBackends: ["AUTO", "WEBGL2"],
    profileOrderByLevel: characterization
      ? CHARACTERIZATION_PROFILE_ORDER
      : CHARACTERIZATION_PROFILE_ORDER.slice(0, 1),
    warmupSamplesPerCell: 1,
    measuredSamplesPerCell: characterization ? 5 : 1,
    previewColor: "#34251F",
    density: "HIGH",
    yaw: 0,
    pitch: 0,
    syncStageCeilingMs: BENCHMARK_SYNC_STAGE_CEILING_MS,
    logicalReadyCeilingMs: BENCHMARK_LOGICAL_READY_CEILING_MS,
    sessionCeilingMs: BENCHMARK_SESSION_CEILING_MS,
  };
}

function emptyResources(): MutableOwnedResources {
  return {
    candidateHosts: 0,
    activeHosts: 0,
    canvases: 0,
    observers: 0,
    timers: 0,
    animationFrames: 0,
    backends: 0,
    geometries: 0,
  };
}

function cleanupOutcome(resources: MutableOwnedResources): BenchmarkCleanupOutcome {
  const total = resources.candidateHosts + resources.activeHosts + resources.canvases +
    resources.observers + resources.timers + resources.animationFrames +
    resources.backends + resources.geometries;
  const snapshot: BenchmarkOwnedResources = {
    ...resources,
    finalOwnedResources: total,
  };
  return {
    status: snapshot.finalOwnedResources === 0 ? "ZERO" : "NONZERO",
    ...snapshot,
  };
}

function emptyTimings(): BenchmarkSampleTimings {
  return {
    inputConstructionCpuMs: null,
    inputValidationCpuMs: null,
    backendConstructionCpuMs: null,
    sceneSetupCpuMs: null,
    rendererInitWallMs: null,
    geometrySelectCpuMs: null,
    geometryCreateCpuMs: null,
    geometryMergeCpuMs: null,
    geometryFinalizeCpuMs: null,
    firstRenderSubmitCpuMs: null,
    candidateToLogicalReadyMs: null,
    teardownCpuMs: null,
    totalSampleWallMs: null,
  };
}

function stageTimingName(stage: RendererBenchmarkStage): keyof BenchmarkSampleTimings | null {
  const names: Readonly<Partial<Record<RendererBenchmarkStage, keyof BenchmarkSampleTimings>>> = {
    SCENE_SETUP: "sceneSetupCpuMs",
    RENDERER_INIT: "rendererInitWallMs",
    GEOMETRY_SELECT: "geometrySelectCpuMs",
    GEOMETRY_CREATE: "geometryCreateCpuMs",
    GEOMETRY_MERGE: "geometryMergeCpuMs",
    GEOMETRY_FINALIZE: "geometryFinalizeCpuMs",
    RENDER_SUBMIT: "firstRenderSubmitCpuMs",
  };
  return names[stage] ?? null;
}

function interruptionFromSignal(signal: AbortSignal): BenchmarkStopReason {
  if (signal.reason === "ROUTE_EXIT") return "ROUTE_EXIT";
  if (signal.reason === "AUTHORIZATION_LOST") return "AUTHORIZATION_LOST";
  return "CANCELLED_BY_OPERATOR";
}

function environmentChange(
  baseline: BenchmarkEnvironmentObservation,
  current: BenchmarkEnvironmentObservation,
): BenchmarkStopReason | null {
  if (!current.pageVisible) return "PAGE_HIDDEN";
  if (
    current.cssViewportWidth !== baseline.cssViewportWidth ||
    current.cssViewportHeight !== baseline.cssViewportHeight
  ) {
    return "CSS_VIEWPORT_CHANGED";
  }
  if (current.devicePixelRatio !== baseline.devicePixelRatio) {
    return "DEVICE_PIXEL_RATIO_CHANGED";
  }
  return null;
}

function sessionInterruption(
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
): BenchmarkStopReason | null {
  if (dependencies.signal.aborted) return interruptionFromSignal(dependencies.signal);
  if (state.sessionStop !== null) return state.sessionStop;
  if (platform.clock.now() - state.startedClock >= BENCHMARK_SESSION_CEILING_MS) {
    return "SESSION_DEADLINE";
  }
  return environmentChange(state.baseline, platform.captureEnvironment(dependencies.root));
}

function assertSessionActive(
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  stageLabel: string,
): void {
  if (stageLabel === "DISPOSE" || stageLabel === "TEARDOWN") return;
  const reason = sessionInterruption(state, dependencies, platform);
  if (reason !== null) throw new BenchmarkInterruption(reason, "SESSION");
}

function rendererStage(stageLabel: string): RendererBenchmarkStage | null {
  for (const stage of RENDERER_BENCHMARK_STAGES) {
    if (stage === stageLabel) return stage;
  }
  return null;
}

function assertCandidateWithinLogicalReadyCeiling(
  sample: MutableSampleState,
  platform: BenchmarkRunnerPlatform,
  stageLabel: string,
): number | null {
  if (
    stageLabel === "DISPOSE" ||
    stageLabel === "TEARDOWN" ||
    sample.logicalReadyStarted === null ||
    sample.logicallyReady
  ) {
    return null;
  }
  const elapsed = platform.clock.now() - sample.logicalReadyStarted;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new BenchmarkInterruption("INSTRUMENTATION_FAILURE", "SESSION");
  }
  if (elapsed >= BENCHMARK_LOGICAL_READY_CEILING_MS) {
    throw new BenchmarkInterruption("LOGICAL_READY_CEILING", "PROFILE");
  }
  return elapsed;
}

function assertNoBackendFailure(sample: MutableSampleState): void {
  if (sample.backendFailure !== null) {
    throw new BenchmarkInterruption("BACKEND_PROFILE_FAILURE", "PROFILE");
  }
}

function applyRendererObservation(
  requestedBackend: RequestedRendererBackend,
  observation: RendererBenchmarkBackendObservation,
  state: MutableSessionState,
): void {
  const actual = enforceRendererBenchmarkBackendRequest(
    requestedBackend,
    observation,
    requestedBackend === "AUTO" ? state.autoBackend : null,
  );
  if (state.drawingBufferWidth === 0) {
    state.drawingBufferWidth = observation.drawingBufferWidth;
    state.drawingBufferHeight = observation.drawingBufferHeight;
    state.rendererPixelRatio = observation.rendererPixelRatio;
  } else {
    if (
      observation.drawingBufferWidth !== state.drawingBufferWidth ||
      observation.drawingBufferHeight !== state.drawingBufferHeight
    ) {
      throw new BenchmarkInterruption("DRAWING_BUFFER_CHANGED", "SESSION");
    }
    if (observation.rendererPixelRatio !== state.rendererPixelRatio) {
      throw new BenchmarkInterruption("RENDERER_PIXEL_RATIO_CHANGED", "SESSION");
    }
  }
  if (requestedBackend === "AUTO" && state.autoBackend === null) state.autoBackend = actual;
}

function normalizeSampleFailure(
  error: unknown,
  lastStage: RendererBenchmarkStage | null,
): BenchmarkInterruption {
  if (error instanceof BenchmarkInterruption) return error;
  if (error instanceof BenchmarkSynchronousStageCeilingError) {
    return new BenchmarkInterruption("SYNC_STAGE_CEILING", "PROFILE");
  }
  if (error instanceof Error && error.message === "FORCED_BACKEND_MISMATCH") {
    return new BenchmarkInterruption("FORCED_BACKEND_MISMATCH", "PROFILE");
  }
  if (error instanceof Error && error.message === "AUTO_BACKEND_DRIFT") {
    return new BenchmarkInterruption("AUTO_BACKEND_DRIFT", "PROFILE");
  }
  if (lastStage === "RENDERER_INIT") {
    return new BenchmarkInterruption("RENDERER_INIT_FAILURE", "PROFILE");
  }
  if (lastStage === "RENDER_SUBMIT") {
    return new BenchmarkInterruption("RENDER_SUBMIT_FAILURE", "PROFILE");
  }
  return new BenchmarkInterruption("BACKEND_PROFILE_FAILURE", "PROFILE");
}

function statusFor(reason: BenchmarkStopReason): BenchmarkSampleStatus {
  return benchmarkTerminalOutcome(reason);
}

function createSampleObserver(
  sample: MutableSampleState,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
): BenchmarkAggregateStageObserver {
  return createBenchmarkAggregateStageObserver({
    clock: platform.clock,
    beforeNextOwnedStage: (stageLabel) => {
      sample.lastStage = rendererStage(stageLabel);
      assertSessionActive(state, dependencies, platform, stageLabel);
      if (stageLabel !== "DISPOSE") assertNoBackendFailure(sample);
      assertCandidateWithinLogicalReadyCeiling(sample, platform, stageLabel);
    },
    onStage: (stage) => {
      const timingName = stageTimingName(stage.stage);
      if (timingName !== null) sample.timings[timingName] = stage.durationMs;
    },
  });
}

function measureSampleCpu<T>(
  name: keyof BenchmarkSampleTimings,
  task: () => T,
  sample: MutableSampleState,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
): T {
  try {
    const measured = measureBenchmarkSynchronousCpu({
      clock: platform.clock,
      beforeNextOwnedStage: (stageLabel) =>
        assertSessionActive(state, dependencies, platform, stageLabel),
    }, name, task);
    sample.timings[name] = measured.durationMs;
    return measured.value;
  } catch (error) {
    if (error instanceof BenchmarkSynchronousStageCeilingError) {
      sample.timings[name] = error.durationMs;
    }
    throw error;
  }
}

async function performSampleWork(
  strandCount: RendererBenchmarkStrandCount,
  requestedBackend: RequestedRendererBackend,
  sample: MutableSampleState,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  createBackend: NonNullable<BenchmarkExecutionDependencies["createBackend"]>,
  observer: BenchmarkAggregateStageObserver,
): Promise<void> {
  state.resources.observers += 1;
  sample.removeEnvironmentObserver = platform.observeEnvironment(dependencies.root, (reason) => {
    state.sessionStop ??= reason;
  });
  const candidate = measureSampleCpu(
    "inputConstructionCpuMs",
    () => constructRendererBenchmarkCandidate({ seed: RENDERER_BENCHMARK_SEED, strandCount }),
    sample, state, dependencies, platform,
  );
  const input = measureSampleCpu(
    "inputValidationCpuMs",
    () => validateRendererBenchmarkInput(candidate),
    sample, state, dependencies, platform,
  );
  const candidateHost = platform.createCandidateHost(dependencies.root);
  sample.host = candidateHost;
  state.resources.candidateHosts += 1;
  sample.logicalReadyStarted = platform.clock.now();
  measureSampleCpu(
    "backendConstructionCpuMs",
    () => {
      sample.backend = createBackend(
        candidateHost.element,
        { forceWebGL: requestedBackend === "WEBGL2" },
        {
          onDiagnostics: () => undefined,
          onFailure: (error) => { sample.backendFailure ??= error; },
        },
      );
      state.resources.backends += 1;
      state.resources.canvases += 1;
    },
    sample, state, dependencies, platform,
  );
  const backend = sample.backend;
  if (backend === null) {
    throw new BenchmarkInterruption("INSTRUMENTATION_FAILURE", "SESSION");
  }
  const initialized = await backend.initialize(
    input,
    FIXED_VISUAL_STATE,
    observer,
    (observation) => {
      sample.actualBackend = observation.actualBackend;
      assertSessionActive(state, dependencies, platform, "PRE_GEOMETRY_GUARD");
      assertCandidateWithinLogicalReadyCeiling(
        sample,
        platform,
        "PRE_GEOMETRY_GUARD",
      );
      applyRendererObservation(requestedBackend, observation, state);
    },
  );
  sample.actualBackend = initialized.observation.actualBackend;
  state.resources.geometries = backend.resourceSnapshot().geometries;
  assertSessionActive(state, dependencies, platform, "CANDIDATE_REVEAL");
  assertNoBackendFailure(sample);
  const preRevealElapsed = assertCandidateWithinLogicalReadyCeiling(
    sample,
    platform,
    "CANDIDATE_REVEAL",
  );
  if (preRevealElapsed === null || sample.logicalReadyStarted === null) {
    throw new BenchmarkInterruption("INSTRUMENTATION_FAILURE", "SESSION");
  }
  candidateHost.reveal();
  state.resources.candidateHosts -= 1;
  state.resources.activeHosts += 1;
  sample.logicallyReady = true;
  const logicalReadyElapsed = platform.clock.now() - sample.logicalReadyStarted;
  sample.timings.candidateToLogicalReadyMs = logicalReadyElapsed;
  if (!Number.isFinite(logicalReadyElapsed) || logicalReadyElapsed < 0) {
    throw new BenchmarkInterruption("INSTRUMENTATION_FAILURE", "SESSION");
  }
  if (logicalReadyElapsed >= BENCHMARK_LOGICAL_READY_CEILING_MS) {
    throw new BenchmarkInterruption("LOGICAL_READY_CEILING", "PROFILE");
  }
}

function releaseSampleBackend(
  sample: MutableSampleState,
  state: MutableSessionState,
  observer: BenchmarkAggregateStageObserver,
): void {
  if (sample.backend === null) return;
  let ceilingError: BenchmarkSynchronousStageCeilingError | null = null;
  try {
    sample.backend.dispose(observer);
  } catch (error) {
    if (!(error instanceof BenchmarkSynchronousStageCeilingError)) throw error;
    ceilingError = error;
  }
  let snapshot: ReturnType<RendererBenchmarkBackend["resourceSnapshot"]>;
  try {
    snapshot = sample.backend.resourceSnapshot();
  } catch (error) {
    throw new Error("Renderer benchmark cleanup snapshot failed.", { cause: error });
  }
  state.resources.backends = snapshot.backends;
  state.resources.canvases = snapshot.canvases;
  state.resources.geometries = snapshot.geometries;
  if (ceilingError !== null) throw ceilingError;
}

function releaseSampleHost(sample: MutableSampleState, state: MutableSessionState): void {
  if (sample.host === null) return;
  sample.host.remove();
  if (state.resources.candidateHosts > 0) state.resources.candidateHosts -= 1;
  if (state.resources.activeHosts > 0) state.resources.activeHosts -= 1;
}

function releaseSampleEnvironment(sample: MutableSampleState, state: MutableSessionState): void {
  if (sample.removeEnvironmentObserver === null) return;
  sample.removeEnvironmentObserver();
  state.resources.observers -= 1;
}

function teardownSample(
  sample: MutableSampleState,
  state: MutableSessionState,
  observer: BenchmarkAggregateStageObserver,
  platform: BenchmarkRunnerPlatform,
): void {
  const teardownStarted = platform.clock.now();
  const attempt = (cleanup: () => void): void => {
    try {
      cleanup();
    } catch (error) {
      if (error instanceof BenchmarkSynchronousStageCeilingError) {
        sample.failure ??= new BenchmarkInterruption("SYNC_STAGE_CEILING", "PROFILE");
        return;
      }
      sample.failure = new BenchmarkInterruption("CLEANUP_INVARIANT_FAILURE", "SESSION");
    }
  };
  attempt(() => releaseSampleBackend(sample, state, observer));
  attempt(() => releaseSampleHost(sample, state));
  attempt(() => releaseSampleEnvironment(sample, state));
  sample.timings.teardownCpuMs = platform.clock.now() - teardownStarted;
  if (sample.timings.teardownCpuMs >= BENCHMARK_SYNC_STAGE_CEILING_MS && sample.failure === null) {
    sample.failure = new BenchmarkInterruption("SYNC_STAGE_CEILING", "PROFILE");
  }
  if (cleanupOutcome(state.resources).status !== "ZERO") {
    sample.failure = new BenchmarkInterruption("CLEANUP_INVARIANT_FAILURE", "SESSION");
  }
}

function recordSampleStop(sample: MutableSampleState, state: MutableSessionState): void {
  if (sample.failure === null) return;
  if (sample.failure.scope === "SESSION") {
    state.sessionStop ??= sample.failure.reason;
  } else {
    state.firstProfileStop ??= sample.failure.reason;
  }
}

async function runSample(
  ordinal: number,
  strandCount: RendererBenchmarkStrandCount,
  requestedBackend: RequestedRendererBackend,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  createBackend: NonNullable<BenchmarkExecutionDependencies["createBackend"]>,
): Promise<SampleExecution> {
  const sample: MutableSampleState = {
    timings: { ...emptyTimings() },
    actualBackend: null,
    backend: null,
    host: null,
    removeEnvironmentObserver: null,
    failure: null,
    backendFailure: null,
    lastStage: null,
    logicalReadyStarted: null,
    logicallyReady: false,
  };
  const sampleStarted = platform.clock.now();
  const observer = createSampleObserver(sample, state, dependencies, platform);
  try {
    await performSampleWork(
      strandCount, requestedBackend, sample, state, dependencies, platform,
      createBackend, observer,
    );
  } catch (error) {
    sample.failure = normalizeSampleFailure(error, sample.lastStage);
  }
  teardownSample(sample, state, observer, platform);
  sample.timings.totalSampleWallMs = platform.clock.now() - sampleStarted;
  recordSampleStop(sample, state);
  const stopReason = sample.failure?.reason ?? "NONE";
  const status = sample.failure === null ? "VALID" : statusFor(sample.failure.reason);
  return {
    sample: {
      ordinal,
      status,
      actualBackend: sample.actualBackend,
      timings: sample.timings,
      cleanupOutcome: cleanupOutcome(state.resources),
      stopReason,
    },
    actualBackend: sample.actualBackend,
    profileStop: sample.failure?.scope === "PROFILE",
    sessionStop: sample.failure?.scope === "SESSION",
  };
}

function warmupStatus(sample: BenchmarkMeasuredSample): BenchmarkWarmupStatus {
  if (sample.status === "VALID") return "VALID";
  if (sample.status === "CANCELLED") return "CANCELLED";
  if (sample.status === "INVALIDATED") return "INVALIDATED";
  if (sample.status === "FAILED") return "FAILED";
  return "STOPPED";
}

function cellOutcome(sample: BenchmarkMeasuredSample): BenchmarkCellOutcome {
  if (sample.status === "CANCELLED") return "CANCELLED";
  if (sample.status === "INVALIDATED") return "INVALIDATED";
  if (sample.status === "FAILED") return "FAILED";
  return "STOPPED";
}

async function quietBoundary(
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
): Promise<void> {
  try {
    await waitForBenchmarkAnimationFrame(
      dependencies.signal,
      (delta) => { state.resources.animationFrames += delta; },
      platform.animationFrames,
    );
  } catch {
    if (dependencies.signal.aborted) {
      throw new BenchmarkInterruption(interruptionFromSignal(dependencies.signal), "SESSION");
    }
    throw new BenchmarkInterruption("INSTRUMENTATION_FAILURE", "SESSION");
  }
}

function stoppedCellFromWarmup(
  strandCount: RendererBenchmarkStrandCount,
  requestedBackend: RequestedRendererBackend,
  execution: SampleExecution,
): BenchmarkCellResult {
  const samples: readonly BenchmarkMeasuredSample[] = [];
  return {
    strandCount,
    pointsPerStrand: 6,
    requestedBackend,
    actualBackend: execution.actualBackend,
    warmupStatus: warmupStatus(execution.sample),
    rawMeasuredSamples: samples,
    metricSummaries: createBenchmarkMetricSummaries(samples),
    cleanupOutcome: execution.sample.cleanupOutcome,
    cellOutcome: cellOutcome(execution.sample),
    cellStopReason: execution.sample.stopReason,
  };
}

function interruptedMeasuredSample(
  ordinal: number,
  actualBackend: ActualRendererBackend | null,
  interruption: BenchmarkInterruption,
  state: MutableSessionState,
): BenchmarkMeasuredSample {
  if (interruption.scope === "SESSION") {
    state.sessionStop ??= interruption.reason;
  } else {
    state.firstProfileStop ??= interruption.reason;
  }
  return {
    ordinal,
    status: statusFor(interruption.reason),
    actualBackend,
    timings: emptyTimings(),
    cleanupOutcome: cleanupOutcome(state.resources),
    stopReason: interruption.reason,
  };
}

interface MeasuredCellCollection {
  readonly samples: readonly BenchmarkMeasuredSample[];
  readonly actualBackend: ActualRendererBackend | null;
}

async function collectMeasuredCellSamples(
  strandCount: RendererBenchmarkStrandCount,
  requestedBackend: RequestedRendererBackend,
  measuredSamplesPerCell: number,
  initialBackend: ActualRendererBackend | null,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  createBackend: NonNullable<BenchmarkExecutionDependencies["createBackend"]>,
): Promise<MeasuredCellCollection> {
  const samples: BenchmarkMeasuredSample[] = [];
  let actualBackend = initialBackend;
  for (let ordinal = 1; ordinal <= measuredSamplesPerCell; ordinal += 1) {
    try {
      await quietBoundary(state, dependencies, platform);
    } catch (error) {
      const interruption = normalizeSampleFailure(error, null);
      samples.push(interruptedMeasuredSample(ordinal, actualBackend, interruption, state));
      break;
    }
    const execution = await runSample(
      ordinal, strandCount, requestedBackend, state, dependencies, platform, createBackend,
    );
    samples.push(execution.sample);
    actualBackend ??= execution.actualBackend;
    if (execution.sample.status !== "VALID") break;
  }
  return { samples, actualBackend };
}

function measuredCellOutcome(
  samples: readonly BenchmarkMeasuredSample[],
  required: number,
): { readonly outcome: BenchmarkCellOutcome; readonly stopReason: BenchmarkStopReason } {
  const complete = samples.length === required &&
    samples.every((sample) => sample.status === "VALID");
  if (complete) return { outcome: "COMPLETE", stopReason: "NONE" };
  const stopped = samples.at(-1);
  if (stopped === undefined) {
    return { outcome: "STOPPED", stopReason: "BACKEND_PROFILE_FAILURE" };
  }
  return { outcome: cellOutcome(stopped), stopReason: stopped.stopReason };
}

async function runCell(
  strandCount: RendererBenchmarkStrandCount,
  requestedBackend: RequestedRendererBackend,
  configuration: BenchmarkSessionConfiguration,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  createBackend: NonNullable<BenchmarkExecutionDependencies["createBackend"]>,
): Promise<BenchmarkCellResult> {
  const warmupExecution = await runSample(
    0,
    strandCount,
    requestedBackend,
    state,
    dependencies,
    platform,
    createBackend,
  );
  if (warmupExecution.sample.status !== "VALID") {
    return stoppedCellFromWarmup(strandCount, requestedBackend, warmupExecution);
  }
  const collected = await collectMeasuredCellSamples(
    strandCount, requestedBackend, configuration.measuredSamplesPerCell,
    warmupExecution.actualBackend, state, dependencies, platform, createBackend,
  );
  const final = measuredCellOutcome(collected.samples, configuration.measuredSamplesPerCell);
  const finalCleanup = collected.samples.at(-1)?.cleanupOutcome ?? warmupExecution.sample.cleanupOutcome;
  return {
    strandCount,
    pointsPerStrand: 6,
    requestedBackend,
    actualBackend: collected.actualBackend,
    warmupStatus: "VALID",
    rawMeasuredSamples: collected.samples,
    metricSummaries: createBenchmarkMetricSummaries(collected.samples),
    cleanupOutcome: finalCleanup,
    cellOutcome: final.outcome,
    cellStopReason: final.stopReason,
  };
}

function buildEnvironment(
  request: BenchmarkExecutionRequest,
  state: MutableSessionState,
  endedAt: string,
): BenchmarkEnvironment {
  return {
    rawUserAgent: state.baseline.rawUserAgent,
    ...request.operator,
    cssViewportWidth: state.baseline.cssViewportWidth,
    cssViewportHeight: state.baseline.cssViewportHeight,
    drawingBufferWidth: state.drawingBufferWidth,
    drawingBufferHeight: state.drawingBufferHeight,
    devicePixelRatio: state.baseline.devicePixelRatio,
    rendererPixelRatio: state.rendererPixelRatio,
    startedAt: state.startedAt,
    endedAt,
  };
}

function runOutcome(reason: BenchmarkStopReason | null): BenchmarkRunOutcome {
  if (reason === null) return "COMPLETE";
  return benchmarkTerminalOutcome(reason);
}

function validateRequest(request: BenchmarkExecutionRequest): void {
  if (request.runKind !== "CHARACTERIZATION" && request.runKind !== "VERIFICATION_SMOKE") {
    throw new Error("runKind is unsupported.");
  }
  validateRendererBenchmarkSeed(request.seed);
  if (!Number.isSafeInteger(request.operator.browserMajor) || request.operator.browserMajor < 0) {
    throw new Error("operator.browserMajor must be a nonnegative integer.");
  }
}

function startSessionState(
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
): MutableSessionState {
  const baseline = platform.captureEnvironment(dependencies.root);
  if (!baseline.pageVisible) throw new Error("PAGE_HIDDEN");
  if (baseline.cssViewportWidth !== 800 || baseline.cssViewportHeight !== 600) {
    throw new Error("CSS_VIEWPORT_CHANGED");
  }
  return {
    baseline,
    startedClock: platform.clock.now(),
    startedAt: platform.nowDate().toISOString(),
    resources: emptyResources(),
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
    rendererPixelRatio: 0,
    autoBackend: null,
    sessionStop: null,
    firstProfileStop: null,
  };
}

interface ScheduledCell {
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly requestedBackend: RequestedRendererBackend;
}

function scheduledCells(configuration: BenchmarkSessionConfiguration): readonly ScheduledCell[] {
  return configuration.profileOrderByLevel.flatMap((level) =>
    level.requestedBackends.map((requestedBackend) => ({
      strandCount: level.strandCount,
      requestedBackend,
    })),
  );
}

async function executeScheduledCells(
  configuration: BenchmarkSessionConfiguration,
  state: MutableSessionState,
  dependencies: BenchmarkExecutionDependencies,
  platform: BenchmarkRunnerPlatform,
  createBackend: NonNullable<BenchmarkExecutionDependencies["createBackend"]>,
): Promise<readonly BenchmarkCellResult[]> {
  const cells: BenchmarkCellResult[] = [];
  const activeProfiles = new Map<RequestedRendererBackend, boolean>([
    ["AUTO", true],
    ["WEBGL2", true],
  ]);
  for (const scheduled of scheduledCells(configuration)) {
    if (state.sessionStop !== null) break;
    if (activeProfiles.get(scheduled.requestedBackend) !== true) continue;
    try {
      const cell = await runCell(
        scheduled.strandCount, scheduled.requestedBackend, configuration,
        state, dependencies, platform, createBackend,
      );
      cells.push(cell);
      if (cell.cellOutcome !== "COMPLETE") {
        activeProfiles.set(scheduled.requestedBackend, false);
      }
    } catch (error) {
      const interruption = normalizeSampleFailure(error, null);
      if (interruption.scope === "SESSION") {
        state.sessionStop ??= interruption.reason;
      } else {
        state.firstProfileStop ??= interruption.reason;
      }
      activeProfiles.set(scheduled.requestedBackend, false);
    }
  }
  return cells;
}

function resultWarnings(
  request: BenchmarkExecutionRequest,
  state: MutableSessionState,
): readonly BenchmarkWarning[] {
  const warnings: BenchmarkWarning[] = request.runKind === "VERIFICATION_SMOKE"
    ? ["NON_DECISION_BEARING"]
    : [];
  if (state.autoBackend !== "WEBGPU") warnings.push("AUTO_DID_NOT_SELECT_WEBGPU");
  return warnings;
}

function buildRunResult(
  request: BenchmarkExecutionRequest,
  source: BenchmarkSourceProvenance,
  configuration: BenchmarkSessionConfiguration,
  cells: readonly BenchmarkCellResult[],
  state: MutableSessionState,
  platform: BenchmarkRunnerPlatform,
): RendererBenchmarkResult {
  const completed = cells.length === scheduledCells(configuration).length &&
    cells.every((cell) => cell.cellOutcome === "COMPLETE");
  const stopReason = completed
    ? "NONE"
    : state.sessionStop ?? state.firstProfileStop ?? "BACKEND_PROFILE_FAILURE";
  return {
    schema: RENDERER_BENCHMARK_RESULT_SCHEMA,
    version: 2,
    measurementContract: RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
    classification: "BENCHMARK_ONLY",
    source,
    environment: buildEnvironment(request, state, platform.nowDate().toISOString()),
    sessionConfiguration: configuration,
    cells,
    outcome: completed ? "COMPLETE" : runOutcome(stopReason),
    stopReason,
    warnings: resultWarnings(request, state),
  };
}

export async function executeRendererBenchmark(
  request: BenchmarkExecutionRequest,
  dependencies: BenchmarkExecutionDependencies,
): Promise<RendererBenchmarkResult> {
  validateRequest(request);
  const provenance = await dependencies.readProvenance(request.seed);
  if (!provenance.success) throw new Error("AUTHORIZATION_LOST");
  if (request.runKind === "CHARACTERIZATION" && provenance.source.treeState !== "CLEAN") {
    throw new Error("SOURCE_TREE_DIRTY");
  }
  if (request.runKind === "CHARACTERIZATION" && !provenance.currentMain) {
    throw new Error("SOURCE_NOT_CURRENT_MAIN");
  }

  const platform = dependencies.platform ?? browserPlatform();
  const createBackend = dependencies.createBackend ?? createBrowserRendererBackend;
  const state = startSessionState(dependencies, platform);
  const configuration = benchmarkSessionConfiguration(request.runKind);
  const cells = await executeScheduledCells(
    configuration, state, dependencies, platform, createBackend,
  );
  const result = buildRunResult(
    request, provenance.source, configuration, cells, state, platform,
  );
  return validateRendererBenchmarkResult(result);
}
