import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type Prisma,
  type RefundAttemptTransition,
  type RefundExecutionEvidence,
} from "@prisma/client";
import {
  buildRefundExecutionApplyOperationKey,
  EVIDENCE_CONFLICT_CODE,
  INSUFFICIENT_SUCCESS_CODE,
  resolutionFailure,
  resolutionSuccess,
  sameRefundEvidenceObservation,
  type NormalizedRefundAdapterResponse,
  type ResolveRefundAdapterResponseResult,
} from "./execution-result-contract";
import {
  EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON,
  EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON,
  EXECUTION_MANUAL_REVIEW_TRANSITION_REASON,
  EXECUTION_RETRYABLE_TRANSITION_REASON,
  EXECUTION_SUCCEEDED_TRANSITION_REASON,
  EXECUTION_TERMINAL_TRANSITION_REASON,
  type ResolutionTarget,
} from "./execution-result-plan";

export async function resolveRefundEvidenceReplay(
  tx: Prisma.TransactionClient,
  target: ResolutionTarget,
  evidence: RefundExecutionEvidence,
  input: NormalizedRefundAdapterResponse,
): Promise<ResolveRefundAdapterResponseResult> {
  const diagnostic = replayDiagnostic(evidence.application, input);
  if (!sameRefundEvidenceObservation(evidence, input, diagnostic.safeCode, diagnostic.safeMessage)) {
    return resolutionFailure(
      "EVIDENCE_IDEMPOTENCY_CONFLICT",
      "Evidence identity conflicts with a stored observation.",
    );
  }
  if (!(await hasCoherentReplayArtifact(tx, target, evidence))) {
    return resolutionFailure("PERSISTENCE_CONFLICT", "Refund execution replay artifacts are inconsistent.");
  }
  return resolutionSuccess(evidence, target.id, true);
}

function replayDiagnostic(
  application: RefundExecutionEvidenceApplication,
  input: NormalizedRefundAdapterResponse,
) {
  if (application === RefundExecutionEvidenceApplication.CONFLICT) {
    return { safeCode: EVIDENCE_CONFLICT_CODE, safeMessage: input.safeMessage };
  }
  if (application === RefundExecutionEvidenceApplication.PARKED) {
    return { safeCode: INSUFFICIENT_SUCCESS_CODE, safeMessage: input.safeMessage };
  }
  return { safeCode: input.safeCode, safeMessage: input.safeMessage };
}

async function hasCoherentReplayArtifact(
  tx: Prisma.TransactionClient,
  target: ResolutionTarget,
  evidence: RefundExecutionEvidence,
): Promise<boolean> {
  const operationKey = buildRefundExecutionApplyOperationKey(evidence.id);
  const transition = await tx.refundAttemptTransition.findUnique({ where: { operationKey } });
  const expected = replayEdge(evidence);
  if (!expected) return transition === null;
  return transition !== null && matchesReplayTransition(transition, target.id, evidence, expected);
}

function replayEdge(evidence: RefundExecutionEvidence): RefundAttemptStatus | null {
  if (isAcceptedPending(evidence)) return null;
  if (evidence.application !== RefundExecutionEvidenceApplication.APPLIED) {
    return RefundAttemptStatus.MANUAL_REVIEW;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) return RefundAttemptStatus.SUCCEEDED;
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE) {
    return RefundAttemptStatus.FAILED_RETRYABLE;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    return RefundAttemptStatus.FAILED_TERMINAL;
  }
  return RefundAttemptStatus.MANUAL_REVIEW;
}

function isAcceptedPending(evidence: RefundExecutionEvidence): boolean {
  return evidence.application === RefundExecutionEvidenceApplication.APPLIED
    && evidence.outcome === RefundExecutionEvidenceOutcome.ACCEPTED_PENDING;
}

function matchesReplayTransition(
  transition: RefundAttemptTransition,
  refundAttemptId: string,
  evidence: RefundExecutionEvidence,
  toStatus: RefundAttemptStatus,
): boolean {
  return transition.refundAttemptId === refundAttemptId
    && transition.fromStatus === RefundAttemptStatus.PROCESSING
    && transition.toStatus === toStatus
    && transition.orderStatusBefore === OrderStatus.REFUND_PENDING
    && matchesReplayOrderStatus(transition.orderStatusAfter, evidence)
    && transition.actorType === RefundAttemptActorType.SYSTEM
    && transition.actorUserId === null
    && transition.reason === replayReason(evidence);
}

function matchesReplayOrderStatus(status: OrderStatus, evidence: RefundExecutionEvidence): boolean {
  if (isAppliedOutcome(evidence, RefundExecutionEvidenceOutcome.SUCCEEDED)) {
    return status === OrderStatus.PARTIALLY_REFUNDED || status === OrderStatus.REFUNDED;
  }
  if (isAppliedOutcome(evidence, RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL)) {
    return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
  }
  return status === OrderStatus.REFUND_PENDING;
}

function isAppliedOutcome(
  evidence: RefundExecutionEvidence,
  outcome: RefundExecutionEvidenceOutcome,
): boolean {
  return evidence.application === RefundExecutionEvidenceApplication.APPLIED
    && evidence.outcome === outcome;
}

function replayReason(evidence: RefundExecutionEvidence): string {
  if (evidence.application === RefundExecutionEvidenceApplication.CONFLICT) {
    return EXECUTION_CONFLICT_REVIEW_TRANSITION_REASON;
  }
  if (evidence.application === RefundExecutionEvidenceApplication.PARKED) {
    return EXECUTION_INSUFFICIENT_SUCCESS_TRANSITION_REASON;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED) {
    return EXECUTION_SUCCEEDED_TRANSITION_REASON;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE) {
    return EXECUTION_RETRYABLE_TRANSITION_REASON;
  }
  if (evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL) {
    return EXECUTION_TERMINAL_TRANSITION_REASON;
  }
  return EXECUTION_MANUAL_REVIEW_TRANSITION_REASON;
}
