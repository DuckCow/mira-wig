import { describe, expect, it } from "vitest";
import {
  mergeRefundExecutionWorkerCandidates,
  REFUND_EXECUTION_WORKER_BATCH_SIZE,
  REFUND_EXECUTION_WORKER_ROUTE_ATTEMPT_BOUND,
  reserveRefundExecutionWorkerCapacity,
  type RefundExecutionWorkerCandidateClass,
  type RefundExecutionWorkerCandidateQueues,
} from "../worker-allocation";

describe("refund execution worker allocation", () => {
  it.each([
    [[6, 6, 6], [4, 1, 1]],
    [[0, 6, 6], [0, 5, 1]],
    [[6, 0, 6], [5, 0, 1]],
    [[6, 6, 0], [5, 1, 0]],
    [[1, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 0]],
  ])("reserves present classes then spills CONTACTED to UNCONTACTED to READY: %j", (
    lengths,
    expected,
  ) => {
    const queues = makeQueues(lengths[0] ?? 0, lengths[1] ?? 0, lengths[2] ?? 0);
    expect(Object.values(reserveRefundExecutionWorkerCapacity(queues))).toEqual(expected);
  });

  it("deduplicates with CONTACTED over UNCONTACTED over READY precedence", () => {
    const merged = mergeRefundExecutionWorkerCandidates({
      CONTACTED: [candidate("same", "CONTACTED"), candidate("contacted", "CONTACTED")],
      UNCONTACTED: [candidate("same", "UNCONTACTED"), candidate("uncontacted", "UNCONTACTED")],
      READY: [candidate("same", "READY"), candidate("ready", "READY")],
    });
    expect(merged).toEqual({
      CONTACTED: [candidate("same", "CONTACTED"), candidate("contacted", "CONTACTED")],
      UNCONTACTED: [candidate("uncontacted", "UNCONTACTED")],
      READY: [candidate("ready", "READY")],
    });
    expect(Object.values(merged).flat().map((item) => item.commandId)).toHaveLength(4);
  });

  it("pins service and route-attempt bounds", () => {
    expect(REFUND_EXECUTION_WORKER_BATCH_SIZE).toBe(6);
    expect(REFUND_EXECUTION_WORKER_ROUTE_ATTEMPT_BOUND).toBe(18);
  });
});

function makeQueues(
  contacted: number,
  uncontacted: number,
  ready: number,
): RefundExecutionWorkerCandidateQueues {
  return {
    CONTACTED: makeCandidates(contacted, "CONTACTED"),
    UNCONTACTED: makeCandidates(uncontacted, "UNCONTACTED"),
    READY: makeCandidates(ready, "READY"),
  };
}

function makeCandidates(length: number, candidateClass: RefundExecutionWorkerCandidateClass) {
  return Array.from({ length }, (_, index) => candidate(`${candidateClass}-${index}`, candidateClass));
}

function candidate(commandId: string, candidateClass: RefundExecutionWorkerCandidateClass) {
  return { commandId, candidateClass } as const;
}
