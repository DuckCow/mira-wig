import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type Payment,
  type RefundAttempt,
  type RefundExecutionCommand,
} from "@prisma/client";
import {
  EVIDENCE_CONFLICT_CODE,
  INSUFFICIENT_SUCCESS_CODE,
  resolutionFailure,
  type NormalizedRefundAdapterResponse,
  type ResolveRefundAdapterResponseFailure,
} from "./execution-result-contract";
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
): ResolveRefundAdapterResponseFailure | null {
  return validateInitialRefundExecutionSuitability(aggregate, target, command).ok ? null : ledgerFailure();
}

export function buildResolutionPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  input: NormalizedRefundAdapterResponse,
  providerIdentityConflict: boolean,
): ResolutionPlan | ResolveRefundAdapterResponseFailure {
  if (hasMoneyConflict(target, aggregate.payment, input) || providerIdentityConflict) {
    return manualReviewPlan(
      RefundExecutionEvidenceApplication.CONFLICT,
      EVIDENCE_CONFLICT_CODE,
      input.safeMessage,
    );
  }
  if (input.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED && input.reportedAmount === null) {
    return manualReviewPlan(
      RefundExecutionEvidenceApplication.PARKED,
      INSUFFICIENT_SUCCESS_CODE,
      input.safeMessage,
    );
  }
  return appliedPlan(aggregate, target, input);
}

function hasMoneyConflict(
  target: RefundAttempt,
  payment: Payment,
  input: NormalizedRefundAdapterResponse,
): boolean {
  if (input.reportedAmount === null || input.reportedCurrency === null) return false;
  return input.reportedAmount !== target.amount
    || input.reportedCurrency !== target.currency
    || input.reportedCurrency !== payment.currency;
}

function appliedPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  input: NormalizedRefundAdapterResponse,
): ResolutionPlan | ResolveRefundAdapterResponseFailure {
  if (input.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) {
    return successPlan(aggregate, target, input);
  }
  if (input.outcome === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING) {
    return pendingPlan(target, input);
  }
  if (input.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE) {
    return failurePlan(RefundAttemptStatus.FAILED_RETRYABLE, RefundExecutionCommandStatus.PARKED, input, false);
  }
  if (input.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    return terminalFailurePlan(aggregate, input);
  }
  return failurePlan(RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.PARKED, input, false);
}

function successPlan(
  aggregate: ResolutionAggregate,
  target: ResolutionTarget,
  input: NormalizedRefundAdapterResponse,
): ResolutionPlan | ResolveRefundAdapterResponseFailure {
  const derived = deriveOrderStatusAfterSucceededRefund({
    capturedAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    succeedingAttemptId: target.id,
    attempts: aggregate.refundAttempts,
  });
  if (!derived.ok) return ledgerFailure();
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: input.safeCode, safeMessage: input.safeMessage },
    attemptStatus: RefundAttemptStatus.SUCCEEDED,
    commandStatus: RefundExecutionCommandStatus.DONE,
    orderStatus: derived.orderStatus,
    processedAt: input.now,
    failedAt: null,
    providerRefundId: input.observedProviderRefundId,
    transitionReason: EXECUTION_SUCCEEDED_TRANSITION_REASON,
  };
}

function pendingPlan(target: ResolutionTarget, input: NormalizedRefundAdapterResponse): ResolutionPlan {
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: input.safeCode, safeMessage: input.safeMessage },
    attemptStatus: RefundAttemptStatus.PROCESSING,
    commandStatus: RefundExecutionCommandStatus.WAITING_EVIDENCE,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: target.providerRefundId ?? input.observedProviderRefundId,
    transitionReason: null,
  };
}

function terminalFailurePlan(
  aggregate: ResolutionAggregate,
  input: NormalizedRefundAdapterResponse,
): ResolutionPlan | ResolveRefundAdapterResponseFailure {
  const resting = deriveRefundRestingOrderStatus({
    totalAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    attempts: aggregate.refundAttempts,
  });
  if (!resting.ok) return ledgerFailure();
  const plan = failurePlan(
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundExecutionCommandStatus.DONE,
    input,
    true,
  );
  return { ...plan, orderStatus: resting.orderStatus };
}

function failurePlan(
  attemptStatus: RefundAttemptStatus,
  commandStatus: RefundExecutionCommandStatus,
  input: NormalizedRefundAdapterResponse,
  terminal: boolean,
): ResolutionPlan {
  const reason = attemptStatus === RefundAttemptStatus.FAILED_RETRYABLE
    ? EXECUTION_RETRYABLE_TRANSITION_REASON
    : attemptStatus === RefundAttemptStatus.FAILED_TERMINAL
      ? EXECUTION_TERMINAL_TRANSITION_REASON
      : EXECUTION_MANUAL_REVIEW_TRANSITION_REASON;
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: input.safeCode, safeMessage: input.safeMessage },
    attemptStatus,
    commandStatus,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: terminal ? input.now : null,
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

function ledgerFailure(): ResolveRefundAdapterResponseFailure {
  return resolutionFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}
