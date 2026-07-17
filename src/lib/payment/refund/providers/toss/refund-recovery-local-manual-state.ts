import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import type { LockedTossContactState } from "./refund-contact-state";
import {
  buildTossRecoveryExhaustionOperationKey,
  TOSS_RECOVERY_EXHAUSTION,
} from "./refund-recovery-exhaustion-contract";

export function coherentLocalManualProjection(
  locked: LockedTossContactState,
  historyIdentityCoherent: boolean,
): boolean {
  if (!localManualAggregateMatches(locked) || !historyIdentityCoherent) return false;
  const matchingCauses = Object.values(TOSS_RECOVERY_EXHAUSTION).filter((cause) => (
    locked.context.target.failureCode === cause.code
      && locked.context.target.safeFailureMessage === cause.message
      && locked.context.command.lastSafeErrorCode === cause.code
      && locked.context.command.lastSafeErrorMessage === cause.message
  ));
  if (matchingCauses.length !== 1) return false;
  const generation = locked.context.command.leaseGeneration;
  const operationKey = buildTossRecoveryExhaustionOperationKey(
    locked.context.command.id,
    generation,
  );
  const transitions = locked.context.target.transitions.filter(
    (row) => row.operationKey === operationKey,
  );
  const events = locked.history.events.filter((event) => (
    event.commandId === locked.context.command.id
      && event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.leaseGeneration === generation
      && event.dispatchAttempt === locked.context.command.dispatchAttempt
  ));
  return transitions.length === 1
    && events.length === 1
    && localManualTransitionMatches(locked, transitions[0], matchingCauses[0].reason);
}

function localManualAggregateMatches(locked: LockedTossContactState): boolean {
  const { aggregate, target, command } = locked.context;
  const dispatches = [...locked.history.dispatchAttempts]
    .sort((left, right) => left.ordinal - right.ordinal);
  return [
    locked.evidence.length === 0,
    aggregate.status === OrderStatus.REFUND_PENDING,
    target.status === RefundAttemptStatus.MANUAL_REVIEW,
    target.providerRefundId === null,
    target.processedAt === null,
    target.failedAt === null,
    command.status === RefundExecutionCommandStatus.PARKED,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    command.dispatchAttempt === dispatches.length,
    dispatches.length >= 1,
    locked.contactProofs.length === dispatches.length,
    dispatches.every((dispatch, index) => (
      dispatch.ordinal === index + 1
        && dispatch.commandId === command.id
        && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
        && dispatch.contactMarkedAt !== null
        && locked.contactProofs.some((proof) => proof.dispatchAttemptId === dispatch.id)
    )),
  ].every(Boolean);
}

function localManualTransitionMatches(
  locked: LockedTossContactState,
  transition: LockedTossContactState["context"]["target"]["transitions"][number],
  reason: string,
): boolean {
  return [
    transition.refundAttemptId === locked.context.target.id,
    transition.fromStatus === RefundAttemptStatus.PROCESSING,
    transition.toStatus === RefundAttemptStatus.MANUAL_REVIEW,
    transition.orderStatusBefore === OrderStatus.REFUND_PENDING,
    transition.orderStatusAfter === OrderStatus.REFUND_PENDING,
    transition.actorType === RefundAttemptActorType.SYSTEM,
    transition.actorUserId === null,
    transition.reason === reason,
  ].every(Boolean);
}
