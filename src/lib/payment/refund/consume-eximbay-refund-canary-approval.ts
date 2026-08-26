import { PaymentMode, PaymentProvider, Prisma, type PrismaClient } from "@prisma/client";
import { EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION } from
  "./eximbay-refund-sandbox-canary-approval-contract";
import type { EximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment";
import { verifyEximbayRefundCanaryTarget } from "./eximbay-refund-canary-target-binding";

export type ConsumeEximbayRefundCanaryApprovalResult =
  | Readonly<{ outcome: "ADMITTED"; commandId: string }>
  | Readonly<{ outcome: "APPROVAL_ALREADY_CONSUMED" }>
  | Readonly<{ outcome: "CONFIG_MISMATCH" }>
  | Readonly<{ outcome: "TARGET_MISMATCH" }>;

export async function consumeEximbayRefundCanaryApproval(
  client: PrismaClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<ConsumeEximbayRefundCanaryApprovalResult> {
  return client.$transaction(
    (tx) => consumeInTransaction(tx, authority),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

async function consumeInTransaction(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<ConsumeEximbayRefundCanaryApprovalResult> {
  const approvalId = await lockExactApprovalId(tx, authority);
  if (!approvalId) return configMismatch();
  const approval = await tx.eximbayRefundSandboxCanaryApproval.findUnique({
    where: { id: approvalId },
  });
  if (!approval) return configMismatch();
  if (approval.consumedAt !== null) return alreadyConsumed();
  const capturedAt = await captureDatabaseTime(tx);
  if (!capturedAt || !approvalIsCurrent(approval.approvedAt, approval.expiresAt, capturedAt)) {
    return configMismatch();
  }
  const targetMatches = await exactTargetMatches(tx, authority, approval);
  if (!targetMatches) return Object.freeze({ outcome: "TARGET_MISMATCH" });
  const consumed = await consumeByCas(tx, authority, approval.id, capturedAt);
  return consumed === 1
    ? Object.freeze({ outcome: "ADMITTED", commandId: approval.commandId })
    : alreadyConsumed();
}

async function lockExactApprovalId(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<string | null> {
  const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "EximbayRefundSandboxCanaryApproval"
    WHERE "formatVersion" = ${EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION}
      AND "provider" = 'EXIMBAY'::"PaymentProvider"
      AND "mode" = 'SANDBOX'::"PaymentMode"
      AND "releaseBindingDigest" = ${authority.releaseBindingDigest}
      AND "canaryJobBindingDigest" = ${authority.canaryJobBindingDigest}
      AND "preflightJobBindingDigest" = ${authority.preflightJobBindingDigest}
      AND "imageBindingDigest" = ${authority.imageBindingDigest}
      AND "secretGenerationBindingDigest" = ${authority.secretGenerationBindingDigest}
      AND "targetBindingDigest" = ${authority.targetBindingDigest}
    ORDER BY "id" FOR UPDATE
  `);
  const first = ids[0];
  return ids.length === 1 && first ? first.id : null;
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date | null> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  return rows.length === 1 && capturedAt instanceof Date ? capturedAt : null;
}

function approvalIsCurrent(approvedAt: Date, expiresAt: Date, now: Date): boolean {
  return approvedAt.getTime() <= now.getTime() && expiresAt.getTime() > now.getTime();
}

async function exactTargetMatches(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
  approval: Readonly<{ commandId: string; targetBindingDigest: string }>,
): Promise<boolean> {
  const target = await verifyEximbayRefundCanaryTarget(tx, {
    commandId: approval.commandId,
    merchantAccountBindingId: authority.merchantAccountBindingId,
    credentialGenerationBindingId: authority.credentialGenerationBindingId,
    syntheticProvenanceDigest: authority.syntheticProvenanceDigest,
    noCustomerPiiAttested: true,
    expectedTargetBindingDigest: approval.targetBindingDigest,
  });
  return target !== null;
}

async function consumeByCas(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
  approvalId: string,
  capturedAt: Date,
): Promise<number> {
  const consumed = await tx.eximbayRefundSandboxCanaryApproval.updateMany({
    where: {
      id: approvalId,
      formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      consumedAt: null,
      approvedAt: { lte: capturedAt },
      expiresAt: { gt: capturedAt },
    },
    data: {
      consumedAt: capturedAt,
      consumedExecutionId: authority.consumedExecutionId,
      consumedExecutionBindingDigest: authority.consumedExecutionBindingDigest,
    },
  });
  return consumed.count;
}

function configMismatch(): ConsumeEximbayRefundCanaryApprovalResult {
  return Object.freeze({ outcome: "CONFIG_MISMATCH" });
}

function alreadyConsumed(): ConsumeEximbayRefundCanaryApprovalResult {
  return Object.freeze({ outcome: "APPROVAL_ALREADY_CONSUMED" });
}
