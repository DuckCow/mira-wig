import {
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
  isTerminalRefundAttemptStatus,
} from "@/lib/payment/refund/invariants";
import { deriveRefundLineCapacity, sameCanonicalRefundLines } from "@/lib/payment/refund/lines";
import { prepareRefundAttempt } from "@/lib/payment/refund/prepare";
import { persistRefundRequestAfterOrderLock } from "@/lib/payment/refund/request-persistence";
import { resolveRefundRequestCreationEvidence } from "@/lib/payment/refund/request-evidence";
import {
  normalizeReplacementInput,
  type CancellationRefundReplacementResult,
  type ReplaceCancellationRefundInput,
} from "./contracts";
import {
  CANCELLATION_REFUND_REPLACEMENT_REASON,
  CUSTOMER_CANCELLATION_REFUND_REASON,
} from "./provenance";
import { deriveCancellationObligation } from "./obligation";

type ReplacementTx = Prisma.TransactionClient;
type ReplacementAggregate = NonNullable<Awaited<ReturnType<typeof loadReplacementAggregate>>>;
type ReplacementAttempt = ReplacementAggregate["refundAttempts"][number];

export async function replaceOutstandingCancellationRefund(
  client: PrismaClient,
  rawInput: ReplaceCancellationRefundInput,
): Promise<CancellationRefundReplacementResult> {
  const input = normalizeReplacementInput(rawInput);
  if (!input) return failure("INVALID_INPUT", "Cancellation refund replacement input is invalid.");
  try {
    return await client.$transaction((tx) => replaceInTransaction(tx, input));
  } catch (error) {
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, input);
    throw error;
  }
}

async function replaceInTransaction(
  tx: ReplacementTx,
  input: ReplaceCancellationRefundInput,
): Promise<CancellationRefundReplacementResult> {
  if (!(await lockOrder(tx, input.orderId))) {
    return failure("ORDER_NOT_FOUND", "Order was not found.");
  }
  const aggregate = await loadReplacementAggregate(tx, input.orderId);
  if (!aggregate) return failure("ORDER_NOT_FOUND", "Order was not found.");
  if (!hasCoherentCancellationAggregate(aggregate)) {
    return failure("ORDER_NOT_CANCELLED", "Order has no coherent accepted cancellation.");
  }

  const replay = aggregate.refundAttempts.find((attempt) => attempt.id === input.requestKey);
  if (replay) return resolveReplacementReplay(aggregate, replay);
  const reusedIdentity = await tx.refundAttempt.findUnique({
    where: { id: input.requestKey },
    select: { orderId: true },
  });
  if (reusedIdentity) return failure("REQUEST_KEY_CONFLICT", "Replacement request identity is unavailable.");

  const admission = validateReplacementAdmission(aggregate);
  if (!admission.ok) return admission.result;
  return persistReplacement(tx, aggregate, input, admission.outstanding);
}

function validateReplacementAdmission(
  aggregate: ReplacementAggregate,
): { ok: true; outstanding: number } | { ok: false; result: CancellationRefundReplacementResult } {
  if (aggregate.disputeStatus !== null) {
    return replacementAdmissionFailure(
      "DISPUTE_REVIEW_REQUIRED",
      "Cancellation refund replacement requires dispute review.",
    );
  }
  if (!hasUsableCapturedPayment(aggregate)) {
    return replacementAdmissionFailure(
      "PAYMENT_NOT_REFUNDABLE",
      "Captured payment facts do not admit another refund request.",
    );
  }
  if (!hasConsistentRefundAttemptLedgerIdentity(aggregate.payment, aggregate.refundAttempts)) {
    return replacementAdmissionFailure("REFUND_LEDGER_INCONSISTENT", "Refund ledger identity is inconsistent.");
  }
  if (!hasOnlyCancellationOwnedPostAcceptanceAttempts(aggregate)) {
    return replacementAdmissionFailure(
      "REFUND_LEDGER_INCONSISTENT",
      "Post-cancellation refund provenance is inconsistent.",
    );
  }
  if (hasOpenRefundAttempt(aggregate)) {
    return replacementAdmissionFailure("REFUND_IN_PROGRESS", "A cancellation refund attempt is already open.");
  }
  const obligation = deriveCancellationObligation(aggregate, aggregate.payment, aggregate.refundAttempts);
  if (obligation.state === "INCONSISTENT") {
    return replacementAdmissionFailure(
      "REFUND_LEDGER_INCONSISTENT",
      "Cancellation refund obligation is inconsistent.",
    );
  }
  if (obligation.state === "SATISFIED") {
    return replacementAdmissionFailure(
      "NO_OUTSTANDING_OBLIGATION",
      "Cancellation refund obligation is already satisfied.",
    );
  }
  if (!hasReplacementRestingState(aggregate)) {
    return replacementAdmissionFailure(
      "REFUND_LEDGER_INCONSISTENT",
      "Order financial state is not a replacement resting state.",
    );
  }
  return { ok: true, outstanding: obligation.outstandingAmount };
}

