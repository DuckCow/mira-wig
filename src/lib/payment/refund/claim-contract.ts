import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type RefundAttemptTransition,
} from "@prisma/client";

export const CLAIM_TRANSITION_REASON = "Refund execution claimed.";
const CLAIM_OPERATION_PREFIX = "refund-exec-claim:";

export interface ClaimRefundAttemptForExecutionInput {
  orderId: string;
  refundAttemptId: string;
  actorType: RefundAttemptActorType;
  actorUserId?: string | null;
  now: Date;
}

export type ClaimRefundAttemptForExecutionFailureCode =
  | "INVALID_ORDER_ID"
  | "INVALID_REFUND_ATTEMPT_ID"
  | "INVALID_ACTOR_TYPE"
  | "INVALID_ACTOR_USER_ID"
  | "INVALID_CLAIM_TIMESTAMP"
  | "ORDER_NOT_FOUND"
  | "REFUND_ATTEMPT_NOT_FOUND"
  | "REFUND_ATTEMPT_NOT_CLAIMABLE"
  | "ORDER_STATUS_CONFLICT"
  | "PAYMENT_NOT_REFUNDABLE"
  | "REFUND_LEDGER_INCONSISTENT"
  | "CLAIM_ARTIFACT_CONFLICT";

export interface ClaimRefundAttemptForExecutionFailure {
  ok: false;
  code: ClaimRefundAttemptForExecutionFailureCode;
  message: string;
}

export type ClaimRefundAttemptForExecutionResult =
  | {
      ok: true;
      refundAttemptId: string;
      commandId: string;
      replayed: boolean;
    }
  | ClaimRefundAttemptForExecutionFailure;

export interface NormalizedClaimInput {
  orderId: string;
  refundAttemptId: string;
  actorType: RefundAttemptActorType;
  actorUserId: string | null;
  now: Date;
}

export type NormalizeClaimInputResult =
  | { ok: true; input: NormalizedClaimInput }
  | ClaimRefundAttemptForExecutionFailure;

export function normalizeClaimInput(input: ClaimRefundAttemptForExecutionInput): NormalizeClaimInputResult {
  const orderId = input.orderId.trim();
  if (!orderId) return claimFailure("INVALID_ORDER_ID", "Order id is required.");
  const refundAttemptId = input.refundAttemptId.trim();
  if (!refundAttemptId) return claimFailure("INVALID_REFUND_ATTEMPT_ID", "Refund attempt id is required.");
  if (!isClaimActorType(input.actorType)) return claimFailure("INVALID_ACTOR_TYPE", "Claim actor type is invalid.");
  const actorUserId = normalizeActorUserId(input.actorType, input.actorUserId);
  if (!actorUserId.ok) return actorUserId;
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    return claimFailure("INVALID_CLAIM_TIMESTAMP", "Claim timestamp must be a valid date.");
  }
  return {
    ok: true,
    input: { orderId, refundAttemptId, actorType: input.actorType, actorUserId: actorUserId.value, now: input.now },
  };
}

export function buildRefundExecutionClaimOperationKey(commandId: string): string {
  const normalized = commandId.trim();
  if (!normalized) throw new Error("Refund execution claim operation key requires a command id.");
  return `${CLAIM_OPERATION_PREFIX}${normalized}`;
}

export function isClaimTransitionCandidate(transition: RefundAttemptTransition): boolean {
  return transition.operationKey.startsWith(CLAIM_OPERATION_PREFIX)
    || (
      transition.fromStatus === RefundAttemptStatus.REQUESTED
      && transition.toStatus === RefundAttemptStatus.PROCESSING
    );
}

export function requiresExecutionCommand(status: RefundAttemptStatus): boolean {
  return status !== RefundAttemptStatus.REQUESTED && status !== RefundAttemptStatus.CANCELLED;
}

export function matchesClaimTransition(
  transition: RefundAttemptTransition,
  refundAttemptId: string,
  input: NormalizedClaimInput,
  operationKey: string,
): boolean {
  return matchesClaimIdentity(transition, refundAttemptId, operationKey)
    && matchesClaimEdge(transition)
    && matchesClaimDecision(transition, input);
}

function matchesClaimIdentity(
  transition: RefundAttemptTransition,
  refundAttemptId: string,
  operationKey: string,
): boolean {
  return transition.refundAttemptId === refundAttemptId && transition.operationKey === operationKey;
}

function matchesClaimEdge(transition: RefundAttemptTransition): boolean {
  return transition.fromStatus === RefundAttemptStatus.REQUESTED
    && transition.toStatus === RefundAttemptStatus.PROCESSING
    && transition.orderStatusBefore === OrderStatus.REFUND_PENDING
    && transition.orderStatusAfter === OrderStatus.REFUND_PENDING;
}

function matchesClaimDecision(
  transition: RefundAttemptTransition,
  input: NormalizedClaimInput,
): boolean {
  return transition.actorType === input.actorType
    && transition.actorUserId === input.actorUserId
    && transition.reason === CLAIM_TRANSITION_REASON;
}

function isClaimActorType(actorType: RefundAttemptActorType): boolean {
  return actorType === RefundAttemptActorType.ADMIN || actorType === RefundAttemptActorType.SYSTEM;
}

function normalizeActorUserId(
  actorType: RefundAttemptActorType,
  actorUserId: string | null | undefined,
): { ok: true; value: string | null } | ClaimRefundAttemptForExecutionFailure {
  if (actorUserId === null || actorUserId === undefined) {
    if (actorType === RefundAttemptActorType.ADMIN) {
      return claimFailure("INVALID_ACTOR_USER_ID", "Admin claim operations require an actor user id.");
    }
    return { ok: true, value: null };
  }
  const normalized = actorUserId.trim();
  if (!normalized) return claimFailure("INVALID_ACTOR_USER_ID", "Actor user id cannot be blank.");
  return { ok: true, value: normalized };
}

export function claimSuccess(
  refundAttemptId: string,
  commandId: string,
  replayed: boolean,
): Extract<ClaimRefundAttemptForExecutionResult, { ok: true }> {
  return { ok: true, refundAttemptId, commandId, replayed };
}

export function claimFailure(
  code: ClaimRefundAttemptForExecutionFailureCode,
  message: string,
): ClaimRefundAttemptForExecutionFailure {
  return { ok: false, code, message };
}
