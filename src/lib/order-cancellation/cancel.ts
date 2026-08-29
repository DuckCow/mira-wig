import { randomUUID } from "node:crypto";
import {
  CustomerRefundIntakeStatus,
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type PrismaClient,
} from "@prisma/client";
import {
  hasConsistentRefundAttemptLedgerIdentity,
} from "@/lib/payment/refund/invariants";
import {
  deriveRefundLineCapacity,
  sameCanonicalRefundLines,
  type CanonicalRefundLine,
} from "@/lib/payment/refund/lines";
import { prepareRefundAttempt } from "@/lib/payment/refund/prepare";
import { persistRefundRequestAfterOrderLock } from "@/lib/payment/refund/request-persistence";
import { deriveRefundEconomicLines } from "@/lib/payment/refund/economic-validation";
import { resolveRefundRequestCreationEvidence } from "@/lib/payment/refund/request-evidence";
import {
  normalizeCustomerCancellationInput,
  type AuthenticatedCustomerCancellationInput,
  type CancellationResult,
} from "./contracts";
import { CUSTOMER_CANCELLATION_REFUND_REASON } from "./provenance";

type CancellationTx = Prisma.TransactionClient;
type CancellationAggregate = NonNullable<Awaited<ReturnType<typeof loadCancellationAggregate>>>;
type CancellationAttempt = CancellationAggregate["refundAttempts"][number];

class CancellationRollbackError extends Error {}

export async function cancelEligibleMtoOrder(
  client: PrismaClient,
  rawInput: AuthenticatedCustomerCancellationInput,
): Promise<CancellationResult> {
  const input = normalizeCustomerCancellationInput(rawInput);
  if (!input) return failure("INVALID_INPUT", "Cancellation input is invalid.");
  const initialRefundAttemptId = randomUUID();

  try {
    return await client.$transaction((tx) => cancelInTransaction(tx, input, initialRefundAttemptId));
  } catch (error) {
    if (error instanceof CancellationRollbackError) {
      return failure("PERSISTENCE_CONFLICT", "Cancellation state changed before acceptance completed.");
    }
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, input);
    throw error;
  }
}

async function cancelInTransaction(
  tx: CancellationTx,
  input: AuthenticatedCustomerCancellationInput,
  initialRefundAttemptId: string,
): Promise<CancellationResult> {
  if (!(await lockOwnedOrder(tx, input.orderId, input.requestedByUserId))) {
    return failure("ORDER_NOT_FOUND_OR_NOT_OWNED", "Order was not found for the customer.");
  }
  const aggregate = await loadCancellationAggregate(tx, input.orderId);
  if (!aggregate || aggregate.userId !== input.requestedByUserId) {
    return failure("ORDER_NOT_FOUND_OR_NOT_OWNED", "Order was not found for the customer.");
  }

  if (aggregate.cancellation) return resolveCancellationReplay(aggregate);
  const reusedKey = await tx.orderCancellation.findUnique({
    where: { requestKey: input.requestKey },
    select: { orderId: true },
  });
  if (reusedKey) return failure("REQUEST_KEY_CONFLICT", "Cancellation request identity is unavailable.");

  const eligibilityFailure = validateCancellationEligibility(aggregate);
  if (eligibilityFailure) return eligibilityFailure;
  return persistAcceptedCancellation(tx, aggregate, input, initialRefundAttemptId);
}

