import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  type PrismaClient,
  type RefundAttempt,
  type RefundAttemptActorType,
  type RefundAttemptLine,
  type RefundAttemptLineEconomicAllocation,
  type RefundAttemptTransition,
} from "@prisma/client";
import {
  hasConsistentRefundAttemptLedgerIdentity,
  isRefundRequestReasonWithinCodePointLimit,
  isTerminalRefundAttemptStatus,
} from "./invariants";
import {
  prepareRefundAttempt,
  type PreparedRefundAttempt,
  type PrepareRefundAttemptFailureCode,
} from "./prepare";
import {
  buildRefundRequestOperationKey,
  resolveRefundRequestCreationEvidence,
  sameImmutableRefundRequest,
} from "./request-evidence";
import {
  deriveRefundLineCapacity,
  normalizeRefundLines,
  sameCanonicalRefundLines,
  type CanonicalRefundLine,
  type RefundLineInput,
} from "./lines";
import { persistRefundRequestAfterOrderLock } from "./request-persistence";
import {
  validateRefundEconomicAllocation,
  type RefundEconomicFailureCode,
} from "./economic-validation";

type RefundRequestTx = Prisma.TransactionClient;
type RefundRequestReader = Pick<PrismaClient, "order">;
type RefundRequestOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type RefundAttemptLineWithAllocation = RefundAttemptLine & {
  economicAllocation: RefundAttemptLineEconomicAllocation | null;
};
type AuditedRefundAttempt = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  lines: RefundAttemptLineWithAllocation[];
};
type RefundAttemptWithLines = RefundAttempt & { lines: RefundAttemptLine[] };

export interface RequestRefundAttemptInput {
  refundAttemptId: string;
  orderId: string;
  amount: number;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId?: string | null;
  now: Date;
  lines: readonly RefundLineInput[];
}

export interface RefundRequestProviderAdmission {
  readonly allowEximbaySandboxCustomerApproval: boolean;
}

const DEFAULT_PROVIDER_ADMISSION: RefundRequestProviderAdmission = Object.freeze({
  allowEximbaySandboxCustomerApproval: false,
});

export type RequestRefundAttemptFailureCode =
  | PrepareRefundAttemptFailureCode
  | "ORDER_NOT_FOUND"
  | "ORDER_STATUS_NOT_REFUNDABLE"
  | "REFUND_IN_PROGRESS"
  | "PAYMENT_NOT_REFUNDABLE"
  | "PAYMENT_IDENTITY_MISMATCH"
  | "REFUND_LEDGER_INCONSISTENT"
  | "INVALID_REFUND_LINES"
  | "REFUND_LINE_ITEM_NOT_FOUND"
  | "OVER_REFUND_LINE_QUANTITY"
  | "REFUND_LINE_HISTORY_UNATTRIBUTED"
  | "REFUND_LINE_LEDGER_INCONSISTENT"
  | RefundEconomicFailureCode
  | "DISPUTE_REVIEW_REQUIRED"
  | "REASON_TOO_LONG"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_STATUS_CONFLICT"
  | "ORDER_CANCELLED";

export interface RequestRefundAttemptFailure {
  ok: false;
  code: RequestRefundAttemptFailureCode;
  message: string;
}

export type RequestRefundAttemptResult =
  | {
      ok: true;
      refundAttempt: RefundAttemptWithLines;
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
    return await client.$transaction((tx) => requestRefundAttemptInTransaction(tx, { ...input, orderId }));
  } catch (error) {
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, { ...input, orderId }, error);
    throw error;
  }
}

export async function requestRefundAttemptInTransaction(
  tx: RefundRequestTx,
  input: RequestRefundAttemptInput,
  providerAdmission: RefundRequestProviderAdmission = DEFAULT_PROVIDER_ADMISSION,
): Promise<RequestRefundAttemptResult> {
  return requestRefundAttemptWithProviderAdmissionInTransaction(tx, input, providerAdmission);
}

async function requestRefundAttemptWithProviderAdmissionInTransaction(
  tx: RefundRequestTx,
  input: RequestRefundAttemptInput,
  providerAdmission: RefundRequestProviderAdmission,
): Promise<RequestRefundAttemptResult> {
  const normalizedLines = normalizeRefundLines(input.lines, { allowEmpty: true });
  if (!normalizedLines.ok) return normalizedLines;
  if (!(await lockOrder(tx, input.orderId))) {
    return failure("ORDER_NOT_FOUND", "Order was not found.");
  }
  const order = await loadOrder(tx, input.orderId);
  if (!order) return failure("ORDER_NOT_FOUND", "Order was not found.");

  const candidate = prepareAgainst(order, input, []);
  if (!candidate.ok) return candidate;
  const replayOrReasonFailure = await resolveReplayBeforeNewWriteReasonValidation(
    tx,
    order,
    candidate.refundAttempt,
    normalizedLines.lines,
  );
  if (replayOrReasonFailure) return replayOrReasonFailure;

  return persistNewRequest(tx, order, input, normalizedLines.lines, providerAdmission);
}

