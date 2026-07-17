import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type RefundExecutionEvidence,
} from "@prisma/client";
import { buildRefundExecutionApplyOperationKey } from "../../execution-result-contract";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import { buildTossResultIdentitySnapshot } from "./refund-contact-finality-snapshot";
import { coherentTossFinality } from "./refund-contact-finality";
import type { LockedTossContactState } from "./refund-contact-state";
import {
  buildProviderLookupObservationIdentity,
  latestContactedDispatch,
} from "./refund-recovery-evidence";
import {
  isTossRefundResultBaseIdentityCoherent,
} from "./refund-result-identity-plan";
import { coherentLocalManualProjection } from "./refund-recovery-local-manual-state";

export const TOSS_RECOVERY_CONFLICT_SAFE_CODE =
  "TOSS_RECOVERY_PROVIDER_STATE_CONFLICT";
export const TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE =
  "Toss recovery lookup found a conflicting provider state.";
export const TOSS_RECOVERY_CONFLICT_TRANSITION_REASON =
  "Toss recovery lookup requires manual review.";

export type TossRecoveryDurableClassification =
  | Readonly<{ kind: "FINALITY" }>
  | Readonly<{ kind: "MANUAL_REVIEW" }>
  | Readonly<{ kind: "CONTACTED_WITHOUT_EVIDENCE" }>
  | Readonly<{ kind: "INELIGIBLE" }>
  | Readonly<{ kind: "INCONSISTENT" }>;

export function classifyTossRecoveryDurableState(
  locked: LockedTossContactState,
): TossRecoveryDurableClassification {
  const nonterminalRowsValid = locked.evidence
    .filter((row) => !isAppliedSuccess(row))
    .every((row) => coherentConflictEvidence(locked, row));
  if (coherentTossFinality(locked)) {
    return nonterminalRowsValid ? classification("FINALITY") : classification("INCONSISTENT");
  }
  if (locked.evidence.length > 0) {
    return coherentManualProjection(locked) && nonterminalRowsValid
      ? classification("MANUAL_REVIEW")
      : classification("INCONSISTENT");
  }
  return classifyRecoveryWithoutEvidence(locked);
}

function classifyRecoveryWithoutEvidence(
  locked: LockedTossContactState,
): TossRecoveryDurableClassification {
  const localManual = coherentLocalManualProjection(
    locked,
    coherentRecoveryHistoryBase(locked, null),
  );
  if (localManual) return classification("MANUAL_REVIEW");
  if (hasTerminalOrManualProjection(locked)) return classification("INCONSISTENT");
  return coherentContactedWithoutEvidence(locked)
    ? classification("CONTACTED_WITHOUT_EVIDENCE")
    : classification("INELIGIBLE");
}

export function coherentContactedRecoveryBase(
  locked: LockedTossContactState,
  credential: ConfiguredTossRefundCredential | null,
): boolean {
  if (!coherentContactedWithoutEvidenceShape(locked)) return false;
  return coherentRecoveryHistoryBase(locked, credential);
}

function coherentRecoveryHistoryBase(
  locked: LockedTossContactState,
  credential: ConfiguredTossRefundCredential | null,
): boolean {
  return locked.history.dispatchAttempts.every((dispatch) => {
    const snapshot = buildTossResultIdentitySnapshot(
      locked,
      syntheticSuccess(locked),
      credential,
      null,
      {
        source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
        dispatchAttemptId: dispatch.id,
        authorizingLeaseGeneration: dispatch.leaseGeneration,
      },
    );
    return snapshot !== null && isTossRefundResultBaseIdentityCoherent(snapshot);
  });
}

export function latestRecoveryDispatch(locked: LockedTossContactState) {
  return latestContactedDispatch(locked.history.dispatchAttempts.map((dispatch) => ({
    id: dispatch.id,
    ordinal: dispatch.ordinal,
    state: dispatch.state,
    contactMarkedAt: dispatch.contactMarkedAt?.getTime() ?? null,
    hasContactProof: locked.contactProofs.some(
      (proof) => proof.dispatchAttemptId === dispatch.id,
    ),
  })));
}

function coherentContactedWithoutEvidence(locked: LockedTossContactState): boolean {
  return coherentContactedWithoutEvidenceShape(locked)
    && coherentContactedRecoveryBase(locked, null);
}

function coherentContactedWithoutEvidenceShape(locked: LockedTossContactState): boolean {
  const { aggregate, target, command } = locked.context;
  const dispatches = [...locked.history.dispatchAttempts]
    .sort((left, right) => left.ordinal - right.ordinal);
  return [
    aggregate.status === OrderStatus.REFUND_PENDING,
    target.status === RefundAttemptStatus.PROCESSING,
    target.providerRefundId === null,
    target.processedAt === null,
    target.failedAt === null,
    target.failureCode === null,
    target.safeFailureMessage === null,
    command.status === RefundExecutionCommandStatus.LEASED,
    command.dispatchAttempt >= 1,
    dispatches.length >= 1,
    command.dispatchAttempt === dispatches.length,
    locked.contactProofs.length === dispatches.length,
    dispatches.every((dispatch, index) => (
      dispatch.ordinal === index + 1
        && dispatch.commandId === command.id
        && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
        && dispatch.contactMarkedAt !== null
    )),
  ].every(Boolean);
}

