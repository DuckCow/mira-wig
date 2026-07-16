import { createHash } from "crypto";
import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  isRefundExecutionLeaseReleaseEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  normalizeReleaseRefundExecutionLeaseInput,
  releaseFailure as failure,
  releaseSuccess as success,
  type NormalizedReleaseRefundExecutionLeaseInput,
  type ReleaseRefundExecutionLeaseInput,
  type ReleaseRefundExecutionLeaseResult,
} from "./release-contract";
import {
  validateInitialRefundExecutionSuitability,
  type InitialExecutionAggregate,
  type InitialExecutionTarget,
} from "./execution-suitability";

type ActivationEnv = Readonly<Record<string, string | undefined>>;
type ReleaseTx = Prisma.TransactionClient;
type Ownership = Readonly<{ orderId: string; refundAttemptId: string }>;
type ReleaseContext = Readonly<{
  aggregate: InitialExecutionAggregate;
  target: InitialExecutionTarget;
  command: NonNullable<InitialExecutionTarget["executionCommand"]>;
}>;

class ReleaseFenceRollbackError extends Error {}
class ReleaseLedgerRollbackError extends Error {}

export async function releaseRefundExecutionLease(
  client: PrismaClient,
  input: ReleaseRefundExecutionLeaseInput,
  env: ActivationEnv = process.env,
): Promise<ReleaseRefundExecutionLeaseResult> {
  const normalized = normalizeReleaseRefundExecutionLeaseInput(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.$transaction((tx) => releaseInTransaction(tx, normalized.input, env));
  } catch (error) {
    if (error instanceof ReleaseFenceRollbackError) return fenceFailure();
    if (error instanceof ReleaseLedgerRollbackError) return ledgerFailure();
    throw error;
  }
}

async function releaseInTransaction(
  tx: ReleaseTx,
  input: NormalizedReleaseRefundExecutionLeaseInput,
  env: ActivationEnv,
): Promise<ReleaseRefundExecutionLeaseResult> {
  const gateFailure = validateGate(env);
  if (gateFailure) return gateFailure;
  const ownership = await discoverOwnership(tx, input.commandId);
  if (!ownership) return notFound();
  const context = await lockAndLoad(tx, ownership, input.commandId);
  if (!context) return notFound();
  const capturedAt = await captureDatabaseTime(tx);
  const replayFailure = await resolveReplay(tx, input);
  if (replayFailure) return replayFailure;
  const validationFailure = await validateRelease(tx, context, input);
  if (validationFailure) return validationFailure;
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  if (context.command.leaseTokenHash !== leaseTokenHash) return fenceFailure();
  return persistRelease(tx, context, input, leaseTokenHash, capturedAt);
}

async function persistRelease(
  tx: ReleaseTx,
  context: ReleaseContext,
  input: NormalizedReleaseRefundExecutionLeaseInput,
  leaseTokenHash: string,
  capturedAt: Date,
): Promise<ReleaseRefundExecutionLeaseResult> {
  const updated = await releaseByCompareAndSwap(tx, context, input, leaseTokenHash);
  if (updated !== 1) throw new ReleaseFenceRollbackError();
  try {
    await tx.refundExecutionCommandEvent.create({
      data: {
        commandId: context.command.id,
        eventType: RefundExecutionCommandEventType.PRE_CONTACT_RELEASED,
        leaseGeneration: input.leaseGeneration,
        dispatchAttempt: 0,
        occurredAt: capturedAt,
      },
    });
  } catch {
    throw new ReleaseLedgerRollbackError();
  }
  return success(context.command.id, context.target.id, context.aggregate.id, input.leaseGeneration);
}

function validateGate(env: ActivationEnv): ReleaseRefundExecutionLeaseResult | null {
  try {
    return isRefundExecutionLeaseReleaseEnabled(env)
      ? null
      : failure("FEATURE_DISABLED", "Refund execution lease release is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return failure("CONFIG_INVALID", "Refund execution lease release configuration is invalid.");
    }
    throw error;
  }
}

async function discoverOwnership(tx: ReleaseTx, commandId: string): Promise<Ownership | null> {
  const command = await tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command
    ? { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId }
    : null;
}

async function lockAndLoad(
  tx: ReleaseTx,
  ownership: Ownership,
  commandId: string,
): Promise<ReleaseContext | null> {
  if (!(await lockOwnershipRows(tx, ownership, commandId))) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  return contextFromAggregate(aggregate, ownership, commandId);
}

async function lockOwnershipRows(
  tx: ReleaseTx,
  ownership: Ownership,
  commandId: string,
): Promise<boolean> {
  if (!(await lockOrder(tx, ownership.orderId))) return false;
  if (!(await lockAttempt(tx, ownership))) return false;
  return lockCommand(tx, commandId, ownership.refundAttemptId);
}

