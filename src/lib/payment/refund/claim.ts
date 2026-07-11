import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
  type RefundAttempt,
  type RefundAttemptTransition,
  type RefundExecutionCommand,
} from "@prisma/client";
import {
  CLAIM_TRANSITION_REASON,
  buildRefundExecutionClaimOperationKey,
  claimFailure as failure,
  claimSuccess as success,
  isClaimTransitionCandidate,
  matchesClaimTransition,
  normalizeClaimInput,
  requiresExecutionCommand,
  type ClaimRefundAttemptForExecutionFailure,
  type ClaimRefundAttemptForExecutionInput,
  type ClaimRefundAttemptForExecutionResult,
  type NormalizedClaimInput,
} from "./claim-contract";
import {
  buildRefundAttemptIdempotencyKey,
  hasConsistentRefundAttemptLedgerIdentity,
  isTerminalRefundAttemptStatus,
  validateRefundRequest,
} from "./invariants";
import { resolveRefundRequestCreationEvidence } from "./request-evidence";

type ClaimTx = Prisma.TransactionClient;
type ClaimReader = Pick<PrismaClient, "refundAttemptTransition">;
type ClaimAggregate = NonNullable<Awaited<ReturnType<typeof loadAggregate>>>;
type ClaimTarget = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  executionCommand: RefundExecutionCommand | null;
};

type ClaimArtifactResolution =
  | { kind: "none" }
  | { kind: "replay"; commandId: string }
  | { kind: "conflict" };

export async function claimRefundAttemptForExecution(
  client: PrismaClient,
  input: ClaimRefundAttemptForExecutionInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  const normalized = normalizeClaimInput(input);
  if (!normalized.ok) return normalized;

  try {
    return await client.$transaction((tx) => claimInTransaction(tx, normalized.input));
  } catch (error) {
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, normalized.input);
    throw error;
  }
}

async function claimInTransaction(
  tx: ClaimTx,
  input: NormalizedClaimInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  if (!(await lockOrder(tx, input.orderId))) return failure("ORDER_NOT_FOUND", "Order was not found.");
  if (!(await lockTarget(tx, input))) {
    return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");
  }

  const aggregate = await loadAggregate(tx, input.orderId);
  if (!aggregate) return failure("ORDER_NOT_FOUND", "Order was not found.");
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (!target) return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");

  const artifacts = await resolveClaimArtifacts(tx, target, input);
  if (artifacts.kind === "replay") return success(target.id, artifacts.commandId, true);
  if (artifacts.kind === "conflict") {
    return failure("CLAIM_ARTIFACT_CONFLICT", "Refund execution claim evidence is inconsistent.");
  }

  const validationFailure = validateFreshClaim(aggregate, target);
  if (validationFailure) return validationFailure;
  return persistClaim(tx, aggregate, target, input);
}