function hasUsableCapturedPayment(aggregate: ReplacementAggregate): boolean {
  return aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(aggregate.payment.providerPaymentKey?.trim());
}

function hasOpenRefundAttempt(aggregate: ReplacementAggregate): boolean {
  return aggregate.refundAttempts.some((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
}

function hasReplacementRestingState(aggregate: ReplacementAggregate): boolean {
  return aggregate.status === OrderStatus.PAID || aggregate.status === OrderStatus.PARTIALLY_REFUNDED;
}

async function persistReplacement(
  tx: ReplacementTx,
  aggregate: ReplacementAggregate,
  input: ReplaceCancellationRefundInput,
  outstanding: number,
): Promise<CancellationRefundReplacementResult> {
  const capacity = deriveRefundLineCapacity(aggregate.id, aggregate.items, aggregate.refundAttempts);
  if (!capacity.ok) {
    return failure("REFUND_LINE_LEDGER_INCONSISTENT", "Refund line capacity is inconsistent.");
  }
  const lines = aggregate.items.flatMap((item) => {
    const quantity = capacity.remainingByOrderItemId.get(item.id);
    return quantity && quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
  });
  if (lines.length === 0) {
    return failure("REFUND_LINE_LEDGER_INCONSISTENT", "Outstanding refund has no remaining merchandise capacity.");
  }

  const requestedAt = await captureOperationTime(tx);
  const prepared = prepareRefundAttempt({
    refundAttemptId: input.requestKey,
    orderId: aggregate.id,
    paymentId: aggregate.payment.id,
    orderAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    requestedAmount: outstanding,
    requestedCurrency: aggregate.payment.currency,
    existingAttempts: aggregate.refundAttempts,
    reason: CANCELLATION_REFUND_REPLACEMENT_REASON,
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: null,
    provider: aggregate.payment.provider,
    mode: aggregate.payment.mode,
    now: requestedAt,
  });
  if (!prepared.ok) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Outstanding cancellation amount is inconsistent.");
  }
  const persisted = await persistRefundRequestAfterOrderLock(tx, aggregate, prepared.refundAttempt, lines);
  if (!persisted.ok) return failure("PERSISTENCE_CONFLICT", persisted.message);
  return {
    ok: true,
    replayed: false,
    orderId: aggregate.id,
    refundAttemptId: persisted.refundAttempt.id,
    amount: persisted.refundAttempt.amount,
    currency: persisted.refundAttempt.currency,
    status: persisted.refundAttempt.status,
  };
}

function replacementAdmissionFailure(
  code: Exclude<CancellationRefundReplacementResult, { ok: true }>["code"],
  message: string,
): { ok: false; result: CancellationRefundReplacementResult } {
  return { ok: false, result: failure(code, message) };
}

async function lockOrder(tx: ReplacementTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

function loadReplacementAggregate(reader: Pick<PrismaClient, "order">, orderId: string) {
  return reader.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      cancellation: true,
      items: { orderBy: { id: "asc" }, include: { mr: true } },
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          lines: { orderBy: { orderItemId: "asc" } },
          transitions: { orderBy: { createdAt: "asc" } },
          executionCommand: {
            include: { evidence: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });
}

function hasCoherentCancellationAggregate(aggregate: ReplacementAggregate): boolean {
  const cancellation = aggregate.cancellation;
  if (!cancellation || !hasCoherentCancellationOrderFacts(aggregate)) return false;
  const initial = aggregate.refundAttempts.find((attempt) => attempt.id === cancellation.initialRefundAttemptId);
  if (!initial) return false;
  return [
    initial.requestedAt.getTime() === cancellation.acceptedAt.getTime(),
    initial.actorType === RefundAttemptActorType.SYSTEM,
    initial.actorUserId === null,
    initial.reason === CUSTOMER_CANCELLATION_REFUND_REASON,
    initial.amount === aggregate.payment.amount,
    initial.currency === aggregate.payment.currency,
    sameCanonicalRefundLines(
      initial.lines,
      aggregate.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity })),
    ),
    resolveRefundRequestCreationEvidence(initial.transitions, initial).kind === "matched",
  ].every(Boolean);
}

function hasCoherentCancellationOrderFacts(aggregate: ReplacementAggregate): boolean {
  const cancellation = aggregate.cancellation;
  return [
    cancellation?.orderId === aggregate.id,
    cancellation?.requestedByUserId === aggregate.userId,
    aggregate.paymentId === aggregate.payment.id,
    aggregate.totalAmount === aggregate.payment.amount,
    aggregate.currency === aggregate.payment.currency,
    aggregate.items.length > 0,
    aggregate.items.every(hasCoherentCancelledMr),
  ].every(Boolean);
}

function hasCoherentCancelledMr(item: ReplacementAggregate["items"][number]): boolean {
  return [
    item.mr?.status === MrStatus.CANCELLED,
    item.mr?.startedAt === null,
    item.mr?.productionStartRequestKey === null,
    item.mr?.startedByUserId === null,
  ].every(Boolean);
}

