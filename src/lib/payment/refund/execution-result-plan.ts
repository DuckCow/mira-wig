import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type Payment,
  type Prisma,
  type RefundAttempt,
  type RefundExecutionDispatchAttempt,
  type RefundExecutionEvidence,
  type RefundExecutionCommand,
} from "@prisma/client";
import {
  EVIDENCE_CONFLICT_CODE,
  INSUFFICIENT_SUCCESS_CODE,
  resultFailure,
  type RefundExecutionResultFailure,
} from "./execution-result-contract";
import type { NormalizedRefundObservation } from "./refund-observation-contract";
import {
  RefundRequestFingerprintInputError,
  fingerprintRefundRequest,
} from "./refund-request-fingerprint";
import {
  validateInitialRefundExecutionSuitability,
  type InitialExecutionAggregate,
  type InitialExecutionTarget,
} from "./execution-suitability";
import { deriveRefundRestingOrderStatus } from "./resting-state";
import { deriveOrderStatusAfterSucceededRefund } from "./success-state";
import { validateRefundAttemptStatusTransition } from "./transitions";
export const EXECUTION_SUCCEEDED_TRANSITION_REASON = "Refund execution succeeded.";
export const EXECUTION_RETRYABLE_TRANSITION_REASON = "Refund execution confirmed not executed and parked.";
export const EXECUTION_TERMINAL_TRANSITION_REASON = "Refund execution ended without provider execution.";
export const EXECUTION_MANUAL_REVIEW_TRANSITION_REASON = "Refund execution outcome requires manual review.";
export const EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON = "Refund execution evidence conflict requires manual review.";
export const EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON = "Refund success evidence requires manual review.";
export type ResolutionTarget = InitialExecutionTarget;
export type ResolutionAggregate = InitialExecutionAggregate;

export interface ResolutionDiagnostic {
  safeCode: string | null;
  safeMessage: string | null;
}

export interface ResolutionPlan {
  application: RefundExecutionEvidenceApplication;
  diagnostic: ResolutionDiagnostic;
  attemptStatus: RefundAttemptStatus;
  commandStatus: RefundExecutionCommandStatus;
  orderStatus: OrderStatus;
  processedAt: Date | null;
  failedAt: Date | null;
  providerRefundId: string | null;
  transitionReason: string | null;
}

export function validateFreshResolutionAggregate(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  command: RefundExecutionCommand,
): RefundExecutionResultFailure | null {
  return validateInitialRefundExecutionSuitability(aggregate, target, command).ok ? null : ledgerFailure();
}

export function matchesAuthorizedResultRequest(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  dispatch: RefundExecutionDispatchAttempt,
): boolean {
  const providerPaymentReference = aggregate.payment.providerPaymentKey;
  if (!providerPaymentReference) return false;
  const coherentIdentity = [
    aggregate.payment.provider === target.provider,
    aggregate.payment.mode === target.mode,
    aggregate.payment.amount === aggregate.totalAmount,
    aggregate.payment.currency === aggregate.currency,
    target.amount <= aggregate.payment.amount,
    target.currency === aggregate.currency,
    dispatch.provider === target.provider,
    dispatch.mode === target.mode,
    dispatch.providerOperationKey === target.idempotencyKey,
  ].every(Boolean);
  if (!coherentIdentity) return false;
  try {
    return dispatch.requestFingerprint === fingerprintRefundRequest({
      provider: target.provider,
      mode: target.mode,
      providerPaymentReference,
      amountMinor: target.amount,
      currency: target.currency,
      providerOperationKey: target.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof RefundRequestFingerprintInputError) return false;
    throw error;
  }
}

export async function hasRefundProviderIdentityConflict(
  tx: Prisma.TransactionClient,
  target: ResolutionTarget,
  observation: NormalizedRefundObservation,
): Promise<boolean> {
  const observed = observation.observedProviderRefundId;
  if (observed === null) return false;
  if (target.providerRefundId !== null && target.providerRefundId !== observed) return true;
  const owner = await tx.refundAttempt.findFirst({
    where: { provider: target.provider, providerRefundId: observed, id: { not: target.id } },
    select: { id: true },
  });
  return owner !== null;
}

export function expectedReplayOrderStatus(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  evidence: RefundExecutionEvidence,
): OrderStatus | null {
  if (evidence.application !== RefundExecutionEvidenceApplication.APPLIED
    || evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE
    || evidence.outcome === RefundExecutionEvidenceOutcome.UNKNOWN) return OrderStatus.REFUND_PENDING;
  if (evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) {
    const derived = deriveOrderStatusAfterSucceededRefund({
      capturedAmount: aggregate.payment.amount,
      currency: aggregate.payment.currency,
      succeedingAttemptId: target.id,
      attempts: aggregate.refundAttempts,
    });
    return derived.ok ? derived.orderStatus : null;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    const derived = deriveRefundRestingOrderStatus({
      totalAmount: aggregate.payment.amount,
      currency: aggregate.payment.currency,
      attempts: aggregate.refundAttempts,
    });
    return derived.ok ? derived.orderStatus : null;
  }
  return OrderStatus.REFUND_PENDING;
}

export function buildResolutionPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  observation: NormalizedRefundObservation,
  capturedAt: Date,
  providerIdentityConflict: boolean,
): ResolutionPlan | RefundExecutionResultFailure {
  if (hasMoneyConflict(target, aggregate.payment, observation) || providerIdentityConflict) {
    return manualReviewPlan(
      RefundExecutionEvidenceApplication.CONFLICT,
      EVIDENCE_CONFLICT_CODE,
      observation.safeMessage,
    );
  }
  if (observation.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED && observation.reportedAmount === null) {
    return manualReviewPlan(
      RefundExecutionEvidenceApplication.PARKED,
      INSUFFICIENT_SUCCESS_CODE,
      observation.safeMessage,
    );
  }
  return appliedPlan(aggregate, target, observation, capturedAt);
}