async function persistAcceptedCancellation(
  tx: CancellationTx,
  aggregate: CancellationAggregate,
  input: AuthenticatedCustomerCancellationInput,
  initialRefundAttemptId: string,
): Promise<CancellationResult> {
  const baseLines = fullOrderLines(aggregate);
  const capacity = deriveRefundLineCapacity(aggregate.id, aggregate.items, aggregate.refundAttempts);
  if (!capacity.ok || !hasFullRemainingLineCapacity(baseLines, capacity.remainingByOrderItemId)) {
    return failure("REFUND_HISTORY_CONFLICT", "Refund line history requires manual review.");
  }
  const economicLines = deriveRefundEconomicLines(aggregate, aggregate.payment.amount, baseLines);
  if (!economicLines.ok) {
    return failure("REFUND_HISTORY_CONFLICT", "Coupon refund economics require manual review.");
  }

  const acceptedAt = await captureOperationTime(tx);
  const prepared = prepareRefundAttempt({
    refundAttemptId: initialRefundAttemptId,
    orderId: aggregate.id,
    paymentId: aggregate.payment.id,
    orderAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    requestedAmount: aggregate.payment.amount,
    requestedCurrency: aggregate.payment.currency,
    existingAttempts: aggregate.refundAttempts,
    reason: CUSTOMER_CANCELLATION_REFUND_REASON,
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: null,
    provider: aggregate.payment.provider,
    mode: aggregate.payment.mode,
    now: acceptedAt,
  });
  if (!prepared.ok) {
    return failure("REFUND_HISTORY_CONFLICT", "Refund amount history requires manual review.");
  }

  const persisted = await persistRefundRequestAfterOrderLock(
    tx,
    aggregate,
    prepared.refundAttempt,
    economicLines.lines,
  );
  if (!persisted.ok) throw new CancellationRollbackError(persisted.code);

  const cancellation = await tx.orderCancellation.create({
    data: {
      orderId: aggregate.id,
      requestKey: input.requestKey,
      requestedByUserId: input.requestedByUserId,
      initialRefundAttemptId: persisted.refundAttempt.id,
      acceptedAt,
    },
  });
  const manufacturingRequestIds = aggregate.items.map((item) => item.mr?.id).filter(isString);
  const mrUpdate = await tx.manufacturingRequest.updateMany({
    where: {
      id: { in: manufacturingRequestIds },
      status: MrStatus.RECEIVED,
      startedAt: null,
      productionStartRequestKey: null,
      startedByUserId: null,
    },
    data: { status: MrStatus.CANCELLED },
  });
  if (mrUpdate.count !== manufacturingRequestIds.length) {
    throw new CancellationRollbackError("Manufacturing request admission changed.");
  }

  return {
    ok: true,
    replayed: false,
    orderId: aggregate.id,
    cancellationId: cancellation.id,
    initialRefundAttemptId: persisted.refundAttempt.id,
    acceptedAt,
    expectedRefundAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    orderStatus: OrderStatus.REFUND_PENDING,
  };
}

function hasFullRemainingLineCapacity(
  lines: readonly CanonicalRefundLine[],
  remainingByOrderItemId: ReadonlyMap<string, number>,
): boolean {
  return lines.every((line) => remainingByOrderItemId.get(line.orderItemId) === line.quantity);
}

