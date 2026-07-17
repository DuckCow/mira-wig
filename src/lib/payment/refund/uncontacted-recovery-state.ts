import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type RefundExecutionCommandEvent,
} from "@prisma/client";
import {
  identifyDispatchAuthorizationStructure,
  isDispatchAuthorizationLedgerCoherent,
  type DispatchAuthorizationContext,
  type DispatchAuthorizationHistory,
} from "./dispatch-authorization-contract";
import {
  deriveDurableTossRefundRequest,
  isTossFullRefundContext,
  matchesCompleteTossAuthorization,
} from "./providers/toss/refund-authorization-identity";
import type { LockedTossAuthorizationState } from "./providers/toss/refund-authorization-state";
import { validateInitialRefundExecutionSuitability } from "./execution-suitability";
import { hasCoherentUncontactedLeaseEventHistory } from "./uncontacted-recovery-event-history";

const POSTGRES_INT_MAX = 2_147_483_647;

const aggregateArgs = Prisma.validator<Prisma.OrderDefaultArgs>()({
  include: {
    payment: true,
    refundAttempts: {
      orderBy: { createdAt: "asc" },
      include: {
        transitions: { orderBy: { createdAt: "asc" } },
        executionCommand: true,
      },
    },
  },
});

export type UncontactedRecoveryAggregate = Prisma.OrderGetPayload<typeof aggregateArgs>;
export type UncontactedRecoveryTarget = UncontactedRecoveryAggregate["refundAttempts"][number];
export type UncontactedRecoveryCommand = NonNullable<UncontactedRecoveryTarget["executionCommand"]>;
export type UncontactedRecoveryBinding =
  Prisma.RefundExecutionProviderOperationBindingGetPayload<{
    include: { eligibilityProof: true };
  }>;

export type LockedUncontactedRecoveryState = Readonly<{
  aggregate: UncontactedRecoveryAggregate;
  target: UncontactedRecoveryTarget;
  command: UncontactedRecoveryCommand;
  events: readonly RefundExecutionCommandEvent[];
  dispatches: readonly Prisma.RefundExecutionDispatchAttemptGetPayload<Record<string, never>>[];
  binding: UncontactedRecoveryBinding | null;
  contactProofCount: number;
  evidenceCount: number;
  capturedAt: Date;
}>;

export type UncontactedRecoveryClassification =
  | Readonly<{ kind: "EXPIRED_U1" }>
  | Readonly<{ kind: "ACTIVE_U1" }>
  | Readonly<{ kind: "AUTHORIZED_U2" }>
  | Readonly<{ kind: "CONTACTED" }>
  | Readonly<{ kind: "INELIGIBLE" }>
  | Readonly<{ kind: "INCONSISTENT" }>;

export function classifyUncontactedRefundExecutionState(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  const contactClassification = classifyContactTruth(locked);
  if (contactClassification) return classification(contactClassification);
  if (isCoherentTerminalOrReservedProjection(locked)) return classification("INELIGIBLE");
  if (hasTerminalOrReservedProjection(locked)) return classification("INCONSISTENT");
  if (locked.command.status === RefundExecutionCommandStatus.READY) return classifyReady(locked);
  if (locked.command.status !== RefundExecutionCommandStatus.LEASED) return classification("INCONSISTENT");
  return classifyLeased(locked);
}

function classifyLeased(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  if (!hasCoherentInitialAggregate(locked) || !hasCoherentLease(locked.command)) {
    return classification("INCONSISTENT");
  }
  if (!hasCoherentUncontactedLeaseEventHistory(
    locked.command.id,
    locked.command.leaseGeneration,
    locked.events,
    false,
  )) return classification("INCONSISTENT");
  if (locked.command.dispatchAttempt === 0) return classifyOrdinalZeroLease(locked);
  if (locked.command.dispatchAttempt === 1) return classifyAuthorizedLease(locked);
  return classification("INCONSISTENT");
}

