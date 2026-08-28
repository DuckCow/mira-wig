import {
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type CustomerRefundIntake,
  type Order,
  type OrderCancellation,
  type OrderItem,
  type Payment,
  type PrismaClient,
  type RefundAttempt,
  type RefundAttemptLine,
  type RefundAttemptTransition,
  type RefundExecutionCommand,
} from "@prisma/client";
import {
  buildRefundExecutionClaimOperationKey,
  claimFailure as failure,
  isClaimTransitionCandidate,
  matchesClaimTransition,
  requiresExecutionCommand,
  type ClaimRefundAttemptForExecutionFailure,
  type NormalizedClaimInput,
} from "./claim-contract";
import {
  buildRefundAttemptIdempotencyKey,
  hasConsistentRefundAttemptLedgerIdentity,
  isTerminalRefundAttemptStatus,
  validateRefundRequest,
} from "./invariants";
import { resolveRefundRequestCreationEvidence } from "./request-evidence";
import { deriveRefundLineCapacity, sameCanonicalRefundLines } from "./lines";
import {
  CANCELLATION_REFUND_REPLACEMENT_REASON,
  CUSTOMER_CANCELLATION_REFUND_REASON,
} from "@/lib/order-cancellation/provenance";

type ClaimArtifactReader = Pick<PrismaClient, "refundAttemptTransition">;
type ClaimAggregateReader = Pick<PrismaClient, "order">;

export type RefundExecutionClaimTarget = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  executionCommand: RefundExecutionCommand | null;
  approvedCustomerRefundIntake: CustomerRefundIntake | null;
  lines: RefundAttemptLine[];
};

export type RefundExecutionClaimAggregate = Order & {
  payment: Payment;
  cancellation: OrderCancellation | null;
  items: Pick<OrderItem, "id" | "quantity">[];
  refundAttempts: RefundExecutionClaimTarget[];
};

export type ClaimArtifactResolution =
  | { kind: "none" }
  | { kind: "replay"; commandId: string }
  | { kind: "conflict" };

export type ExistingRefundExecutionClaimClassification =
  | "HEALTHY_EXISTING_CLAIM"
  | "UNPROVEN";

export async function loadRefundExecutionClaimAggregate(
  reader: ClaimAggregateReader,
  orderId: string,
): Promise<RefundExecutionClaimAggregate | null> {
  return reader.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      cancellation: true,
      items: { select: { id: true, quantity: true } },
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          transitions: { orderBy: { createdAt: "asc" } },
          executionCommand: true,
          approvedCustomerRefundIntake: true,
          lines: { orderBy: { orderItemId: "asc" } },
        },
      },
    },
  });
}

export async function resolveRefundExecutionClaimArtifacts(
  reader: ClaimArtifactReader,
  target: RefundExecutionClaimTarget,
  input: NormalizedClaimInput,
): Promise<ClaimArtifactResolution> {
  const claimTransitions = target.transitions.filter(isClaimTransitionCandidate);
  const command = target.executionCommand;
  if (!command) return resolveMissingCommandArtifacts(target.status, claimTransitions.length);
  if (target.status === RefundAttemptStatus.REQUESTED) return { kind: "conflict" };
  if (command.refundAttemptId !== target.id) return { kind: "conflict" };
  const transition = await resolveCommandArtifactEvidence(reader, target, command, claimTransitions);
  if (!transition) return { kind: "conflict" };
  const operationKey = buildRefundExecutionClaimOperationKey(command.id);
  if (!matchesClaimTransition(transition, target.id, input, operationKey)) return { kind: "conflict" };
  return { kind: "replay", commandId: command.id };
}

export function validateFreshRefundExecutionClaim(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): ClaimRefundAttemptForExecutionFailure | null {
  const stateFailure = validateFreshClaimState(aggregate, target);
  if (stateFailure) return stateFailure;
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
  if (aggregate.cancellation && !hasCancellationAttemptProvenance(aggregate, target)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Cancellation refund provenance is inconsistent.");
  }
  return null;
}

function validateFreshClaimState(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
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
  return null;
}

