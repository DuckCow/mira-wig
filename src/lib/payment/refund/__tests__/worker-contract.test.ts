import { describe, expect, it } from "vitest";
import {
  normalizeRefundExecutionWorkerCycleInput,
  workerCycleSuccess,
  workerFailure,
  type RefundExecutionWorkerCycleCounters,
} from "../worker-contract";

const ZERO_COUNTERS: RefundExecutionWorkerCycleCounters = {
  selectedCount: 0,
  attemptedCount: 0,
  succeededCount: 0,
  replayedCount: 0,
  temporaryCount: 0,
  manualCount: 0,
  conflictCount: 0,
  inconsistentCount: 0,
  skippedCount: 0,
  failedCount: 0,
  readySelected: 0,
  uncontactedSelected: 0,
  contactedSelected: 0,
};

describe("refund execution worker contract", () => {
  it("accepts only one trimmed authority field on ordinary or null-prototype objects", () => {
    expect(normalizeRefundExecutionWorkerCycleInput({ workerOwner: "  worker-1  " }))
      .toEqual({ ok: true, input: { workerOwner: "worker-1" } });
    const nullPrototype: unknown = Object.defineProperty(Object.create(null), "workerOwner", {
      value: "worker-2",
      enumerable: true,
    });
    expect(normalizeRefundExecutionWorkerCycleInput(nullPrototype))
      .toEqual({ ok: true, input: { workerOwner: "worker-2" } });
  });

  it.each([
    null,
    [],
    {},
    { workerOwner: "" },
    { workerOwner: "worker", extra: true },
    { workerOwner: "work\ner" },
    { workerOwner: "x".repeat(256) },
    Object.assign(Object.create({ workerOwner: "inherited" }), {}),
  ])("rejects invalid authority input %#", (input) => {
    expect(normalizeRefundExecutionWorkerCycleInput(input)).toMatchObject({
      ok: false,
      code: "INVALID_WORKER_OWNER",
    });
  });

  it("rejects accessors and symbols without evaluating the accessor", () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "workerOwner", {
      enumerable: true,
      get: () => { reads += 1; return "worker"; },
    });
    const symbol = { workerOwner: "worker", [Symbol("authority")]: true };
    expect(normalizeRefundExecutionWorkerCycleInput(accessor).ok).toBe(false);
    expect(normalizeRefundExecutionWorkerCycleInput(symbol).ok).toBe(false);
    expect(reads).toBe(0);
  });

  it("returns exact frozen, non-sensitive public success and failure shapes", () => {
    const success = workerCycleSuccess(ZERO_COUNTERS);
    const failure = workerFailure("SYSTEMIC_FAILURE");
    expect(Object.keys(success.cycle)).toEqual(Object.keys(ZERO_COUNTERS));
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(success.cycle)).toBe(true);
    expect(Object.isFrozen(failure)).toBe(true);
    expect(JSON.stringify({ success, failure })).not.toMatch(
      /commandId|leaseToken|leaseGeneration|paymentKey|providerRefundId|rawError/,
    );
    expect(Object.values(success.cycle).every(Number.isInteger)).toBe(true);
    expect(Object.values(success.cycle).every((value) => value >= 0)).toBe(true);
  });
});
