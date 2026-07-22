import { Prisma, type PrismaClient } from "@prisma/client";
import {
  contactedRefundExecutionWorkerWhere,
  manualReviewRefundExecutionWorkerWhere,
  readyRefundExecutionWorkerWhere,
  uncontactedRefundExecutionWorkerWhere,
} from "./worker-eligibility";

export type RefundExecutionWorkerBacklogObservation = Readonly<{
  count: number;
  oldestAgeSeconds: number | null;
}>;

export type RefundExecutionWorkerHealthBacklog = Readonly<{
  READY: RefundExecutionWorkerBacklogObservation;
  UNCONTACTED: RefundExecutionWorkerBacklogObservation;
  CONTACTED: RefundExecutionWorkerBacklogObservation;
  MANUAL_REVIEW: RefundExecutionWorkerBacklogObservation;
}>;

export async function readRefundExecutionWorkerHealthBacklog(
  client: PrismaClient,
): Promise<RefundExecutionWorkerHealthBacklog> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const capturedAt = await captureHealthDatabaseTime(tx);
    const ready = await tx.refundExecutionCommand.aggregate({
      where: readyRefundExecutionWorkerWhere(capturedAt),
      _count: { _all: true },
      _min: { availableAt: true },
    });
    const uncontacted = await tx.refundExecutionCommand.aggregate({
      where: uncontactedRefundExecutionWorkerWhere(capturedAt),
      _count: { _all: true },
      _min: { leaseUntil: true },
    });
    const contacted = await tx.refundExecutionCommand.aggregate({
      where: contactedRefundExecutionWorkerWhere(capturedAt),
      _count: { _all: true },
      _min: { leaseUntil: true },
    });
    const manual = await tx.refundExecutionCommand.aggregate({
      where: manualReviewRefundExecutionWorkerWhere(),
      _count: { _all: true },
      _min: { updatedAt: true },
    });
    return Object.freeze({
      READY: backlogObservation(ready._count._all, ready._min.availableAt, capturedAt),
      UNCONTACTED: backlogObservation(
        uncontacted._count._all, uncontacted._min.leaseUntil, capturedAt,
      ),
      CONTACTED: backlogObservation(
        contacted._count._all, contacted._min.leaseUntil, capturedAt,
      ),
      MANUAL_REVIEW: backlogObservation(manual._count._all, manual._min.updatedAt, capturedAt),
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function captureHealthDatabaseTime(
  tx: Prisma.TransactionClient,
): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !isFiniteDate(rows[0]?.capturedAt)) {
    throw new Error("INVALID_HEALTH_DATABASE_TIME");
  }
  return rows[0].capturedAt;
}

function backlogObservation(
  count: number,
  oldest: Date | null,
  capturedAt: Date,
): RefundExecutionWorkerBacklogObservation {
  if (!isNonnegativeSafeInteger(count)) throw new Error("INVALID_HEALTH_COUNT");
  if (count === 0) {
    if (oldest !== null) throw new Error("INVALID_EMPTY_HEALTH_AGE");
    return Object.freeze({ count, oldestAgeSeconds: null });
  }
  if (!isFiniteDate(oldest)) {
    throw new Error("INVALID_HEALTH_AGE_SOURCE");
  }
  return Object.freeze({
    count,
    oldestAgeSeconds: refundExecutionWorkerOldestAgeSeconds(capturedAt, oldest),
  });
}

export function refundExecutionWorkerOldestAgeSeconds(
  capturedAt: Date,
  oldest: Date,
): number {
  if (!isFiniteDate(capturedAt) || !isFiniteDate(oldest)) {
    throw new Error("INVALID_HEALTH_AGE_SOURCE");
  }
  const age = Math.max(
    0,
    Math.floor((capturedAt.getTime() - oldest.getTime()) / 1_000),
  );
  if (!isNonnegativeSafeInteger(age)) throw new Error("INVALID_HEALTH_AGE");
  return age;
}

function isFiniteDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
