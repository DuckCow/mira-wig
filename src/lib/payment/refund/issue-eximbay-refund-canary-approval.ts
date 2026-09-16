import { randomUUID } from "node:crypto";
import { PaymentMode, PaymentProvider, Prisma, type PrismaClient } from "@prisma/client";
import {
  EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
  EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION,
  evaluateEximbayRefundSandboxCanaryEvidence,
} from "./eximbay-refund-sandbox-canary-approval-contract";
import {
  EXIMBAY_CANARY_APPROVAL_TTL_MS,
  EximbayCanaryProducerError,
  deriveEximbayCanaryRuntimeBindings,
  extractEximbayCanaryRuntimeTargetAuthority,
  parseEximbayCanaryRuntimeReadback,
  requireEximbayCanaryExactContractDigests,
  type EximbayCanaryAttendedAttestation,
  type EximbayCanaryContractDigests,
} from "./eximbay-refund-canary-producer-contract";
import { inspectSealedEximbayCanaryTarget } from "./eximbay-refund-canary-target-producer";

const PRINCIPAL = /^[A-Za-z0-9._:@/-]{1,255}$/u;

export type IssueEximbayCanaryApprovalInput = Readonly<{
  paymentId: string;
  attestation: EximbayCanaryAttendedAttestation;
  contractDigests: EximbayCanaryContractDigests;
  runtimeReadback: unknown;
  issuerPrincipalId: string;
}>;

export type IssueEximbayCanaryApprovalResult = Readonly<{
  ok: true;
  code: "EXIMBAY_CANARY_APPROVAL_ISSUED";
  approvalId: string;
  commandId: string;
  approvedAt: string;
  expiresAt: string;
  approvalEvidenceDigest: string;
  targetBindingDigest: string;
}>;

export async function issueEximbayRefundCanaryApproval(
  client: PrismaClient,
  input: IssueEximbayCanaryApprovalInput,
): Promise<IssueEximbayCanaryApprovalResult> {
  requireEximbayCanaryExactContractDigests(input.contractDigests);
  const issuerPrincipalId = normalizePrincipal(input.issuerPrincipalId);
  const runtimeTarget = extractEximbayCanaryRuntimeTargetAuthority(input.runtimeReadback);
  if (!runtimeTarget) throw new EximbayCanaryProducerError("RUNTIME_READBACK_INVALID");

  return client.$transaction(async (tx) => {
    const inspected = await inspectSealedEximbayCanaryTarget(
      tx, input.paymentId, input.attestation, runtimeTarget.targetBindingDigest,
    );
    const command = inspected.target.executionCommand;
    if (!command) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
    const expectedBindings = deriveEximbayCanaryRuntimeBindings(input.contractDigests, {
      targetBindingDigest: runtimeTarget.targetBindingDigest,
      syntheticProvenanceDigest: inspected.syntheticProvenanceDigest,
      merchantAccountBindingId: inspected.merchantAccountBindingId,
      credentialGenerationBindingId: inspected.credentialGenerationBindingId,
    });
    if (!parseEximbayCanaryRuntimeReadback(input.runtimeReadback, expectedBindings)) {
      throw new EximbayCanaryProducerError("RUNTIME_READBACK_INVALID");
    }
    const evaluation = evaluateEximbayRefundSandboxCanaryEvidence({
      formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION,
      provider: "EXIMBAY",
      mode: "SANDBOX",
      trigger: "MANUAL_ONLY",
      intendedExecutionLimit: 1,
      releaseBindingDigest: expectedBindings.releaseBindingDigest,
      canaryJobBindingDigest: expectedBindings.canaryJobBindingDigest,
      preflightJobBindingDigest: expectedBindings.preflightJobBindingDigest,
      imageBindingDigest: expectedBindings.imageBindingDigest,
      secretGenerationBindingDigest: expectedBindings.secretGenerationBindingDigest,
      targetBindingDigest: expectedBindings.targetBindingDigest,
    });
    if (!evaluation.ok || !evaluation.approvalEvidenceDigest) {
      throw new EximbayCanaryProducerError("APPROVAL_EVIDENCE_INVALID");
    }
    const approvedAt = await captureDatabaseTime(tx);
    const expiresAt = new Date(approvedAt.getTime() + EXIMBAY_CANARY_APPROVAL_TTL_MS);
    const approval = await tx.eximbayRefundSandboxCanaryApproval.create({
      data: {
        id: `eximbay-canary-approval-${randomUUID()}`,
        formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        approvalEvidenceDigest: evaluation.approvalEvidenceDigest,
        releaseBindingDigest: expectedBindings.releaseBindingDigest,
        canaryJobBindingDigest: expectedBindings.canaryJobBindingDigest,
        preflightJobBindingDigest: expectedBindings.preflightJobBindingDigest,
        imageBindingDigest: expectedBindings.imageBindingDigest,
        secretGenerationBindingDigest: expectedBindings.secretGenerationBindingDigest,
        targetBindingDigest: expectedBindings.targetBindingDigest,
        commandId: command.id,
        approvedAt,
        expiresAt,
        issuedByPrincipalId: issuerPrincipalId,
        consumedAt: null,
        consumedExecutionId: null,
        consumedExecutionBindingDigest: null,
      },
    }).catch((error: unknown) => {
      if (isUniqueConstraint(error)) {
        throw new EximbayCanaryProducerError("APPROVAL_ALREADY_EXISTS");
      }
      throw new EximbayCanaryProducerError("APPROVAL_INSERT_FAILED");
    });
    requireApprovalReadback(approval, command.id, evaluation.approvalEvidenceDigest,
      expectedBindings.targetBindingDigest, approvedAt, expiresAt, issuerPrincipalId);
    return Object.freeze({
      ok: true,
      code: "EXIMBAY_CANARY_APPROVAL_ISSUED",
      approvalId: approval.id,
      commandId: approval.commandId,
      approvedAt: approval.approvedAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      approvalEvidenceDigest: approval.approvalEvidenceDigest,
      targetBindingDigest: approval.targetBindingDigest,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function normalizePrincipal(value: string): string {
  const normalized = value.trim();
  if (normalized !== value || !PRINCIPAL.test(normalized) || /\p{Cc}/u.test(normalized)) {
    throw new EximbayCanaryProducerError("ISSUER_PRINCIPAL_INVALID");
  }
  return normalized;
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new EximbayCanaryProducerError("DATABASE_TIME_UNAVAILABLE");
  }
  return capturedAt;
}

function requireApprovalReadback(
  approval: Readonly<{
    commandId: string;
    approvalEvidenceDigest: string;
    targetBindingDigest: string;
    approvedAt: Date;
    expiresAt: Date;
    issuedByPrincipalId: string;
    consumedAt: Date | null;
    consumedExecutionId: string | null;
    consumedExecutionBindingDigest: string | null;
  }>,
  commandId: string,
  evidenceDigest: string,
  targetBindingDigest: string,
  approvedAt: Date,
  expiresAt: Date,
  issuerPrincipalId: string,
): void {
  const valid = [
    approval.commandId === commandId,
    approval.approvalEvidenceDigest === evidenceDigest,
    approval.targetBindingDigest === targetBindingDigest,
    approval.approvedAt.getTime() === approvedAt.getTime(),
    approval.expiresAt.getTime() === expiresAt.getTime(),
    approval.issuedByPrincipalId === issuerPrincipalId,
    approval.consumedAt === null,
    approval.consumedExecutionId === null,
    approval.consumedExecutionBindingDigest === null,
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("APPROVAL_INSERT_FAILED");
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
