export const REFUND_EXECUTION_WORKER_BATCH_SIZE = 6;
export const REFUND_EXECUTION_WORKER_CLASS_COUNT = 3;
export const REFUND_EXECUTION_WORKER_ROUTE_ATTEMPT_BOUND =
  REFUND_EXECUTION_WORKER_BATCH_SIZE * REFUND_EXECUTION_WORKER_CLASS_COUNT;

export type RefundExecutionWorkerCandidateClass = "CONTACTED" | "UNCONTACTED" | "READY";

export type RefundExecutionWorkerCandidate = Readonly<{
  commandId: string;
  candidateClass: RefundExecutionWorkerCandidateClass;
}>;

export type RefundExecutionWorkerCandidateQueues = Readonly<{
  CONTACTED: readonly RefundExecutionWorkerCandidate[];
  UNCONTACTED: readonly RefundExecutionWorkerCandidate[];
  READY: readonly RefundExecutionWorkerCandidate[];
}>;

export type RefundExecutionWorkerServiceAllocation = Readonly<{
  CONTACTED: number;
  UNCONTACTED: number;
  READY: number;
}>;

const CLASS_ORDER = ["CONTACTED", "UNCONTACTED", "READY"] as const;

export function reserveRefundExecutionWorkerCapacity(
  queues: RefundExecutionWorkerCandidateQueues,
): RefundExecutionWorkerServiceAllocation {
  const allocation: Record<RefundExecutionWorkerCandidateClass, number> = {
    CONTACTED: 0,
    UNCONTACTED: 0,
    READY: 0,
  };
  let remaining = REFUND_EXECUTION_WORKER_BATCH_SIZE;
  for (const candidateClass of CLASS_ORDER) {
    if (queues[candidateClass].length === 0) continue;
    allocation[candidateClass] = 1;
    remaining -= 1;
  }
  for (const candidateClass of CLASS_ORDER) {
    const available = queues[candidateClass].length - allocation[candidateClass];
    const granted = Math.min(available, remaining);
    allocation[candidateClass] += granted;
    remaining -= granted;
  }
  return Object.freeze({ ...allocation });
}

export function mergeRefundExecutionWorkerCandidates(
  candidates: RefundExecutionWorkerCandidateQueues,
): RefundExecutionWorkerCandidateQueues {
  const seen = new Set<string>();
  return Object.freeze({
    CONTACTED: uniqueCandidates(candidates.CONTACTED, "CONTACTED", seen),
    UNCONTACTED: uniqueCandidates(candidates.UNCONTACTED, "UNCONTACTED", seen),
    READY: uniqueCandidates(candidates.READY, "READY", seen),
  });
}

export function workerCandidateClassOrder(): readonly RefundExecutionWorkerCandidateClass[] {
  return CLASS_ORDER;
}

function uniqueCandidates(
  candidates: readonly RefundExecutionWorkerCandidate[],
  candidateClass: RefundExecutionWorkerCandidateClass,
  seen: Set<string>,
): readonly RefundExecutionWorkerCandidate[] {
  const unique: RefundExecutionWorkerCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.commandId)) continue;
    seen.add(candidate.commandId);
    unique.push(Object.freeze({ commandId: candidate.commandId, candidateClass }));
  }
  return Object.freeze(unique);
}
