export const BENCHMARK_SYNC_STAGE_CEILING_MS = 1000;
export const BENCHMARK_LOGICAL_READY_CEILING_MS = 3000;
export const BENCHMARK_SESSION_CEILING_MS = 900_000;

export const RENDERER_BENCHMARK_STAGES = [
  "SCENE_SETUP",
  "RENDERER_INIT",
  "GEOMETRY_SELECT",
  "GEOMETRY_CREATE",
  "GEOMETRY_MERGE",
  "GEOMETRY_FINALIZE",
  "RENDER_SUBMIT",
  "DISPOSE",
] as const;

export type RendererBenchmarkStage = (typeof RENDERER_BENCHMARK_STAGES)[number];

export interface BenchmarkMonotonicClock {
  now(): number;
}

export interface BenchmarkStageObservation {
  readonly stage: RendererBenchmarkStage;
  readonly durationMs: number;
  readonly measurement: "SYNCHRONOUS_CPU" | "AWAITED_WALL";
}

export type BenchmarkStageObservationListener = (
  observation: BenchmarkStageObservation,
) => void;

export class BenchmarkSynchronousStageCeilingError extends Error {
  constructor(
    readonly stageLabel: string,
    readonly durationMs: number,
  ) {
    super(`${stageLabel} reached the synchronous stage ceiling.`);
    this.name = "BenchmarkSynchronousStageCeilingError";
  }
}

export interface BenchmarkAggregateStageObserver {
  measureSynchronous<T>(stage: RendererBenchmarkStage, task: () => T): T;
  measureAwaited<T>(stage: "RENDERER_INIT", task: () => Promise<T>): Promise<T>;
}

export interface BenchmarkMeasurementOptions {
  readonly clock: BenchmarkMonotonicClock;
  readonly beforeNextOwnedStage: (stageLabel: string) => void;
  readonly onStage?: BenchmarkStageObservationListener;
  readonly synchronousCeilingMs?: number;
}

function duration(clock: BenchmarkMonotonicClock, startedAt: number): number {
  const measured = clock.now() - startedAt;
  if (!Number.isFinite(measured) || measured < 0) {
    throw new Error("Benchmark monotonic clock produced an invalid duration.");
  }
  return measured;
}

export function measureBenchmarkSynchronousCpu<T>(
  options: BenchmarkMeasurementOptions,
  stageLabel: string,
  task: () => T,
): { readonly value: T; readonly durationMs: number } {
  options.beforeNextOwnedStage(stageLabel);
  const startedAt = options.clock.now();
  const value = task();
  const durationMs = duration(options.clock, startedAt);
  if (durationMs >= (options.synchronousCeilingMs ?? BENCHMARK_SYNC_STAGE_CEILING_MS)) {
    throw new BenchmarkSynchronousStageCeilingError(stageLabel, durationMs);
  }
  return { value, durationMs };
}

export async function measureBenchmarkAwaitedWall<T>(
  options: Pick<BenchmarkMeasurementOptions, "clock" | "beforeNextOwnedStage">,
  stageLabel: string,
  task: () => Promise<T>,
): Promise<{ readonly value: T; readonly durationMs: number }> {
  options.beforeNextOwnedStage(stageLabel);
  const startedAt = options.clock.now();
  const value = await task();
  return { value, durationMs: duration(options.clock, startedAt) };
}

export function createBenchmarkAggregateStageObserver(
  options: BenchmarkMeasurementOptions,
): BenchmarkAggregateStageObserver {
  return {
    measureSynchronous(stage, task) {
      options.beforeNextOwnedStage(stage);
      const startedAt = options.clock.now();
      const value = task();
      const durationMs = duration(options.clock, startedAt);
      options.onStage?.({
        stage,
        durationMs,
        measurement: "SYNCHRONOUS_CPU",
      });
      if (durationMs >= (options.synchronousCeilingMs ?? BENCHMARK_SYNC_STAGE_CEILING_MS)) {
        throw new BenchmarkSynchronousStageCeilingError(stage, durationMs);
      }
      return value;
    },
    async measureAwaited(stage, task) {
      options.beforeNextOwnedStage(stage);
      const startedAt = options.clock.now();
      const value = await task();
      const durationMs = duration(options.clock, startedAt);
      options.onStage?.({
        stage,
        durationMs,
        measurement: "AWAITED_WALL",
      });
      return value;
    },
  };
}

export interface BenchmarkAnimationFrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(typeof signal.reason === "string" ? signal.reason : "Benchmark frame aborted.");
}

function animationFrameRequestError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error("Benchmark animation-frame request failed.", { cause: value });
}

const browserAnimationFrameScheduler: BenchmarkAnimationFrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function waitForBenchmarkAnimationFrame(
  signal: AbortSignal,
  onOwnedAnimationFramesChange: (delta: 1 | -1) => void,
  scheduler: BenchmarkAnimationFrameScheduler = browserAnimationFrameScheduler,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let handle: number | null = null;
    let callbackRan = false;
    let requestFinished = false;
    const release = (): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      onOwnedAnimationFramesChange(-1);
    };
    const abort = (): void => {
      if (handle !== null) scheduler.cancel(handle);
      release();
      reject(abortError(signal));
    };
    onOwnedAnimationFramesChange(1);
    signal.addEventListener("abort", abort, { once: true });
    let requestedHandle: number;
    try {
      requestedHandle = scheduler.request(() => {
        callbackRan = true;
        if (!requestFinished) return;
        handle = null;
        release();
        resolve();
      });
    } catch (error) {
      requestFinished = true;
      release();
      reject(animationFrameRequestError(error));
      return;
    }
    handle = requestedHandle;
    requestFinished = true;
    if (callbackRan && !settled) {
      handle = null;
      release();
      resolve();
      return;
    }
    if (settled && !callbackRan) scheduler.cancel(requestedHandle);
  });
}
