import { Prisma, type PrismaClient } from "@prisma/client";
import {
  REFUND_RECONCILIATION_CLASSIFICATIONS,
  type RefundReconciliationCase,
  type RefundReconciliationClassification,
  type RefundReconciliationSnapshotResult,
} from "./refund-operations-contract";
import { refundExecutionOldestAgeSeconds } from "./refund-age";
import { TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS } from "./providers/toss/refund-recovery-policy";

export const REFUND_RECONCILIATION_WARNING_SECONDS = 10 * 24 * 60 * 60;
export const REFUND_RECONCILIATION_CRITICAL_SECONDS = 12 * 24 * 60 * 60;
export const REFUND_RECONCILIATION_HARD_DEADLINE_SECONDS =
  refundReconciliationHardDeadlineSeconds(TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
const RECONCILIATION_CASE_LIMIT = 100;

type ReconciliationSummaryRow = Readonly<{
  caseCount: bigint;
  possibleContactCount: bigint;
  manualReviewCount: bigint;
  contactedWarningCount: bigint;
  contactedCriticalCount: bigint;
}>;

type ReconciliationCaseRow = Readonly<{
  caseRef: string;
  manualReview: boolean;
  possibleContact: boolean;
  deadlineWarning: boolean;
  deadlineCritical: boolean;
  oldestRelevantAgeSeconds: bigint;
}>;

export async function readRefundOperationsReconciliationSnapshot(
  client: PrismaClient,
): Promise<RefundReconciliationSnapshotResult> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const capturedAt = await captureDatabaseTime(tx);
    const summaryRows = await tx.$queryRaw<ReconciliationSummaryRow[]>(summaryQuery(capturedAt));
    const caseRows = await tx.$queryRaw<ReconciliationCaseRow[]>(casesQuery(capturedAt));
    if (summaryRows.length !== 1) throw new Error("INVALID_RECONCILIATION_SUMMARY");
    const summaryRow = summaryRows[0];
    const caseCount = safeBigInt(summaryRow.caseCount);
    const summary = Object.freeze({
      caseCount,
      possibleContactCount: safeBigInt(summaryRow.possibleContactCount),
      manualReviewCount: safeBigInt(summaryRow.manualReviewCount),
      contactedWarningCount: safeBigInt(summaryRow.contactedWarningCount),
      contactedCriticalCount: safeBigInt(summaryRow.contactedCriticalCount),
    });
    const cases = Object.freeze(caseRows.map((row) => reconciliationCase(row, capturedAt)));
    return Object.freeze({
      ok: true,
      code: "RECONCILIATION_SNAPSHOT",
      summary,
      cases,
      truncated: caseCount > cases.length,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export function refundReconciliationDeadlineClassification(
  capturedAt: Date,
  earliestContactAt: Date,
): "BELOW_WARNING" | "WARNING" | "CRITICAL" {
  const age = refundExecutionOldestAgeSeconds(capturedAt, earliestContactAt);
  if (age >= REFUND_RECONCILIATION_CRITICAL_SECONDS) return "CRITICAL";
  if (age >= REFUND_RECONCILIATION_WARNING_SECONDS) return "WARNING";
  return "BELOW_WARNING";
}

export function refundReconciliationHardDeadlineReached(
  capturedAt: Date,
  earliestContactAt: Date,
): boolean {
  return refundExecutionOldestAgeSeconds(capturedAt, earliestContactAt)
    >= REFUND_RECONCILIATION_HARD_DEADLINE_SECONDS;
}

export function refundReconciliationHardDeadlineSeconds(policyMilliseconds: number): number {
  if (!Number.isFinite(policyMilliseconds) || !Number.isSafeInteger(policyMilliseconds)
    || policyMilliseconds < 0 || policyMilliseconds % 1_000 !== 0) {
    throw new Error("INVALID_REFUND_RECONCILIATION_HARD_DEADLINE");
  }
  const seconds = policyMilliseconds / 1_000;
  if (!Number.isSafeInteger(seconds)) {
    throw new Error("INVALID_REFUND_RECONCILIATION_HARD_DEADLINE");
  }
  return seconds;
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !isDate(rows[0]?.capturedAt)) {
    throw new Error("INVALID_RECONCILIATION_DATABASE_TIME");
  }
  return rows[0].capturedAt;
}

function candidateCte(): Prisma.Sql {
  return Prisma.sql`
    WITH candidates AS (
      SELECT
        command."refundAttemptId" AS "caseRef",
        (
          command."status" = 'PARKED'::"RefundExecutionCommandStatus"
          AND attempt."status" = 'MANUAL_REVIEW'::"RefundAttemptStatus"
        ) AS "manualReview",
        MIN(dispatch."contactMarkedAt") FILTER (
          WHERE dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
            AND dispatch."contactMarkedAt" IS NOT NULL
        ) AS "earliestContactAt",
        CASE
          WHEN command."status" = 'PARKED'::"RefundExecutionCommandStatus"
            AND attempt."status" = 'MANUAL_REVIEW'::"RefundAttemptStatus"
          THEN LEAST(
            command."updatedAt",
            MIN(dispatch."contactMarkedAt") FILTER (
              WHERE dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
                AND dispatch."contactMarkedAt" IS NOT NULL
            )
          )
          ELSE MIN(dispatch."contactMarkedAt") FILTER (
            WHERE dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
              AND dispatch."contactMarkedAt" IS NOT NULL
          )
        END AS "oldestRelevantAt"
      FROM "RefundExecutionCommand" AS command
      JOIN "RefundAttempt" AS attempt ON attempt."id" = command."refundAttemptId"
      JOIN "Order" AS aggregate ON aggregate."id" = attempt."orderId"
      LEFT JOIN "RefundExecutionDispatchAttempt" AS dispatch
        ON dispatch."commandId" = command."id"
      WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
        AND attempt."mode" = 'SANDBOX'::"PaymentMode"
        AND aggregate."status" = 'REFUND_PENDING'::"OrderStatus"
      GROUP BY command."refundAttemptId", command."status", attempt."status", command."updatedAt"
      HAVING (
        command."status" = 'PARKED'::"RefundExecutionCommandStatus"
        AND attempt."status" = 'MANUAL_REVIEW'::"RefundAttemptStatus"
      ) OR COUNT(dispatch."id") FILTER (
        WHERE dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
          AND dispatch."contactMarkedAt" IS NOT NULL
      ) > 0
    )
  `;
}

function summaryQuery(capturedAt: Date): Prisma.Sql {
  const warningAt = thresholdTimestamp(capturedAt, REFUND_RECONCILIATION_WARNING_SECONDS);
  const criticalAt = thresholdTimestamp(capturedAt, REFUND_RECONCILIATION_CRITICAL_SECONDS);
  return Prisma.sql`
    ${candidateCte()}
    SELECT
      COUNT(DISTINCT "caseRef")::bigint AS "caseCount",
      COUNT(*) FILTER (WHERE "earliestContactAt" IS NOT NULL)::bigint AS "possibleContactCount",
      COUNT(*) FILTER (WHERE "manualReview")::bigint AS "manualReviewCount",
      COUNT(*) FILTER (
        WHERE "earliestContactAt" <= ${warningAt}
          AND "earliestContactAt" > ${criticalAt}
      )::bigint AS "contactedWarningCount",
      COUNT(*) FILTER (
        WHERE "earliestContactAt" <= ${criticalAt}
      )::bigint AS "contactedCriticalCount"
    FROM candidates
  `;
}

function casesQuery(capturedAt: Date): Prisma.Sql {
  const warningAt = thresholdTimestamp(capturedAt, REFUND_RECONCILIATION_WARNING_SECONDS);
  const criticalAt = thresholdTimestamp(capturedAt, REFUND_RECONCILIATION_CRITICAL_SECONDS);
  return Prisma.sql`
    ${candidateCte()}
    SELECT
      "caseRef",
      "manualReview",
      "earliestContactAt" IS NOT NULL AS "possibleContact",
      COALESCE("earliestContactAt" <= ${warningAt}, false) AS "deadlineWarning",
      COALESCE("earliestContactAt" <= ${criticalAt}, false) AS "deadlineCritical",
      GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (
          ${capturedAt} - ("oldestRelevantAt" AT TIME ZONE 'UTC')
        )))
      )::bigint AS "oldestRelevantAgeSeconds"
    FROM candidates
    ORDER BY
      CASE
        WHEN "earliestContactAt" <= ${criticalAt} THEN 4
        WHEN "earliestContactAt" <= ${warningAt} THEN 3
        WHEN "manualReview" THEN 2
        ELSE 1
      END DESC,
      "oldestRelevantAgeSeconds" DESC,
      "caseRef" COLLATE "C" ASC
    LIMIT ${RECONCILIATION_CASE_LIMIT}
  `;
}

function reconciliationCase(
  row: ReconciliationCaseRow,
  _capturedAt: Date,
): RefundReconciliationCase {
  if (!validCaseRow(row)) throw new Error("INVALID_RECONCILIATION_CASE");
  const classifications = caseClassifications(row);
  if (!classifications.every((value, index) => (
    index === 0 || REFUND_RECONCILIATION_CLASSIFICATIONS.indexOf(classifications[index - 1])
      < REFUND_RECONCILIATION_CLASSIFICATIONS.indexOf(value)
  ))) throw new Error("NONCANONICAL_RECONCILIATION_CASE");
  return Object.freeze({
    caseRef: row.caseRef,
    classifications: Object.freeze(classifications),
    oldestRelevantAgeSeconds: safeBigInt(row.oldestRelevantAgeSeconds),
  });
}

function validCaseRow(row: ReconciliationCaseRow): boolean {
  const booleans = [
    row.manualReview, row.possibleContact, row.deadlineWarning, row.deadlineCritical,
  ];
  return booleans.every((value) => typeof value === "boolean")
    && (!row.deadlineCritical || row.deadlineWarning);
}

function caseClassifications(
  row: ReconciliationCaseRow,
): RefundReconciliationClassification[] {
  const classifications: RefundReconciliationClassification[] = [];
  if (row.possibleContact) classifications.push("POSSIBLE_CONTACT");
  if (row.manualReview) classifications.push("MANUAL_REVIEW");
  if (row.deadlineWarning && !row.deadlineCritical) {
    classifications.push("CONTACTED_DEADLINE_WARNING");
  }
  if (row.deadlineCritical) classifications.push("CONTACTED_DEADLINE_CRITICAL");
  return classifications;
}

function safeBigInt(value: bigint): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error("INVALID_RECONCILIATION_COUNT");
  }
  return converted;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function thresholdTimestamp(capturedAt: Date, seconds: number): Date {
  const value = new Date(capturedAt.getTime() - seconds * 1_000);
  if (!isDate(value)) throw new Error("INVALID_RECONCILIATION_THRESHOLD");
  return value;
}
