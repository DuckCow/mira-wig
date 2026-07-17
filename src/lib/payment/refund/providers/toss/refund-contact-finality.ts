import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type RefundAttemptTransition,
} from "@prisma/client";
import {
  buildRefundExecutionApplyOperationKey,
  buildRefundResultDedupKey,
} from "../../execution-result-contract";
import { EXECUTION_SUCCEEDED_TRANSITION_REASON } from "../../execution-result-plan";
import {
  contactFailure,
  contactSuccess,
  type ExecuteTossRefundContactResult,
} from "./refund-contact-contract";
import { hasAtomicContactMarker, type LockedTossContactState } from "./refund-contact-state";
import type { TossRefundCancellationSuccessCandidate } from "./refund-cancellation-response";
import { buildTossResultIdentitySnapshot } from "./refund-contact-finality-snapshot";
import { planTossRefundResultIdentity } from "./refund-result-identity-plan";

export type ContactDurableClassification =
  | Readonly<{ kind: "fresh" }>
  | Readonly<{ kind: "result"; result: ExecuteTossRefundContactResult }>;

export function classifyTossContactDurableState(
  locked: LockedTossContactState,
): ContactDurableClassification {
  if (locked.evidence.length > 0) {
    return coherentTossFinality(locked)
      ? result(contactSuccess(locked.context.command.id, true))
      : result(ledgerFailure());
  }
  if (locked.structure.kind === "contacted") {
    return hasAtomicContactMarker(locked) ? result(recoveryFailure()) : result(ledgerFailure());
  }
  const fresh = locked.structure.kind === "replay" && locked.contactProof === null;
  return fresh ? Object.freeze({ kind: "fresh" }) : result(ledgerFailure());
}

export function coherentTossFinality(locked: LockedTossContactState): boolean {
  const evidence = soleFinalityEvidence(locked);
  if (!evidence) return false;
  const transactionKey = evidence.observedProviderRefundId;
  if (!transactionKey) return false;
  const success = successFromEvidence(locked, transactionKey);
  const snapshot = buildTossResultIdentitySnapshot(locked, success, null, evidence);
  if (!snapshot || !planTossRefundResultIdentity(snapshot).ok) return false;
  const transition = appliedTransition(locked, evidence.id);
  return evidenceMatches(locked, transactionKey)
    && projectionMatches(locked, transactionKey, transition);
}

function soleFinalityEvidence(locked: LockedTossContactState) {
  const appliedSuccess = locked.evidence.filter((row) => (
    row.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
      && row.application === RefundExecutionEvidenceApplication.APPLIED
  ));
  if (appliedSuccess.length !== 1) return null;
  const providerIds = new Set(locked.evidence
    .map((row) => row.observedProviderRefundId)
    .filter((value): value is string => value !== null));
  return providerIds.size <= 1 ? appliedSuccess[0] : null;
}

function successFromEvidence(
  locked: LockedTossContactState,
  transactionKey: string,
): TossRefundCancellationSuccessCandidate {
  const paymentKey = locked.context.aggregate.payment.providerPaymentKey ?? "";
  const amount = locked.context.target.amount;
  return Object.freeze({
    paymentKey,
    currency: "KRW",
    paymentStatus: "CANCELED",
    totalAmount: amount,
    balanceAmount: 0,
    transactionKey,
    cancelStatus: "DONE",
    cancelAmount: amount,
    cancelReason: "Mira merchant refund",
  });
}

function evidenceMatches(locked: LockedTossContactState, transactionKey: string): boolean {
  const evidence = soleFinalityEvidence(locked);
  if (!evidence?.dispatchAttemptId || !evidence.authorizingLeaseGeneration) return false;
  const dispatch = locked.history.dispatchAttempts.find((row) => row.id === evidence.dispatchAttemptId);
  if (!dispatch || laterContactedOrdinalExists(locked, dispatch.ordinal)) return false;
  return [
    evidence.commandId === locked.context.command.id,
    evidence.sourceDedupKey === buildRefundResultDedupKey(
      locked.context.command.id, dispatch.ordinal,
    ),
    evidence.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE
      || evidence.source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED,
    evidence.application === RefundExecutionEvidenceApplication.APPLIED,
    evidence.observedProviderRefundId === transactionKey,
    evidence.reportedAmount === locked.context.target.amount,
    evidence.reportedCurrency === "KRW",
    evidence.safeCode === null,
    evidence.safeMessage === null,
    locked.context.target.processedAt?.getTime() === evidence.observedAt.getTime(),
  ].every(Boolean);
}

function laterContactedOrdinalExists(locked: LockedTossContactState, ordinal: number): boolean {
  return locked.history.dispatchAttempts.some((dispatch) => (
    dispatch.ordinal > ordinal
      && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
  ));
}

function projectionMatches(
  locked: LockedTossContactState,
  transactionKey: string,
  transition: RefundAttemptTransition | null,
): boolean {
  const { aggregate, target, command } = locked.context;
  if (!transition) return false;
  return [
    aggregate.status === OrderStatus.REFUNDED,
    aggregate.totalAmount === target.amount,
    target.status === RefundAttemptStatus.SUCCEEDED,
    target.providerRefundId === transactionKey,
    target.processedAt?.getTime() === transition.createdAt.getTime(),
    target.failedAt === null,
    target.failureCode === null,
    target.safeFailureMessage === null,
    command.status === RefundExecutionCommandStatus.DONE,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    command.lastSafeErrorCode === null,
    command.lastSafeErrorMessage === null,
    transitionMatches(locked, transition),
  ].every(Boolean);
}

function appliedTransition(
  locked: LockedTossContactState,
  evidenceId: string,
): RefundAttemptTransition | null {
  const key = buildRefundExecutionApplyOperationKey(evidenceId);
  return locked.context.target.transitions.find((row) => row.operationKey === key) ?? null;
}

function transitionMatches(
  locked: LockedTossContactState,
  transition: RefundAttemptTransition,
): boolean {
  return transition.refundAttemptId === locked.context.target.id
    && transition.fromStatus === RefundAttemptStatus.PROCESSING
    && transition.toStatus === RefundAttemptStatus.SUCCEEDED
    && transition.orderStatusBefore === OrderStatus.REFUND_PENDING
    && transition.orderStatusAfter === OrderStatus.REFUNDED
    && transition.actorType === RefundAttemptActorType.SYSTEM
    && transition.actorUserId === null
    && transition.reason === EXECUTION_SUCCEEDED_TRANSITION_REASON;
}

function result(value: ExecuteTossRefundContactResult): ContactDurableClassification {
  return Object.freeze({ kind: "result", result: value });
}

const recoveryFailure = () => contactFailure(
  "CONTACT_RECOVERY_REQUIRED",
  "Toss refund contact state requires recovery.",
);
const ledgerFailure = () => contactFailure(
  "REFUND_LEDGER_INCONSISTENT",
  "Refund execution aggregate is inconsistent.",
);
