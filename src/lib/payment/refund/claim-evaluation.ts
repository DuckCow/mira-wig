import {
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type CustomerRefundIntake,
  type Order,
  type Payment,
  type PrismaClient,
  type RefundAttempt,
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

type ClaimArtifactReader = Pick<PrismaClient, "refundAttemptTransition">;
type ClaimAggregateReader = Pick<PrismaClient, "order">;

export type RefundExecutionClaimTarget = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  executionCommand: RefundExecutionCommand | null;
  approvedCustomerRefundIntake: CustomerRefundIntake | null;
};

export type RefundExecutionClaimAggregate = Order & {
  payment: Payment;
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
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          transitions: { orderBy: { createdAt: "asc" } },
          executionCommand: true,
          approvedCustomerRefundIntake: true,
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