export async function classifyExistingRefundExecutionClaim(
  client: PrismaClient,
  input: Pick<NormalizedClaimInput, "orderId" | "refundAttemptId">,
): Promise<ExistingRefundExecutionClaimClassification> {
  const aggregate = await loadRefundExecutionClaimAggregate(client, input.orderId);
  if (!aggregate) return "UNPROVEN";
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (!target || !hasHealthyClaimedAggregate(aggregate, target)) return "UNPROVEN";
  const command = target.executionCommand;
  if (!command || command.refundAttemptId !== target.id) return "UNPROVEN";
  const candidates = target.transitions.filter(isClaimTransitionCandidate);
  const transition = await resolveCommandArtifactEvidence(client, target, command, candidates);
  if (!transition || !hasCoherentStoredClaimDecision(transition, target.id, command.id)) return "UNPROVEN";
  return "HEALTHY_EXISTING_CLAIM";
}

function resolveMissingCommandArtifacts(
  status: RefundAttemptStatus,
  claimTransitionCount: number,
): ClaimArtifactResolution {
  if (claimTransitionCount > 0 || requiresExecutionCommand(status)) return { kind: "conflict" };
  return { kind: "none" };
}

async function resolveCommandArtifactEvidence(
  reader: ClaimArtifactReader,
  target: RefundExecutionClaimTarget,
  command: RefundExecutionCommand,
  claimTransitions: readonly RefundAttemptTransition[],
): Promise<RefundAttemptTransition | null> {
  const operationKey = buildRefundExecutionClaimOperationKey(command.id);
  const operationTransition = await reader.refundAttemptTransition.findUnique({ where: { operationKey } });
  if (!operationTransition || claimTransitions.length !== 1) return null;
  if (claimTransitions[0].id !== operationTransition.id) return null;
  if (resolveRefundRequestCreationEvidence(target.transitions, target).kind !== "matched") return null;
  return operationTransition;
}

function hasRefundablePayment(aggregate: RefundExecutionClaimAggregate): boolean {
  return aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(aggregate.payment.providerPaymentKey?.trim());
}

function hasConsistentAggregateIdentity(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  const payment = aggregate.payment;
  if (!hasConsistentOrderPaymentIdentity(aggregate)) return false;
  if (!hasConsistentRefundAttemptLedgerIdentity(payment, aggregate.refundAttempts)) return false;
  return hasInitialTargetIdentity(target, payment.id);
}

function hasConsistentOrderPaymentIdentity(aggregate: RefundExecutionClaimAggregate): boolean {
  return aggregate.paymentId === aggregate.payment.id
    && aggregate.totalAmount === aggregate.payment.amount
    && aggregate.currency === aggregate.payment.currency;
}

function hasInitialTargetIdentity(target: RefundExecutionClaimTarget, paymentId: string): boolean {
  return target.idempotencyKey === buildRefundAttemptIdempotencyKey(paymentId, target.id)
    && target.providerRefundId === null
    && target.processedAt === null
    && target.failedAt === null
    && target.failureCode === null
    && target.safeFailureMessage === null;
}

