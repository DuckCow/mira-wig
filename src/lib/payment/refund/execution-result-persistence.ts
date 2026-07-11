import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceSource,
  type Prisma,
} from "@prisma/client";
import {
  buildRefundExecutionApplyOperationKey,
  resolutionSuccess,
  type NormalizedRefundAdapterResponse,
  type ResolveRefundAdapterResponseResult,
} from "./execution-result-contract";
import type { ResolutionAggregate, ResolutionPlan, ResolutionTarget } from "./execution-result-plan";

type ResolutionTx = Prisma.TransactionClient;
type PersistenceContext = {
  aggregate: ResolutionAggregate;
  target: ResolutionTarget;
  command: NonNullable<ResolutionTarget["executionCommand"]>;
};

export class ResolutionRollbackError extends Error {}

export async function persistResolution(
  tx: ResolutionTx,
  context: PersistenceContext,
  input: NormalizedRefundAdapterResponse,
  plan: ResolutionPlan,
): Promise<ResolveRefundAdapterResponseResult> {
  const evidence = await tx.refundExecutionEvidence.create({ data: evidenceData(input, plan) });
  await updateAttempt(tx, context, plan);
  await updateCommand(tx, context, input, plan);
  await updateOrder(tx, context, plan);
  if (plan.attemptStatus !== RefundAttemptStatus.PROCESSING) {
    await tx.refundAttemptTransition.create({
      data: transitionData(context.target.id, evidence.id, plan, input.now),
    });
  }
  return resolutionSuccess(evidence, context.target.id, false);
}

function evidenceData(input: NormalizedRefundAdapterResponse, plan: ResolutionPlan) {
  return {
    commandId: input.commandId,
    source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    sourceDedupKey: input.sourceDedupKey,
    outcome: input.outcome,
    application: plan.application,
    observedProviderRefundId: input.observedProviderRefundId,
    reportedAmount: input.reportedAmount,
    reportedCurrency: input.reportedCurrency,
    safeCode: plan.diagnostic.safeCode,
    safeMessage: plan.diagnostic.safeMessage,
    observedAt: input.observedAt,
  };
}

async function updateAttempt(
  tx: ResolutionTx,
  context: PersistenceContext,
  plan: ResolutionPlan,
): Promise<void> {
  const shouldWriteProvider = plan.providerRefundId !== null && context.target.providerRefundId === null;
  if (plan.attemptStatus === RefundAttemptStatus.PROCESSING && !shouldWriteProvider) return;
  const update = await tx.refundAttempt.updateMany({
    where: {
      id: context.target.id,
      orderId: context.aggregate.id,
      status: RefundAttemptStatus.PROCESSING,
    },
    data: attemptData(context, plan, shouldWriteProvider),
  });
  if (update.count !== 1) throw new ResolutionRollbackError();
}

function attemptData(
  context: PersistenceContext,
  plan: ResolutionPlan,
  shouldWriteProvider: boolean,
) {
  const clearDiagnostic = plan.attemptStatus === RefundAttemptStatus.SUCCEEDED
    || plan.attemptStatus === RefundAttemptStatus.PROCESSING;
  return {
    status: plan.attemptStatus,
    processedAt: plan.processedAt,
    failedAt: plan.failedAt,
    failureCode: clearDiagnostic ? null : plan.diagnostic.safeCode,
    safeFailureMessage: clearDiagnostic ? null : plan.diagnostic.safeMessage,
    providerRefundId: shouldWriteProvider ? plan.providerRefundId : context.target.providerRefundId,
  };
}

async function updateCommand(
  tx: ResolutionTx,
  context: PersistenceContext,
  input: NormalizedRefundAdapterResponse,
  plan: ResolutionPlan,
): Promise<void> {
  const update = await tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: input.dispatchAttempt,
    },
    data: commandData(plan),
  });
  if (update.count !== 1) throw new ResolutionRollbackError();
}

function commandData(plan: ResolutionPlan) {
  const clearDiagnostic = plan.attemptStatus === RefundAttemptStatus.SUCCEEDED
    || plan.attemptStatus === RefundAttemptStatus.PROCESSING;
  return {
    status: plan.commandStatus,
    leaseOwner: null,
    leaseUntil: null,
    lastSafeErrorCode: clearDiagnostic ? null : plan.diagnostic.safeCode,
    lastSafeErrorMessage: clearDiagnostic ? null : plan.diagnostic.safeMessage,
  };
}

async function updateOrder(
  tx: ResolutionTx,
  context: PersistenceContext,
  plan: ResolutionPlan,
): Promise<void> {
  if (plan.orderStatus === OrderStatus.REFUND_PENDING) return;
  const update = await tx.order.updateMany({
    where: { id: context.aggregate.id, status: OrderStatus.REFUND_PENDING },
    data: { status: plan.orderStatus },
  });
  if (update.count !== 1) throw new ResolutionRollbackError();
}

function transitionData(
  refundAttemptId: string,
  evidenceId: string,
  plan: ResolutionPlan,
  now: Date,
) {
  return {
    refundAttemptId,
    fromStatus: RefundAttemptStatus.PROCESSING,
    toStatus: plan.attemptStatus,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: plan.orderStatus,
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: null,
    reason: plan.transitionReason ?? "Refund execution result applied.",
    operationKey: buildRefundExecutionApplyOperationKey(evidenceId),
    createdAt: now,
  };
}
