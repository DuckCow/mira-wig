import { Prisma, type PrismaClient } from "@prisma/client";
import {
  type ManualReviewCase,
  type ManualReviewQueueResult,
} from "./refund-operations-contract";
import { refundExecutionOldestAgeSeconds } from "./refund-age";
import { manualReviewRefundExecutionWorkerWhere } from "./worker-eligibility";

const MANUAL_CASE_LIMIT = 50;

export async function readRefundOperationsManualReviewQueue(
  client: PrismaClient,
): Promise<ManualReviewQueueResult> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const capturedAt = await captureDatabaseTime(tx);
    const summary = await tx.refundExecutionCommand.aggregate({
      where: manualReviewRefundExecutionWorkerWhere(),
      _count: { _all: true },
      _min: { updatedAt: true },
    });
    const records = await tx.refundExecutionCommand.findMany({
      where: manualReviewRefundExecutionWorkerWhere(),
      select: {
        refundAttemptId: true,
        updatedAt: true,
        refundAttempt: {
          select: {
            providerOperationBinding: {
              select: { eligibilityProof: { select: { id: true } } },
            },
          },
        },
        dispatchAttempts: {
          select: {
            contactMarkedAt: true,
            contactEligibilityProof: { select: { id: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { refundAttemptId: "asc" }],
      take: MANUAL_CASE_LIMIT,
    });
    const count = requireNonnegativeCount(summary._count._all);
    const cases = Object.freeze(records.map((record) => manualCase(record, capturedAt)));
    const oldestAgeSeconds = count === 0
      ? emptyOldest(summary._min.updatedAt)
      : refundExecutionOldestAgeSeconds(
        capturedAt,
        requireDate(summary._min.updatedAt, "INVALID_MANUAL_OLDEST"),
      );
    return Object.freeze({
      ok: true,
      code: "MANUAL_REVIEW_QUEUE",
      summary: Object.freeze({ count, oldestAgeSeconds }),
      cases,
      truncated: count > cases.length,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1) throw new Error("INVALID_MANUAL_DATABASE_TIME");
  return requireDate(rows[0]?.capturedAt, "INVALID_MANUAL_DATABASE_TIME");
}

function manualCase(
  record: {
    refundAttemptId: string;
    updatedAt: Date;
    refundAttempt: {
      providerOperationBinding: { eligibilityProof: { id: string } | null } | null;
    };
    dispatchAttempts: readonly {
      contactMarkedAt: Date | null;
      contactEligibilityProof: { id: string } | null;
    }[];
  },
  capturedAt: Date,
): ManualReviewCase {
  const authorizationEvidenceCount = record.refundAttempt.providerOperationBinding
    ?.eligibilityProof ? 1 : 0;
  const contactEvidenceCount = record.dispatchAttempts.filter(
    (dispatch) => dispatch.contactEligibilityProof !== null,
  ).length;
  const contactMarkerPresent = record.dispatchAttempts.some(
    (dispatch) => dispatch.contactMarkedAt !== null,
  );
  return Object.freeze({
    caseRef: record.refundAttemptId,
    ageSeconds: refundExecutionOldestAgeSeconds(capturedAt, record.updatedAt),
    contactMarkerPresent,
    authorizationEvidenceCount,
    contactEvidenceCount,
  });
}

function requireNonnegativeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_MANUAL_COUNT");
  return value;
}

function emptyOldest(value: Date | null): null {
  if (value !== null) throw new Error("INVALID_EMPTY_MANUAL_OLDEST");
  return null;
}

function requireDate(value: unknown, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(code);
  return value;
}
