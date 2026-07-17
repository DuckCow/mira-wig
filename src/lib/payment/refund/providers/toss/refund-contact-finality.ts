import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
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
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  contactFailure,
  contactSuccess,
  type ExecuteTossRefundContactResult,
} from "./refund-contact-contract";
import { hasAtomicContactMarker, type LockedTossContactState } from "./refund-contact-state";
import type { TossRefundCancellationSuccessCandidate } from "./refund-cancellation-response";
import {
  planTossRefundResultIdentity,
  type TossRefundResultIdentitySnapshot,
} from "./refund-result-identity-plan";

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
  const snapshot = buildTossResultIdentitySnapshot(locked, success, null);
  if (!snapshot || !planTossRefundResultIdentity(snapshot).ok) return false;
  const transition = appliedTransition(locked, evidence.id);
  return evidenceMatches(locked, transactionKey)
    && projectionMatches(locked, transactionKey, transition)
    && acquisitionMatches(locked);
}

function soleFinalityEvidence(locked: LockedTossContactState) {
  return locked.evidence.length === 1 && hasAtomicContactMarker(locked)
    ? locked.evidence[0]
    : null;
}

export function buildTossResultIdentitySnapshot(
  locked: LockedTossContactState,
  success: TossRefundCancellationSuccessCandidate,
  credential: ConfiguredTossRefundCredential | null,
): TossRefundResultIdentitySnapshot | null {
  const binding = locked.binding;
  const authorizationProof = binding?.eligibilityProof;
  const contactProof = locked.contactProof;
  const dispatch = locked.history.dispatchAttempts[0];
  const paymentKey = locked.context.aggregate.payment.providerPaymentKey;
  if (!binding) return null;
  if (!authorizationProof) return null;
  if (!contactProof) return null;
  if (!dispatch) return null;
  if (!paymentKey) return null;
  return {
    commandId: locked.context.command.id,
    refundAttempt: refundAttemptSnapshot(locked),
    payment: paymentSnapshot(locked, paymentKey),
    binding: { ...binding },
    expectedCredential: expectedCredentialSnapshot(binding, credential),
    authorizationProof: {
      ...proofFacts(authorizationProof),
      bindingId: authorizationProof.bindingId,
    },
    contactProof: {
      ...proofFacts(contactProof),
      dispatchAttemptId: contactProof.dispatchAttemptId,
    },
    dispatch: dispatchSnapshot(dispatch),
    success,
  };
}

function expectedCredentialSnapshot(
  binding: NonNullable<LockedTossContactState["binding"]>,
  credential: ConfiguredTossRefundCredential | null,
) {
  return {
    merchantAccountBindingId: credential?.merchantAccountBinding
      ?? binding.merchantAccountBindingId,
    credentialGenerationBindingId: credential?.credentialGenerationBinding
      ?? binding.credentialGenerationBindingId,
  };
}

function dispatchSnapshot(
  dispatch: LockedTossContactState["history"]["dispatchAttempts"][number],
) {
  return {
    ...dispatch,
    contactMarkedAt: dispatch.contactMarkedAt?.getTime() ?? null,
  };
}

function refundAttemptSnapshot(locked: LockedTossContactState) {
  const target = locked.context.target;
  return {
    id: target.id,
    paymentId: target.paymentId,
    provider: target.provider,
    mode: target.mode,
    amount: target.amount,
    currency: target.currency,
    idempotencyKey: target.idempotencyKey,
  };
}

function paymentSnapshot(locked: LockedTossContactState, paymentKey: string) {
  const payment = locked.context.aggregate.payment;
  return {
    id: payment.id,
    provider: payment.provider,
    mode: payment.mode,
    amount: payment.amount,
    currency: payment.currency,
    paymentKey,
  };
}

function proofFacts(proof: Readonly<{
  paymentKey: string;
  method: string;
  easyPayPresent: boolean;
  currency: string;
  providerStatus: string;
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: number;
  taxExemptionAmount: number;
  cancelsCount: number;
  localReceivedAt: Date;
  eligibilityFingerprint: string;
}>) {
  return {
    paymentKey: proof.paymentKey,
    method: proof.method,
    easyPayPresent: proof.easyPayPresent,
    currency: proof.currency,
    providerStatus: proof.providerStatus,
    totalAmount: proof.totalAmount,
    balanceAmount: proof.balanceAmount,
    taxFreeAmount: proof.taxFreeAmount,
    taxExemptionAmount: proof.taxExemptionAmount,
    cancelsCount: proof.cancelsCount,
    localReceivedAt: proof.localReceivedAt.getTime(),
    eligibilityFingerprint: proof.eligibilityFingerprint,
  };
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
  const evidence = locked.evidence[0];
  return [
    evidence.commandId === locked.context.command.id,
    evidence.sourceDedupKey === buildRefundResultDedupKey(locked.context.command.id, 1),
    evidence.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
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

function acquisitionMatches(locked: LockedTossContactState): boolean {
  const dispatch = locked.history.dispatchAttempts[0];
  const acquisitions = locked.history.events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
  ));
  return locked.history.events.length === 1 && acquisitions.length === 1
    && acquisitions[0].commandId === locked.context.command.id
    && acquisitions[0].leaseGeneration === dispatch.leaseGeneration
    && acquisitions[0].dispatchAttempt === 0
    && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED;
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
