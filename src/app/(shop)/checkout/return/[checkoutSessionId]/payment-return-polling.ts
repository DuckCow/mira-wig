import {
  isTerminalPaymentReturnStatus,
  type PaymentReturnStatus,
  type PaymentReturnViewStatus,
} from "@/lib/payment/return-status-contract";

export const PAYMENT_RETURN_OBSERVATION_WINDOW_MS = 30_000;

export const PAYMENT_RETURN_POLL_DELAYS_MS: readonly number[] = Object.freeze([
  1_000,
  2_000,
  4_000,
  8_000,
  15_000,
]);

type TimerHandle = ReturnType<typeof setTimeout>;

export interface PaymentReturnPollingClock {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (timer: TimerHandle) => void;
}

export interface ObservePaymentReturnStatusInput {
  initialStatus: PaymentReturnStatus;
  readStatus: (signal: AbortSignal) => Promise<PaymentReturnStatus>;
  onStatus: (status: PaymentReturnViewStatus) => void;
  signal: AbortSignal;
  delaysMs?: readonly number[];
  observationWindowMs?: number;
  clock?: PaymentReturnPollingClock;
}

type ObservationEnd = "terminal" | "deadline" | "external";
type SettledRead =
  | { kind: "status"; status: PaymentReturnStatus }
  | { kind: "error"; error: unknown }
  | { kind: "ended" };

const MONOTONIC_CLOCK: PaymentReturnPollingClock = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

export async function observePaymentReturnStatus(
  input: ObservePaymentReturnStatusInput,
): Promise<void> {
  if (isTerminalPaymentReturnStatus(input.initialStatus) || input.signal.aborted) return;
  const delays = input.delaysMs ?? PAYMENT_RETURN_POLL_DELAYS_MS;
  const observationWindowMs = input.observationWindowMs ?? PAYMENT_RETURN_OBSERVATION_WINDOW_MS;
  const clock = input.clock ?? MONOTONIC_CLOCK;
  assertValidConfiguration(delays, observationWindowMs);
  await new PaymentReturnObservation(input, delays, observationWindowMs, clock).run();
}

class PaymentReturnObservation {
  private endedAs: ObservationEnd | null = null;
  private activeRequest: AbortController | null = null;
  private deadlineTimer: TimerHandle | null = null;
  private resolveEnded: () => void = () => undefined;
  private readonly ended = new Promise<void>((resolve) => {
    this.resolveEnded = resolve;
  });
  private readonly deadlineAt: number;
  private readonly onExternalAbort = () => this.finish("external");

  constructor(
    private readonly input: ObservePaymentReturnStatusInput,
    private readonly delays: readonly number[],
    observationWindowMs: number,
    private readonly clock: PaymentReturnPollingClock,
  ) {
    this.deadlineAt = requireMonotonicTime(clock.now()) + observationWindowMs;
  }

  async run(): Promise<void> {
    this.input.signal.addEventListener("abort", this.onExternalAbort, { once: true });
    if (this.input.signal.aborted) this.finish("external");
    const remainingMs = this.deadlineAt - requireMonotonicTime(this.clock.now());
    this.deadlineTimer = this.clock.setTimer(() => this.finish("deadline"), Math.max(0, remainingMs));
    try {
      await this.pollDelays();
    } finally {
      this.cleanup();
    }
  }

  private async pollDelays(): Promise<void> {
    for (const delayMs of this.delays) {
      if (!await this.waitUntilNextRead(delayMs)) return;
      await this.readOnce();
      if (this.endedAs !== null) return;
    }
    await this.ended;
  }

  private async waitUntilNextRead(delayMs: number): Promise<boolean> {
    if (this.endedAs !== null) return false;
    const remainingMs = this.deadlineAt - requireMonotonicTime(this.clock.now());
    if (remainingMs <= 0) return this.finishDeadline();
    const elapsed = await waitForDelay(this.clock, Math.min(delayMs, remainingMs), this.ended);
    if (!elapsed || this.endedAs !== null) return false;
    if (requireMonotonicTime(this.clock.now()) >= this.deadlineAt) return this.finishDeadline();
    return true;
  }

  private async readOnce(): Promise<void> {
    const requestController = new AbortController();
    this.activeRequest = requestController;
    const result = await Promise.race<SettledRead>([
      settleRead(this.input.readStatus(requestController.signal)),
      this.ended.then(() => ({ kind: "ended" as const })),
    ]);
    if (this.activeRequest === requestController) this.activeRequest = null;
    if (result.kind === "ended" || this.endedAs !== null) return;
    if (this.input.signal.aborted) return this.finish("external");
    if (requireMonotonicTime(this.clock.now()) >= this.deadlineAt) return this.finish("deadline");

    const observed: PaymentReturnStatus = result.kind === "status"
      ? result.status
      : { kind: "PROCESSING" };
    this.input.onStatus(observed);
    if (isTerminalPaymentReturnStatus(observed)) this.finish("terminal");
  }

  private finish(reason: ObservationEnd): void {
    if (this.endedAs !== null) return;
    this.endedAs = reason;
    this.activeRequest?.abort();
    if (reason === "deadline" && !this.input.signal.aborted) {
      this.input.onStatus({ kind: "UNRESOLVED" });
    }
    this.resolveEnded();
  }

  private finishDeadline(): false {
    this.finish("deadline");
    return false;
  }

  private cleanup(): void {
    if (this.deadlineTimer !== null) this.clock.clearTimer(this.deadlineTimer);
    this.input.signal.removeEventListener("abort", this.onExternalAbort);
    this.activeRequest?.abort();
  }
}

function settleRead(read: Promise<PaymentReturnStatus>): Promise<SettledRead> {
  return read.then(
    (status) => ({ kind: "status", status }),
    (error: unknown) => ({ kind: "error", error }),
  );
}

function waitForDelay(
  clock: PaymentReturnPollingClock,
  delayMs: number,
  ended: Promise<void>,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (elapsed: boolean) => {
      if (settled) return;
      settled = true;
      clock.clearTimer(timer);
      resolve(elapsed);
    };
    const timer = clock.setTimer(() => finish(true), delayMs);
    void ended.then(() => finish(false));
  });
}

function assertValidConfiguration(delays: readonly number[], observationWindowMs: number): void {
  if (delays.length === 0 || delays.some((delay) => !Number.isSafeInteger(delay) || delay <= 0)) {
    throw new Error("Payment return polling requires positive integer delays.");
  }
  if (!Number.isSafeInteger(observationWindowMs) || observationWindowMs <= 0) {
    throw new Error("Payment return polling requires a positive integer observation window.");
  }
}

function requireMonotonicTime(value: number): number {
  if (Number.isFinite(value) && value >= 0) return value;
  throw new Error("Payment return polling monotonic time is unavailable.");
}
