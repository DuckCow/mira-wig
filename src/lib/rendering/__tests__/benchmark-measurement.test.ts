import { describe, expect, it, vi } from "vitest";
import {
  BENCHMARK_LOGICAL_READY_CEILING_MS,
  BENCHMARK_SESSION_CEILING_MS,
  BENCHMARK_SYNC_STAGE_CEILING_MS,
  BenchmarkSynchronousStageCeilingError,
  createBenchmarkAggregateStageObserver,
  measureBenchmarkAwaitedWall,
  measureBenchmarkSynchronousCpu,
  waitForBenchmarkAnimationFrame,
  type BenchmarkAnimationFrameScheduler,
  type BenchmarkMonotonicClock,
} from "../benchmark-measurement";

class ControlledClock implements BenchmarkMonotonicClock {
  constructor(private readonly values: number[]) {}
  now(): number {
    const value = this.values.shift();
    if (value === undefined) throw new Error("Missing clock value.");
    return value;
  }
}

class ControlledFrameScheduler implements BenchmarkAnimationFrameScheduler {
  private callback: (() => void) | null = null;
  readonly cancel = vi.fn();
  request(callback: () => void): number {
    this.callback = callback;
    return 41;
  }
  flush(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
  }
}

describe("minimal benchmark measurement layer", () => {
  it("publishes only the three frozen v0.3 ceilings", () => {
    expect(BENCHMARK_SYNC_STAGE_CEILING_MS).toBe(1000);
    expect(BENCHMARK_LOGICAL_READY_CEILING_MS).toBe(3000);
    expect(BENCHMARK_SESSION_CEILING_MS).toBe(900000);
  });

  it("measures synchronous CPU and awaited wall with an injected monotonic clock", async () => {
    const before = vi.fn();
    const synchronous = measureBenchmarkSynchronousCpu({
      clock: new ControlledClock([10, 24]),
      beforeNextOwnedStage: before,
    }, "INPUT_CONSTRUCTION", () => "value");
    const awaited = await measureBenchmarkAwaitedWall({
      clock: new ControlledClock([30, 47]),
      beforeNextOwnedStage: before,
    }, "PROVENANCE", () => Promise.resolve("source"));

    expect(synchronous).toEqual({ value: "value", durationMs: 14 });
    expect(awaited).toEqual({ value: "source", durationMs: 17 });
    expect(before.mock.calls).toEqual([["INPUT_CONSTRUCTION"], ["PROVENANCE"]]);
  });

  it("observes aggregate stages and stops before the next stage after a ceiling", () => {
    const observations: string[] = [];
    let blocked = false;
    const observer = createBenchmarkAggregateStageObserver({
      clock: new ControlledClock([0, 1000]),
      beforeNextOwnedStage: (stage) => {
        if (blocked) throw new Error(`blocked:${stage}`);
      },
      onStage: ({ stage }) => {
        observations.push(stage);
        blocked = true;
      },
    });

    expect(() => observer.measureSynchronous("GEOMETRY_CREATE", () => undefined)).toThrow(
      BenchmarkSynchronousStageCeilingError,
    );
    expect(() => observer.measureSynchronous("GEOMETRY_MERGE", () => undefined)).toThrow(
      "blocked:GEOMETRY_MERGE",
    );
    expect(observations).toEqual(["GEOMETRY_CREATE"]);
  });

  it("owns exactly one abortable animation frame and accounts cleanup", async () => {
    const scheduler = new ControlledFrameScheduler();
    const changes: number[] = [];
    const controller = new AbortController();
    const pending = waitForBenchmarkAnimationFrame(
      controller.signal,
      (delta) => changes.push(delta),
      scheduler,
    );
    scheduler.flush();
    await expect(pending).resolves.toBeUndefined();
    expect(changes).toEqual([1, -1]);

    const abortedScheduler = new ControlledFrameScheduler();
    const abortedChanges: number[] = [];
    const abortedController = new AbortController();
    const aborted = waitForBenchmarkAnimationFrame(
      abortedController.signal,
      (delta) => abortedChanges.push(delta),
      abortedScheduler,
    );
    abortedController.abort(new Error("cancelled"));
    await expect(aborted).rejects.toThrow("cancelled");
    expect(abortedScheduler.cancel).toHaveBeenCalledWith(41);
    expect(abortedChanges).toEqual([1, -1]);
  });

  it("releases frame ownership and preserves a synchronous request failure", async () => {
    const failure = new Error("requestAnimationFrame unavailable");
    const changes: number[] = [];
    const controller = new AbortController();
    const cancel = vi.fn();
    const scheduler: BenchmarkAnimationFrameScheduler = {
      request: () => { throw failure; },
      cancel,
    };

    await expect(waitForBenchmarkAnimationFrame(
      controller.signal,
      (delta) => changes.push(delta),
      scheduler,
    )).rejects.toBe(failure);
    expect(changes).toEqual([1, -1]);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("rejects a request failure even if a hostile scheduler invokes the callback first", async () => {
    const failure = new Error("request failed after callback");
    const changes: number[] = [];
    const scheduler: BenchmarkAnimationFrameScheduler = {
      request: (callback) => {
        callback();
        throw failure;
      },
      cancel: () => undefined,
    };

    await expect(waitForBenchmarkAnimationFrame(
      new AbortController().signal,
      (delta) => changes.push(delta),
      scheduler,
    )).rejects.toBe(failure);
    expect(changes).toEqual([1, -1]);
  });
});