function classifyReady(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  const coherent = [
    locked.command.leaseOwner === null,
    locked.command.leaseUntil === null,
    locked.command.leaseTokenHash === null,
    locked.command.dispatchAttempt === 0,
    locked.dispatches.length === 0,
    locked.binding === null,
    locked.contactProofCount === 0,
    locked.evidenceCount === 0,
    locked.target.providerRefundId === null,
    hasCoherentInitialAggregate(locked),
    hasCoherentUncontactedLeaseEventHistory(
      locked.command.id,
      locked.command.leaseGeneration,
      locked.events,
      true,
    ),
  ].every(Boolean);
  return classification(coherent ? "INELIGIBLE" : "INCONSISTENT");
}

function classifyOrdinalZeroLease(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  const exactUncontactedShape = [
    locked.dispatches.length === 0,
    locked.binding === null,
    locked.contactProofCount === 0,
    locked.evidenceCount === 0,
    locked.target.providerRefundId === null,
    locked.command.lastSafeErrorCode === null,
    locked.command.lastSafeErrorMessage === null,
  ].every(Boolean);
  if (!exactUncontactedShape) return classification("INCONSISTENT");
  if (!isSupportedTossSandboxContext(locked)) return classification("INELIGIBLE");
  return isExpired(locked)
    ? classification("EXPIRED_U1")
    : classification("ACTIVE_U1");
}

function classifyAuthorizedLease(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  if (locked.contactProofCount !== 0 || locked.evidenceCount !== 0) {
    return classification("INCONSISTENT");
  }
  const context = authorizationContext(locked);
  const history: DispatchAuthorizationHistory = {
    events: locked.events,
    dispatchAttempts: locked.dispatches,
    evidenceCount: locked.evidenceCount,
  };
  const structure = identifyDispatchAuthorizationStructure(
    locked.command.dispatchAttempt,
    locked.dispatches,
  );
  const tossState: LockedTossAuthorizationState = {
    context,
    history,
    structure,
    binding: locked.binding,
    capturedAt: locked.capturedAt,
  };
  const request = deriveDurableTossRefundRequest(context);
  const coherent = [
    isSupportedTossSandboxContext(locked),
    structure.kind === "replay",
    isDispatchAuthorizationLedgerCoherent(context, history, structure),
    request !== null,
    request !== null && matchesCompleteTossAuthorization(tossState, request),
    locked.target.providerRefundId === null,
  ].every(Boolean);
  if (!coherent) return classification("INCONSISTENT");
  return isExpired(locked)
    ? classification("AUTHORIZED_U2")
    : classification("INELIGIBLE");
}

function classifyContactTruth(
  locked: LockedUncontactedRecoveryState,
): "CONTACTED" | "INCONSISTENT" | null {
  const contradictoryAuthorized = locked.dispatches.some((dispatch) => (
    dispatch.state === RefundExecutionDispatchAttemptState.AUTHORIZED
      && (dispatch.contactMarkedAt !== null || locked.contactProofCount > 0)
  ));
  if (contradictoryAuthorized) return "INCONSISTENT";
  const contacted = locked.contactProofCount > 0 || locked.dispatches.some((dispatch) => (
    dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
      || dispatch.contactMarkedAt !== null
  ));
  return contacted ? "CONTACTED" : null;
}

function hasCoherentInitialAggregate(locked: LockedUncontactedRecoveryState): boolean {
  return locked.aggregate.status === OrderStatus.REFUND_PENDING
    && locked.target.status === RefundAttemptStatus.PROCESSING
    && validateInitialRefundExecutionSuitability(
      locked.aggregate,
      locked.target,
      locked.command,
    ).ok;
}

function isSupportedTossSandboxContext(locked: LockedUncontactedRecoveryState): boolean {
  return locked.aggregate.payment.provider === PaymentProvider.TOSS
    && locked.aggregate.payment.mode === PaymentMode.SANDBOX
    && locked.target.provider === PaymentProvider.TOSS
    && locked.target.mode === PaymentMode.SANDBOX
    && isTossFullRefundContext(authorizationContext(locked));
}

