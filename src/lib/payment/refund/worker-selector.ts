import { Prisma, type PrismaClient } from "@prisma/client";
import {
  mergeRefundExecutionWorkerCandidates,
  REFUND_EXECUTION_WORKER_BATCH_SIZE,
  type RefundExecutionWorkerCandidate,
  type RefundExecutionWorkerCandidateClass,
  type RefundExecutionWorkerCandidateQueues,
  type RefundExecutionWorkerProvider,
} from "./worker-allocation";
import {
  contactedRefundExecutionWorkerWhere,
  readyRefundExecutionWorkerWhere,
  uncontactedRefundExecutionWorkerWhere,
} from "./worker-eligibility";

type SelectorTx = Prisma.TransactionClient;

export async function selectRefundExecutionWorkerCandidates(
  client: PrismaClient,
  options: Readonly<{ eximbayEnabled: boolean }> = Object.freeze({ eximbayEnabled: false }),
): Promise<RefundExecutionWorkerCandidateQueues> {
  return client.$transaction(async (tx) => {
    const capturedAt = await captureSelectorDatabaseTime(tx);
    const providers = selectedProviders(options.eximbayEnabled);
    const ready = await selectReady(tx, capturedAt, providers);
    const uncontacted = await selectUncontacted(tx, capturedAt, providers);
    const contacted = await selectContacted(tx, capturedAt, providers);
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

function selectReady(
  tx: SelectorTx,
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[],
) {
  return tx.refundExecutionCommand.findMany({
    where: readyRefundExecutionWorkerWhere(capturedAt, providers),
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true, refundAttempt: { select: { provider: true } } },
  });
}

function selectUncontacted(
  tx: SelectorTx,
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[],
) {
  return tx.refundExecutionCommand.findMany({
    where: uncontactedRefundExecutionWorkerWhere(capturedAt, providers),
    orderBy: [{ leaseUntil: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true, refundAttempt: { select: { provider: true } } },
  });
}

function selectContacted(
  tx: SelectorTx,
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[],
) {
  return tx.refundExecutionCommand.findMany({
    where: contactedRefundExecutionWorkerWhere(capturedAt, providers),
    orderBy: [{ leaseUntil: "asc" }, { id: "asc" }],
    take: REFUND_EXECUTION_WORKER_BATCH_SIZE,
    select: { id: true, refundAttempt: { select: { provider: true } } },
  });
}

function toCandidates(
  rows: readonly Readonly<{ id: string; refundAttempt: { provider: string } }>[],
  candidateClass: RefundExecutionWorkerCandidateClass,
): readonly RefundExecutionWorkerCandidate[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    commandId: row.id,
    candidateClass,
    provider: workerProvider(row.refundAttempt.provider),
  })));
}

function selectedProviders(eximbayEnabled: boolean): readonly RefundExecutionWorkerProvider[] {
  return eximbayEnabled
    ? Object.freeze(["TOSS", "EXIMBAY"] as const)
    : Object.freeze(["TOSS"] as const);
}

function workerProvider(value: string): RefundExecutionWorkerProvider {
  if (value === "TOSS" || value === "EXIMBAY") return value;
  throw new Error("UNSUPPORTED_REFUND_EXECUTION_WORKER_PROVIDER");
}
