import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  CLAIM_TRANSITION_REASON,
  buildRefundExecutionClaimOperationKey,
  claimFailure as failure,
  claimSuccess as success,
  normalizeClaimInput,
  type ClaimRefundAttemptForExecutionFailure,
  type ClaimRefundAttemptForExecutionInput,
  type ClaimRefundAttemptForExecutionResult,
  type ClaimRefundAttemptForManualSandboxExecutionInput,
  type NormalizedClaimInput,
} from "./claim-contract";
import {
  loadRefundExecutionClaimAggregate,
  resolveRefundExecutionClaimArtifacts,
  validateFreshRefundExecutionClaim,
  type ClaimArtifactResolution,
  type RefundExecutionClaimAggregate,
  type RefundExecutionClaimTarget,
} from "./claim-evaluation";

type ClaimTx = Prisma.TransactionClient;

type ClaimCapability = "provider-neutral" | "manual-mock-sandbox";

export async function claimRefundAttemptForExecution(
  client: PrismaClient,
  input: ClaimRefundAttemptForExecutionInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  return runClaim(client, input, "provider-neutral");
}

export async function claimRefundAttemptForManualSandboxExecution(
  client: PrismaClient,
  input: ClaimRefundAttemptForManualSandboxExecutionInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  return runClaim(client, {
    ...input,
    actorType: RefundAttemptActorType.ADMIN,
  }, "manual-mock-sandbox");
}

async function runClaim(
  client: PrismaClient,
  input: ClaimRefundAttemptForExecutionInput,
  capability: ClaimCapability,
): Promise<ClaimRefundAttemptForExecutionResult> {
  const normalized = normalizeClaimInput(input);
  if (!normalized.ok) return normalized;

  try {
    return await client.$transaction((tx) => claimInTransaction(tx, normalized.input, capability));
  } catch (error) {
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, normalized.input, capability);
    throw error;
  }
}

async function claimInTransaction(
  tx: ClaimTx,
  input: NormalizedClaimInput,
  capability: ClaimCapability,
): Promise<ClaimRefundAttemptForExecutionResult> {
  if (!(await lockOrder(tx, input.orderId))) return failure("ORDER_NOT_FOUND", "Order was not found.");
  if (!(await lockTarget(tx, input))) {
    return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");
  }

  const aggregate = await loadRefundExecutionClaimAggregate(tx, input.orderId);
  if (!aggregate) return failure("ORDER_NOT_FOUND", "Order was not found.");
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (!target) return failure("REFUND_ATTEMPT_NOT_FOUND", "Refund attempt was not found for the order.");

  const capabilityFailure = validateClaimCapability(aggregate, capability);
  if (capabilityFailure) return capabilityFailure;

  const artifacts = await resolveRefundExecutionClaimArtifacts(tx, target, input);
  const existingArtifactResult = resultFromExistingArtifacts(target.id, artifacts);
  if (existingArtifactResult) return existingArtifactResult;

  const validationFailure = validateFreshRefundExecutionClaim(aggregate, target);
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

function resultFromExistingArtifacts(
  refundAttemptId: string,
  artifacts: ClaimArtifactResolution,
): ClaimRefundAttemptForExecutionResult | null {
  if (artifacts.kind === "replay") return success(refundAttemptId, artifacts.commandId, true);
  if (artifacts.kind === "conflict") {
    return failure("CLAIM_ARTIFACT_CONFLICT", "Refund execution claim evidence is inconsistent.");
  }
  return null;
}

function validateClaimCapability(
  aggregate: RefundExecutionClaimAggregate,
  capability: ClaimCapability,
): ClaimRefundAttemptForExecutionFailure | null {
  if (aggregate.payment.provider === PaymentProvider.EXIMBAY) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Eximbay refund execution is disabled.",
    );
  }
  if (capability === "provider-neutral") return null;
  if (aggregate.payment.provider === PaymentProvider.MOCK && aggregate.payment.mode === PaymentMode.SANDBOX) {
    return null;
  }
  return failure(
    "CLAIM_CAPABILITY_UNSUPPORTED",
    "Manual refund execution claim supports only MOCK payments in SANDBOX mode.",
  );
}

async function persistClaim(
  tx: ClaimTx,
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
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
  capability: ClaimCapability,
): Promise<ClaimRefundAttemptForExecutionResult> {
  const aggregate = await loadRefundExecutionClaimAggregate(client, input.orderId);
  if (!aggregate) return failure("CLAIM_ARTIFACT_CONFLICT", "Refund execution claim evidence is inconsistent.");
  const capabilityFailure = validateClaimCapability(aggregate, capability);
  if (capabilityFailure) return capabilityFailure;
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (target) {
    const artifacts = await resolveRefundExecutionClaimArtifacts(client, target, input);
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
  ClaimRefundAttemptForManualSandboxExecutionInput,
} from "./claim-contract";

export {
  classifyExistingRefundExecutionClaim,
  type ExistingRefundExecutionClaimClassification,
} from "./claim-evaluation";