function coherentConflictEvidence(
  locked: LockedTossContactState,
  evidence: RefundExecutionEvidence,
): boolean {
  const dispatch = latestRecoveryDispatch(locked);
  if (!dispatch || evidence.authorizingLeaseGeneration === null) return false;
  const exactRow = [
    evidence.commandId === locked.context.command.id,
    evidence.source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    evidence.outcome === RefundExecutionEvidenceOutcome.UNKNOWN,
    evidence.application === RefundExecutionEvidenceApplication.CONFLICT,
    evidence.sourceDedupKey === buildProviderLookupObservationIdentity(
      locked.context.command.id,
      evidence.authorizingLeaseGeneration,
    ),
    evidence.dispatchAttemptId === dispatch.id,
    evidence.observedProviderRefundId === null,
    evidence.reportedAmount === null,
    evidence.reportedCurrency === null,
    evidence.safeCode === TOSS_RECOVERY_CONFLICT_SAFE_CODE,
    evidence.safeMessage === TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
  ].every(Boolean);
  if (!exactRow) return false;
  const snapshot = buildTossResultIdentitySnapshot(
    locked,
    syntheticSuccess(locked),
    null,
    evidence,
  );
  return snapshot !== null && isTossRefundResultBaseIdentityCoherent(snapshot);
}

function coherentManualProjection(locked: LockedTossContactState): boolean {
  if (locked.evidence.length !== 1) return false;
  const evidence = locked.evidence[0];
  const transition = locked.context.target.transitions.find(
    (row) => row.operationKey === buildRefundExecutionApplyOperationKey(evidence.id),
  );
  return coherentConflictEvidence(locked, evidence)
    && manualAggregateMatches(locked)
    && transition !== undefined
    && manualTransitionMatches(locked, evidence, transition);
}

function manualAggregateMatches(locked: LockedTossContactState): boolean {
  const { aggregate, target, command } = locked.context;
  return [
    aggregate.status === OrderStatus.REFUND_PENDING,
    target.status === RefundAttemptStatus.MANUAL_REVIEW,
    target.providerRefundId === null,
    target.processedAt === null,
    target.failedAt === null,
    target.failureCode === TOSS_RECOVERY_CONFLICT_SAFE_CODE,
    target.safeFailureMessage === TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
    command.status === RefundExecutionCommandStatus.PARKED,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    command.lastSafeErrorCode === TOSS_RECOVERY_CONFLICT_SAFE_CODE,
    command.lastSafeErrorMessage === TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
  ].every(Boolean);
}

function manualTransitionMatches(
  locked: LockedTossContactState,
  evidence: RefundExecutionEvidence,
  transition: LockedTossContactState["context"]["target"]["transitions"][number],
): boolean {
  return [
    transition.refundAttemptId === locked.context.target.id,
    transition.fromStatus === RefundAttemptStatus.PROCESSING,
    transition.toStatus === RefundAttemptStatus.MANUAL_REVIEW,
    transition.orderStatusBefore === OrderStatus.REFUND_PENDING,
    transition.orderStatusAfter === OrderStatus.REFUND_PENDING,
    transition.actorType === RefundAttemptActorType.SYSTEM,
    transition.actorUserId === null,
    transition.reason === TOSS_RECOVERY_CONFLICT_TRANSITION_REASON,
    transition.createdAt.getTime() === evidence.observedAt.getTime(),
  ].every(Boolean);
}

function hasTerminalOrManualProjection(locked: LockedTossContactState): boolean {
  const { aggregate, target, command } = locked.context;
  return aggregate.status !== OrderStatus.REFUND_PENDING
    || target.status !== RefundAttemptStatus.PROCESSING
    || command.status !== RefundExecutionCommandStatus.LEASED;
}

function isAppliedSuccess(evidence: RefundExecutionEvidence): boolean {
  return evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
    && evidence.application === RefundExecutionEvidenceApplication.APPLIED;
}

function syntheticSuccess(locked: LockedTossContactState) {
  const paymentKey = locked.context.aggregate.payment.providerPaymentKey ?? "";
  const amount = locked.context.target.amount;
  return Object.freeze({
    paymentKey,
    currency: "KRW" as const,
    paymentStatus: "CANCELED" as const,
    totalAmount: amount,
    balanceAmount: 0 as const,
    transactionKey: "recovery-state-validation",
    cancelStatus: "DONE" as const,
    cancelAmount: amount,
    cancelReason: "Mira merchant refund" as const,
  });
}

function classification<K extends TossRecoveryDurableClassification["kind"]>(
  kind: K,
): Readonly<{ kind: K }> {
  return Object.freeze({ kind });
}
