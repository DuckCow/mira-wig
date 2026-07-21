import { describe, expect, it, vi } from "vitest";
import {
  createRefundExecutionWorkerHostLifecycle,
  REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS,
  REFUND_EXECUTION_WORKER_EXTERNAL_HARD_DEADLINE_MS,
  type RefundExecutionWorkerHostSignal,
  type RefundExecutionWorkerLifecycleRuntime,
} from "../worker-host-lifecycle";

describe("refund execution worker host lifecycle", () => {
  it("registers one exact cooperative budget and first-reason-wins signal drain", () => {
    const fixture = lifecycleFixture();
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    expect(fixture.timerDelays).toEqual([REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS]);
    expect(REFUND_EXECUTION_WORKER_EXTERNAL_HARD_DEADLINE_MS).toBe(150_000);
    expect(fixture.listenerCount("SIGTERM")).toBe(1);
    expect(fixture.listenerCount("SIGINT")).toBe(1);
    expect(lifecycle.shouldStop()).toBe(false);
    expect(lifecycle.drainReason()).toBeNull();

    fixture.emit("SIGTERM");
    fixture.fireTimer();
    fixture.emit("SIGINT");

    expect(lifecycle.shouldStop()).toBe(true);
    expect(lifecycle.drainReason()).toBe("SIGNAL");
  });

  it("preserves a budget request when a signal arrives later", () => {
    const fixture = lifecycleFixture();
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    fixture.fireTimer();
    fixture.emit("SIGTERM");

    expect(lifecycle.shouldStop()).toBe(true);
    expect(lifecycle.drainReason()).toBe("BUDGET");
  });

  it.each(["SIGTERM", "SIGINT"] as const)(
    "stores one SIGNAL reason and treats repeated %s requests idempotently",
    (signal) => {
      const fixture = lifecycleFixture();
      const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

      fixture.emit(signal);
      fixture.emit(signal);

      expect(lifecycle.shouldStop()).toBe(true);
      expect(typeof lifecycle.shouldStop()).toBe("boolean");
      expect(lifecycle.drainReason()).toBe("SIGNAL");
      expect(Reflect.ownKeys(lifecycle)).toEqual(["shouldStop", "drainReason", "dispose"]);
    },
  );

  it("keeps SIGNAL when the budget fires later", () => {
    const fixture = lifecycleFixture();
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    fixture.emit("SIGINT");
    fixture.fireTimer();

    expect(lifecycle.shouldStop()).toBe(true);
    expect(lifecycle.drainReason()).toBe("SIGNAL");
  });

  it("clears the timer and both listeners exactly once on idempotent disposal", () => {
    const fixture = lifecycleFixture();
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    lifecycle.dispose();
    lifecycle.dispose();
    fixture.fireTimer();

    expect(fixture.clearTimer).toHaveBeenCalledTimes(1);
    expect(fixture.removedSignals).toEqual(["SIGINT", "SIGTERM"]);
    expect(fixture.listenerCount("SIGTERM")).toBe(0);
    expect(fixture.listenerCount("SIGINT")).toBe(0);
    expect(lifecycle.shouldStop()).toBe(false);
    expect(lifecycle.drainReason()).toBeNull();
  });

  it("disposes after a drain without changing the stored reason or accepting later requests", () => {
    const fixture = lifecycleFixture();
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    fixture.fireTimer();
    lifecycle.dispose();
    fixture.emit("SIGTERM");

    expect(lifecycle.shouldStop()).toBe(true);
    expect(lifecycle.drainReason()).toBe("BUDGET");
    expect(fixture.clearTimer).toHaveBeenCalledTimes(1);
    expect(fixture.removedSignals).toEqual(["SIGINT", "SIGTERM"]);
  });

  it("rolls back partial registration and exposes only a bounded registration failure", () => {
    const fixture = lifecycleFixture({ failAdd: "SIGINT" });

    expect(() => createRefundExecutionWorkerHostLifecycle(fixture.runtime))
      .toThrow("REFUND_WORKER_LIFECYCLE_REGISTRATION_FAILED");
    expect(fixture.clearTimer).toHaveBeenCalledTimes(1);
    expect(fixture.removedSignals).toEqual(["SIGTERM"]);
    expect(fixture.listenerCount("SIGTERM")).toBe(0);
  });

  it("attempts every cleanup resource and bounds a disposal failure", () => {
    const fixture = lifecycleFixture({ failClear: true, failRemove: "SIGINT" });
    const lifecycle = createRefundExecutionWorkerHostLifecycle(fixture.runtime);

    expect(() => lifecycle.dispose()).toThrow("REFUND_WORKER_LIFECYCLE_DISPOSAL_FAILED");
    expect(fixture.clearTimer).toHaveBeenCalledTimes(1);
    expect(fixture.removedSignals).toEqual(["SIGINT", "SIGTERM"]);
    expect(() => lifecycle.dispose()).not.toThrow();
  });
});

type TimerToken = Readonly<{ id: "cooperative-budget" }>;
type FixtureOptions = Readonly<{
  failAdd?: RefundExecutionWorkerHostSignal;
  failRemove?: RefundExecutionWorkerHostSignal;
  failClear?: boolean;
}>;

function lifecycleFixture(options: FixtureOptions = Object.freeze({})) {
  const listeners = new Map<RefundExecutionWorkerHostSignal, Set<() => void>>();
  const timerDelays: number[] = [];
  const removedSignals: RefundExecutionWorkerHostSignal[] = [];
  let timerListener: (() => void) | null = null;
  const clearTimer = vi.fn(() => {
    timerListener = null;
    if (options.failClear) throw new Error("TEST_CLEAR_SECRET");
  });
  const runtime: RefundExecutionWorkerLifecycleRuntime<TimerToken> = Object.freeze({
    addSignalListener: (signal, listener) => {
      if (options.failAdd === signal) throw new Error("TEST_ADD_SECRET");
      const signalListeners = listeners.get(signal) ?? new Set<() => void>();
      signalListeners.add(listener);
      listeners.set(signal, signalListeners);
    },
    removeSignalListener: (signal, listener) => {
      removedSignals.push(signal);
      listeners.get(signal)?.delete(listener);
      if (options.failRemove === signal) throw new Error("TEST_REMOVE_SECRET");
    },
    setTimer: (listener, delayMs) => {
      timerDelays.push(delayMs);
      timerListener = listener;
      return Object.freeze({ id: "cooperative-budget" as const });
    },
    clearTimer,
  });
  return {
    runtime,
    timerDelays,
    removedSignals,
    clearTimer,
    emit: (signal: RefundExecutionWorkerHostSignal) => {
      for (const listener of listeners.get(signal) ?? []) listener();
    },
    fireTimer: () => timerListener?.(),
    listenerCount: (signal: RefundExecutionWorkerHostSignal) => listeners.get(signal)?.size ?? 0,
  };
}
