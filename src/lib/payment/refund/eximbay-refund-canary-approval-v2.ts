import type { EximbayRefundSandboxCanaryApproval } from "@prisma/client";
import { isEximbayRefundCanaryDatabaseSessionIssuer } from "./eximbay-refund-sandbox-canary-approval-contract";
import { createHash } from "node:crypto";
import { EXIMBAY_CANARY_JOB_V2 } from "./eximbay-refund-canary-job-v2";

export const EXIMBAY_CANARY_APPROVAL_V2 = "mira-refund-eximbay-sandbox-canary-approval/v2";
export const EXIMBAY_CANARY_TARGET_V2 = "mira-refund-eximbay-sandbox-canary-target/v2";
export const EXIMBAY_CANARY_CUSTODY_V3 = "mira-refund-eximbay-canary-fresh-sale-custody/v3";

export type EximbayCanaryApprovalAuthorityV2 = Readonly<{
  id: string;
  commandId: string;
  targetBindingDigest: string;
  custodyArtifactSha256: string;
  syntheticProvenanceDigest: string;
  noCustomerPiiAttested: true;
  canaryJobBindingDigest: string;
  releaseBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  issuedByPrincipalId: string;
  approvedAt: Date;
  expiresAt: Date;
}>;

export function approvalAuthorityDigestV2(facts: EximbayCanaryApprovalAuthorityV2): string {
  const digests = [facts.targetBindingDigest, facts.custodyArtifactSha256,
    facts.syntheticProvenanceDigest, facts.canaryJobBindingDigest,
    facts.releaseBindingDigest, facts.preflightJobBindingDigest,
    facts.imageBindingDigest, facts.secretGenerationBindingDigest,
    facts.merchantAccountBindingId, facts.credentialGenerationBindingId];
  if (![digests.every((value) => /^[0-9a-f]{64}$/u.test(value)),
    facts.noCustomerPiiAttested === true, Boolean(facts.id), Boolean(facts.commandId),
    isEximbayRefundCanaryDatabaseSessionIssuer(facts.issuedByPrincipalId),
    Number.isFinite(facts.approvedAt.getTime()), Number.isFinite(facts.expiresAt.getTime()),
    facts.approvedAt < facts.expiresAt].every(Boolean)) throw new Error("APPROVAL_V2_AUTHORITY_INVALID");
  return createHash("sha256").update(JSON.stringify([
    EXIMBAY_CANARY_APPROVAL_V2, facts.id, facts.commandId,
    "EXIMBAY", "SANDBOX", "MANUAL_ONLY", 1,
    EXIMBAY_CANARY_TARGET_V2, facts.targetBindingDigest,
    EXIMBAY_CANARY_CUSTODY_V3, facts.custodyArtifactSha256,
    facts.syntheticProvenanceDigest, true,
    EXIMBAY_CANARY_JOB_V2, facts.canaryJobBindingDigest,
    facts.releaseBindingDigest, facts.preflightJobBindingDigest,
    facts.imageBindingDigest, facts.secretGenerationBindingDigest,
    facts.merchantAccountBindingId, facts.credentialGenerationBindingId,
    facts.issuedByPrincipalId, facts.approvedAt.toISOString(), facts.expiresAt.toISOString(),
  ]), "utf8").digest("hex");
}

/** Verifies the complete immutable persisted authority; never accepts v1 by fallback. */
export function verifiedApprovalAuthorityV2(row: EximbayRefundSandboxCanaryApproval):
EximbayCanaryApprovalAuthorityV2 | null {
  if (![row.formatVersion === EXIMBAY_CANARY_APPROVAL_V2,
    row.provider === "EXIMBAY", row.mode === "SANDBOX",
    row.jobContractVersion === EXIMBAY_CANARY_JOB_V2,
    row.targetContractVersion === EXIMBAY_CANARY_TARGET_V2,
    row.custodyContractVersion === EXIMBAY_CANARY_CUSTODY_V3,
    row.approvalEvidenceDigest === row.custodyArtifactSha256].every(Boolean)) return null;
  if (!row.custodyArtifactSha256 || !row.syntheticProvenanceDigest
    || !row.merchantAccountBindingId || !row.credentialGenerationBindingId
    ) return null;
  if (row.noCustomerPiiAttested !== true) return null;
  const facts = { ...row, custodyArtifactSha256: row.custodyArtifactSha256,
    syntheticProvenanceDigest: row.syntheticProvenanceDigest,
    merchantAccountBindingId: row.merchantAccountBindingId,
    credentialGenerationBindingId: row.credentialGenerationBindingId,
    noCustomerPiiAttested: true as const };
  try {
    return authorityDigestMatches(facts, row.approvalAuthorityDigestV2);
  } catch { return null; }
}

function authorityDigestMatches(facts: EximbayCanaryApprovalAuthorityV2, expected: string | null): EximbayCanaryApprovalAuthorityV2 | null {
  return approvalAuthorityDigestV2(facts) === expected ? facts : null;
}
