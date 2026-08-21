export const REFUND_EXECUTION_WORKER_BATCH_SIZE = 6;
export const REFUND_EXECUTION_WORKER_CLASS_COUNT = 3;
export const REFUND_EXECUTION_WORKER_ROUTE_ATTEMPT_BOUND =
  REFUND_EXECUTION_WORKER_BATCH_SIZE * REFUND_EXECUTION_WORKER_CLASS_COUNT;

export type RefundExecutionWorkerCandidateClass = "CONTACTED" | "UNCONTACTED" | "READY";
export type RefundExecutionWorkerProvider =
  | "TOSS"
  | "EXIMBAY";

export type RefundExecutionWorkerCandidate = Readonly<{
  commandId: string;
  candidateClass: RefundExecutionWorkerCandidateClass;
  provider: RefundExecutionWorkerProvider;
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
  const seen = new Map<string, RefundExecutionWorkerProvider>();
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
  seen: Map<string, RefundExecutionWorkerProvider>,
): readonly RefundExecutionWorkerCandidate[] {
  const unique: RefundExecutionWorkerCandidate[] = [];
  for (const candidate of candidates) {
    const seenProvider = seen.get(candidate.commandId);
    if (seenProvider !== undefined) {
      if (seenProvider !== candidate.provider) {
        throw new Error("REFUND_EXECUTION_WORKER_PROVIDER_CONFLICT");
      }
      continue;
    }
    seen.set(candidate.commandId, candidate.provider);
    unique.push(Object.freeze({
      commandId: candidate.commandId,
      candidateClass,
      provider: candidate.provider,
    }));
  }
  return Object.freeze(unique);
}
