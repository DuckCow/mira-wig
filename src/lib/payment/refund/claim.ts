import {
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type CustomerRefundIntake,
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
  hasCancellationAttemptProvenance,
  type ClaimArtifactResolution,
  type RefundExecutionClaimAggregate,
  type RefundExecutionClaimTarget,
} from "./claim-evaluation";
import { hasExactEximbayCanaryClaimAuthority } from
  "./eximbay-refund-canary-claim-authority";
import type { EximbayCanaryAttendedAttestation } from
  "./eximbay-refund-canary-producer-contract";
import {
  isRefundExecutionClaimEnabled,
  isRefundExecutionEximbayClaimEnabled,
} from "./execution-activation";
import {
  buildRefundRequestOperationKey,
  resolveRefundRequestCreationEvidence,
} from "./request-evidence";

type ClaimTx = Prisma.TransactionClient;

type ClaimActivationEnv = Readonly<Record<string, string | undefined>>;

type ClaimCapability =
  | "provider-neutral"
  | "manual-mock-sandbox"
  | Readonly<{ kind: "admin-sandbox"; env: ClaimActivationEnv }>
  | Readonly<{
    kind: "eximbay-canary-system";
    authority: Readonly<{ attestation: EximbayCanaryAttendedAttestation }>;
  }>;

export type ClaimEximbayCanarySystemRefundInput = Readonly<{
  orderId: string;
  refundAttemptId: string;
  now: Date;
  attestation: EximbayCanaryAttendedAttestation;
}>;

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

export async function claimRefundAttemptForAdminSandboxExecution(
  client: PrismaClient,
  input: ClaimRefundAttemptForManualSandboxExecutionInput,
  env: ClaimActivationEnv = process.env,
): Promise<ClaimRefundAttemptForExecutionResult> {
  if (!isRefundExecutionClaimEnabled(env)) {
    return failure("CLAIM_CAPABILITY_UNSUPPORTED", "Refund execution claim is disabled.");
  }
  return runClaim(client, {
    ...input,
    actorType: RefundAttemptActorType.ADMIN,
  }, Object.freeze({ kind: "admin-sandbox", env }));
}

export async function claimRefundAttemptForEximbayCanarySystemExecution(
  client: PrismaClient,
  input: ClaimEximbayCanarySystemRefundInput,
): Promise<ClaimRefundAttemptForExecutionResult> {
  return runClaim(client, {
    orderId: input.orderId,
    refundAttemptId: input.refundAttemptId,
    now: input.now,
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: null,
  }, Object.freeze({
    kind: "eximbay-canary-system",
    authority: Object.freeze({ attestation: input.attestation }),
  }));
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

  const capabilityFailure = await validateClaimCapabilityWithCurrentAuthority(
    tx, aggregate, target, input, capability,
  );
  if (capabilityFailure) return capabilityFailure;

  const artifacts = await resolveRefundExecutionClaimArtifacts(tx, target, input);
  const existingArtifactResult = resultFromExistingArtifacts(target.id, artifacts);
  if (existingArtifactResult) return existingArtifactResult;

  const validationFailure = validateFreshRefundExecutionClaim(aggregate, target);
  if (validationFailure) return validationFailure;
  return persistClaim(tx, aggregate, target, input);
}

async function validateClaimCapabilityWithCurrentAuthority(
  tx: ClaimTx,
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
  input: NormalizedClaimInput,
  capability: ClaimCapability,
): Promise<ClaimRefundAttemptForExecutionFailure | null> {
  if (isEximbayCanaryCapability(capability)
    && !(await hasExactEximbayCanaryClaimAuthority(
      tx, aggregate, target, input, capability.authority,
    ))) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Refund attempt is not an exact fresh synthetic Eximbay SYSTEM canary target.",
    );
  }
  return validateClaimCapability(aggregate, target, capability);
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
  target: RefundExecutionClaimTarget,
  capability: ClaimCapability,
): ClaimRefundAttemptForExecutionFailure | null {
  if (aggregate.cancellation && !hasCancellationAttemptProvenance(aggregate, target)) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Cancellation refund execution provenance is unsupported.",
    );
  }
  if (aggregate.payment.provider === PaymentProvider.EXIMBAY) {
    return validateEximbayClaimCapability(aggregate, target, capability);
  }
  if (isEximbayCanaryCapability(capability)) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Eximbay canary claim authority requires an Eximbay payment.",
    );
  }
  if (capability === "provider-neutral") return null;
  if (aggregate.payment.provider === PaymentProvider.MOCK
    && aggregate.payment.mode === PaymentMode.SANDBOX) {
    return null;
  }
  return failure(
    "CLAIM_CAPABILITY_UNSUPPORTED",
    "Manual refund execution claim supports only MOCK payments in SANDBOX mode.",
  );
}

