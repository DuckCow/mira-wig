import { Prisma, type PrismaClient } from "@prisma/client";
import {
  EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
  isEximbayRefundCanaryDatabaseSessionIssuer,
} from "./eximbay-refund-sandbox-canary-approval-contract";
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
  const targetMatches = await exactTargetMatches(tx, authority, approval);
  if (!targetMatches) return Object.freeze({ outcome: "TARGET_MISMATCH" });
  const postLockApproval = await tx.eximbayRefundSandboxCanaryApproval.findUnique({
    where: { id: approval.id },
  });
  if (!postLockApproval || postLockApproval.consumedAt !== null) return configMismatch();
  const consumed = await consumeByCas(tx, authority, postLockApproval);
  return consumed === 1
    ? Object.freeze({ outcome: "ADMITTED", commandId: approval.commandId })
    : configMismatch();
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

async function exactTargetMatches(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
  approval: Readonly<{
    commandId: string;
    targetBindingDigest: string;
    approvalEvidenceDigest: string;
    issuedByPrincipalId: string;
  }>,
): Promise<boolean> {
  if (approval.approvalEvidenceDigest !== authority.custodyArtifactSha256
    || !isEximbayRefundCanaryDatabaseSessionIssuer(approval.issuedByPrincipalId)) return false;
  const target = await verifyEximbayRefundCanaryTarget(tx, {
    commandId: approval.commandId,
    merchantAccountBindingId: authority.merchantAccountBindingId,
    credentialGenerationBindingId: authority.credentialGenerationBindingId,
    custodyArtifactSha256: authority.custodyArtifactSha256,
    expectedTargetBindingDigest: approval.targetBindingDigest,
  });
  return target !== null;
}

async function consumeByCas(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
  approval: Readonly<{
    id: string;
    commandId: string;
    approvalEvidenceDigest: string;
    releaseBindingDigest: string;
    canaryJobBindingDigest: string;
    preflightJobBindingDigest: string;
    imageBindingDigest: string;
    secretGenerationBindingDigest: string;
    targetBindingDigest: string;
    approvedAt: Date;
    expiresAt: Date;
    issuedByPrincipalId: string;
  }>,
): Promise<number> {
  const consumed = await tx.$queryRaw<{ consumedAt: Date }[]>(Prisma.sql`
    WITH decision AS (
      SELECT date_trunc('milliseconds', clock_timestamp()) AS "decisionAt"
    )
    UPDATE "EximbayRefundSandboxCanaryApproval" AS approval
    SET "consumedAt" = decision."decisionAt",
      "consumedExecutionId" = ${authority.consumedExecutionId},
      "consumedExecutionBindingDigest" = ${authority.consumedExecutionBindingDigest}
    FROM decision
    WHERE approval."id" = ${approval.id}
      AND approval."formatVersion" = ${EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION}
      AND approval."provider" = 'EXIMBAY'::"PaymentProvider"
      AND approval."mode" = 'SANDBOX'::"PaymentMode"
      AND approval."approvalEvidenceDigest" = ${approval.approvalEvidenceDigest}
      AND approval."approvalEvidenceDigest" = ${authority.custodyArtifactSha256}
      AND approval."releaseBindingDigest" = ${approval.releaseBindingDigest}
      AND approval."releaseBindingDigest" = ${authority.releaseBindingDigest}
      AND approval."canaryJobBindingDigest" = ${approval.canaryJobBindingDigest}
      AND approval."canaryJobBindingDigest" = ${authority.canaryJobBindingDigest}
      AND approval."preflightJobBindingDigest" = ${approval.preflightJobBindingDigest}
      AND approval."preflightJobBindingDigest" = ${authority.preflightJobBindingDigest}
      AND approval."imageBindingDigest" = ${approval.imageBindingDigest}
      AND approval."imageBindingDigest" = ${authority.imageBindingDigest}
      AND approval."secretGenerationBindingDigest" = ${approval.secretGenerationBindingDigest}
      AND approval."secretGenerationBindingDigest" = ${authority.secretGenerationBindingDigest}
      AND approval."targetBindingDigest" = ${approval.targetBindingDigest}
      AND approval."targetBindingDigest" = ${authority.targetBindingDigest}
      AND approval."commandId" = ${approval.commandId}
      AND approval."approvedAt" = ${approval.approvedAt}
      AND approval."expiresAt" = ${approval.expiresAt}
      AND approval."issuedByPrincipalId" = ${approval.issuedByPrincipalId}
      AND approval."consumedAt" IS NULL
      AND approval."consumedExecutionId" IS NULL
      AND approval."consumedExecutionBindingDigest" IS NULL
      AND approval."approvedAt" <= decision."decisionAt"
      AND approval."expiresAt" > decision."decisionAt"
    RETURNING approval."consumedAt"
  `);
  return consumed.length;
}

function configMismatch(): ConsumeEximbayRefundCanaryApprovalResult {
  return Object.freeze({ outcome: "CONFIG_MISMATCH" });
}

function alreadyConsumed(): ConsumeEximbayRefundCanaryApprovalResult {
  return Object.freeze({ outcome: "APPROVAL_ALREADY_CONSUMED" });
}