async function persistNewRequest(
  tx: RefundRequestTx,
  order: RefundRequestOrder,
  input: RequestRefundAttemptInput,
  lines: readonly CanonicalRefundLine[],
  providerAdmission: RefundRequestProviderAdmission,
): Promise<RequestRefundAttemptResult> {
  if (lines.length === 0) {
    return failure("INVALID_REFUND_LINES", "Refund line selection must contain at least one item.");
  }
  const aggregateFailure = validateNewRefundAggregate(order);
  if (aggregateFailure) return aggregateFailure;
  const lineFailure = validateLineCapacity(order, lines);
  if (lineFailure) return lineFailure;
  const economicFailure = validateRefundEconomicAllocation(order, input.amount, lines);
  if (!economicFailure.ok) return economicFailure;
  const eligibilityFailure = validateEligibility(order, providerAdmission);
  if (eligibilityFailure) return eligibilityFailure;

  const prepared = prepareAgainst(order, input, order.refundAttempts);
  if (!prepared.ok) return prepared;
  const persisted = await persistRefundRequestAfterOrderLock(
    tx,
    order,
    prepared.refundAttempt,
    lines,
  );
  if (!persisted.ok) return persisted;
  return { ...persisted, replayed: false };
}

function validateNewRefundAggregate(order: RefundRequestOrder): RequestRefundAttemptFailure | null {
  if (order.cancellation !== null) {
    return failure("ORDER_CANCELLED", "Accepted cancellation blocks a competing refund request.");
  }
  return hasConsistentRefundAttemptLedgerIdentity(order.payment, order.refundAttempts)
    ? null
    : failure("REFUND_LEDGER_INCONSISTENT", "Historical refund ledger identity is inconsistent.");
}

async function lockOrder(tx: RefundRequestTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

function loadOrder(client: RefundRequestReader, orderId: string) {
  return client.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      cancellation: true,
      items: { select: { id: true, quantity: true, unitAmount: true, discountAmount: true } },
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          transitions: { orderBy: { createdAt: "asc" } },
          lines: {
            orderBy: { orderItemId: "asc" },
            include: { economicAllocation: true },
          },
        },
      },
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
  lines: readonly CanonicalRefundLine[],
): RequestRefundAttemptResult | null {
  const existing = order.refundAttempts.find((attempt) => (
    attempt.id === candidate.id || attempt.idempotencyKey === candidate.idempotencyKey
  ));
  if (!existing) return null;
  return resolveExistingReplay(existing, candidate, lines);
}

async function resolveReplayBeforeNewWriteReasonValidation(
  tx: RefundRequestTx,
  order: RefundRequestOrder,
  candidate: PreparedRefundAttempt,
  lines: readonly CanonicalRefundLine[],
): Promise<RequestRefundAttemptResult | null> {
  const replay = resolveReplay(order, candidate, lines);
  if (replay) return replay;
  if (isRefundRequestReasonWithinCodePointLimit(candidate.reason)) return null;
  if (await hasExistingRequestIdentity(tx, candidate)) {
    return failure("IDEMPOTENCY_CONFLICT", "Refund request identity is already in use.");
  }
  return failure("REASON_TOO_LONG", "Refund reason exceeds the 500-code-point limit.");
}

async function hasExistingRequestIdentity(
  tx: RefundRequestTx,
  candidate: PreparedRefundAttempt,
): Promise<boolean> {
  const operationKey = buildRefundRequestOperationKey(candidate.id);
  const [attempt, transition] = await Promise.all([
    tx.refundAttempt.findFirst({
      where: { OR: [{ id: candidate.id }, { idempotencyKey: candidate.idempotencyKey }] },
      select: { id: true },
    }),
    tx.refundAttemptTransition.findUnique({ where: { operationKey }, select: { id: true } }),
  ]);
  return attempt !== null || transition !== null;
}

function resolveExistingReplay(
  existing: AuditedRefundAttempt,
  candidate: PreparedRefundAttempt,
  lines: readonly CanonicalRefundLine[],
): RequestRefundAttemptResult {
  if (
    !sameImmutableRefundRequest(existing, candidate)
    || !sameCanonicalRefundLines(existing.lines.map(refundLineReplayInput), lines)
  ) {
    return failure("IDEMPOTENCY_CONFLICT", "Refund attempt identity conflicts with an existing request.");
  }
  const evidence = resolveRefundRequestCreationEvidence(existing.transitions, candidate);
  if (evidence.kind === "conflict") {
    return failure("IDEMPOTENCY_CONFLICT", "Refund request creation evidence conflicts with the existing request.");
  }
  const orderStatus = evidence.kind === "matched"
    ? evidence.orderStatus
    : OrderStatus.REFUND_PENDING;
  const { transitions: _transitions, ...refundAttempt } = existing;
  return { ok: true, refundAttempt, orderStatus, replayed: true };
}