function hasCoherentLease(command: UncontactedRecoveryCommand): boolean {
  const owner = command.leaseOwner;
  return [
    owner !== null,
    owner !== null && owner === owner.trim(),
    owner !== null && owner.length > 0,
    owner !== null && Array.from(owner).length <= 255,
    owner !== null && !/\p{Cc}/u.test(owner),
    command.leaseUntil instanceof Date,
    /^[0-9a-f]{64}$/.test(command.leaseTokenHash ?? ""),
    Number.isInteger(command.leaseGeneration),
    command.leaseGeneration >= 1,
    command.leaseGeneration < POSTGRES_INT_MAX,
  ].every(Boolean);
}

function isExpired(locked: LockedUncontactedRecoveryState): boolean {
  return locked.command.leaseUntil !== null
    && locked.command.leaseUntil.getTime() <= locked.capturedAt.getTime();
}

function hasTerminalOrReservedProjection(locked: LockedUncontactedRecoveryState): boolean {
  return locked.command.status === RefundExecutionCommandStatus.DONE
    || locked.command.status === RefundExecutionCommandStatus.PARKED
    || locked.command.status === RefundExecutionCommandStatus.WAITING_EVIDENCE
    || locked.command.status === RefundExecutionCommandStatus.WAITING_RETRY
    || locked.target.status !== RefundAttemptStatus.PROCESSING
    || locked.aggregate.status !== OrderStatus.REFUND_PENDING;
}

function isCoherentTerminalOrReservedProjection(locked: LockedUncontactedRecoveryState): boolean {
  if (!hasTerminalOrReservedProjection(locked)) return false;
  if (![locked.command.leaseOwner, locked.command.leaseUntil, locked.command.leaseTokenHash]
    .every((value) => value === null)) return false;
  if (locked.command.status === RefundExecutionCommandStatus.PARKED) return coherentParked(locked);
  if (locked.command.status === RefundExecutionCommandStatus.DONE) return coherentDone(locked);
  return coherentWaiting(locked);
}

function coherentParked(locked: LockedUncontactedRecoveryState): boolean {
  const acceptedAttempt = locked.target.status === RefundAttemptStatus.FAILED_RETRYABLE
    || locked.target.status === RefundAttemptStatus.MANUAL_REVIEW;
  return [
    locked.aggregate.status === OrderStatus.REFUND_PENDING,
    locked.evidenceCount >= 1,
    acceptedAttempt,
  ].every(Boolean);
}

function coherentDone(locked: LockedUncontactedRecoveryState): boolean {
  const succeeded = locked.target.status === RefundAttemptStatus.SUCCEEDED
    && (locked.aggregate.status === OrderStatus.PARTIALLY_REFUNDED
      || locked.aggregate.status === OrderStatus.REFUNDED);
  const terminalFailure = locked.target.status === RefundAttemptStatus.FAILED_TERMINAL
    && (locked.aggregate.status === OrderStatus.PAID
      || locked.aggregate.status === OrderStatus.PARTIALLY_REFUNDED);
  return locked.evidenceCount >= 1 && (succeeded || terminalFailure);
}

function coherentWaiting(locked: LockedUncontactedRecoveryState): boolean {
  const waitingStatus = locked.command.status === RefundExecutionCommandStatus.WAITING_EVIDENCE
    || locked.command.status === RefundExecutionCommandStatus.WAITING_RETRY;
  const evidenceShape = locked.command.status === RefundExecutionCommandStatus.WAITING_RETRY
    || locked.evidenceCount >= 1;
  return [
    waitingStatus,
    locked.target.status === RefundAttemptStatus.PROCESSING,
    locked.aggregate.status === OrderStatus.REFUND_PENDING,
    evidenceShape,
  ].every(Boolean);
}

function authorizationContext(
  locked: LockedUncontactedRecoveryState,
): DispatchAuthorizationContext {
  return {
    aggregate: locked.aggregate,
    target: locked.target,
    command: locked.command,
  };
}

function classification<K extends UncontactedRecoveryClassification["kind"]>(
  kind: K,
): Readonly<{ kind: K }> {
  return Object.freeze({ kind });
}

export { aggregateArgs as uncontactedRecoveryAggregateArgs };
