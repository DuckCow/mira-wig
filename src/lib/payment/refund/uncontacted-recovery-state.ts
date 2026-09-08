import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
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
import { isEximbayRefundContext } from "./providers/eximbay/preflight-state";
import { deriveEximbayDispatchAuthority } from "./providers/eximbay/lifecycle-authority";
import {
  createEximbayRefundPreflightConfig,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "./providers/eximbay/preflight-contract";
import { validateInitialRefundExecutionSuitability } from "./execution-suitability";
import { hasCoherentUncontactedLeaseEventHistory } from "./uncontacted-recovery-event-history";
import { EXIMBAY_REFUND_REENTRY_TARGET } from "./eximbay-refund-reentry-authority";

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
    include: {
      eligibilityProof: true;
      eximbayPreflightObservations: true;
    };
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
  evidence: readonly Prisma.RefundExecutionEvidenceGetPayload<Record<string, never>>[];
  capturedAt: Date;
}>;

export type UncontactedRecoveryClassification =
  | Readonly<{ kind: "EXPIRED_U1" }>
  | Readonly<{ kind: "ACTIVE_U1" }>
  | Readonly<{ kind: "EXPIRED_SEALED_EXIMBAY_REENTRY" }>
  | Readonly<{ kind: "ACTIVE_SEALED_EXIMBAY_REENTRY" }>
  | Readonly<{ kind: "AUTHORIZED_U2" }>
  | Readonly<{ kind: "EXPIRED_AUTHORIZED_EXIMBAY_R1" }>
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
  if (locked.command.dispatchAttempt === 0) {
    if (!hasCoherentUncontactedLeaseEventHistory(
      locked.command.id,
      locked.command.leaseGeneration,
      locked.events,
      false,
    )) return classification("INCONSISTENT");
    return classifyOrdinalZeroLease(locked);
  }
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
  const sealedEximbay = hasExactSealedEximbayReentryState(locked);
  if (sealedEximbay) {
    return isExpired(locked)
      ? classification("EXPIRED_SEALED_EXIMBAY_REENTRY")
      : classification("ACTIVE_SEALED_EXIMBAY_REENTRY");
  }
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
  if (!isSupportedInitialSandboxContext(locked)) return classification("INELIGIBLE");
  return isExpired(locked)
    ? classification("EXPIRED_U1")
    : classification("ACTIVE_U1");
}

function hasExactSealedEximbayReentryState(
  locked: LockedUncontactedRecoveryState,
): boolean {
  const target = EXIMBAY_REFUND_REENTRY_TARGET;
  const binding = locked.binding;
  if (!binding) return false;
  return [
    locked.aggregate.payment.id === target.paymentId,
    locked.aggregate.id === target.orderId,
    locked.target.id === target.refundAttemptId,
    locked.command.id === target.commandId,
    locked.command.leaseGeneration === target.predecessorLeaseGeneration,
    locked.command.dispatchAttempt === 0,
    locked.dispatches.length === 0,
    locked.contactProofCount === 0,
    locked.evidenceCount === 0,
    locked.target.providerRefundId === null,
    locked.command.lastSafeErrorCode === null,
    locked.command.lastSafeErrorMessage === null,
    isEximbayRefundContext(authorizationContext(locked)),
    binding.id === target.providerOperationBindingId,
    binding.refundAttemptId === target.refundAttemptId,
    binding.provider === PaymentProvider.EXIMBAY,
    binding.mode === PaymentMode.SANDBOX,
    binding.providerOperationFamilyKey === target.providerOperationFamilyKey,
    binding.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    binding.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    binding.operationFamilyFingerprint === target.operationFamilyFingerprint,
    binding.merchantAccountBindingId === target.merchantAccountBindingId,
    binding.credentialGenerationBindingId === target.credentialGenerationBindingId,
    binding.eligibilityProof === null,
    binding.eximbayPreflightObservations.length === 0,
  ].every(Boolean);
}

