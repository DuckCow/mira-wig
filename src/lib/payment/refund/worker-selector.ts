import { Prisma, type PrismaClient } from "@prisma/client";
import {
  mergeRefundExecutionWorkerCandidates,
  REFUND_EXECUTION_WORKER_BATCH_SIZE,
  type RefundExecutionWorkerCandidate,
  type RefundExecutionWorkerCandidateClass,
  type RefundExecutionWorkerCandidateQueues,
} from "./worker-allocation";
import {
  contactedRefundExecutionWorkerWhere,
  readyRefundExecutionWorkerWhere,
  uncontactedRefundExecutionWorkerWhere,
} from "./worker-eligibility";

type SelectorTx = Prisma.TransactionClient;

export async function selectRefundExecutionWorkerCandidates(
  client: PrismaClient,
): Promise<RefundExecutionWorkerCandidateQueues> {
  return client.$transaction(async (tx) => {
    const capturedAt = await captureSelectorDatabaseTime(tx);
    const ready = await selectReady(tx, capturedAt);
    const uncontacted = await selectUncontacted(tx, capturedAt);
    const contacted = await selectContacted(tx, capturedAt);
    return mergeRefundExecutionWorkerCandidates({
      CONTACTED: toCandidates(contacted, "CONTACTED"),
      UNCONTACTED: toCandidates(uncontacted, "UNCONTACTED"),
      READY: toCandidates(ready, "READY"),
    });
  });
}

async function captureSelectorDatabaseTime(tx: SelectorTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative refund worker selector time.");
  }
  return rows[0].capturedAt;
}

function selectReady(tx: SelectorTx, capturedAt: Date) {
  return tx.refundExecutionCommand.findMany({
    where: readyRefundExecutionWorkerWhere(capturedAt),
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true },
  });
}

function selectUncontacted(tx: SelectorTx, capturedAt: Date) {
  return tx.refundExecutionCommand.findMany({
    where: uncontactedRefundExecutionWorkerWhere(capturedAt),
    orderBy: [{ leaseUntil: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true },
  });
}

function selectContacted(tx: SelectorTx, capturedAt: Date) {
  return tx.refundExecutionCommand.findMany({
    where: contactedRefundExecutionWorkerWhere(capturedAt),
    orderBy: [{ leaseUntil: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true },
  });
}

function toCandidates(
  rows: readonly Readonly<{ id: string }>[],
  candidateClass: RefundExecutionWorkerCandidateClass,
): readonly RefundExecutionWorkerCandidate[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    commandId: row.id,
    candidateClass,
  })));
}