async function lockOwnedOrder(
  tx: CancellationTx,
  orderId: string,
  requestedByUserId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order"
    WHERE "id" = ${orderId} AND "userId" = ${requestedByUserId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadCancellationAggregate(reader: Pick<PrismaClient, "order">, orderId: string) {
  return reader.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      cancellation: true,
      items: {
        orderBy: { id: "asc" },
        include: { mr: true },
      },
      customerRefundIntakes: { orderBy: { submittedAt: "asc" } },
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          lines: {
            orderBy: { orderItemId: "asc" },
            include: { economicAllocation: true },
          },
          transitions: { orderBy: { createdAt: "asc" } },
          executionCommand: {
            include: { evidence: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });
}

function validateCancellationEligibility(
  aggregate: CancellationAggregate,
): CancellationResult | null {
  if (aggregate.status !== OrderStatus.PAID) {
    return failure("NOT_ELIGIBLE", "Order is not eligible for automatic cancellation.");
  }
  if (aggregate.disputeStatus !== null) {
    return failure("DISPUTE_REVIEW_REQUIRED", "Order dispute state requires manual review.");
  }
  if (!hasCoherentCapturedPayment(aggregate)) {
    return failure("PAYMENT_NOT_REFUNDABLE", "Captured payment evidence is not refundable automatically.");
  }
  if (aggregate.items.length === 0) {
    return failure("NOT_ELIGIBLE", "Order has no cancellable items.");
  }
  if (aggregate.items.some((item) => item.fulfillmentType !== FulfillmentType.MTO)) {
    return failure("UNSUPPORTED_FULFILLMENT", "Only all-MTO Orders support automatic cancellation.");
  }
  if (aggregate.items.some((item) => !hasCoherentPreProductionRequest(item.mr))) {
    return failure("MANUFACTURING_STATE_CONFLICT", "Manufacturing has started or its state is inconsistent.");
  }
  if (aggregate.customerRefundIntakes.some((intake) => intake.status === CustomerRefundIntakeStatus.SUBMITTED)) {
    return failure("INTAKE_CONFLICT", "An open customer refund intake requires manual review.");
  }
  if (!hasConsistentRefundAttemptLedgerIdentity(aggregate.payment, aggregate.refundAttempts)) {
    return failure("REFUND_HISTORY_CONFLICT", "Refund ledger identity is inconsistent.");
  }
  if (!hasEligibleTerminalRefundHistory(aggregate)) {
    return failure("REFUND_HISTORY_CONFLICT", "Refund history requires manual review.");
  }
  return null;
}

function hasCoherentCapturedPayment(aggregate: CancellationAggregate): boolean {
  return aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(aggregate.payment.providerPaymentKey?.trim())
    && aggregate.paymentId === aggregate.payment.id
    && aggregate.totalAmount === aggregate.payment.amount
    && aggregate.currency === aggregate.payment.currency
    && Number.isSafeInteger(aggregate.payment.amount)
    && aggregate.payment.amount > 0;
}

function hasCoherentPreProductionRequest(
  mr: CancellationAggregate["items"][number]["mr"],
): boolean {
  return mr !== null
    && mr.status === MrStatus.RECEIVED
    && mr.startedAt === null
    && mr.productionStartRequestKey === null
    && mr.startedByUserId === null;
}

function hasEligibleTerminalRefundHistory(aggregate: CancellationAggregate): boolean {
  const itemQuantities = new Map(aggregate.items.map((item) => [item.id, item.quantity]));
  return aggregate.refundAttempts.every((attempt) => {
    if (attempt.status === RefundAttemptStatus.SUCCEEDED) return false;
    if (attempt.status === RefundAttemptStatus.FAILED_TERMINAL) {
      return hasConfirmedTerminalNonExecution(attempt) && hasCoherentHistoricalLines(attempt, aggregate.id, itemQuantities);
    }
    if (attempt.status === RefundAttemptStatus.CANCELLED) {
      return hasCoherentPreContactCancellation(attempt) && hasCoherentHistoricalLines(attempt, aggregate.id, itemQuantities);
    }
    return false;
  });
}

function hasConfirmedTerminalNonExecution(attempt: CancellationAttempt): boolean {
  if (attempt.providerRefundId !== null || !attempt.failedAt || !attempt.executionCommand) return false;
  const appliedTerminal = attempt.executionCommand.evidence.filter((evidence) => (
    evidence.application === RefundExecutionEvidenceApplication.APPLIED
      && evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL
  ));
  return appliedTerminal.length === 1
    && !attempt.executionCommand.evidence.some((evidence) => evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED)
    && attempt.transitions.some((transition) => (
      transition.fromStatus === RefundAttemptStatus.PROCESSING
        && transition.toStatus === RefundAttemptStatus.FAILED_TERMINAL
    ));
}

function hasCoherentPreContactCancellation(attempt: CancellationAttempt): boolean {
  return attempt.providerRefundId === null
    && attempt.executionCommand === null
    && attempt.transitions.some((transition) => (
      transition.fromStatus === RefundAttemptStatus.REQUESTED
        && transition.toStatus === RefundAttemptStatus.CANCELLED
    ));
}

function hasCoherentHistoricalLines(
  attempt: CancellationAttempt,
  orderId: string,
  itemQuantities: ReadonlyMap<string, number>,
): boolean {
  return attempt.lines.every((line) => {
    const ordered = itemQuantities.get(line.orderItemId);
    return line.orderId === orderId
      && ordered !== undefined
      && Number.isInteger(line.quantity)
      && line.quantity > 0
      && line.quantity <= ordered;
  });
}

function fullOrderLines(aggregate: CancellationAggregate): readonly CanonicalRefundLine[] {
  return aggregate.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity }));
}

