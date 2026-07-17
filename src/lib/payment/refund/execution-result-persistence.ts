import { createHash } from "node:crypto";
import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceSource,
  Prisma,
} from "@prisma/client";
import {
  buildRefundExecutionApplyOperationKey,
  buildRefundResultDedupKey,
  resultSuccess,
  type NormalizedPersistFreshRefundExecutionObservationInput,
  type RefundExecutionResult,
} from "./execution-result-contract";
import type { ResolutionAggregate, ResolutionPlan, ResolutionTarget } from "./execution-result-plan";

type ResolutionTx = Prisma.TransactionClient;
type PersistenceContext = {
  aggregate: ResolutionAggregate;
  target: ResolutionTarget;
  command: NonNullable<ResolutionTarget["executionCommand"]>;
};

export type RefundEvidencePersistenceProvenance = Readonly<{
  dispatchAttemptId: string | null;
  authorizingLeaseGeneration: number | null;
}>;

const NO_EVIDENCE_PROVENANCE: RefundEvidencePersistenceProvenance = Object.freeze({
  dispatchAttemptId: null,
  authorizingLeaseGeneration: null,
});

export class ResolutionRollbackError extends Error {}

export async function lockRefundResultRows(
  tx: ResolutionTx,
  orderId: string,
  refundAttemptId: string,
  commandId: string,
  dispatchAttempt: number,
): Promise<{ ok: true; dispatchId: string | null } | { ok: false }> {
  const order = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  if (order.length !== 1) return { ok: false };
  const attempt = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${refundAttemptId} AND "orderId" = ${orderId} FOR UPDATE
  `);
  if (attempt.length !== 1) return { ok: false };
  const command = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${refundAttemptId} FOR UPDATE
  `);
  if (command.length !== 1) return { ok: false };
  const dispatch = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionDispatchAttempt"
    WHERE "commandId" = ${commandId} AND "ordinal" = ${dispatchAttempt} FOR UPDATE
  `);
  return { ok: true, dispatchId: dispatch.length === 1 ? dispatch[0].id : null };
}

export async function captureRefundResultDatabaseTime(tx: ResolutionTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative refund result time.");
  }
  return rows[0].capturedAt;
}

export async function persistResolution(
  tx: ResolutionTx,
  context: PersistenceContext,
  input: NormalizedPersistFreshRefundExecutionObservationInput,
  plan: ResolutionPlan,
  capturedAt: Date,
  provenance: RefundEvidencePersistenceProvenance = NO_EVIDENCE_PROVENANCE,
): Promise<RefundExecutionResult> {
  try {
    return await persistResolutionWrites(tx, context, input, plan, capturedAt, provenance);
  } catch (error) {
    if (error instanceof ResolutionRollbackError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) throw new ResolutionRollbackError();
    if (isDriverAdapterError(error)) throw new ResolutionRollbackError();
    throw error;
  }
}

function isDriverAdapterError(error: unknown): boolean {
  return error instanceof Error && error.name === "DriverAdapterError";
}

async function persistResolutionWrites(
  tx: ResolutionTx,
  context: PersistenceContext,
  input: NormalizedPersistFreshRefundExecutionObservationInput,
  plan: ResolutionPlan,
  capturedAt: Date,
  provenance: RefundEvidencePersistenceProvenance,
): Promise<RefundExecutionResult> {
  const evidence = await tx.refundExecutionEvidence.create({
    data: evidenceData(input, plan, provenance),
  });
  await updateAttempt(tx, context, plan);
  await updateOrder(tx, context, plan);
  if (plan.attemptStatus !== RefundAttemptStatus.PROCESSING) {
    await tx.refundAttemptTransition.create({
      data: transitionData(context.target.id, evidence.id, plan, capturedAt),
    });
  }
  await finalizeCommand(tx, context, input, plan);
  return resultSuccess(evidence, context.target.id, false);
}

function evidenceData(
  input: NormalizedPersistFreshRefundExecutionObservationInput,
  plan: ResolutionPlan,
  provenance: RefundEvidencePersistenceProvenance,
) {
  return {
    commandId: input.commandId,
    source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    sourceDedupKey: buildRefundResultDedupKey(input.commandId, input.dispatchAttempt),
    outcome: input.observation.outcome,
    application: plan.application,
    observedProviderRefundId: input.observation.observedProviderRefundId,
    reportedAmount: input.observation.reportedAmount,
    reportedCurrency: input.observation.reportedCurrency,
    safeCode: plan.diagnostic.safeCode,
    safeMessage: plan.diagnostic.safeMessage,
    observedAt: input.observation.observedAt,
    dispatchAttemptId: provenance.dispatchAttemptId,
    authorizingLeaseGeneration: provenance.authorizingLeaseGeneration,
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

async function finalizeCommand(
  tx: ResolutionTx,
  context: PersistenceContext,
  input: NormalizedPersistFreshRefundExecutionObservationInput,
  plan: ResolutionPlan,
): Promise<void> {
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  const update = await tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: input.dispatchAttempt,
      leaseGeneration: input.leaseGeneration,
      leaseTokenHash,
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
    leaseTokenHash: null,
    lastSafeErrorCode: clearDiagnostic ? null : plan.diagnostic.safeCode,
    lastSafeErrorMessage: clearDiagnostic ? null : plan.diagnostic.safeMessage,
  };
}

function transitionData(
  refundAttemptId: string,
  evidenceId: string,
  plan: ResolutionPlan,
  capturedAt: Date,
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
    createdAt: capturedAt,
  };
}