function validateEximbayClaimCapability(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
  capability: ClaimCapability,
): ClaimRefundAttemptForExecutionFailure | null {
  if (isEximbayCanaryCapability(capability)) {
    return validateEximbayCanaryClaimCapability(aggregate, target);
  }
  if (typeof capability === "string" || !isRefundExecutionEximbayClaimEnabled(capability.env)) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Eximbay refund execution claim is disabled.",
    );
  }
  if (!isSupportedEximbaySandboxIdentity(aggregate, target)
    || !hasEximbayClaimProvenance(aggregate, target)) {
    return failure(
      "CLAIM_CAPABILITY_UNSUPPORTED",
      "Eximbay refund execution claim authority is unsupported.",
    );
  }
  if (aggregate.payment.adapterExecutionKind !== PaymentAdapterExecutionKind.EXTERNAL
    || aggregate.payment.attemptLifecycle !== PaymentAttemptLifecycle.FINALIZED) {
    return failure(
      "PAYMENT_NOT_REFUNDABLE",
      "Payment is not eligible for Eximbay refund execution.",
    );
  }
  return null;
}

function isEximbayCanaryCapability(
  capability: ClaimCapability,
): capability is Extract<ClaimCapability, { kind: "eximbay-canary-system" }> {
  return typeof capability !== "string" && capability.kind === "eximbay-canary-system";
}

function validateEximbayCanaryClaimCapability(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): ClaimRefundAttemptForExecutionFailure | null {
  const payment = aggregate.payment;
  const exact = [
    target.actorType === RefundAttemptActorType.SYSTEM,
    target.actorUserId === null,
    target.provider === PaymentProvider.EXIMBAY,
    target.mode === PaymentMode.SANDBOX,
    target.currency === "USD",
    target.amount === payment.amount,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    payment.currency === "USD",
    payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
  ].every(Boolean);
  return exact ? null : failure(
    "CLAIM_CAPABILITY_UNSUPPORTED",
    "Refund attempt is not an exact Eximbay SYSTEM canary target.",
  );
}

function isSupportedEximbaySandboxIdentity(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  const payment = aggregate.payment;
  return target.provider === PaymentProvider.EXIMBAY
    && target.mode === PaymentMode.SANDBOX
    && payment.mode === PaymentMode.SANDBOX
    && isSupportedEximbayRefundCurrency(target.currency)
    && target.currency === payment.currency
    && payment.currency === aggregate.currency;
}

function isSupportedEximbayRefundCurrency(currency: string): boolean {
  return currency === "USD" || currency === "JPY";
}

function hasApprovedCustomerIntakeProvenance(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): boolean {
  const intake = target.approvedCustomerRefundIntake;
  if (intake === null) return false;
  return hasApprovedIntakeIdentity(aggregate, target, intake)
    && hasApprovedIntakeActorProvenance(target, intake);
}

function hasApprovedIntakeIdentity(
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
  intake: CustomerRefundIntake,
): boolean {
  return intake.status === CustomerRefundIntakeStatus.APPROVED
    && intake.orderId === aggregate.id
    && intake.customerUserId === aggregate.userId
    && intake.approvedRefundAttemptId === target.id;
}

function hasApprovedIntakeActorProvenance(
  target: RefundExecutionClaimTarget,
  intake: CustomerRefundIntake,
): boolean {
  const actorUserId = target.actorUserId?.trim();
  const creation = target.transitions.find((transition) => (
    transition.operationKey === buildRefundRequestOperationKey(target.id)
  ));
  return [
    target.actorType === RefundAttemptActorType.ADMIN,
    Boolean(actorUserId),
    intake.reviewedByUserId === actorUserId,
    resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched",
    creation?.createdAt.getTime() === target.requestedAt.getTime(),
    target.requestedAt.getTime() === intake.reviewedAt?.getTime(),
  ].every(Boolean);
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
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === input.refundAttemptId);
  if (target) {
    const capabilityFailure = validateClaimCapability(aggregate, target, capability);
    if (capabilityFailure) return capabilityFailure;
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

function hasEximbayClaimProvenance(aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget): boolean {
  return hasApprovedCustomerIntakeProvenance(aggregate, target)
    || hasCancellationAttemptProvenance(aggregate, target);
}