async function lockOrder(tx: ClaimTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockTarget(tx: ClaimTx, input: NormalizedClaimInput): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${input.refundAttemptId} AND "orderId" = ${input.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: ClaimTx, orderId: string) {
  return tx.order.findUnique({
    where: { id: orderId },
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
}

async function resolveClaimArtifacts(
  reader: ClaimReader,
  target: ClaimTarget,
  input: NormalizedClaimInput,
): Promise<ClaimArtifactResolution> {
  const claimTransitions = target.transitions.filter(isClaimTransitionCandidate);
  const command = target.executionCommand;
  if (!command) return resolveMissingCommandArtifacts(target.status, claimTransitions.length);
  if (target.status === RefundAttemptStatus.REQUESTED) return { kind: "conflict" };
  if (command.refundAttemptId !== target.id) return { kind: "conflict" };
  return resolveCommandArtifacts(reader, target, input, command, claimTransitions);
}

function resolveMissingCommandArtifacts(
  status: RefundAttemptStatus,
  claimTransitionCount: number,
): ClaimArtifactResolution {
  if (claimTransitionCount > 0 || requiresExecutionCommand(status)) return { kind: "conflict" };
  return { kind: "none" };
}

async function resolveCommandArtifacts(
  reader: ClaimReader,
  target: ClaimTarget,
  input: NormalizedClaimInput,
  command: RefundExecutionCommand,
  claimTransitions: readonly RefundAttemptTransition[],
): Promise<ClaimArtifactResolution> {
  const operationKey = buildRefundExecutionClaimOperationKey(command.id);
  const operationTransition = await reader.refundAttemptTransition.findUnique({ where: { operationKey } });
  if (!operationTransition || claimTransitions.length !== 1) return { kind: "conflict" };
  if (claimTransitions[0].id !== operationTransition.id) return { kind: "conflict" };
  if (!matchesClaimTransition(operationTransition, target.id, input, operationKey)) {
    return { kind: "conflict" };
  }
  if (resolveRefundRequestCreationEvidence(target.transitions, target).kind !== "matched") {
    return { kind: "conflict" };
  }
  return { kind: "replay", commandId: command.id };
}

function validateFreshClaim(
  aggregate: ClaimAggregate,
  target: ClaimTarget,
): ClaimRefundAttemptForExecutionFailure | null {
  if (target.status !== RefundAttemptStatus.REQUESTED) {
    return failure("REFUND_ATTEMPT_NOT_CLAIMABLE", "Refund attempt cannot be claimed from its current status.");
  }
  if (aggregate.status !== OrderStatus.REFUND_PENDING) {
    return failure("ORDER_STATUS_CONFLICT", "Order is not awaiting refund execution.");
  }
  if (!hasRefundablePayment(aggregate)) {
    return failure("PAYMENT_NOT_REFUNDABLE", "Payment is not eligible for refund execution.");
  }
  if (!hasConsistentAggregateIdentity(aggregate, target)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Order, payment, and refund identities are inconsistent.");
  }
  if (!hasSingleOpenTarget(aggregate, target)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Refund ledger has multiple or contradictory open attempts.");
  }
  if (!hasValidReservedAmount(aggregate, target)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Refund ledger amount or currency reservation is inconsistent.");
  }
  if (!hasCoherentRequestCreation(target)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Refund request creation evidence is inconsistent.");
  }
  return null;
}

function hasRefundablePayment(aggregate: ClaimAggregate): boolean {
  return aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(aggregate.payment.providerPaymentKey?.trim());
}

function hasConsistentAggregateIdentity(
  aggregate: ClaimAggregate,
  target: ClaimTarget,
): boolean {
  const payment = aggregate.payment;
  if (!hasConsistentOrderPaymentIdentity(aggregate)) return false;
  if (!hasConsistentRefundAttemptLedgerIdentity(payment, aggregate.refundAttempts)) return false;
  return hasInitialTargetIdentity(target, payment.id);
}

function hasConsistentOrderPaymentIdentity(aggregate: ClaimAggregate): boolean {
  return aggregate.paymentId === aggregate.payment.id
    && aggregate.totalAmount === aggregate.payment.amount
    && aggregate.currency === aggregate.payment.currency;
}

function hasInitialTargetIdentity(target: ClaimTarget, paymentId: string): boolean {
  return target.idempotencyKey === buildRefundAttemptIdempotencyKey(paymentId, target.id)
    && target.providerRefundId === null
    && target.processedAt === null
    && target.failedAt === null
    && target.failureCode === null
    && target.safeFailureMessage === null;
}

function hasSingleOpenTarget(aggregate: ClaimAggregate, target: ClaimTarget): boolean {
  const openAttempts = aggregate.refundAttempts.filter((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
  return openAttempts.length === 1 && openAttempts[0].id === target.id;
}

function hasValidReservedAmount(aggregate: ClaimAggregate, target: ClaimTarget): boolean {
  const invariant = validateRefundRequest({
    totalAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    requestedAmount: target.amount,
    requestedCurrency: target.currency,
    attempts: aggregate.refundAttempts.filter((attempt) => attempt.id !== target.id),
  });
  return invariant.ok;
}

function hasCoherentRequestCreation(target: ClaimTarget): boolean {
  return target.transitions.length === 1
    && resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched";
}

async function persistClaim(
  tx: ClaimTx,
  aggregate: ClaimAggregate,
  target: ClaimTarget,
  input: NormalizedClaimInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  const attemptUpdate = await tx.refundAttempt.updateMany({
    where: {
      id: target.id,
      orderId: aggregate.id,
      status: RefundAttemptStatus.REQUESTED,
      providerRefundId: null,
    },
    data: { status: RefundAttemptStatus.PROCESSING },
  });
  if (attemptUpdate.count !== 1) {
    return failure("REFUND_ATTEMPT_NOT_CLAIMABLE", "Refund attempt cannot be claimed from its current status.");
  }

  const command = await createInitialCommand(tx, target.id, input.now);
  await tx.refundAttemptTransition.create({
    data: claimTransitionData(target.id, command.id, input),
  });
  return success(target.id, command.id, false);
}

function createInitialCommand(tx: ClaimTx, refundAttemptId: string, availableAt: Date) {
  return tx.refundExecutionCommand.create({
    data: {
      refundAttemptId,
      status: RefundExecutionCommandStatus.READY,
      availableAt,
      leaseOwner: null,
      leaseUntil: null,
      dispatchAttempt: 0,
      lastSafeErrorCode: null,
      lastSafeErrorMessage: null,
    },
  });
}

function claimTransitionData(
  refundAttemptId: string,
  commandId: string,
  input: NormalizedClaimInput,
) {
  return {
    refundAttemptId,
    fromStatus: RefundAttemptStatus.REQUESTED,
    toStatus: RefundAttemptStatus.PROCESSING,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: OrderStatus.REFUND_PENDING,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    reason: CLAIM_TRANSITION_REASON,
    operationKey: buildRefundExecutionClaimOperationKey(commandId),
    createdAt: input.now,
  };
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: NormalizedClaimInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  const target = await client.refundAttempt.findFirst({
    where: { id: input.refundAttemptId, orderId: input.orderId },
    include: {
      transitions: { orderBy: { createdAt: "asc" } },
      executionCommand: true,
    },
  });
  if (target) {
    const artifacts = await resolveClaimArtifacts(client, target, input);
    if (artifacts.kind === "replay") return success(target.id, artifacts.commandId, true);
  }
  return failure("CLAIM_ARTIFACT_CONFLICT", "Refund execution claim evidence is inconsistent.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}

export { buildRefundExecutionClaimOperationKey } from "./claim-contract";
export type {
  ClaimRefundAttemptForExecutionFailure,
  ClaimRefundAttemptForExecutionFailureCode,
  ClaimRefundAttemptForExecutionInput,
  ClaimRefundAttemptForExecutionResult,
} from "./claim-contract";
