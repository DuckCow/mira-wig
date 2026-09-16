import { EXIMBAY_CANARY_APPROVAL_V2, verifiedApprovalAuthorityV2 } from "./eximbay-refund-canary-approval-v2";
import { Prisma, type PrismaClient, type EximbayRefundSandboxCanaryApproval } from "@prisma/client";
import {
  isEximbayRefundCanaryDatabaseSessionIssuer,
} from "./eximbay-refund-sandbox-canary-approval-contract";
import type { EximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment-v2";
import { verifyEximbayRefundCanaryTargetV2 } from "./eximbay-refund-canary-target-binding-v2";

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
  if (!matchesAuthority(approval, authority)) return configMismatch();
  if (approval.consumedAt !== null) return alreadyConsumed();
  const targetMatches = await exactTargetMatches(tx, authority, approval);
  if (!targetMatches) return Object.freeze({ outcome: "TARGET_MISMATCH" });
  const postLockApproval = await tx.eximbayRefundSandboxCanaryApproval.findUnique({
    where: { id: approval.id },
  });
  if (!postLockApproval) return configMismatch();
  if (!unconsumedAuthority(postLockApproval, authority)) return configMismatch();
  const consumed = await consumeByCas(tx, authority, postLockApproval);
  return consumptionResult(consumed, approval.commandId);
}

async function lockExactApprovalId(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<string | null> {
  const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "EximbayRefundSandboxCanaryApproval"
    WHERE "formatVersion" = ${EXIMBAY_CANARY_APPROVAL_V2}
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
  const target = await verifyEximbayRefundCanaryTargetV2(tx, {
    commandId: approval.commandId,
    merchantAccountBindingId: authority.merchantAccountBindingId,
    credentialGenerationBindingId: authority.credentialGenerationBindingId,
    custodyArtifactSha256: authority.custodyArtifactSha256,
    syntheticProvenanceDigest: authority.syntheticProvenanceDigest,
    noCustomerPiiAttested: true,
    expectedTargetBindingDigest: approval.targetBindingDigest,
  });
  return target !== null;
}

async function consumeByCas(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
  approval: EximbayRefundSandboxCanaryApproval,
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
      AND approval."formatVersion" = ${EXIMBAY_CANARY_APPROVAL_V2}
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
      AND approval."approvalAuthorityDigestV2" = ${approval.approvalAuthorityDigestV2}
      AND approval."custodyArtifactSha256" = ${authority.custodyArtifactSha256}
      AND approval."syntheticProvenanceDigest" = ${authority.syntheticProvenanceDigest}
      AND approval."noCustomerPiiAttested" = true
      AND approval."merchantAccountBindingId" = ${authority.merchantAccountBindingId}
      AND approval."credentialGenerationBindingId" = ${authority.credentialGenerationBindingId}
      AND approval."jobContractVersion" = ${approval.jobContractVersion}
      AND approval."custodyContractVersion" = ${approval.custodyContractVersion}
      AND approval."targetContractVersion" = ${approval.targetContractVersion}
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

function matchesAuthority(row: EximbayRefundSandboxCanaryApproval,
  authority: EximbayRefundCanaryEnvironment): boolean {
  const verified = verifiedApprovalAuthorityV2(row);
  return verified !== null
    && verified.custodyArtifactSha256 === authority.custodyArtifactSha256
    && verified.syntheticProvenanceDigest === authority.syntheticProvenanceDigest
    && verified.merchantAccountBindingId === authority.merchantAccountBindingId
    && verified.credentialGenerationBindingId === authority.credentialGenerationBindingId;
}

function unconsumedAuthority(row: EximbayRefundSandboxCanaryApproval,
  authority: EximbayRefundCanaryEnvironment): boolean {
  return row.consumedAt === null && matchesAuthority(row, authority);
}

function consumptionResult(count: number, commandId: string): ConsumeEximbayRefundCanaryApprovalResult {
  return count === 1 ? Object.freeze({ outcome: "ADMITTED", commandId }) : configMismatch();
}
