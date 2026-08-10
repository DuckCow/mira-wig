import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeParent: vi.fn(),
  executeS1: vi.fn(),
  parentProvenance: vi.fn(),
  s1Provenance: vi.fn(),
}));

vi.mock("@/lib/rendering/benchmark-runner", () => ({ executeRendererBenchmark: mocks.executeParent }));
vi.mock("@/lib/rendering/benchmark-point-sensitivity-runner", () => ({ executePointSensitivityBenchmark: mocks.executeS1 }));
vi.mock("@/app/admin/render-lab/performance/actions", () => ({ startBenchmarkProvenance: mocks.parentProvenance }));
vi.mock("@/app/admin/render-lab/performance/point-sensitivity-actions", () => ({ startPointSensitivityProvenance: mocks.s1Provenance }));

import {
  RenderPerformanceLab,
  createRenderPerformanceLabCoordinator,
} from "./RenderPerformanceLab";

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === null) throw new Error("Deferred resolve is unavailable.");
      resolvePromise(value);
    },
    reject: (error) => {
      if (rejectPromise === null) throw new Error("Deferred reject is unavailable.");
      rejectPromise(error);
    },
  };
}

async function flushCoordinator(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function callbacks(
  onSuccess: (value: string) => void = () => undefined,
  onStart: () => void = () => undefined,
  onError: (error: unknown) => void = () => undefined,
) {
  return { onStart, onSuccess, onError };
}

describe("RenderPerformanceLab parent/S1 coordinator", () => {
  it("renders distinct parent and S1 controls without executing on render", () => {
    const markup = renderToStaticMarkup(createElement(RenderPerformanceLab));
    expect(markup).toContain("Start Characterization");
    expect(markup).toContain("Run Verification Smoke");
    expect(markup).toContain("Download JSON");
    expect(markup).toContain("Start R2C-A-S1");
    expect(markup).toContain("Download S1 JSON");
    expect(markup).toContain("point/tessellation sensitivity");
    expect(markup).toContain("performance perturbation only");
    expect(mocks.executeParent).not.toHaveBeenCalled();
    expect(mocks.executeS1).not.toHaveBeenCalled();
    expect(mocks.parentProvenance).not.toHaveBeenCalled();
    expect(mocks.s1Provenance).not.toHaveBeenCalled();
  });

  it("rejects S1 while a parent run owns the page", async () => {
    const running: boolean[] = [];
    const parent = deferred<string>();
    const s1 = deferred<string>();
    const parentSignals: AbortSignal[] = [];
    const parentRunner = vi.fn((signal: AbortSignal) => {
      parentSignals.push(signal);
      return parent.promise;
    });
    const s1Runner = vi.fn(() => s1.promise);
    const coordinator = createRenderPerformanceLabCoordinator((value) => running.push(value));

    expect(coordinator.start("PARENT", parentRunner, callbacks())).toBe(true);
    expect(coordinator.start("POINT_SENSITIVITY", s1Runner, callbacks())).toBe(false);
    expect(parentRunner).toHaveBeenCalledOnce();
    expect(s1Runner).not.toHaveBeenCalled();
    expect(parentSignals[0].aborted).toBe(false);
    expect(running).toEqual([true]);

    parent.resolve("parent-result");
    await flushCoordinator();
    expect(running).toEqual([true, false]);
  });

  it("rejects parent and a second S1 while S1 owns the page", async () => {
    const running: boolean[] = [];
    const s1 = deferred<string>();
    const parentRunner = vi.fn(() => Promise.resolve("parent-result"));
    const firstS1Runner = vi.fn(() => s1.promise);
    const secondS1Runner = vi.fn(() => Promise.resolve("second-s1"));
    const coordinator = createRenderPerformanceLabCoordinator((value) => running.push(value));

    expect(coordinator.start("POINT_SENSITIVITY", firstS1Runner, callbacks())).toBe(true);
    expect(coordinator.start("PARENT", parentRunner, callbacks())).toBe(false);
    expect(coordinator.start("POINT_SENSITIVITY", secondS1Runner, callbacks())).toBe(false);
    expect(firstS1Runner).toHaveBeenCalledOnce();
    expect(parentRunner).not.toHaveBeenCalled();
    expect(secondS1Runner).not.toHaveBeenCalled();

    s1.resolve("s1-result");
    await flushCoordinator();
    expect(running).toEqual([true, false]);
  });

  it("cancels only the active owner and admits another run after settlement", async () => {
    const running: boolean[] = [];
    const first = deferred<string>();
    const second = deferred<string>();
    const firstSignals: AbortSignal[] = [];
    const secondSignals: AbortSignal[] = [];
    const coordinator = createRenderPerformanceLabCoordinator((value) => running.push(value));

    expect(coordinator.start("PARENT", (signal) => {
      firstSignals.push(signal);
      return first.promise;
    }, callbacks())).toBe(true);
    coordinator.cancel("CANCELLED_BY_OPERATOR");
    expect(firstSignals[0].aborted).toBe(true);
    expect(firstSignals[0].reason).toBe("CANCELLED_BY_OPERATOR");

    first.reject(new Error("cancelled"));
    await flushCoordinator();
    expect(coordinator.start("POINT_SENSITIVITY", (signal) => {
      secondSignals.push(signal);
      return second.promise;
    }, callbacks())).toBe(true);
    expect(secondSignals[0]).not.toBe(firstSignals[0]);
    expect(secondSignals[0].aborted).toBe(false);

    coordinator.cancel("CANCELLED_BY_OPERATOR");
    expect(secondSignals[0].aborted).toBe(true);
    expect(secondSignals[0].reason).toBe("CANCELLED_BY_OPERATOR");
    expect(firstSignals[0].reason).toBe("CANCELLED_BY_OPERATOR");
    second.reject(new Error("cancelled"));
    await flushCoordinator();
    expect(running).toEqual([true, false, true, false]);
  });

  it("prevents an old page completion from clearing or overwriting a newer owner", async () => {
    const oldRun = deferred<string>();
    const newRun = deferred<string>();
    const blockedRunner = vi.fn(() => Promise.resolve("blocked"));
    const state = { running: false, visibleResult: "initial" };
    const oldSignals: AbortSignal[] = [];
    const newSignals: AbortSignal[] = [];
    const changeRunning = (running: boolean): void => { state.running = running; };
    const coordinator = createRenderPerformanceLabCoordinator(changeRunning);

    expect(coordinator.start("PARENT", (signal) => {
      oldSignals.push(signal);
      return oldRun.promise;
    }, callbacks(
      (value) => { state.visibleResult = value; },
      () => { state.visibleResult = "old-pending"; },
    ))).toBe(true);
    coordinator.dispose();
    expect(oldSignals[0].aborted).toBe(true);
    expect(oldSignals[0].reason).toBe("ROUTE_EXIT");

    coordinator.mount();
    expect(coordinator.start("POINT_SENSITIVITY", (signal) => {
      newSignals.push(signal);
      return newRun.promise;
    }, callbacks(
      (value) => { state.visibleResult = value; },
      () => { state.visibleResult = "new-pending"; },
    ))).toBe(true);
    expect(state).toEqual({ running: true, visibleResult: "new-pending" });

    oldRun.resolve("stale-parent-result");
    await flushCoordinator();
    expect(state).toEqual({ running: true, visibleResult: "new-pending" });
    expect(newSignals[0].aborted).toBe(false);
    expect(coordinator.start("PARENT", blockedRunner, callbacks())).toBe(false);
    expect(blockedRunner).not.toHaveBeenCalled();

    newRun.resolve("new-s1-result");
    await flushCoordinator();
    expect(state).toEqual({ running: false, visibleResult: "new-s1-result" });
  });

  it("aborts on unmount and suppresses pending success and error callbacks", async () => {
    const pending = deferred<string>();
    const success = vi.fn();
    const failure = vi.fn();
    const running: boolean[] = [];
    const signals: AbortSignal[] = [];
    const coordinator = createRenderPerformanceLabCoordinator((value) => running.push(value));

    expect(coordinator.start("POINT_SENSITIVITY", (nextSignal) => {
      signals.push(nextSignal);
      return pending.promise;
    }, callbacks(success, () => undefined, failure))).toBe(true);
    coordinator.dispose();
    expect(signals[0].aborted).toBe(true);
    expect(signals[0].reason).toBe("ROUTE_EXIT");
    expect(coordinator.start(
      "PARENT",
      () => Promise.resolve("late"),
      callbacks(success),
    )).toBe(false);

    pending.resolve("stale-s1-result");
    await flushCoordinator();
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    expect(running).toEqual([true]);
  });
});
