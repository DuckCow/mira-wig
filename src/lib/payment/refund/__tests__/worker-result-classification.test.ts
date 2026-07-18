import { describe, expect, it } from "vitest";
import {
  classifyAcquireWorkerFailure,
  classifyAuthorizationWorkerFailure,
  classifyContactWorkerFailure,
  classifyRecoveryWorkerFailure,
  classifyReclaimWorkerFailure,
  classifyWorkerSuccess,
  isSelectorRaceLoss,
  stopsRefundExecutionWorkerCycle,
} from "../worker-result-classification";

describe("refund execution worker result classification", () => {
  it.each([
    [classifyAcquireWorkerFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE"), "SKIPPED"],
    [classifyAcquireWorkerFailure("LEASE_CONFLICT"), "CONFLICT"],
    [classifyReclaimWorkerFailure("LEASE_NOT_EXPIRED"), "CONFLICT"],
    [classifyAuthorizationWorkerFailure("PERSISTENCE_CONFLICT"), "CONFLICT"],
    [classifyContactWorkerFailure("LEASE_FENCE_MISMATCH"), "CONFLICT"],
    [classifyRecoveryWorkerFailure("RECOVERY_LEASE_CONFLICT"), "CONFLICT"],
  ] as const)("marks stale selector outcomes as bounded replacement races", (outcome, kind) => {
    expect(outcome.kind).toBe(kind);
    expect(isSelectorRaceLoss(outcome)).toBe(true);
  });

  it.each([
    [classifyAuthorizationWorkerFailure("TOSS_LOOKUP_UNAVAILABLE"), "TEMPORARY"],
    [classifyContactWorkerFailure("TOSS_CONTACT_OUTCOME_UNKNOWN"), "TEMPORARY"],
    [classifyRecoveryWorkerFailure("RECOVERY_INTERVAL_NOT_ELAPSED"), "TEMPORARY"],
    [classifyRecoveryWorkerFailure("RECOVERY_RECONTACT_REQUIRED"), "TEMPORARY"],
    [classifyRecoveryWorkerFailure("RECOVERY_DEADLINE_EXPIRED"), "MANUAL"],
    [classifyReclaimWorkerFailure("AUTHORIZED_RECOVERY_UNSUPPORTED"), "MANUAL"],
    [classifyReclaimWorkerFailure("CONTACTED_RECOVERY_REQUIRED"), "MANUAL"],
    [classifyContactWorkerFailure("REFUND_LEDGER_INCONSISTENT"), "INCONSISTENT"],
  ] as const)("does not replace semantic per-command outcome %s", (outcome, kind) => {
    expect(outcome.kind).toBe(kind);
    expect(isSelectorRaceLoss(outcome)).toBe(false);
  });

  it("distinguishes success, replay, configuration stop, and invariant stop", () => {
    expect(classifyWorkerSuccess(false).kind).toBe("SUCCEEDED");
    expect(classifyWorkerSuccess(true).kind).toBe("REPLAYED");
    expect(stopsRefundExecutionWorkerCycle(
      classifyAuthorizationWorkerFailure("CONFIG_INVALID"),
    )).toBe(true);
    expect(stopsRefundExecutionWorkerCycle(
      classifyAuthorizationWorkerFailure("INVALID_LEASE_TOKEN"),
    )).toBe(true);
    expect(Object.isFrozen(classifyWorkerSuccess(false))).toBe(true);
  });
});
