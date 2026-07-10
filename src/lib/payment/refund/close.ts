import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundAttemptStatus,
  type PrismaClient,
  type RefundAttempt,
} from "@prisma/client";
import {
  closeFailure as failure,
  closeSuccess,
  normalizeCloseInput,
  resolveCloseReplay,
  type CloseRefundRequestFailure,
  type CloseRefundRequestInput,
  type CloseRefundRequestResult,
  type NormalizedCloseInput,
} from "./close-contract";
import {
  hasConsistentRefundAttemptLedgerIdentity,
  isTerminalRefundAttemptStatus,
} from "./invariants";
import {
  deriveRefundRestingOrderStatus,
  type RefundRestingOrderStatus,
} from "./resting-state";

type CloseRefundTx = Prisma.TransactionClient;
type CloseRefundAggregate = NonNullable<Awaited<ReturnType<typeof loadAggregate>>>;

class OrderStatusRollbackError extends Error {}

export async function closeRefundRequest(
  client: PrismaClient,
  input: CloseRefundRequestInput,
): Promise<CloseRefundRequestResult> {
  const normalized = normalizeCloseInput(input);
  if (!normalized.ok) return normalized;

  try {
    return await client.$transaction((tx) => closeInTransaction(tx, normalized.input));
  } catch (error) {
    if (error instanceof OrderStatusRollbackError) {
      return failure("ORDER_STATUS_CONFLICT", "Order status changed before the refund request was closed.");
    }
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, normalized.input, error);
    throw error;
  }
}

async function closeInTransaction(
  tx: CloseRefundTx,
  input: NormalizedCloseInput,
): Promise<CloseRefundRequestResult> {
  if (!(await lockOrder(tx, input.orderId))) return failure("ORDER_NOT_FOUND", "Order was not found.");
  if (!(await lockTarget(tx, input))) {
    return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");
  }

  const replay = await findReplay(tx, input.operationKey);
  if (replay) return resolveCloseReplay(replay, input);

  const aggregate = await loadAggregate(tx, input.orderId);
  if (!aggregate) return failure("ORDER_NOT_FOUND", "Order was not found.");
  return closeAggregate(tx, aggregate, input);
}

function closeAggregate(
  tx: CloseRefundTx,
  aggregate: CloseRefundAggregate,
  input: NormalizedCloseInput,
): Promise<CloseRefundRequestResult> | CloseRefundRequestResult {
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (!target) return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");

  const targetFailure = classifyTarget(target);
  if (targetFailure) return targetFailure;
  const aggregateFailure = validateAggregate(aggregate, target);
  if (aggregateFailure) return aggregateFailure;

  const resting = deriveRefundRestingOrderStatus({
    totalAmount: aggregate.totalAmount,
    currency: aggregate.currency,
    attempts: aggregate.refundAttempts,
  });
  if (!resting.ok) return failure(resting.code, resting.message);
  return persistClose(tx, aggregate.id, target, input, resting.orderStatus);
}

