import {
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type Prisma,
  type RefundAttemptTransition,
  type RefundExecutionDispatchAttempt,
  type RefundExecutionEvidence,
} from "@prisma/client";
import {
  buildRefundExecutionApplyOperationKey,
  buildRefundResultDedupKey,
  EVIDENCE_CONFLICT_CODE,
  INSUFFICIENT_SUCCESS_CODE,
  resultFailure,
  resultSuccess,
  sameRefundEvidenceObservation,
  type NormalizedRefundResultInput,
  type RefundExecutionResult,
} from "./execution-result-contract";
import {
  EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON,
  EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON,
  EXECUTION_MANUAL_REVIEW_TRANSITION_REASON,
  EXECUTION_RETRYABLE_TRANSITION_REASON,
  EXECUTION_SUCCEEDED_TRANSITION_REASON,
  EXECUTION_TERMINAL_TRANSITION_REASON,
  expectedReplayOrderStatus,
  type ResolutionAggregate,
  type ResolutionTarget,
} from "./execution-result-plan";
import { fingerprintRefundRequest } from "./refund-request-fingerprint";

type ReplayContext = {
  aggregate: ResolutionAggregate;
  target: ResolutionTarget;
  command: NonNullable<ResolutionTarget["executionCommand"]>;
};

export async function resolveRefundEvidenceReplay(
  tx: Prisma.TransactionClient,
  context: ReplayContext,
  dispatch: RefundExecutionDispatchAttempt,
  evidence: RefundExecutionEvidence,
  input: NormalizedRefundResultInput,
): Promise<RefundExecutionResult> {
  const diagnostic = replayDiagnostic(evidence.application, input);
  if (evidence.commandId !== input.commandId
    || evidence.sourceDedupKey !== buildRefundResultDedupKey(input.commandId, input.dispatchAttempt)
    || evidence.source !== RefundExecutionEvidenceSource.ADAPTER_RESPONSE
    || !sameRefundEvidenceObservation(evidence, input.observation, diagnostic.safeCode, diagnostic.safeMessage)) {
    return resultFailure("EVIDENCE_IDEMPOTENCY_CONFLICT", "Evidence identity conflicts with a stored observation.");
  }
  if (!(await hasCoherentReplayArtifact(tx, context, dispatch, evidence))) {
    return resultFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution replay artifacts are inconsistent.");
  }
  return resultSuccess(evidence, context.target.id, true);
}

function replayDiagnostic(application: RefundExecutionEvidenceApplication, input: NormalizedRefundResultInput) {
  if (application === RefundExecutionEvidenceApplication.CONFLICT) {
    return { safeCode: EVIDENCE_CONFLICT_CODE, safeMessage: input.observation.safeMessage };
  }
  if (application === RefundExecutionEvidenceApplication.PARKED) {
    return { safeCode: INSUFFICIENT_SUCCESS_CODE, safeMessage: input.observation.safeMessage };
  }
  return { safeCode: input.observation.safeCode, safeMessage: input.observation.safeMessage };
}

async function hasCoherentReplayArtifact(
  tx: Prisma.TransactionClient,
  context: ReplayContext,
  dispatch: RefundExecutionDispatchAttempt,
  evidence: RefundExecutionEvidence,
): Promise<boolean> {
  if (!matchesDispatch(context, dispatch) || !matchesCommand(context, dispatch, evidence)) return false;
  if (!matchesRequestFingerprint(context, dispatch)) return false;
  const transition = await tx.refundAttemptTransition.findUnique({
    where: { operationKey: buildRefundExecutionApplyOperationKey(evidence.id) },
  });
  return matchesApplicationState(context, evidence, transition);
}

function matchesDispatch(context: ReplayContext, dispatch: RefundExecutionDispatchAttempt): boolean {
  return dispatch.commandId === context.command.id
    && dispatch.ordinal === context.command.dispatchAttempt
    && dispatch.leaseGeneration === context.command.leaseGeneration
    && dispatch.provider === context.target.provider
    && dispatch.mode === context.target.mode
    && dispatch.providerOperationKey === context.target.idempotencyKey
    && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
    && dispatch.contactMarkedAt !== null;
}