function hasOnlyCancellationOwnedPostAcceptanceAttempts(aggregate: ReplacementAggregate): boolean {
  const cancellation = aggregate.cancellation;
  if (!cancellation) return false;
  return aggregate.refundAttempts.every((attempt) => {
    if (attempt.requestedAt.getTime() < cancellation.acceptedAt.getTime()) return true;
    const creationOwned = attempt.id === cancellation.initialRefundAttemptId
      ? true
      : attempt.actorType === RefundAttemptActorType.SYSTEM
      && attempt.actorUserId === null
      && attempt.reason === CANCELLATION_REFUND_REPLACEMENT_REASON
      && resolveRefundRequestCreationEvidence(attempt.transitions, attempt).kind === "matched";
    if (!creationOwned) return false;
    if (attempt.status === RefundAttemptStatus.SUCCEEDED) return true;
    if (attempt.status === RefundAttemptStatus.FAILED_TERMINAL) {
      return hasConfirmedTerminalNonExecution(attempt);
    }
    return !isTerminalRefundAttemptStatus(attempt.status);
  });
}

function hasConfirmedTerminalNonExecution(
  attempt: ReplacementAggregate["refundAttempts"][number],
): boolean {
  if (attempt.providerRefundId !== null || !attempt.failedAt || !attempt.executionCommand) return false;
  const appliedTerminal = attempt.executionCommand.evidence.filter((evidence) => (
    evidence.application === RefundExecutionEvidenceApplication.APPLIED
    && evidence.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL
  ));
  return appliedTerminal.length === 1
    && !attempt.executionCommand.evidence.some((evidence) => (
      evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
    ))
    && attempt.transitions.some((transition) => (
      transition.fromStatus === RefundAttemptStatus.PROCESSING
      && transition.toStatus === RefundAttemptStatus.FAILED_TERMINAL
    ));
}

function resolveReplacementReplay(
  aggregate: ReplacementAggregate,
  attempt: ReplacementAttempt,
): CancellationRefundReplacementResult {
  const cancellation = aggregate.cancellation;
  const capacityBeforeTarget = deriveRefundLineCapacity(
    aggregate.id,
    aggregate.items,
    aggregate.refundAttempts.filter((candidate) => candidate.id !== attempt.id),
  );
  const obligationBeforeTarget = deriveCancellationObligation(
    aggregate,
    aggregate.payment,
    aggregate.refundAttempts.filter((candidate) => candidate.id !== attempt.id),
  );
  const expectedAmount = obligationBeforeTarget.state === "OUTSTANDING"
    ? obligationBeforeTarget.outstandingAmount
    : null;
  const expectedLines = capacityBeforeTarget.ok
    ? aggregate.items.flatMap((item) => {
      const quantity = capacityBeforeTarget.remainingByOrderItemId.get(item.id);
      return quantity && quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
    })
    : [];
  if (!cancellation || expectedAmount === null
    || !hasCoherentReplacementReplay(cancellation, attempt, expectedAmount, expectedLines)) {
    return failure("REQUEST_KEY_CONFLICT", "Replacement request identity conflicts with stored evidence.");
  }
  return {
    ok: true,
    replayed: true,
    orderId: aggregate.id,
    refundAttemptId: attempt.id,
    amount: attempt.amount,
    currency: attempt.currency,
    status: attempt.status,
  };
}

function hasCoherentReplacementReplay(
  cancellation: NonNullable<ReplacementAggregate["cancellation"]>,
  attempt: ReplacementAttempt,
  expectedAmount: number,
  expectedLines: ReadonlyArray<{ orderItemId: string; quantity: number }>,
): boolean {
  return [
    attempt.id !== cancellation.initialRefundAttemptId,
    attempt.requestedAt.getTime() >= cancellation.acceptedAt.getTime(),
    attempt.actorType === RefundAttemptActorType.SYSTEM,
    attempt.actorUserId === null,
    attempt.reason === CANCELLATION_REFUND_REPLACEMENT_REASON,
    attempt.amount === expectedAmount,
    expectedAmount > 0,
    resolveRefundRequestCreationEvidence(attempt.transitions, attempt).kind === "matched",
    sameCanonicalRefundLines(attempt.lines, expectedLines),
  ].every(Boolean);
}

async function captureOperationTime(tx: ReplacementTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative cancellation replacement time.");
  }
  return capturedAt;
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: ReplaceCancellationRefundInput,
): Promise<CancellationRefundReplacementResult> {
  const aggregate = await loadReplacementAggregate(client, input.orderId);
  const attempt = aggregate?.refundAttempts.find((candidate) => candidate.id === input.requestKey);
  return aggregate && attempt
    ? resolveReplacementReplay(aggregate, attempt)
    : failure("REQUEST_KEY_CONFLICT", "Replacement request identity is unavailable.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function failure(
  code: Exclude<CancellationRefundReplacementResult, { ok: true }>["code"],
  message: string,
): CancellationRefundReplacementResult {
  return { ok: false, code, message };
}