function contextFromAggregate(
  aggregate: InitialExecutionAggregate,
  ownership: Ownership,
  commandId: string,
): ReleaseContext | null {
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  if (target.orderId !== ownership.orderId || target.executionCommand.refundAttemptId !== target.id) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function lockOrder(tx: ReleaseTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockAttempt(tx: ReleaseTx, ownership: Ownership): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockCommand(tx: ReleaseTx, commandId: string, refundAttemptId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${refundAttemptId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: ReleaseTx, orderId: string) {
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

async function captureDatabaseTime(tx: ReleaseTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative refund execution lease-release time.");
  }
  return rows[0].capturedAt;
}

function findEvent(
  tx: ReleaseTx, commandId: string, leaseGeneration: number, eventType: RefundExecutionCommandEventType,
) {
  return tx.refundExecutionCommandEvent.findUnique({
    where: { commandId_leaseGeneration_eventType: { commandId, leaseGeneration, eventType } },
  });
}

async function resolveReplay(
  tx: ReleaseTx,
  input: NormalizedReleaseRefundExecutionLeaseInput,
): Promise<ReleaseRefundExecutionLeaseResult | null> {
  const released = await findEvent(tx, input.commandId, input.leaseGeneration,
    RefundExecutionCommandEventType.PRE_CONTACT_RELEASED);
  return released ? alreadyReleased() : null;
}

async function validateRelease(
  tx: ReleaseTx,
  context: ReleaseContext,
  input: NormalizedReleaseRefundExecutionLeaseInput,
): Promise<ReleaseRefundExecutionLeaseResult | null> {
  const aggregateFailure = validateAggregate(context);
  if (aggregateFailure) return aggregateFailure;
  const evidenceCount = await tx.refundExecutionEvidence.count({ where: { commandId: input.commandId } });
  if (hasProviderContact(context, evidenceCount)) {
    return failure("NOT_PRE_CONTACT", "Refund execution command is not structurally pre-contact.");
  }
  if (context.command.dispatchAttempt < 0) return ledgerFailure();
  if (context.command.status !== RefundExecutionCommandStatus.LEASED
    || context.command.leaseGeneration !== input.leaseGeneration) return fenceFailure();
  const acquisition = await findEvent(tx, input.commandId, input.leaseGeneration,
    RefundExecutionCommandEventType.LEASE_ACQUIRED);
  if (!hasCoherentCurrentLease(context.command) || !hasCoherentAcquisitionEvent(acquisition, context.command.id)) {
    return ledgerFailure();
  }
  return null;
}

function hasProviderContact(context: ReleaseContext, evidenceCount: number): boolean {
  return context.command.dispatchAttempt > 0
    || evidenceCount > 0
    || context.target.providerRefundId !== null;
}

function validateAggregate(context: ReleaseContext): ReleaseRefundExecutionLeaseResult | null {
  if (context.aggregate.status !== OrderStatus.REFUND_PENDING) return ledgerFailure();
  if (context.target.status !== RefundAttemptStatus.PROCESSING) return ledgerFailure();
  if (context.aggregate.payment.status !== PaymentAttemptStatus.SUCCEEDED) return ledgerFailure();
  return validateInitialRefundExecutionSuitability(context.aggregate, context.target, context.command).ok
    ? null
    : ledgerFailure();
}

function hasCoherentCurrentLease(command: ReleaseContext["command"]): boolean {
  return Boolean(command.leaseOwner?.trim())
    && command.leaseUntil !== null
    && /^[0-9a-f]{64}$/.test(command.leaseTokenHash ?? "")
    && Number.isInteger(command.leaseGeneration)
    && command.leaseGeneration >= 1;
}

function hasCoherentAcquisitionEvent(
  acquisition: Awaited<ReturnType<typeof findEvent>>,
  commandId: string,
): boolean {
  return acquisition !== null
    && acquisition.commandId === commandId
    && acquisition.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    && acquisition.dispatchAttempt === 0
    && acquisition.leaseGeneration >= 1
    && acquisition.occurredAt instanceof Date;
}

function releaseByCompareAndSwap(
  tx: ReleaseTx,
  context: ReleaseContext,
  input: NormalizedReleaseRefundExecutionLeaseInput,
  leaseTokenHash: string,
): Promise<number> {
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      leaseGeneration: input.leaseGeneration,
      leaseTokenHash,
      dispatchAttempt: 0,
    },
    data: {
      status: RefundExecutionCommandStatus.READY,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
    },
  }).then((result) => result.count);
}

function notFound(): ReleaseRefundExecutionLeaseResult {
  return failure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
}

function alreadyReleased(): ReleaseRefundExecutionLeaseResult {
  return failure("ALREADY_RELEASED", "Refund execution lease was already released.");
}

function fenceFailure(): ReleaseRefundExecutionLeaseResult {
  return failure("LEASE_FENCE_MISMATCH", "Refund execution lease fence does not match.");
}

function ledgerFailure(): ReleaseRefundExecutionLeaseResult {
  return failure("LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}

export type {
  ReleaseRefundExecutionLeaseFailure,
  ReleaseRefundExecutionLeaseFailureCode,
  ReleaseRefundExecutionLeaseInput,
  ReleaseRefundExecutionLeaseResult,
} from "./release-contract";