function resolveCancellationReplay(aggregate: CancellationAggregate): CancellationResult {
  const cancellation = aggregate.cancellation;
  if (!cancellation || !hasCoherentCancellationIdentity(aggregate, cancellation)) {
    return failure("PERSISTENCE_CONFLICT", "Cancellation evidence is inconsistent.");
  }
  const initial = aggregate.refundAttempts.find((attempt) => attempt.id === cancellation.initialRefundAttemptId);
  if (!initial || !hasCoherentInitialCancellationAttempt(aggregate, cancellation, initial)) {
    return failure("PERSISTENCE_CONFLICT", "Cancellation evidence is inconsistent.");
  }
  return {
    ok: true,
    replayed: true,
    orderId: aggregate.id,
    cancellationId: cancellation.id,
    initialRefundAttemptId: initial.id,
    acceptedAt: cancellation.acceptedAt,
    expectedRefundAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    orderStatus: aggregate.status,
  };
}

function hasCoherentCancellationIdentity(
  aggregate: CancellationAggregate,
  cancellation: NonNullable<CancellationAggregate["cancellation"]>,
): boolean {
  return [
    cancellation.orderId === aggregate.id,
    cancellation.requestedByUserId === aggregate.userId,
  ].every(Boolean);
}

function hasCoherentInitialCancellationAttempt(
  aggregate: CancellationAggregate,
  cancellation: NonNullable<CancellationAggregate["cancellation"]>,
  initial: CancellationAttempt,
): boolean {
  const expectedLines = deriveRefundEconomicLines(
    {
      ...aggregate,
      // Initial C0 acceptance owns the full captured-payment/full-quantity decision.
      // Later financial outcomes change the current obligation, never this creation identity.
      refundAttempts: [],
    },
    aggregate.payment.amount,
    fullOrderLines(aggregate),
  );
  if (!expectedLines.ok) return false;
  return [
    initial.orderId === aggregate.id,
    initial.paymentId === aggregate.payment.id,
    initial.amount === aggregate.payment.amount,
    initial.currency === aggregate.payment.currency,
    initial.actorType === RefundAttemptActorType.SYSTEM,
    initial.actorUserId === null,
    initial.reason === CUSTOMER_CANCELLATION_REFUND_REASON,
    initial.requestedAt.getTime() === cancellation.acceptedAt.getTime(),
    resolveRefundRequestCreationEvidence(initial.transitions, initial).kind === "matched",
    sameCanonicalRefundLines(initial.lines.map(storedEconomicLine), expectedLines.lines),
    aggregate.items.every(hasCoherentCancelledManufacturingRequest),
  ].every(Boolean);
}

function storedEconomicLine(
  line: CancellationAttempt["lines"][number],
): CanonicalRefundLine {
  const merchandiseRefundAmount = line.economicAllocation?.merchandiseRefundAmount;
  return merchandiseRefundAmount === undefined
    ? { orderItemId: line.orderItemId, quantity: line.quantity }
    : { orderItemId: line.orderItemId, quantity: line.quantity, merchandiseRefundAmount };
}

function hasCoherentCancelledManufacturingRequest(
  item: CancellationAggregate["items"][number],
): boolean {
  return [
    item.mr?.status === MrStatus.CANCELLED,
    item.mr?.startedAt === null,
    item.mr?.productionStartRequestKey === null,
    item.mr?.startedByUserId === null,
  ].every(Boolean);
}

async function captureOperationTime(tx: CancellationTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0]?.capturedAt instanceof Date)) {
    throw new CancellationRollbackError("Unable to capture operation time.");
  }
  return rows[0].capturedAt;
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: AuthenticatedCustomerCancellationInput,
): Promise<CancellationResult> {
  const aggregate = await loadCancellationAggregate(client, input.orderId);
  if (aggregate?.userId === input.requestedByUserId && aggregate.cancellation) {
    return resolveCancellationReplay(aggregate);
  }
  return failure("REQUEST_KEY_CONFLICT", "Cancellation request identity is unavailable.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string";
}

function failure(
  code: Exclude<CancellationResult, { ok: true }>["code"],
  message: string,
): CancellationResult {
  return { ok: false, code, message };
}