function hasSingleOpenTarget(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  const openAttempts = aggregate.refundAttempts.filter((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
  return openAttempts.length === 1 && openAttempts[0].id === target.id;
}

function hasValidReservedAmount(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  return validateRefundRequest({
    totalAmount: aggregate.payment.amount,
    currency: aggregate.payment.currency,
    requestedAmount: target.amount,
    requestedCurrency: target.currency,
    attempts: aggregate.refundAttempts.filter((attempt) => attempt.id !== target.id),
  }).ok;
}

function hasCoherentRequestCreation(target: RefundExecutionClaimTarget): boolean {
  return target.transitions.length === 1
    && resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched";
}

export function hasCancellationAttemptProvenance(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  const cancellation = aggregate.cancellation;
  if (!cancellation) return false;
  if (!hasCancellationClaimBaseFacts(aggregate, target)) return false;
  if (!hasCancellationTargetCreation(cancellation, target)) return false;
  if (!aggregate.refundAttempts.every((attempt) => isCancellationOwnedAttempt(cancellation, attempt))) return false;

  const otherAttempts = aggregate.refundAttempts.filter((attempt) => attempt.id !== target.id);
  const succeededBeforeTarget = sumSucceededAmounts(otherAttempts);
  if (succeededBeforeTarget === null) return false;
  const exactOutstanding = aggregate.payment.amount - succeededBeforeTarget;
  if (exactOutstanding <= 0 || target.amount !== exactOutstanding) return false;

  return hasExactRemainingCancellationLines(aggregate, target, otherAttempts);
}

function hasCancellationClaimBaseFacts(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  return [
    aggregate.cancellation?.orderId === aggregate.id,
    aggregate.cancellation?.requestedByUserId === aggregate.userId,
    target.actorType === RefundAttemptActorType.SYSTEM,
    target.actorUserId === null,
    resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched",
  ].every(Boolean);
}

function hasCancellationTargetCreation(
  cancellation: OrderCancellation,
  target: RefundExecutionClaimTarget,
): boolean {
  if (target.id === cancellation.initialRefundAttemptId) {
    return [
      target.reason === CUSTOMER_CANCELLATION_REFUND_REASON,
      target.requestedAt.getTime() === cancellation.acceptedAt.getTime(),
    ].every(Boolean);
  }
  return [
    target.reason === CANCELLATION_REFUND_REPLACEMENT_REASON,
    target.requestedAt.getTime() >= cancellation.acceptedAt.getTime(),
  ].every(Boolean);
}

function isCancellationOwnedAttempt(
  cancellation: OrderCancellation,
  attempt: RefundExecutionClaimTarget,
): boolean {
  if (attempt.requestedAt.getTime() < cancellation.acceptedAt.getTime()) return true;
  if (attempt.id === cancellation.initialRefundAttemptId) return true;
  return [
    attempt.actorType === RefundAttemptActorType.SYSTEM,
    attempt.actorUserId === null,
    attempt.reason === CANCELLATION_REFUND_REPLACEMENT_REASON,
    resolveRefundRequestCreationEvidence(attempt.transitions, attempt).kind === "matched",
  ].every(Boolean);
}

function sumSucceededAmounts(attempts: readonly RefundExecutionClaimTarget[]): number | null {
  let succeeded = 0;
  for (const attempt of attempts.filter((candidate) => candidate.status === RefundAttemptStatus.SUCCEEDED)) {
    if (!Number.isSafeInteger(attempt.amount) || attempt.amount <= 0) return null;
    succeeded += attempt.amount;
    if (!Number.isSafeInteger(succeeded)) return null;
  }
  return succeeded;
}

function hasExactRemainingCancellationLines(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
  otherAttempts: readonly RefundExecutionClaimTarget[],
): boolean {
  const capacity = deriveRefundLineCapacity(aggregate.id, aggregate.items, otherAttempts);
  if (!capacity.ok) return false;
  const exactRemainingLines = aggregate.items.flatMap((item) => {
    const quantity = capacity.remainingByOrderItemId.get(item.id);
    return quantity && quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
  });
  return exactRemainingLines.length > 0
    && sameCanonicalRefundLines(target.lines, exactRemainingLines);
}

function hasHealthyClaimedAggregate(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  return [
    aggregate.status === OrderStatus.REFUND_PENDING,
    target.status === RefundAttemptStatus.PROCESSING,
    hasRefundablePayment(aggregate),
    hasConsistentAggregateIdentity(aggregate, target),
    hasSingleOpenTarget(aggregate, target),
    hasValidReservedAmount(aggregate, target),
    !aggregate.cancellation || hasCancellationAttemptProvenance(aggregate, target),
  ].every(Boolean);
}

function hasCoherentStoredClaimDecision(
  transition: RefundAttemptTransition,
  refundAttemptId: string,
  commandId: string,
): boolean {
  const actorUserId = transition.actorUserId?.trim() ?? null;
  if (transition.actorType === RefundAttemptActorType.ADMIN && !actorUserId) return false;
  if (transition.actorType === RefundAttemptActorType.SYSTEM && actorUserId !== null) return false;
  return matchesClaimTransition(transition, refundAttemptId, {
    orderId: "stored-claim-classification",
    refundAttemptId,
    actorType: transition.actorType,
    actorUserId,
    now: transition.createdAt,
  }, buildRefundExecutionClaimOperationKey(commandId));
}