function hasMoneyConflict(
  target: RefundAttempt,
  payment: Payment,
  observation: NormalizedRefundObservation,
): boolean {
  if (observation.reportedAmount === null || observation.reportedCurrency === null) return false;
  return observation.reportedAmount !== target.amount
    || observation.reportedCurrency !== target.currency
    || observation.reportedCurrency !== payment.currency;
}

function appliedPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  observation: NormalizedRefundObservation,
  capturedAt: Date,
): ResolutionPlan | RefundExecutionResultFailure {
  if (observation.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) {
    return successPlan(aggregate, target, observation, capturedAt);
  }
  if (observation.outcome === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING) {
    return pendingPlan(target, observation);
  }
  if (observation.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE) {
    return failurePlan(RefundAttemptStatus.FAILED_RETRYABLE, RefundExecutionCommandStatus.PARKED, observation, capturedAt, false);
  }
  if (observation.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    return terminalFailurePlan(aggregate, observation, capturedAt);
  }
  return failurePlan(RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.PARKED, observation, capturedAt, false);
}

function successPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  observation: NormalizedRefundObservation,
  capturedAt: Date,
): ResolutionPlan | RefundExecutionResultFailure {
  const derived = deriveOrderStatusAfterSucceededRefund({
    capturedAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    succeedingAttemptId: target.id,
    attempts: aggregate.refundAttempts,
  });
  if (!derived.ok) return ledgerFailure();
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: observation.safeCode, safeMessage: observation.safeMessage },
    attemptStatus: RefundAttemptStatus.SUCCEEDED,
    commandStatus: RefundExecutionCommandStatus.DONE,
    orderStatus: derived.orderStatus,
    processedAt: capturedAt,
    failedAt: null,
    providerRefundId: observation.observedProviderRefundId,
    transitionReason: EXECUTION_SUCCEEDED_TRANSITION_REASON,
  };
}

function pendingPlan(target: ResolutionTarget, observation: NormalizedRefundObservation): ResolutionPlan {
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: observation.safeCode, safeMessage: observation.safeMessage },
    attemptStatus: RefundAttemptStatus.PROCESSING,
    commandStatus: RefundExecutionCommandStatus.WAITING_EVIDENCE,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: target.providerRefundId ?? observation.observedProviderRefundId,
    transitionReason: null,
  };
}

function terminalFailurePlan(
  aggregate: ResolutionAggregate,
  observation: NormalizedRefundObservation,
  capturedAt: Date,
): ResolutionPlan | RefundExecutionResultFailure {
  const resting = deriveRefundRestingOrderStatus({
    totalAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    attempts: aggregate.refundAttempts,
  });
  if (!resting.ok) return ledgerFailure();
  const plan = failurePlan(
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundExecutionCommandStatus.DONE,
    observation,
    capturedAt,
    true,
  );
  return { ...plan, orderStatus: resting.orderStatus };
}

function failurePlan(
  attemptStatus: RefundAttemptStatus,
  commandStatus: RefundExecutionCommandStatus,
  observation: NormalizedRefundObservation,
  capturedAt: Date,
  terminal: boolean,
): ResolutionPlan {
  const reason = attemptStatus === RefundAttemptStatus.FAILED_RETRYABLE
    ? EXECUTION_RETRYABLE_TRANSITION_REASON
    : attemptStatus === RefundAttemptStatus.FAILED_TERMINAL
      ? EXECUTION_TERMINAL_TRANSITION_REASON
      : EXECUTION_MANUAL_REVIEW_TRANSITION_REASON;
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: observation.safeCode, safeMessage: observation.safeMessage },
    attemptStatus,
    commandStatus,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: terminal ? capturedAt : null,
    providerRefundId: null,
    transitionReason: reason,
  };
}
function manualReviewPlan(
  application: RefundExecutionEvidenceApplication,
  safeCode: string,
  safeMessage: string | null,
): ResolutionPlan {
  return {
    application,
    diagnostic: { safeCode, safeMessage },
    attemptStatus: RefundAttemptStatus.MANUAL_REVIEW,
    commandStatus: RefundExecutionCommandStatus.PARKED,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: null,
    transitionReason: application === RefundExecutionEvidenceApplication.CONFLICT ? EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON : EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON,
  };
}
export function validatePlanTransition(plan: ResolutionPlan): boolean {
  if (plan.attemptStatus === RefundAttemptStatus.PROCESSING) return plan.transitionReason === null;
  return plan.transitionReason !== null
    && validateRefundAttemptStatusTransition(RefundAttemptStatus.PROCESSING, plan.attemptStatus).ok;
}

function ledgerFailure(): RefundExecutionResultFailure {
  return resultFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}
