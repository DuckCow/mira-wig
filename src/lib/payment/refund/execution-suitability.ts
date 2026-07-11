import {
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type Order,
  type Payment,
  type RefundAttempt,
  type RefundAttemptTransition,
  type RefundExecutionCommand,
} from "@prisma/client";
import { CLAIM_TRANSITION_REASON, buildRefundExecutionClaimOperationKey, isClaimTransitionCandidate } from "./claim-contract";
import {
  buildRefundAttemptIdempotencyKey,
  hasConsistentRefundAttemptLedgerIdentity,
  isTerminalRefundAttemptStatus,
  validateRefundRequest,
} from "./invariants";
import { resolveRefundRequestCreationEvidence } from "./request-evidence";

export type InitialExecutionTarget = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  executionCommand: RefundExecutionCommand | null;
};

export type InitialExecutionAggregate = Order & {
  payment: Payment;
  refundAttempts: InitialExecutionTarget[];
};

export type InitialExecutionSuitabilityResult = { ok: true } | { ok: false };

// This validator intentionally requires the initial creation + claim transition pair.
// Future retry/re-dispatch flows with additional transitions need a separate contract.
export function validateInitialRefundExecutionSuitability(
  aggregate: InitialExecutionAggregate,
  target: InitialExecutionTarget,
  command: RefundExecutionCommand,
): InitialExecutionSuitabilityResult {
  if (!hasCoherentOwnership(aggregate, target, command)) return { ok: false };
  if (!hasCoherentPayment(aggregate)) return { ok: false };
  if (!hasConsistentRefundAttemptLedgerIdentity(aggregate.payment, aggregate.refundAttempts)) return { ok: false };
  if (!hasCoherentTargetIdentity(target, aggregate.paymentId)) return { ok: false };
  if (!hasSingleOpenTarget(aggregate.refundAttempts, target.id)) return { ok: false };
  if (!hasValidReservation(aggregate, target)) return { ok: false };
  if (!hasExactCreationAndClaim(target, command.id)) return { ok: false };
  return { ok: true };
}

function hasCoherentOwnership(
  aggregate: InitialExecutionAggregate,
  target: InitialExecutionTarget,
  command: RefundExecutionCommand,
): boolean {
  return target.orderId === aggregate.id
    && target.paymentId === aggregate.paymentId
    && command.refundAttemptId === target.id
    && target.executionCommand?.id === command.id;
}

function hasCoherentPayment(aggregate: InitialExecutionAggregate): boolean {
  const payment = aggregate.payment;
  return payment.id === aggregate.paymentId
    && payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(payment.providerPaymentKey?.trim())
    && payment.amount === aggregate.totalAmount
    && payment.currency === aggregate.currency;
}

function hasCoherentTargetIdentity(target: InitialExecutionTarget, paymentId: string): boolean {
  return target.idempotencyKey === buildRefundAttemptIdempotencyKey(paymentId, target.id)
    && Number.isSafeInteger(target.amount)
    && target.amount > 0
    && target.processedAt === null
    && target.failedAt === null
    && target.failureCode === null
    && target.safeFailureMessage === null;
}

function hasSingleOpenTarget(attempts: readonly RefundAttempt[], targetId: string): boolean {
  const open = attempts.filter((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
  return open.length === 1 && open[0].id === targetId;
}

function hasValidReservation(
  aggregate: InitialExecutionAggregate,
  target: InitialExecutionTarget,
): boolean {
  return validateRefundRequest({
    totalAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    requestedAmount: target.amount,
    requestedCurrency: target.currency,
    attempts: aggregate.refundAttempts.filter((attempt) => attempt.id !== target.id),
  }).ok;
}

function hasExactCreationAndClaim(target: InitialExecutionTarget, commandId: string): boolean {
  if (resolveRefundRequestCreationEvidence(target.transitions, target).kind !== "matched") return false;
  const claims = target.transitions.filter(isClaimTransitionCandidate);
  if (claims.length !== 1 || target.transitions.length !== 2) return false;
  return matchesClaimArtifact(claims[0], target.id, commandId);
}

function matchesClaimArtifact(
  claim: RefundAttemptTransition,
  refundAttemptId: string,
  commandId: string,
): boolean {
  return claim.refundAttemptId === refundAttemptId
    && claim.operationKey === buildRefundExecutionClaimOperationKey(commandId)
    && claim.fromStatus === RefundAttemptStatus.REQUESTED
    && claim.toStatus === RefundAttemptStatus.PROCESSING
    && claim.orderStatusBefore === OrderStatus.REFUND_PENDING
    && claim.orderStatusAfter === OrderStatus.REFUND_PENDING
    && claim.reason === CLAIM_TRANSITION_REASON
    && hasCoherentClaimActor(claim);
}

function hasCoherentClaimActor(claim: RefundAttemptTransition): boolean {
  if (claim.actorType === RefundAttemptActorType.ADMIN) return Boolean(claim.actorUserId?.trim());
  if (claim.actorType !== RefundAttemptActorType.SYSTEM) return false;
  return claim.actorUserId === null || Boolean(claim.actorUserId.trim());
}
