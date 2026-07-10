import {
  OrderStatus,
  RefundAttemptStatus,
  type RefundAttempt,
  type RefundAttemptTransition,
} from "@prisma/client";
import type { PreparedRefundAttempt } from "./prepare";

export type RefundRequestCreationEvidence =
  | { kind: "legacy" }
  | { kind: "matched"; orderStatus: typeof OrderStatus.REFUND_PENDING }
  | { kind: "conflict" };

export function buildRefundRequestOperationKey(refundAttemptId: string): string {
  return `refund-request:${refundAttemptId}`;
}

export function sameImmutableRefundRequest(
  existing: RefundAttempt,
  candidate: PreparedRefundAttempt,
): boolean {
  return sameAttemptIdentity(existing, candidate)
    && sameRequestDecision(existing, candidate)
    && samePaymentContext(existing, candidate);
}

function sameAttemptIdentity(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.id === candidate.id
    && existing.orderId === candidate.orderId
    && existing.paymentId === candidate.paymentId
    && existing.idempotencyKey === candidate.idempotencyKey;
}

function sameRequestDecision(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.amount === candidate.amount
    && existing.currency === candidate.currency
    && existing.reason === candidate.reason
    && existing.actorType === candidate.actorType
    && existing.actorUserId === candidate.actorUserId;
}

function samePaymentContext(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.provider === candidate.provider && existing.mode === candidate.mode;
}

export function resolveRefundRequestCreationEvidence(
  transitions: readonly RefundAttemptTransition[],
  candidate: PreparedRefundAttempt,
): RefundRequestCreationEvidence {
  const operationKey = buildRefundRequestOperationKey(candidate.id);
  const creationRows = transitions.filter((transition) => (
    transition.operationKey === operationKey
      || transition.fromStatus === null
      || transition.toStatus === RefundAttemptStatus.REQUESTED
  ));

  if (creationRows.length === 0) return { kind: "legacy" };
  if (creationRows.length !== 1) return { kind: "conflict" };
  return matchesCreationEvidence(creationRows[0], candidate, operationKey)
    ? { kind: "matched", orderStatus: OrderStatus.REFUND_PENDING }
    : { kind: "conflict" };
}

function matchesCreationEvidence(
  transition: RefundAttemptTransition,
  candidate: PreparedRefundAttempt,
  operationKey: string,
): boolean {
  return sameCreationIdentity(transition, candidate, operationKey)
    && sameCreationOrderEdge(transition)
    && sameCreationDecision(transition, candidate);
}

function sameCreationIdentity(
  transition: RefundAttemptTransition,
  candidate: PreparedRefundAttempt,
  operationKey: string,
): boolean {
  return transition.refundAttemptId === candidate.id
    && transition.operationKey === operationKey
    && transition.fromStatus === null
    && transition.toStatus === RefundAttemptStatus.REQUESTED;
}

function sameCreationOrderEdge(transition: RefundAttemptTransition): boolean {
  return isRequestableOrderStatus(transition.orderStatusBefore)
    && transition.orderStatusAfter === OrderStatus.REFUND_PENDING;
}

function sameCreationDecision(
  transition: RefundAttemptTransition,
  candidate: PreparedRefundAttempt,
): boolean {
  return transition.actorType === candidate.actorType
    && transition.actorUserId === candidate.actorUserId
    && transition.reason === candidate.reason;
}

function isRequestableOrderStatus(status: OrderStatus): boolean {
  return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
}