function classifyAuthorizedLease(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  if (locked.contactProofCount !== 0 || locked.evidenceCount !== 0) {
    return classification("INCONSISTENT");
  }
  if (isEximbayRefundContext(authorizationContext(locked))) {
    return classifyEximbayAuthorizedR1Lease(locked);
  }
  if (!hasCoherentUncontactedLeaseEventHistory(
    locked.command.id,
    locked.command.leaseGeneration,
    locked.events,
    false,
  )) return classification("INCONSISTENT");
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

function classifyEximbayAuthorizedR1Lease(
  locked: LockedUncontactedRecoveryState,
): UncontactedRecoveryClassification {
  const structure = identifyDispatchAuthorizationStructure(
    locked.command.dispatchAttempt,
    locked.dispatches,
  );
  if (structure.kind !== "replay"
    || !hasCoherentEximbayAuthorizedLeaseEvents(locked, structure.attempt.leaseGeneration)
    || !hasExactEximbayR1Authority(locked, structure.attempt.id)) {
    return classification("INCONSISTENT");
  }
  return isExpired(locked)
    ? classification("EXPIRED_AUTHORIZED_EXIMBAY_R1")
    : classification("INELIGIBLE");
}

function hasExactEximbayR1Authority(
  locked: LockedUncontactedRecoveryState,
  dispatchId: string,
): boolean {
  const authority = deriveAuthorizedEximbayR1Authority(locked);
  return [
    authority !== null,
    authority?.dispatch.id === dispatchId,
    authority?.dispatch.state === RefundExecutionDispatchAttemptState.AUTHORIZED,
    authority?.dispatch.contactMarkedAt === null,
  ].every(Boolean);
}

function deriveAuthorizedEximbayR1Authority(
  locked: LockedUncontactedRecoveryState,
): ReturnType<typeof deriveEximbayDispatchAuthority> {
  const binding = locked.binding;
  const observations = binding?.eximbayPreflightObservations ?? [];
  if (!binding || observations.length !== 1) return null;
  try {
    const config = createEximbayRefundPreflightConfig({
      mode: PaymentMode.SANDBOX,
      mid: observations[0].mid,
      merchantAccountBindingId: binding.merchantAccountBindingId,
      credentialGenerationBindingId: binding.credentialGenerationBindingId,
    });
    return deriveEximbayDispatchAuthority({
      context: authorizationContext(locked),
      history: {
        events: locked.events,
        dispatchAttempts: locked.dispatches,
        evidenceCount: locked.evidenceCount,
      },
      binding,
      observations,
      evidence: [...locked.evidence],
      capturedAt: locked.capturedAt,
    }, config, 1);
  } catch {
    return null;
  }
}

function hasCoherentEximbayAuthorizedLeaseEvents(
  locked: LockedUncontactedRecoveryState,
  authorizationGeneration: number,
): boolean {
  if (authorizationGeneration > locked.command.leaseGeneration) return false;
  const initial = locked.events.filter((event) => (
    event.leaseGeneration <= authorizationGeneration
  ));
  if (!hasCoherentUncontactedLeaseEventHistory(
    locked.command.id,
    authorizationGeneration,
    initial,
    false,
  )) return false;
  const recovered = locked.events.filter((event) => (
    event.leaseGeneration > authorizationGeneration
  ));
  if (recovered.length !== locked.command.leaseGeneration - authorizationGeneration) return false;
  let prior = initial.at(-1)?.occurredAt;
  return recovered.every((event, index) => {
    const coherent = event.commandId === locked.command.id
      && event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
      && event.leaseGeneration === authorizationGeneration + index + 1
      && event.dispatchAttempt === 1
      && event.occurredAt instanceof Date
      && (prior === undefined || prior.getTime() <= event.occurredAt.getTime());
    prior = event.occurredAt;
    return coherent;
  });
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

function isSupportedInitialSandboxContext(locked: LockedUncontactedRecoveryState): boolean {
  return isSupportedTossSandboxContext(locked)
    || isEximbayRefundContext(authorizationContext(locked));
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
