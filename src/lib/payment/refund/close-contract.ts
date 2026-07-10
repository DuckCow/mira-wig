import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type RefundAttemptTransition,
} from "@prisma/client";
import type { RefundRestingOrderStatus } from "./resting-state";

export interface CloseRefundRequestInput {
  orderId: string;
  refundAttemptId: string;
  closeOperationId: string;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId?: string | null;
  now: Date;
}

export type CloseRefundRequestFailureCode =
  | "INVALID_ORDER_ID"
  | "INVALID_REFUND_ATTEMPT_ID"
  | "INVALID_CLOSE_OPERATION_ID"
  | "INVALID_REASON"
  | "INVALID_ACTOR_USER_ID"
  | "INVALID_CLOSE_TIMESTAMP"
  | "ORDER_NOT_FOUND"
  | "REFUND_ATTEMPT_NOT_FOUND"
  | "REFUND_ATTEMPT_NOT_CANCELLABLE"
  | "PROVIDER_CONTACT_ALREADY_STARTED"
  | "ORDER_STATUS_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "REFUND_LEDGER_INCONSISTENT";

export interface CloseRefundRequestFailure {
  ok: false;
  code: CloseRefundRequestFailureCode;
  message: string;
}

export type CloseRefundRequestResult =
  | {
      ok: true;
      transitionId: string;
      refundAttemptId: string;
      refundAttemptStatus: typeof RefundAttemptStatus.CANCELLED;
      restoredOrderStatus: RefundRestingOrderStatus;
      createdAt: Date;
      replayed: boolean;
    }
  | CloseRefundRequestFailure;

export interface NormalizedCloseInput {
  orderId: string;
  refundAttemptId: string;
  operationKey: string;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId: string | null;
  now: Date;
}

export type NormalizeCloseInputResult =
  | { ok: true; input: NormalizedCloseInput }
  | CloseRefundRequestFailure;

export function normalizeCloseInput(input: CloseRefundRequestInput): NormalizeCloseInputResult {
  const orderId = input.orderId.trim();
  if (!orderId) return closeFailure("INVALID_ORDER_ID", "Order id is required.");
  const refundAttemptId = input.refundAttemptId.trim();
  if (!refundAttemptId) return closeFailure("INVALID_REFUND_ATTEMPT_ID", "Refund attempt id is required.");
  const closeOperationId = input.closeOperationId.trim();
  if (!closeOperationId) return closeFailure("INVALID_CLOSE_OPERATION_ID", "Close operation id is required.");
  const reason = input.reason.trim();
  if (!reason) return closeFailure("INVALID_REASON", "Close reason is required.");
  const actorUserId = normalizeActor(input.actorType, input.actorUserId);
  if (!actorUserId.ok) return actorUserId;
  if (!Number.isFinite(input.now.getTime())) {
    return closeFailure("INVALID_CLOSE_TIMESTAMP", "Close timestamp must be a valid date.");
  }
  return {
    ok: true,
    input: {
      orderId,
      refundAttemptId,
      operationKey: buildRefundCloseOperationKey(refundAttemptId, closeOperationId),
      reason,
      actorType: input.actorType,
      actorUserId: actorUserId.value,
      now: input.now,
    },
  };
}

function normalizeActor(
  actorType: RefundAttemptActorType,
  actorUserId: string | null | undefined,
): { ok: true; value: string | null } | CloseRefundRequestFailure {
  if (actorUserId === null || actorUserId === undefined) {
    if (actorType === RefundAttemptActorType.ADMIN) {
      return closeFailure("INVALID_ACTOR_USER_ID", "Admin close operations require an actor user id.");
    }
    return { ok: true, value: null };
  }
  const normalized = actorUserId.trim();
  if (!normalized) return closeFailure("INVALID_ACTOR_USER_ID", "Actor user id cannot be blank.");
  return { ok: true, value: normalized };
}

export function buildRefundCloseOperationKey(refundAttemptId: string, operationId: string): string {
  return `refund-close:${refundAttemptId}:${operationId}`;
}

export function resolveCloseReplay(
  transition: RefundAttemptTransition,
  input: NormalizedCloseInput,
): CloseRefundRequestResult {
  if (!matchesReplay(transition, input)) {
    return closeFailure("IDEMPOTENCY_CONFLICT", "Close operation identity conflicts with existing evidence.");
  }
  return closeSuccess(transition, true);
}

function matchesReplay(transition: RefundAttemptTransition, input: NormalizedCloseInput): boolean {
  return matchesReplayEdge(transition, input)
    && transition.actorType === input.actorType
    && transition.actorUserId === input.actorUserId
    && transition.reason === input.reason
    && isRestingStatus(transition.orderStatusAfter);
}

function matchesReplayEdge(transition: RefundAttemptTransition, input: NormalizedCloseInput): boolean {
  return transition.operationKey === input.operationKey
    && transition.refundAttemptId === input.refundAttemptId
    && transition.fromStatus === RefundAttemptStatus.REQUESTED
    && transition.toStatus === RefundAttemptStatus.CANCELLED
    && transition.orderStatusBefore === OrderStatus.REFUND_PENDING;
}

function isRestingStatus(status: OrderStatus): status is RefundRestingOrderStatus {
  return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
}

export function closeSuccess(
  transition: RefundAttemptTransition,
  replayed: boolean,
): Extract<CloseRefundRequestResult, { ok: true }> {
  if (!isRestingStatus(transition.orderStatusAfter)) throw new Error("Invalid refund close transition result.");
  return {
    ok: true,
    transitionId: transition.id,
    refundAttemptId: transition.refundAttemptId,
    refundAttemptStatus: RefundAttemptStatus.CANCELLED,
    restoredOrderStatus: transition.orderStatusAfter,
    createdAt: transition.createdAt,
    replayed,
  };
}

export function closeFailure(
  code: CloseRefundRequestFailureCode,
  message: string,
): CloseRefundRequestFailure {
  return { ok: false, code, message };
}