function validateLineCapacity(
  order: RefundRequestOrder,
  requestedLines: readonly CanonicalRefundLine[],
): RequestRefundAttemptFailure | null {
  const capacity = deriveRefundLineCapacity(order.id, order.items, order.refundAttempts);
  if (!capacity.ok) {
    return capacity.code === "REFUND_LINE_HISTORY_UNATTRIBUTED"
      ? failure(capacity.code, "Historical guarded refunds have no merchandise attribution; manual review is required.")
      : failure(capacity.code, "Historical refund line attribution is inconsistent; manual review is required.");
  }
  for (const line of requestedLines) {
    const remaining = capacity.remainingByOrderItemId.get(line.orderItemId);
    if (remaining === undefined) {
      return failure("REFUND_LINE_ITEM_NOT_FOUND", "Selected refund item does not belong to the Order.");
    }
    if (line.quantity > remaining) {
      return failure("OVER_REFUND_LINE_QUANTITY", "Requested refund quantity exceeds remaining item capacity.");
    }
  }
  return null;
}

function validateEligibility(
  order: RefundRequestOrder,
  providerAdmission: RefundRequestProviderAdmission,
): RequestRefundAttemptFailure | null {
  if (order.status === OrderStatus.REFUND_PENDING) {
    return failure("REFUND_IN_PROGRESS", "A refund request is already in progress.");
  }
  if (!isRefundableOrderStatus(order.status)) {
    return failure("ORDER_STATUS_NOT_REFUNDABLE", "Order status does not allow a refund request.");
  }
  if (order.disputeStatus !== null) {
    return failure("DISPUTE_REVIEW_REQUIRED", "Order dispute state requires manual review.");
  }
  if (!isRefundablePayment(order, providerAdmission)) {
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

function isRefundablePayment(
  order: RefundRequestOrder,
  providerAdmission: RefundRequestProviderAdmission,
): boolean {
  if (
    order.payment.status !== PaymentAttemptStatus.SUCCEEDED
    || !order.payment.providerPaymentKey?.trim()
  ) {
    return false;
  }
  if (order.payment.provider !== PaymentProvider.EXIMBAY) return true;
  return providerAdmission.allowEximbaySandboxCustomerApproval
    && order.payment.mode === PaymentMode.SANDBOX
    && (order.payment.currency === "USD" || order.payment.currency === "JPY");
}

function hasMatchingPaymentIdentity(order: RefundRequestOrder): boolean {
  return order.totalAmount === order.payment.amount
    && order.currency === order.payment.currency;
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: RequestRefundAttemptInput,
  originalError: unknown,
): Promise<RequestRefundAttemptResult> {
  const order = await loadOrder(client, input.orderId);
  if (!order) throw originalError;
  const prepared = prepareAgainst(order, input, []);
  if (!prepared.ok) return prepared;

  const candidate = prepared.refundAttempt;
  const operationKey = buildRefundRequestOperationKey(candidate.id);
  const [attempts, transition] = await Promise.all([
    client.refundAttempt.findMany({
      where: { OR: [{ id: candidate.id }, { idempotencyKey: candidate.idempotencyKey }] },
      include: {
        transitions: { orderBy: { createdAt: "asc" } },
        lines: {
          orderBy: { orderItemId: "asc" },
          include: { economicAllocation: true },
        },
      },
      take: 2,
    }),
    client.refundAttemptTransition.findUnique({ where: { operationKey } }),
  ]);
  if (attempts.length === 0 && !transition) throw originalError;
  const normalizedLines = normalizeRefundLines(input.lines, { allowEmpty: true });
  if (!normalizedLines.ok) return normalizedLines;
  return resolveUniqueConflictEvidence(attempts, transition, candidate, normalizedLines.lines);
}

function resolveUniqueConflictEvidence(
  attempts: readonly AuditedRefundAttempt[],
  transition: RefundAttemptTransition | null,
  candidate: PreparedRefundAttempt,
  lines: readonly CanonicalRefundLine[],
): RequestRefundAttemptResult {
  if (attempts.length !== 1) {
    return failure("IDEMPOTENCY_CONFLICT", "Refund request identity or creation evidence is already in use.");
  }
  const attempt = attempts[0];
  if (!attempt || (transition && transition.refundAttemptId !== attempt.id)) {
    return failure("IDEMPOTENCY_CONFLICT", "Refund request identity or creation evidence is already in use.");
  }
  return resolveExistingReplay(attempt, candidate, lines);
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}

function refundLineReplayInput(line: RefundAttemptLineWithAllocation): RefundLineInput {
  const merchandiseRefundAmount = line.economicAllocation?.merchandiseRefundAmount;
  return merchandiseRefundAmount === undefined
    ? { orderItemId: line.orderItemId, quantity: line.quantity }
    : { orderItemId: line.orderItemId, quantity: line.quantity, merchandiseRefundAmount };
}

function failure(
  code: RequestRefundAttemptFailureCode,
  message: string,
): RequestRefundAttemptFailure {
  return { ok: false, code, message };
}
