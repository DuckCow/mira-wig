import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  type PrismaClient,
  type RefundAttempt,
  type RefundAttemptActorType,
} from "@prisma/client";
import { isTerminalRefundAttemptStatus } from "./invariants";
import {
  prepareRefundAttempt,
  type PreparedRefundAttempt,
  type PrepareRefundAttemptFailureCode,
} from "./prepare";

type RefundRequestTx = Prisma.TransactionClient;
type RefundRequestOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

export interface RequestRefundAttemptInput {
  refundAttemptId: string;
  orderId: string;
  amount: number;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId?: string | null;
  now: Date;
}

export type RequestRefundAttemptFailureCode =
  | PrepareRefundAttemptFailureCode
  | "ORDER_NOT_FOUND"
  | "ORDER_STATUS_NOT_REFUNDABLE"
  | "REFUND_IN_PROGRESS"
  | "PAYMENT_NOT_REFUNDABLE"
  | "PAYMENT_IDENTITY_MISMATCH"
  | "DISPUTE_REVIEW_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_STATUS_CONFLICT";

export interface RequestRefundAttemptFailure {
  ok: false;
  code: RequestRefundAttemptFailureCode;
  message: string;
}

export type RequestRefundAttemptResult =
  | {
      ok: true;
      refundAttempt: RefundAttempt;
      orderStatus: OrderStatus;
      replayed: boolean;
    }
  | RequestRefundAttemptFailure;

export async function requestRefundAttempt(
  client: PrismaClient,
  input: RequestRefundAttemptInput,
): Promise<RequestRefundAttemptResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return failure("INVALID_ORDER_ID", "Order id is required.");

  try {
    return await client.$transaction((tx) => requestInTransaction(tx, { ...input, orderId }));
  } catch (error) {
    if (isUniqueConflict(error)) {
      return failure("IDEMPOTENCY_CONFLICT", "Refund attempt identity is already in use.");
    }
    throw error;
  }
}

async function requestInTransaction(
  tx: RefundRequestTx,
  input: RequestRefundAttemptInput,
): Promise<RequestRefundAttemptResult> {
  if (!(await lockOrder(tx, input.orderId))) {
    return failure("ORDER_NOT_FOUND", "Order was not found.");
  }
  const order = await loadOrder(tx, input.orderId);
  if (!order) return failure("ORDER_NOT_FOUND", "Order was not found.");

  const candidate = prepareAgainst(order, input, []);
  if (!candidate.ok) return candidate;
  const replay = resolveReplay(order, candidate.refundAttempt);
  if (replay) return replay;

  const eligibilityFailure = validateEligibility(order);
  if (eligibilityFailure) return eligibilityFailure;

  const prepared = prepareAgainst(order, input, order.refundAttempts);
  if (!prepared.ok) return prepared;
  return persistRequest(tx, order, prepared.refundAttempt);
}

async function lockOrder(tx: RefundRequestTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

function loadOrder(tx: RefundRequestTx, orderId: string) {
  return tx.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      refundAttempts: { orderBy: { createdAt: "asc" } },
    },
  });
}

function prepareAgainst(
  order: RefundRequestOrder,
  input: RequestRefundAttemptInput,
  attempts: readonly RefundAttempt[],
) {
  return prepareRefundAttempt({
    refundAttemptId: input.refundAttemptId,
    orderId: order.id,
    paymentId: order.payment.id,
    orderAmount: order.payment.amount,
    currency: order.payment.currency,
    requestedAmount: input.amount,
    requestedCurrency: order.payment.currency,
    existingAttempts: attempts,
    reason: input.reason,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    provider: order.payment.provider,
    mode: order.payment.mode,
    now: input.now,
  });
}

function resolveReplay(
  order: RefundRequestOrder,
  candidate: PreparedRefundAttempt,
): RequestRefundAttemptResult | null {
  const existing = order.refundAttempts.find((attempt) => (
    attempt.id === candidate.id || attempt.idempotencyKey === candidate.idempotencyKey
  ));
  if (!existing) return null;
  if (!sameImmutableRequest(existing, candidate)) {
    return failure("IDEMPOTENCY_CONFLICT", "Refund attempt identity conflicts with an existing request.");
  }
  return { ok: true, refundAttempt: existing, orderStatus: order.status, replayed: true };
}

function sameImmutableRequest(
  existing: RefundAttempt,
  candidate: PreparedRefundAttempt,
): boolean {
  return sameRecordIdentity(existing, candidate)
    && sameMoneyAndReason(existing, candidate)
    && sameActor(existing, candidate)
    && sameProviderContext(existing, candidate);
}

function sameRecordIdentity(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.id === candidate.id
    && existing.orderId === candidate.orderId
    && existing.paymentId === candidate.paymentId
    && existing.idempotencyKey === candidate.idempotencyKey;
}

function sameMoneyAndReason(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.amount === candidate.amount
    && existing.currency === candidate.currency
    && existing.reason === candidate.reason;
}

function sameActor(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.actorType === candidate.actorType
    && existing.actorUserId === candidate.actorUserId;
}

function sameProviderContext(existing: RefundAttempt, candidate: PreparedRefundAttempt): boolean {
  return existing.provider === candidate.provider && existing.mode === candidate.mode;
}

function validateEligibility(order: RefundRequestOrder): RequestRefundAttemptFailure | null {
  if (order.status === OrderStatus.REFUND_PENDING) {
    return failure("REFUND_IN_PROGRESS", "A refund request is already in progress.");
  }
  if (!isRefundableOrderStatus(order.status)) {
    return failure("ORDER_STATUS_NOT_REFUNDABLE", "Order status does not allow a refund request.");
  }
  if (order.disputeStatus !== null) {
    return failure("DISPUTE_REVIEW_REQUIRED", "Order dispute state requires manual review.");
  }
  if (!isRefundablePayment(order)) {
    return failure("PAYMENT_NOT_REFUNDABLE", "Payment is not eligible for a refund request.");
  }
  if (!hasMatchingPaymentIdentity(order)) {
    return failure("PAYMENT_IDENTITY_MISMATCH", "Order and payment amount or currency do not match.");
  }
  if (order.refundAttempts.some((attempt) => !isTerminalRefundAttemptStatus(attempt.status))) {
    return failure("REFUND_IN_PROGRESS", "A refund request is already in progress.");
  }
  return null;
}

function isRefundableOrderStatus(status: OrderStatus): boolean {
  return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
}

function isRefundablePayment(order: RefundRequestOrder): boolean {
  return order.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(order.payment.providerPaymentKey?.trim());
}

function hasMatchingPaymentIdentity(order: RefundRequestOrder): boolean {
  return order.totalAmount === order.payment.amount
    && order.currency === order.payment.currency;
}

async function persistRequest(
  tx: RefundRequestTx,
  order: RefundRequestOrder,
  prepared: PreparedRefundAttempt,
): Promise<RequestRefundAttemptResult> {
  const transition = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: OrderStatus.REFUND_PENDING },
  });
  if (transition.count !== 1) {
    return failure("ORDER_STATUS_CONFLICT", "Order status changed before the refund request was saved.");
  }
  const refundAttempt = await tx.refundAttempt.create({ data: prepared });
  return { ok: true, refundAttempt, orderStatus: OrderStatus.REFUND_PENDING, replayed: false };
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}

function failure(
  code: RequestRefundAttemptFailureCode,
  message: string,
): RequestRefundAttemptFailure {
  return { ok: false, code, message };
}