function matchesCommand(
  context: ReplayContext,
  dispatch: RefundExecutionDispatchAttempt,
  evidence: RefundExecutionEvidence,
): boolean {
  return context.command.refundAttemptId === context.target.id
    && evidence.commandId === context.command.id
    && context.command.dispatchAttempt === dispatch.ordinal
    && context.command.leaseGeneration === dispatch.leaseGeneration
    && context.command.leaseOwner === null
    && context.command.leaseUntil === null
    && context.command.leaseTokenHash === null;
}

function matchesRequestFingerprint(context: ReplayContext, dispatch: RefundExecutionDispatchAttempt): boolean {
  const providerPaymentReference = context.aggregate.payment.providerPaymentKey;
  if (!providerPaymentReference) return false;
  const coherentIdentity = [
    context.target.orderId === context.aggregate.id,
    context.target.paymentId === context.aggregate.payment.id,
    context.aggregate.paymentId === context.aggregate.payment.id,
    context.aggregate.payment.provider === context.target.provider,
    context.aggregate.payment.mode === context.target.mode,
    context.aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED,
    context.aggregate.payment.amount === context.aggregate.totalAmount,
    context.aggregate.payment.currency === context.aggregate.currency,
    context.target.currency === context.aggregate.currency,
  ].every(Boolean);
  if (!coherentIdentity) return false;
  try {
    return dispatch.requestFingerprint === fingerprintRefundRequest({
      provider: context.target.provider,
      mode: context.target.mode,
      providerPaymentReference,
      amountMinor: context.target.amount,
      currency: context.target.currency,
      providerOperationKey: context.target.idempotencyKey,
    });
  } catch {
    return false;
  }
}

function matchesApplicationState(
  context: ReplayContext,
  evidence: RefundExecutionEvidence,
  transition: RefundAttemptTransition | null,
): boolean {
  if (evidence.application === RefundExecutionEvidenceApplication.APPLIED
    && evidence.outcome === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING) {
    return matchesPendingApplication(context, evidence, transition);
  }
  return matchesFinalizedApplication(context, evidence, transition);
}

function matchesPendingApplication(
  context: ReplayContext,
  evidence: RefundExecutionEvidence,
  transition: RefundAttemptTransition | null,
): boolean {
  return [
    transition === null,
    context.aggregate.status === OrderStatus.REFUND_PENDING,
    matchesCoreState(
      context,
      RefundAttemptStatus.PROCESSING,
      RefundExecutionCommandStatus.WAITING_EVIDENCE,
      null,
      null,
    ),
    matchesAttemptDiagnostics(context.target, null, null, null, null),
    evidence.observedProviderRefundId === null || context.target.providerRefundId === evidence.observedProviderRefundId,
  ].every(Boolean);
}

function matchesFinalizedApplication(
  context: ReplayContext,
  evidence: RefundExecutionEvidence,
  transition: RefundAttemptTransition | null,
): boolean {
  const expected = expectedTerminalState(evidence);
  if (!expected || !transition) return false;
  const diagnostic = expected.failureCode
    ? { safeCode: evidence.safeCode, safeMessage: evidence.safeMessage }
    : { safeCode: null, safeMessage: null };
  const processedAt = expected.processed ? transition.createdAt : null;
  const failedAt = expected.failed ? transition.createdAt : null;
  const orderStatus = expectedReplayOrderStatus(context.aggregate, context.target, evidence);
  if (orderStatus === null) return false;
  return [
    matchesCoreState(
      context,
      expected.attemptStatus,
      expected.commandStatus,
      diagnostic.safeCode,
      diagnostic.safeMessage,
    ),
    matchesAttemptDiagnostics(
      context.target,
      diagnostic.safeCode,
      diagnostic.safeMessage,
      processedAt,
      failedAt,
    ),
    matchesProviderRefundId(context.target, evidence, expected.providerIdentityOwned),
    context.aggregate.status === orderStatus,
    matchesTransition(context, evidence, transition, expected.reason, orderStatus),
  ].every(Boolean);
}

