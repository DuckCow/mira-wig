import { createHash } from "node:crypto";
import {
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import { EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION } from
  "./eximbay-refund-sandbox-canary-approval-contract";
import type { EximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment";
import {
  deriveEximbayRefundOperationFamily,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "./providers/eximbay/preflight-contract";

export const EXIMBAY_REFUND_REENTRY_TARGET = Object.freeze({
  paymentId: "cmtsdmk16000201s6alc0evek",
  orderId: "cmtsdmo8r000401s671x1chsp",
  refundAttemptId: "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8",
  commandId: "cmtsdrrxk00010ss6we7g8qe7",
  providerOperationBindingId: "cmtsdrs0900030ss6qwxcgar6",
  approvalId: "eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc",
  targetBindingDigest: "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c",
  approvalEvidenceDigest: "e4464d8ee559e7fd3f65909128fe240ba23a60e210fd0e861fcbdc12404f0e63",
  consumedExecutionId: "cloud-run-0899eaa6e48ed3578f7c1ae2427ce00c",
  consumedExecutionBindingDigest:
    "e95385493ef34bace5fcb2c706740255984b57ced3ac8b6eae8e022df63e2748",
  releaseBindingDigest: "0944e3e6fd1d0f85a0b5196adf4fe724e27eff64992e1fe711bfdf3f77637433",
  canaryJobBindingDigest: "204c8cd805e7cb66f66e7a7590f070117bc2f2312c30d46ac64b7cd574b42c07",
  preflightJobBindingDigest: "97e3aeb0fc4c1bec9ae316d915158ffb647ced886fd8166f1929d2f9dc925ffd",
  imageBindingDigest: "5c5718b3e697f5bb72491f5347e172eddb7026aac1fb87aa7b8da4bae875852e",
  secretGenerationBindingDigest:
    "cc778c3c5d0a533371ef31c119b521510f0b7eb2a1515cc7e6f04a4c304129d7",
  syntheticProvenanceDigest:
    "710a63bda4810d0f1f974a82b33b476dedaa20cc14df6746eb3bb478790a4d75",
  merchantAccountBindingId:
    "783244bb25ed5c7506bd3589e8b252e683c65f265068673dbe4d18e415477893",
  credentialGenerationBindingId:
    "2c03724ab5f9746b50815e888ef1619719b5ab1590ac69873487d337ffd50c73",
  providerOperationFamilyKey:
    "eximbay-refund-family-v1-a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62",
  operationFamilyFingerprint:
    "a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62",
  approvalApprovedAt: "2026-09-08T08:05:31.763Z",
  approvalExpiresAt: "2026-09-08T08:35:31.763Z",
  approvalConsumedAt: "2026-09-08T08:07:49.762Z",
  generationOneLeaseUntil: "2026-09-08T08:12:50.494Z",
  generationOneLeaseEventId: "cmtse03xh00000ps6ktj4v6ys",
  generationOneLeaseOccurredAt: "2026-09-08T08:07:50.494Z",
  predecessorLeaseDurationMs: 300_000,
  predecessorLeaseGeneration: 2,
  amount: 100,
  currency: "USD",
  mid: "1849705C64",
} as const);

export type EximbayRefundReentryHistoricalSeal = Readonly<{
  commandId: typeof EXIMBAY_REFUND_REENTRY_TARGET.commandId;
  predecessorLeaseGeneration: typeof EXIMBAY_REFUND_REENTRY_TARGET.predecessorLeaseGeneration;
}>;

export async function verifyExactConsumedEximbayRefundReentrySeal(
  client: PrismaClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<EximbayRefundReentryHistoricalSeal | null> {
  return client.$transaction((tx) => verifyInTransaction(tx, authority), {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

async function verifyInTransaction(
  tx: Prisma.TransactionClient,
  authority: EximbayRefundCanaryEnvironment,
): Promise<EximbayRefundReentryHistoricalSeal | null> {
  if (!environmentMatchesRetainedSeal(authority)) return null;
  const capturedAt = await captureDatabaseTime(tx);
  const [approval, command, contactProofCount, evidenceCount] =
    await Promise.all([
      tx.eximbayRefundSandboxCanaryApproval.findUnique({
        where: { id: EXIMBAY_REFUND_REENTRY_TARGET.approvalId },
      }),
      loadTarget(tx),
      tx.refundExecutionProviderContactEligibilityProof.count({
        where: { dispatchAttempt: { commandId: EXIMBAY_REFUND_REENTRY_TARGET.commandId } },
      }),
      tx.refundExecutionEvidence.count({
        where: { commandId: EXIMBAY_REFUND_REENTRY_TARGET.commandId },
      }),
    ]);
  if (!approval || !command) return null;
  if (![approvalMatches(approval, authority), targetMatches(command, capturedAt)].every(Boolean)) {
    return null;
  }
  if ([contactProofCount, evidenceCount].some((count) => count !== 0)) {
    return null;
  }
  return Object.freeze({
    commandId: EXIMBAY_REFUND_REENTRY_TARGET.commandId,
    predecessorLeaseGeneration: EXIMBAY_REFUND_REENTRY_TARGET.predecessorLeaseGeneration,
  });
}

function loadTarget(tx: Prisma.TransactionClient) {
  return tx.refundExecutionCommand.findUnique({
    where: { id: EXIMBAY_REFUND_REENTRY_TARGET.commandId },
    include: {
      events: { orderBy: [{ leaseGeneration: "asc" }, { occurredAt: "asc" }] },
      dispatchAttempts: true,
      refundAttempt: {
        include: {
          order: true,
          payment: true,
          transitions: true,
          providerOperationBinding: {
            include: { eligibilityProof: true, eximbayPreflightObservations: true },
          },
        },
      },
    },
  });
}

type Target = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;
type Approval = Prisma.EximbayRefundSandboxCanaryApprovalGetPayload<Record<string, never>>;

function targetMatches(command: Target, capturedAt: Date): boolean {
  const target = EXIMBAY_REFUND_REENTRY_TARGET;
  const attempt = command.refundAttempt;
  const payment = attempt.payment;
  const order = attempt.order;
  const binding = attempt.providerOperationBinding;
  const paymentKey = payment.providerPaymentKey;
  if (!binding) return false;
  if (!paymentKey) return false;
  const family = deriveEximbayRefundOperationFamily(
    attempt.idempotencyKey, paymentKey, attempt.amount, attempt.currency,
  );
  const historicalTargetDigest = canaryTargetBindingDigest({
    commandId: command.id,
    refundAttemptId: attempt.id,
    paymentId: payment.id,
    providerOperationBindingId: binding.id,
    amount: attempt.amount,
    currency: attempt.currency,
    idempotencyKey: attempt.idempotencyKey,
    providerOrderId: payment.providerOrderId,
    providerPaymentKey: paymentKey,
    financialSucceededAt: payment.financialSucceededAt,
    providerOperationFamilyKey: family.key,
    operationFamilyFingerprint: family.fingerprint,
    merchantAccountBindingId: binding.merchantAccountBindingId,
    credentialGenerationBindingId: binding.credentialGenerationBindingId,
    syntheticProvenanceDigest: target.syntheticProvenanceDigest,
  });
  const leaseExpired = isExpiredLease(command.leaseUntil, capturedAt);
  const leaseOwnerValid = isNonemptyLeaseOwner(command.leaseOwner);
  const predecessorLeaseMatches = exactPredecessorLeaseMatches(command, command.events);
  return [
    payment.id === target.paymentId,
    order.id === target.orderId,
    attempt.id === target.refundAttemptId,
    command.id === target.commandId,
    binding.id === target.providerOperationBindingId,
    payment.status === PaymentAttemptStatus.SUCCEEDED,
    payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    order.paymentId === payment.id,
    order.status === OrderStatus.REFUND_PENDING,
    attempt.orderId === order.id,
    attempt.paymentId === payment.id,
    attempt.status === RefundAttemptStatus.PROCESSING,
    attempt.actorType === RefundAttemptActorType.SYSTEM,
    attempt.actorUserId === null,
    attempt.provider === PaymentProvider.EXIMBAY,
    attempt.mode === PaymentMode.SANDBOX,
    attempt.providerRefundId === null,
    attempt.processedAt === null,
    attempt.failedAt === null,
    attempt.failureCode === null,
    attempt.amount === target.amount,
    attempt.currency === target.currency,
    order.currency === attempt.currency,
    payment.amount === attempt.amount,
    payment.currency === attempt.currency,
    command.status === RefundExecutionCommandStatus.LEASED,
    command.leaseGeneration === target.predecessorLeaseGeneration,
    command.dispatchAttempt === 0,
    leaseExpired,
    predecessorLeaseMatches,
    leaseOwnerValid,
    isLeaseTokenHash(command.leaseTokenHash),
    command.lastSafeErrorCode === null,
    command.lastSafeErrorMessage === null,
    command.dispatchAttempts.length === 0,
    exactPredecessorEventMatches(command.events),
    binding.refundAttemptId === attempt.id,
    binding.provider === PaymentProvider.EXIMBAY,
    binding.mode === PaymentMode.SANDBOX,
    binding.providerOperationFamilyKey === target.providerOperationFamilyKey,
    binding.providerOperationFamilyKey === family.key,
    binding.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    binding.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    binding.operationFamilyFingerprint === target.operationFamilyFingerprint,
    binding.operationFamilyFingerprint === family.fingerprint,
    binding.merchantAccountBindingId === target.merchantAccountBindingId,
    binding.credentialGenerationBindingId === target.credentialGenerationBindingId,
    binding.eligibilityProof === null,
    binding.eximbayPreflightObservations.length === 0,
    !attempt.transitions.some((transition) => transition.toStatus === RefundAttemptStatus.SUCCEEDED),
    historicalTargetDigest === target.targetBindingDigest,
  ].every(Boolean);
}

function isExpiredLease(leaseUntil: Date | null, capturedAt: Date): boolean {
  return leaseUntil instanceof Date && leaseUntil.getTime() <= capturedAt.getTime();
}

function isNonemptyLeaseOwner(owner: string | null): boolean {
  return typeof owner === "string" && owner.length > 0;
}

function isLeaseTokenHash(value: string | null): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function exactPredecessorLeaseMatches(
  command: Target,
  events: Target["events"],
): boolean {
  const leaseUntil = command.leaseUntil;
  const predecessorEvent = events.at(-1);
  return leaseUntil instanceof Date
    && predecessorEvent !== undefined
    && leaseUntil.getTime() === predecessorEvent.occurredAt.getTime()
      + EXIMBAY_REFUND_REENTRY_TARGET.predecessorLeaseDurationMs;
}

function exactPredecessorEventMatches(events: Target["events"]): boolean {
  const generationOne = events[0];
  const predecessor = events[1];
  if (events.length !== 2 || !generationOne || !predecessor) return false;
  const target = EXIMBAY_REFUND_REENTRY_TARGET;
  return [
    generationOne.id === target.generationOneLeaseEventId,
    generationOne.commandId === target.commandId,
    generationOne.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED,
    generationOne.leaseGeneration === 1,
    generationOne.dispatchAttempt === 0,
    generationOne.occurredAt.toISOString() === target.generationOneLeaseOccurredAt,
    predecessor.commandId === target.commandId,
    predecessor.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED,
    predecessor.leaseGeneration === target.predecessorLeaseGeneration,
    predecessor.dispatchAttempt === 0,
    predecessor.occurredAt.getTime() >= generationOne.occurredAt.getTime(),
    isCuid(predecessor.id),
  ].every(Boolean);
}

function isCuid(value: string): boolean {
  return /^c[a-z0-9]{24}$/u.test(value);
}

function approvalMatches(
  approval: Approval,
  authority: EximbayRefundCanaryEnvironment,
): boolean {
  const target = EXIMBAY_REFUND_REENTRY_TARGET;
  return [
    approval.id === target.approvalId,
    approval.formatVersion === EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
    approval.provider === PaymentProvider.EXIMBAY,
    approval.mode === PaymentMode.SANDBOX,
    approval.commandId === target.commandId,
    approval.approvalEvidenceDigest === target.approvalEvidenceDigest,
    approval.releaseBindingDigest === target.releaseBindingDigest,
    approval.canaryJobBindingDigest === target.canaryJobBindingDigest,
    approval.preflightJobBindingDigest === target.preflightJobBindingDigest,
    approval.imageBindingDigest === target.imageBindingDigest,
    approval.secretGenerationBindingDigest === target.secretGenerationBindingDigest,
    approval.targetBindingDigest === target.targetBindingDigest,
    approval.approvedAt.toISOString() === target.approvalApprovedAt,
    approval.expiresAt.toISOString() === target.approvalExpiresAt,
    approval.consumedAt?.toISOString() === target.approvalConsumedAt,
    approval.consumedExecutionId === target.consumedExecutionId,
    approval.consumedExecutionBindingDigest === target.consumedExecutionBindingDigest,
    approval.releaseBindingDigest === authority.releaseBindingDigest,
    approval.canaryJobBindingDigest === authority.canaryJobBindingDigest,
    approval.preflightJobBindingDigest === authority.preflightJobBindingDigest,
    approval.imageBindingDigest === authority.imageBindingDigest,
    approval.secretGenerationBindingDigest === authority.secretGenerationBindingDigest,
    approval.targetBindingDigest === authority.targetBindingDigest,
  ].every(Boolean);
}

function environmentMatchesRetainedSeal(authority: EximbayRefundCanaryEnvironment): boolean {
  const target = EXIMBAY_REFUND_REENTRY_TARGET;
  return [
    authority.releaseBindingDigest === target.releaseBindingDigest,
    authority.canaryJobBindingDigest === target.canaryJobBindingDigest,
    authority.preflightJobBindingDigest === target.preflightJobBindingDigest,
    authority.imageBindingDigest === target.imageBindingDigest,
    authority.secretGenerationBindingDigest === target.secretGenerationBindingDigest,
    authority.targetBindingDigest === target.targetBindingDigest,
    authority.syntheticProvenanceDigest === target.syntheticProvenanceDigest,
    authority.merchantAccountBindingId === target.merchantAccountBindingId,
    authority.credentialGenerationBindingId === target.credentialGenerationBindingId,
    authority.mid === target.mid,
  ].every(Boolean);
}

type CanaryTargetDigestFacts = Readonly<{
  commandId: string;
  refundAttemptId: string;
  paymentId: string;
  providerOperationBindingId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  providerOrderId: string | null;
  providerPaymentKey: string;
  financialSucceededAt: Date | null;
  providerOperationFamilyKey: string;
  operationFamilyFingerprint: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  syntheticProvenanceDigest: string;
}>;

function canaryTargetBindingDigest(facts: CanaryTargetDigestFacts): string {
  return createHash("sha256").update(JSON.stringify([
    "mira-refund-eximbay-sandbox-canary-target/v1",
    facts.commandId, facts.refundAttemptId, facts.paymentId, facts.providerOperationBindingId,
    "EXIMBAY", "SANDBOX", facts.amount, facts.currency,
    facts.idempotencyKey, facts.providerOrderId, facts.providerPaymentKey,
    facts.financialSucceededAt?.toISOString(),
    facts.providerOperationFamilyKey, facts.operationFamilyFingerprint,
    "READY", "PROCESSING", "REFUND_PENDING", "SUCCEEDED", "EXTERNAL", "FINALIZED",
    0, null, facts.merchantAccountBindingId, facts.credentialGenerationBindingId,
    facts.syntheticProvenanceDigest, true, 1, false,
  ]), "utf8").digest("hex");
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new Error("EXIMBAY_REFUND_REENTRY_DATABASE_TIME_UNAVAILABLE");
  }
  return capturedAt;
}
