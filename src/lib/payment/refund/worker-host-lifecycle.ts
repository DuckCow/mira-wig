import type { RefundExecutionWorkerCycleControl } from "./worker-contract";

export const REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS = 120_000;
export const REFUND_EXECUTION_WORKER_EXTERNAL_HARD_DEADLINE_MS = 150_000;

export type RefundExecutionWorkerDrainReason = "SIGNAL" | "BUDGET";
export type RefundExecutionWorkerHostSignal = "SIGTERM" | "SIGINT";

export type RefundExecutionWorkerHostLifecycle = RefundExecutionWorkerCycleControl & Readonly<{
  drainReason(): RefundExecutionWorkerDrainReason | null;
  dispose(): void;
}>;

export type { RefundExecutionWorkerCycleControl } from "./worker-contract";

export type RefundExecutionWorkerLifecycleRuntime<TimerHandle> = Readonly<{
  addSignalListener(signal: RefundExecutionWorkerHostSignal, listener: () => void): void;
  removeSignalListener(signal: RefundExecutionWorkerHostSignal, listener: () => void): void;
  setTimer(listener: () => void, delayMs: number): TimerHandle;
  clearTimer(timer: TimerHandle): void;
}>;

const SIGNALS = Object.freeze(["SIGTERM", "SIGINT"] as const);
const NEVER_STOPPING_LIFECYCLE: RefundExecutionWorkerHostLifecycle = Object.freeze({
  shouldStop: () => false,
  drainReason: () => null,
  dispose: () => undefined,
});

export function neverStoppingRefundExecutionWorkerLifecycle(): RefundExecutionWorkerHostLifecycle {
  return NEVER_STOPPING_LIFECYCLE;
}

export function createRefundExecutionWorkerHostLifecycle<TimerHandle>(
  runtime: RefundExecutionWorkerLifecycleRuntime<TimerHandle>,
): RefundExecutionWorkerHostLifecycle {
  let reason: RefundExecutionWorkerDrainReason | null = null;
  let disposed = false;
  let timerRegistration: Readonly<{ timer: TimerHandle }> | null = null;
  const registeredSignals: RefundExecutionWorkerHostSignal[] = [];
  const requestSignalDrain = () => requestDrain("SIGNAL");
  const requestBudgetDrain = () => requestDrain("BUDGET");

  function requestDrain(requested: RefundExecutionWorkerDrainReason): void {
    if (!disposed && reason === null) reason = requested;
  }

  function cleanupResources(): boolean {
    let cleanupSucceeded = true;
    if (timerRegistration) {
      try {
        runtime.clearTimer(timerRegistration.timer);
      } catch {
        cleanupSucceeded = false;
      }
      timerRegistration = null;
    }
    for (const signal of registeredSignals.splice(0).reverse()) {
      try {
        runtime.removeSignalListener(signal, requestSignalDrain);
      } catch {
        cleanupSucceeded = false;
      }
    }
    return cleanupSucceeded;
  }

  try {
    timerRegistration = Object.freeze({
      timer: runtime.setTimer(requestBudgetDrain, REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS),
    });
    for (const signal of SIGNALS) {
      runtime.addSignalListener(signal, requestSignalDrain);
      registeredSignals.push(signal);
    }
  } catch {
    disposed = true;
    cleanupResources();
    throw new Error("REFUND_WORKER_LIFECYCLE_REGISTRATION_FAILED");
  }

  return Object.freeze({
    shouldStop: () => reason !== null,
    drainReason: () => reason,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (!cleanupResources()) throw new Error("REFUND_WORKER_LIFECYCLE_DISPOSAL_FAILED");
    },
  });
}

export function createProcessRefundExecutionWorkerHostLifecycle(): RefundExecutionWorkerHostLifecycle {
  return createRefundExecutionWorkerHostLifecycle({
    addSignalListener: (signal, listener) => process.on(signal, listener),
    removeSignalListener: (signal, listener) => process.off(signal, listener),
    setTimer: (listener, delayMs) => setTimeout(listener, delayMs),
    clearTimer: (timer) => clearTimeout(timer),
  });
}
