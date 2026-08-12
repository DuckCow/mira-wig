import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PaymentReturnStatus,
  PaymentReturnViewStatus,
} from "@/lib/payment/return-status-contract";
import {
  PAYMENT_RETURN_OBSERVATION_WINDOW_MS,
  PAYMENT_RETURN_POLL_DELAYS_MS,
  observePaymentReturnStatus,
} from "./payment-return-polling";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("provider-neutral payment return polling", () => {
  it("uses a 30-second monotonic observation window with the required delay sequence", () => {
    expect(PAYMENT_RETURN_OBSERVATION_WINDOW_MS).toBe(30_000);
    expect(PAYMENT_RETURN_POLL_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000, 15_000]);
  });

  it("includes a slow request in the deadline and caps the next delay to remaining time", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const readStatus = vi.fn(() => processingAfter(70));
    const observation = observe({
      readStatus,
      statuses,
      delaysMs: [10, 20, 40],
      observationWindowMs: 100,
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([{ kind: "PROCESSING" }]);
    await vi.advanceTimersByTimeAsync(1);
    await observation;

    expect(statuses).toEqual([{ kind: "PROCESSING" }, { kind: "UNRESOLVED" }]);
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it("aborts a permanently hung in-flight request at the actual 30-second deadline", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    let requestSignal: AbortSignal | undefined;
    const readStatus = vi.fn((signal: AbortSignal) => {
      requestSignal = signal;
      return rejectWhenAborted(signal);
    });
    const observation = observe({ readStatus, statuses });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(29_000);
    await observation;

    expect(requestSignal?.aborted).toBe(true);
    expect(statuses).toEqual([{ kind: "UNRESOLVED" }]);
  });

  it("lets a terminal response observed immediately before the deadline win", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const response = deferred<PaymentReturnStatus>();
    const observation = observe({
      readStatus: vi.fn(() => response.promise),
      statuses,
      delaysMs: [10],
      observationWindowMs: 100,
    });

    await vi.advanceTimersByTimeAsync(99);
    response.resolve({ kind: "SUCCEEDED", orderId: "order_before_deadline" });
    await observation;
    await vi.advanceTimersByTimeAsync(1);

    expect(statuses).toEqual([{ kind: "SUCCEEDED", orderId: "order_before_deadline" }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets the deadline win over a late terminal response and suppresses the stale result", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const response = deferred<PaymentReturnStatus>();
    const observation = observe({
      readStatus: vi.fn(() => response.promise),
      statuses,
      delaysMs: [10],
      observationWindowMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await observation;
    response.resolve({ kind: "SUCCEEDED", orderId: "too_late" });
    await Promise.resolve();

    expect(statuses).toEqual([{ kind: "UNRESOLVED" }]);
  });

  it("treats external abort as silent cleanup without a new state", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const controller = new AbortController();
    const readStatus = vi.fn((_signal: AbortSignal) => deferred<PaymentReturnStatus>().promise);
    const observation = observe({
      readStatus,
      statuses,
      signal: controller.signal,
      delaysMs: [10, 20],
      observationWindowMs: 100,
    });

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await observation;
    await vi.runAllTimersAsync();

    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps timeout and AbortError outcomes unresolved rather than failed", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const readStatus = vi.fn().mockRejectedValue(abortError());
    const observation = observe({
      readStatus,
      statuses,
      delaysMs: [10, 20],
      observationWindowMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);
    await observation;

    expect(statuses.at(-1)).toEqual({ kind: "UNRESOLVED" });
    expect(statuses).not.toContainEqual({ kind: "FAILED" });
  });

  it("serializes requests and never overlaps a hung read with another read", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    let active = 0;
    let maximumActive = 0;
    const readStatus = vi.fn((signal: AbortSignal) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return rejectWhenAborted(signal);
    });
    const observation = observe({
      readStatus,
      statuses,
      delaysMs: [5, 5, 5],
      observationWindowMs: 40,
    });

    await vi.advanceTimersByTimeAsync(40);
    await observation;

    expect(maximumActive).toBe(1);
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([{ kind: "UNRESOLVED" }]);
  });

  it("a terminal result cancels every future timer and request owner", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const readStatus = vi.fn().mockResolvedValue({ kind: "FAILED" });
    const observation = observe({
      readStatus,
      statuses,
      delaysMs: [10, 20, 40],
      observationWindowMs: 100,
    });

    await vi.advanceTimersByTimeAsync(10);
    await observation;
    await vi.runAllTimersAsync();

    expect(statuses).toEqual([{ kind: "FAILED" }]);
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Strict-Mode-equivalent cleanup prevents a stale prior mount from overwriting a remount", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const firstController = new AbortController();
    const staleResponse = deferred<PaymentReturnStatus>();
    const first = observe({
      readStatus: vi.fn(() => staleResponse.promise),
      statuses,
      signal: firstController.signal,
      delaysMs: [10],
      observationWindowMs: 100,
    });
    await vi.advanceTimersByTimeAsync(10);
    firstController.abort();
    await first;

    const second = observe({
      readStatus: vi.fn().mockResolvedValue({ kind: "SUCCEEDED", orderId: "current_order" }),
      statuses,
      delaysMs: [10],
      observationWindowMs: 100,
    });
    await vi.advanceTimersByTimeAsync(10);
    await second;
    staleResponse.resolve({ kind: "FAILED" });
    await Promise.resolve();

    expect(statuses).toEqual([{ kind: "SUCCEEDED", orderId: "current_order" }]);
  });

  it("does not update state after unmount during a pending delay", async () => {
    vi.useFakeTimers();
    const statuses: PaymentReturnViewStatus[] = [];
    const controller = new AbortController();
    const readStatus = vi.fn().mockResolvedValue({ kind: "FAILED" });
    const observation = observe({
      readStatus,
      statuses,
      signal: controller.signal,
      delaysMs: [20],
      observationWindowMs: 100,
    });

    controller.abort();
    await observation;
    await vi.runAllTimersAsync();

    expect(readStatus).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  const terminalStatuses: PaymentReturnStatus[] = [
    { kind: "SUCCEEDED", orderId: "order_1" },
    { kind: "FAILED" },
    { kind: "UNAVAILABLE" },
  ];

  it.each(terminalStatuses)("does not poll an initial terminal state: $kind", async (initialStatus) => {
    const readStatus = vi.fn();
    const onStatus = vi.fn();

    await observePaymentReturnStatus({
      initialStatus,
      readStatus,
      onStatus,
      signal: new AbortController().signal,
    });

    expect(readStatus).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });
});

function observe({
  readStatus,
  statuses,
  signal = new AbortController().signal,
  delaysMs,
  observationWindowMs,
}: {
  readStatus: (signal: AbortSignal) => Promise<PaymentReturnStatus>;
  statuses: PaymentReturnViewStatus[];
  signal?: AbortSignal;
  delaysMs?: readonly number[];
  observationWindowMs?: number;
}): Promise<void> {
  return observePaymentReturnStatus({
    initialStatus: { kind: "PROCESSING" },
    readStatus,
    onStatus: (status) => statuses.push(status),
    signal,
    delaysMs,
    observationWindowMs,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function processingAfter(delayMs: number): Promise<PaymentReturnStatus> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs, { kind: "PROCESSING" });
  });
}

function rejectWhenAborted(
  signal: AbortSignal,
): Promise<PaymentReturnStatus> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Local status observation aborted.");
  error.name = "AbortError";
  return error;
}
