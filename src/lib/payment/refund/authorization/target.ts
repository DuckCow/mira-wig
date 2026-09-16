import { EXIMBAY_CANARY_APPROVAL_V2, verifiedApprovalAuthorityV2 } from "../eximbay-refund-canary-approval-v2";
import type { Prisma, EximbayRefundSandboxCanaryApproval } from "@prisma/client";
import { validateInitialRefundExecutionSuitability } from "../execution-suitability";
import { hasCoherentUncontactedLeaseEventHistory } from "../uncontacted-recovery-event-history";
import {
  captureDatabaseTime, discoverEximbayLifecycleOwnership, lockAndLoadEximbayLifecycleState,
  type LockedEximbayLifecycleState,
} from "../providers/eximbay/lifecycle-state";
import {
  deriveEximbayRefundOperationFamily, EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "../providers/eximbay/preflight-contract";
import { RefundAuthorizationError } from "./contract";

export async function lockAuthorizationTarget(tx: Prisma.TransactionClient, commandId: string) {
  const ownership = await discoverEximbayLifecycleOwnership(tx, commandId);
  if (!ownership) throw new RefundAuthorizationError("NOT_FOUND");
  const state = await lockAndLoadEximbayLifecycleState(tx, ownership, commandId);
  if (!state) throw new RefundAuthorizationError("TARGET_MISMATCH");
  return state;
}

export async function validateAuthorizationTarget(
  tx: Prisma.TransactionClient, state: LockedEximbayLifecycleState,
  expectedGeneration: number, account: Readonly<{ merchantAccountBindingId: string; credentialGenerationBindingId: string }>,
) {
  const fresh = { ...state, capturedAt: await captureDatabaseTime(tx) };
  await requireUncontacted(tx, fresh);
  const { command, target, aggregate } = fresh.context;
  if (command.leaseGeneration !== expectedGeneration) throw new RefundAuthorizationError("GENERATION_MISMATCH");
  if (!validPredecessor(fresh) || !validFinancialScope(fresh)) throw new RefundAuthorizationError("TARGET_INELIGIBLE");
  if (!validateInitialRefundExecutionSuitability(aggregate, target, command).ok) throw new RefundAuthorizationError("TARGET_MISMATCH");
  requireBinding(fresh, account);
  const approval = await tx.eximbayRefundSandboxCanaryApproval.findUnique({ where: { commandId: command.id } });
  if (!approval || approval.consumedAt === null) throw new RefundAuthorizationError("TARGET_INELIGIBLE");
  requireApprovalVersion(approval);
  return { state: fresh, targetBindingDigest: approval.targetBindingDigest };
}

async function requireUncontacted(tx: Prisma.TransactionClient, state: LockedEximbayLifecycleState): Promise<void> {
  const proofs = await tx.refundExecutionProviderContactEligibilityProof.count({
    where: { dispatchAttempt: { commandId: state.context.command.id } },
  });
  const possibleContact = state.history.dispatchAttempts.some((row) => (
    row.contactMarkedAt !== null || row.state === "CONTACT_MAY_HAVE_OCCURRED"
  ));
  if (proofs > 0 || possibleContact || state.evidence.length > 0) throw new RefundAuthorizationError("CONTACTED_RECOVERY_REQUIRED");
  if (state.history.dispatchAttempts.length > 0 || state.observations.length > 0) throw new RefundAuthorizationError("TARGET_INELIGIBLE");
}

function validPredecessor(state: LockedEximbayLifecycleState): boolean {
  const c = state.context.command;
  return [
    c.status === "LEASED", c.dispatchAttempt === 0,
    c.leaseUntil !== null && c.leaseUntil <= state.capturedAt,
    Boolean(c.leaseOwner?.trim()), /^[0-9a-f]{64}$/u.test(c.leaseTokenHash ?? ""),
    c.lastSafeErrorCode === null, c.lastSafeErrorMessage === null,
    hasCoherentUncontactedLeaseEventHistory(c.id, c.leaseGeneration, state.history.events, false),
  ].every(Boolean);
}

function validFinancialScope(state: LockedEximbayLifecycleState): boolean {
  const { target, aggregate } = state.context;
  const payment = aggregate.payment;
  return [
    target.provider === "EXIMBAY", target.mode === "SANDBOX", target.status === "PROCESSING",
    target.actorType === "SYSTEM", target.actorUserId === null, target.providerRefundId === null,
    target.currency === "USD", target.amount > 0, target.amount <= 100, target.amount === payment.amount,
    payment.provider === "EXIMBAY", payment.mode === "SANDBOX", payment.status === "SUCCEEDED",
    payment.attemptLifecycle === "FINALIZED", payment.adapterExecutionKind === "EXTERNAL",
    payment.financialSucceededAt !== null, Boolean(payment.providerOrderId), aggregate.status === "REFUND_PENDING",
  ].every(Boolean);
}

function requireBinding(state: LockedEximbayLifecycleState, account: Readonly<{
  merchantAccountBindingId: string; credentialGenerationBindingId: string;
}>): void {
  const binding = state.binding;
  const { target, aggregate } = state.context;
  if (!binding || !aggregate.payment.providerPaymentKey) throw new RefundAuthorizationError("TARGET_MISMATCH");
  const family = deriveEximbayRefundOperationFamily(target.idempotencyKey, aggregate.payment.providerPaymentKey, target.amount, target.currency);
  const matches = [
    binding.refundAttemptId === target.id, binding.provider === "EXIMBAY", binding.mode === "SANDBOX",
    binding.providerOperationFamilyKey === family.key, binding.operationFamilyFingerprint === family.fingerprint,
    binding.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    binding.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION, binding.eligibilityProof === null,
    binding.merchantAccountBindingId === account.merchantAccountBindingId,
    binding.credentialGenerationBindingId === account.credentialGenerationBindingId,
  ].every(Boolean);
  if (!matches) throw new RefundAuthorizationError("TARGET_MISMATCH");
}

function requireApprovalVersion(approval: EximbayRefundSandboxCanaryApproval): void {
  if (approval.formatVersion === "mira-refund-eximbay-sandbox-canary-approval/v1") return;
  if (approval.formatVersion === EXIMBAY_CANARY_APPROVAL_V2 && verifiedApprovalAuthorityV2(approval)) return;
  throw new RefundAuthorizationError("TARGET_MISMATCH");
}