async function lockOrder(tx: CloseRefundTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockTarget(tx: CloseRefundTx, input: NormalizedCloseInput): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${input.refundAttemptId} AND "orderId" = ${input.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: CloseRefundTx, orderId: string) {
  return tx.order.findUnique({
    where: { id: orderId },
    include: { payment: true, refundAttempts: { orderBy: { createdAt: "asc" } } },
  });
}

function validateAggregate(
  aggregate: CloseRefundAggregate,
  target: RefundAttempt,
): CloseRefundRequestFailure | null {
  if (aggregate.status !== OrderStatus.REFUND_PENDING) {
    return failure("ORDER_STATUS_CONFLICT", "Order is not awaiting a refund decision.");
  }
  if (!hasConsistentPaymentIdentity(aggregate)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Order, payment, and refund identities are inconsistent.");
  }
  const openAttempts = aggregate.refundAttempts.filter((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
  if (openAttempts.length !== 1 || openAttempts[0].id !== target.id) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Refund ledger has multiple or contradictory open attempts.");
  }
  return null;
}

function hasConsistentPaymentIdentity(
  aggregate: CloseRefundAggregate,
): boolean {
  const payment = aggregate.payment;
  if (payment.status !== PaymentAttemptStatus.SUCCEEDED) return false;
  if (aggregate.paymentId !== payment.id) return false;
  if (aggregate.totalAmount !== payment.amount || aggregate.currency !== payment.currency) return false;
  return hasConsistentRefundAttemptLedgerIdentity(payment, aggregate.refundAttempts);
}

function classifyTarget(target: RefundAttempt): CloseRefundRequestFailure | null {
  if (target.providerRefundId !== null) {
    return failure("PROVIDER_CONTACT_ALREADY_STARTED", "Refund provider contact may already have started.");
  }
  if (isContactStatus(target.status)) {
    return failure("PROVIDER_CONTACT_ALREADY_STARTED", "Refund provider contact may already have started.");
  }
  if (target.status !== RefundAttemptStatus.REQUESTED) {
    return failure("REFUND_ATTEMPT_NOT_CANCELLABLE", "Refund attempt cannot be closed from its current status.");
  }
  return null;
}

function isContactStatus(status: RefundAttemptStatus): boolean {
  return status === RefundAttemptStatus.PROCESSING
    || status === RefundAttemptStatus.FAILED_RETRYABLE
    || status === RefundAttemptStatus.MANUAL_REVIEW;
}

async function persistClose(
  tx: CloseRefundTx,
  orderId: string,
  target: RefundAttempt,
  input: NormalizedCloseInput,
  restingStatus: RefundRestingOrderStatus,
): Promise<CloseRefundRequestResult> {
  const attemptUpdate = await tx.refundAttempt.updateMany({
    where: {
      id: target.id,
      orderId,
      status: RefundAttemptStatus.REQUESTED,
      providerRefundId: null,
    },
    data: { status: RefundAttemptStatus.CANCELLED },
  });
  if (attemptUpdate.count !== 1) return classifyCasLoss(tx, orderId, target.id);

  const orderUpdate = await tx.order.updateMany({
    where: { id: orderId, status: OrderStatus.REFUND_PENDING },
    data: { status: restingStatus },
  });
  if (orderUpdate.count !== 1) throw new OrderStatusRollbackError();

  const transition = await tx.refundAttemptTransition.create({ data: transitionData(target.id, input, restingStatus) });
  return closeSuccess(transition, false);
}

async function classifyCasLoss(
  tx: CloseRefundTx,
  orderId: string,
  refundAttemptId: string,
): Promise<CloseRefundRequestFailure> {
  const target = await tx.refundAttempt.findFirst({ where: { id: refundAttemptId, orderId } });
  if (target) {
    const targetFailure = classifyTarget(target);
    if (targetFailure) return targetFailure;
  }
  return failure("REFUND_ATTEMPT_NOT_CANCELLABLE", "Refund attempt cannot be closed from its current status.");
}

function transitionData(
  refundAttemptId: string,
  input: NormalizedCloseInput,
  restingStatus: RefundRestingOrderStatus,
) {
  return {
    refundAttemptId,
    fromStatus: RefundAttemptStatus.REQUESTED,
    toStatus: RefundAttemptStatus.CANCELLED,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: restingStatus,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    reason: input.reason,
    operationKey: input.operationKey,
    createdAt: input.now,
  };
}

async function findReplay(tx: CloseRefundTx, operationKey: string) {
  return tx.refundAttemptTransition.findUnique({ where: { operationKey } });
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: NormalizedCloseInput,
  originalError: unknown,
): Promise<CloseRefundRequestResult> {
  const transition = await client.refundAttemptTransition.findUnique({
    where: { operationKey: input.operationKey },
  });
  if (!transition) throw originalError;
  return resolveCloseReplay(transition, input);
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}


export type {
  CloseRefundRequestFailure,
  CloseRefundRequestFailureCode,
  CloseRefundRequestInput,
  CloseRefundRequestResult,
} from "./close-contract";