function matchesCoreState(
  context: ReplayContext,
  attemptStatus: RefundAttemptStatus,
  commandStatus: RefundExecutionCommandStatus,
  safeCode: string | null,
  safeMessage: string | null,
): boolean {
  return context.target.status === attemptStatus
    && context.command.status === commandStatus
    && context.command.lastSafeErrorCode === safeCode
    && context.command.lastSafeErrorMessage === safeMessage;
}

function matchesAttemptDiagnostics(
  target: ResolutionTarget,
  failureCode: string | null,
  safeFailureMessage: string | null,
  processedAt: Date | null,
  failedAt: Date | null,
): boolean {
  return target.failureCode === failureCode
    && target.safeFailureMessage === safeFailureMessage
    && sameNullableDate(target.processedAt, processedAt)
    && sameNullableDate(target.failedAt, failedAt);
}

function matchesProviderRefundId(
  target: ResolutionTarget,
  evidence: RefundExecutionEvidence,
  providerIdentityOwned: boolean,
): boolean {
  return !providerIdentityOwned || evidence.observedProviderRefundId === null
    || target.providerRefundId === evidence.observedProviderRefundId;
}

function matchesTransition(
  context: ReplayContext,
  evidence: RefundExecutionEvidence,
  transition: RefundAttemptTransition,
  reason: string,
  orderStatus: OrderStatus,
): boolean {
  return [
    transition.refundAttemptId === context.target.id,
    transition.fromStatus === RefundAttemptStatus.PROCESSING,
    transition.toStatus === context.target.status,
    transition.orderStatusBefore === OrderStatus.REFUND_PENDING,
    transition.orderStatusAfter === orderStatus,
    transition.actorType === RefundAttemptActorType.SYSTEM,
    transition.actorUserId === null,
    transition.reason === reason,
    transition.operationKey === buildRefundExecutionApplyOperationKey(evidence.id),
  ].every(Boolean);
}

function expectedTerminalState(evidence: RefundExecutionEvidence): {
  attemptStatus: RefundAttemptStatus;
  commandStatus: RefundExecutionCommandStatus;
  failureCode: boolean;
  processed: boolean;
  failed: boolean;
  providerIdentityOwned: boolean;
  reason: string;
} | null {
  if (evidence.application === RefundExecutionEvidenceApplication.CONFLICT) {
    return terminalState(RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.PARKED, true, false, false, false, EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON);
  }
  if (evidence.application === RefundExecutionEvidenceApplication.PARKED) {
    return terminalState(RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.PARKED, true, false, false, false, EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON);
  }
  if (evidence.application !== RefundExecutionEvidenceApplication.APPLIED) return null;
  if (evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) {
    return terminalState(RefundAttemptStatus.SUCCEEDED, RefundExecutionCommandStatus.DONE, false, true, false, true, EXECUTION_SUCCEEDED_TRANSITION_REASON);
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE) {
    return terminalState(RefundAttemptStatus.FAILED_RETRYABLE, RefundExecutionCommandStatus.PARKED, true, false, false, false, EXECUTION_RETRYABLE_TRANSITION_REASON);
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    return terminalState(RefundAttemptStatus.FAILED_TERMINAL, RefundExecutionCommandStatus.DONE, true, false, true, false, EXECUTION_TERMINAL_TRANSITION_REASON);
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.UNKNOWN) {
    return terminalState(RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.PARKED, true, false, false, false, EXECUTION_MANUAL_REVIEW_TRANSITION_REASON);
  }
  return null;
}

function terminalState(
  attemptStatus: RefundAttemptStatus,
  commandStatus: RefundExecutionCommandStatus,
  failureCode: boolean,
  processed: boolean,
  failed: boolean,
  providerIdentityOwned: boolean,
  reason: string,
) {
  return { attemptStatus, commandStatus, failureCode, processed, failed, providerIdentityOwned, reason };
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  return left === null ? right === null : right !== null && left.getTime() === right.getTime();
}
