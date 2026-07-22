import { describe, expect, it, vi } from "vitest";
import {
  classifyRefundDeploymentExit,
  refundDeploymentBackoffDecision,
  simulateRefundDeploymentOverlap,
  type RefundDeploymentExitObservation,
} from "../refund-deployment-exit-policy";

describe("refund deployment external policy", () => {
  it.each([
    [{ kind: "RESULT", code: "CYCLE_COMPLETE", exitCode: 0 }, "NEXT_CADENCE"],
    [{ kind: "RESULT", code: "FEATURE_DISABLED", exitCode: 0 }, "DISABLED_NO_PROCESSING"],
    [{ kind: "RESULT", code: "LIFECYCLE_DRAINED", exitCode: 75, reason: "SIGNAL" }, "DRAINED_DO_NOT_OVERLAP"],
    [{ kind: "RESULT", code: "LIFECYCLE_DRAINED", exitCode: 75, reason: "BUDGET" }, "DRAINED_DO_NOT_OVERLAP"],
    [{ kind: "RESULT", code: "INVALID_HOST_INPUT", exitCode: 64 }, "SUSPEND_INVOCATION_DEFECT"],
    [{ kind: "RESULT", code: "INVALID_WORKER_OWNER", exitCode: 64 }, "SUSPEND_INVOCATION_DEFECT"],
    [{ kind: "RESULT", code: "CONFIG_INVALID", exitCode: 78 }, "SUSPEND_READINESS_DEFECT"],
    [{ kind: "RESULT", code: "MIGRATIONS_NOT_READY", exitCode: 78 }, "SUSPEND_READINESS_DEFECT"],
    [{ kind: "RESULT", code: "DATABASE_UNAVAILABLE", exitCode: 1 }, "BACKOFF_SYSTEMIC"],
    [{ kind: "RESULT", code: "SYSTEMIC_FAILURE", exitCode: 1 }, "BACKOFF_SYSTEMIC"],
    [{ kind: "EXTERNAL_TIMEOUT" }, "STOP_AND_RECONCILE_POSSIBLE_CONTACT"],
    [{ kind: "SIGNAL_OR_INVALID_OUTPUT" }, "STOP_AND_INVESTIGATE"],
  ] as const)("classifies %j as %s", (observation, expected) => {
    expect(classifyRefundDeploymentExit(observation)).toBe(expected);
  });

  it.each([
    { kind: "RESULT", code: "CYCLE_COMPLETE", exitCode: 1 },
    { kind: "RESULT", code: "LIFECYCLE_DRAINED", exitCode: 0, reason: "SIGNAL" },
    { kind: "RESULT", code: "LIFECYCLE_DRAINED", exitCode: 75 },
    { kind: "RESULT", code: "LIFECYCLE_DRAINED", exitCode: 75, reason: "OTHER" },
    { kind: "RESULT", code: "CONFIG_INVALID", exitCode: 0 },
    { kind: "RESULT", code: "SYSTEMIC_FAILURE", exitCode: 1, reason: "SIGNAL" },
    { kind: "RESULT", code: "UNKNOWN", exitCode: 0 },
  ] satisfies RefundDeploymentExitObservation[])("rejects impossible observation %j", (observation) => {
    expect(classifyRefundDeploymentExit(observation)).toBeNull();
  });

  it("uses 1, 2, 4, 8, then 15 minute external jittered backoff", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map((count) => (
      refundDeploymentBackoffDecision("BACKOFF_SYSTEMIC", count)
    ))).toEqual([
      { kind: "BACKOFF", failureCount: 1, minutes: 1, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 2, minutes: 2, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 3, minutes: 4, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 4, minutes: 8, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 5, minutes: 15, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 6, minutes: 15, externalJitterRequired: true },
      { kind: "BACKOFF", failureCount: 21, minutes: 15, externalJitterRequired: true },
    ]);
    expect(refundDeploymentBackoffDecision("NEXT_CADENCE", 7)).toEqual({
      kind: "RESET", failureCount: 0,
    });
    expect(refundDeploymentBackoffDecision("DISABLED_NO_PROCESSING", 7)).toEqual({
      kind: "NO_PROCESSING_SUCCESS",
    });
    expect(refundDeploymentBackoffDecision("SUSPEND_READINESS_DEFECT", 7)).toEqual({ kind: "SUSPEND" });
    expect(refundDeploymentBackoffDecision("STOP_AND_RECONCILE_POSSIBLE_CONTACT", 7))
      .toEqual({ kind: "RECONCILE" });
  });

  it("simulates acquired once and repeatedly busy without queue, delay, or retry", async () => {
    const invoke = vi.fn(() => Promise.resolve("COMPLETE"));

    await expect(simulateRefundDeploymentOverlap("ACQUIRED", invoke)).resolves.toEqual({
      code: "OVERLAP_ACQUIRED", result: "COMPLETE",
    });
    await expect(simulateRefundDeploymentOverlap("BUSY", invoke)).resolves.toEqual({
      code: "OVERLAP_SKIPPED",
    });
    await expect(simulateRefundDeploymentOverlap("BUSY", invoke)).resolves.toEqual({
      code: "OVERLAP_SKIPPED",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("fails closed for every malformed admission state without coercion or getter evaluation", async () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "state", {
      enumerable: true,
      get() { getterCalls += 1; return "ACQUIRED"; },
    });
    const inherited: object = {};
    Reflect.setPrototypeOf(inherited, { state: "ACQUIRED" });
    const symbol = { [Symbol("state")]: "ACQUIRED" };
    const invoke = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));
    const malformed: unknown[] = [
      "INVALID", "", " ", "\t", null, undefined, 0, 1, true, false, {}, [], accessor,
      new Proxy({}, {}), inherited, symbol,
    ];

    for (const state of malformed) {
      await expect(simulateRefundDeploymentOverlap(state, invoke)).resolves.toEqual({
        code: "INVALID_ADMISSION_STATE",
      });
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(getterCalls).toBe(0);
  });

  it.each([" ", "\t"])(
    "does not trim whitespace admission state %j into an accepted state",
    async (state) => {
      const invoke = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));

      await expect(simulateRefundDeploymentOverlap(state, invoke)).resolves.toEqual({
        code: "INVALID_ADMISSION_STATE",
      });
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it("invokes ACQUIRED exactly once and preserves its thrown operation boundary", async () => {
    const failure = new Error("INJECTED_ACQUIRED_OPERATION_FAILURE");
    const invoke = vi.fn(() => Promise.reject(failure));

    await expect(simulateRefundDeploymentOverlap("ACQUIRED", invoke)).rejects.toBe(failure);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
