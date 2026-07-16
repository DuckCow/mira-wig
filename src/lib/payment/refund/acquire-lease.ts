import { createHash, randomBytes } from "crypto";
import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  isRefundExecutionLeaseEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  leaseFailure as failure,
  leaseSuccess as success,
  normalizeAcquireRefundExecutionLeaseInput,
  type AcquireRefundExecutionLeaseInput,
  type AcquireRefundExecutionLeaseResult,
  type NormalizedAcquireRefundExecutionLeaseInput,
} from "./lease-contract";
import {
  validateInitialRefundExecutionSuitability,
  type InitialExecutionAggregate,
  type InitialExecutionTarget,
} from "./execution-suitability";

export const REFUND_EXECUTION_LEASE_DURATION_MS = 5 * 60 * 1000;

const POSTGRES_INT_MAX = 2_147_483_647;
type ActivationEnv = Readonly<Record<string, string | undefined>>;
type LeaseTx = Prisma.TransactionClient;
type Ownership = Readonly<{ orderId: string; refundAttemptId: string }>;
type LeaseContext = Readonly<{
  aggregate: InitialExecutionAggregate;
  target: InitialExecutionTarget;
  command: NonNullable<InitialExecutionTarget["executionCommand"]>;
}>;

class LeaseAcquisitionRollbackError extends Error {}

export async function acquireRefundExecutionLease(
  client: PrismaClient,
  input: AcquireRefundExecutionLeaseInput,
  env: ActivationEnv = process.env,
): Promise<AcquireRefundExecutionLeaseResult> {
  const normalized = normalizeAcquireRefundExecutionLeaseInput(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.$transaction((tx) => acquireInTransaction(tx, normalized.input, env));
  } catch (error) {
    if (error instanceof LeaseAcquisitionRollbackError) {
      return failure("LEASE_CONFLICT", "Refund execution lease acquisition conflicted.");
    }
    throw error;
  }
}

async function acquireInTransaction(
  tx: LeaseTx,
  input: NormalizedAcquireRefundExecutionLeaseInput,
  env: ActivationEnv,
): Promise<AcquireRefundExecutionLeaseResult> {
  const gateFailure = validateGate(env);
  if (gateFailure) return gateFailure;
  const ownership = await discoverOwnership(tx, input.commandId);
  if (!ownership) return notFound();
  const context = await lockAndLoad(tx, ownership, input.commandId);
  if (!context) return notFound();
  const evidenceCount = await tx.refundExecutionEvidence.count({ where: { commandId: input.commandId } });
  const capturedAt = await captureDatabaseTime(tx);
  const eligibilityFailure = validateEligibility(context, evidenceCount, capturedAt);
  if (eligibilityFailure) return eligibilityFailure;
  const leaseToken = randomBytes(32).toString("hex");
  const leaseTokenHash = createHash("sha256").update(leaseToken, "utf8").digest("hex");
  const leaseUntil = new Date(capturedAt.getTime() + REFUND_EXECUTION_LEASE_DURATION_MS);
  const nextGeneration = context.command.leaseGeneration + 1;
  const updated = await acquireByCompareAndSwap(
    tx,
    context,
    input,
    capturedAt,
    leaseUntil,
    nextGeneration,
    leaseTokenHash,
  );
  if (updated !== 1) throw new LeaseAcquisitionRollbackError();
  return success(
    context.command.id,
    context.target.id,
    context.aggregate.id,
    nextGeneration,
    leaseToken,
    leaseUntil,
  );
}

function validateGate(env: ActivationEnv): AcquireRefundExecutionLeaseResult | null {
  try {
    return isRefundExecutionLeaseEnabled(env)
      ? null
      : failure("FEATURE_DISABLED", "Refund execution lease acquisition is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return failure("CONFIG_INVALID", "Refund execution lease configuration is invalid.");
    }
    throw error;
  }
}

async function discoverOwnership(tx: LeaseTx, commandId: string): Promise<Ownership | null> {
  const command = await tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command
    ? { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId }
    : null;
}

async function lockAndLoad(
  tx: LeaseTx,
  ownership: Ownership,
  commandId: string,
): Promise<LeaseContext | null> {
  if (!(await lockOwnershipRows(tx, ownership, commandId))) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  return contextFromAggregate(aggregate, ownership, commandId);
}

async function lockOwnershipRows(
  tx: LeaseTx,
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
): LeaseContext | null {
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  if (target.orderId !== ownership.orderId || target.executionCommand.refundAttemptId !== target.id) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function lockOrder(tx: LeaseTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockAttempt(tx: LeaseTx, ownership: Ownership): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockCommand(tx: LeaseTx, commandId: string, refundAttemptId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${refundAttemptId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: LeaseTx, orderId: string) {
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

async function captureDatabaseTime(tx: LeaseTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative refund execution lease time.");
  }
  return rows[0].capturedAt;
}

function validateEligibility(
  context: LeaseContext,
  evidenceCount: number,
  capturedAt: Date,
): AcquireRefundExecutionLeaseResult | null {
  const commandFailure = classifyCommandState(context, capturedAt);
  if (commandFailure) return commandFailure;
  return validateReadyAggregate(context, evidenceCount);
}

function classifyCommandState(
  context: LeaseContext,
  capturedAt: Date,
): AcquireRefundExecutionLeaseResult | null {
  if (context.command.status === RefundExecutionCommandStatus.LEASED) {
    return isCoherentLease(context.command)
      ? failure("LEASE_CONFLICT", "Refund execution command already has a lease.")
      : ledgerFailure();
  }
  if (context.command.status !== RefundExecutionCommandStatus.READY) {
    return failure("COMMAND_NOT_READY", "Refund execution command is not ready.");
  }
  if (context.command.availableAt.getTime() > capturedAt.getTime()) {
    return failure("NOT_YET_AVAILABLE", "Refund execution command is not yet available.");
  }
  return null;
}

function validateReadyAggregate(
  context: LeaseContext,
  evidenceCount: number,
): AcquireRefundExecutionLeaseResult | null {
  if (!isPaymentExecutable(context)) {
    return failure("PAYMENT_NOT_EXECUTABLE", "Payment is not executable for refund leasing.");
  }
  if (hasCorruptReadyLeaseState(context) || evidenceCount !== 0) return ledgerFailure();
  if (context.aggregate.status !== OrderStatus.REFUND_PENDING
    || context.target.status !== RefundAttemptStatus.PROCESSING) return ledgerFailure();
  if (!validateInitialRefundExecutionSuitability(context.aggregate, context.target, context.command).ok) {
    return ledgerFailure();
  }
  return null;
}

function isPaymentExecutable(context: LeaseContext): boolean {
  return context.aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && Boolean(context.aggregate.payment.providerPaymentKey?.trim());
}

function hasCorruptReadyLeaseState(context: LeaseContext): boolean {
  const command = context.command;
  return command.dispatchAttempt !== 0
    || command.leaseOwner !== null
    || command.leaseUntil !== null
    || command.leaseTokenHash !== null
    || !Number.isInteger(command.leaseGeneration)
    || command.leaseGeneration < 0
    || command.leaseGeneration >= POSTGRES_INT_MAX
    || context.target.providerRefundId !== null;
}

function isCoherentLease(command: LeaseContext["command"]): boolean {
  return Boolean(command.leaseOwner?.trim())
    && command.leaseUntil !== null
    && /^[0-9a-f]{64}$/.test(command.leaseTokenHash ?? "")
    && Number.isInteger(command.leaseGeneration)
    && command.leaseGeneration >= 1;
}

function acquireByCompareAndSwap(
  tx: LeaseTx,
  context: LeaseContext,
  input: NormalizedAcquireRefundExecutionLeaseInput,
  capturedAt: Date,
  leaseUntil: Date,
  nextGeneration: number,
  leaseTokenHash: string,
): Promise<number> {
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.READY,
      availableAt: { lte: capturedAt },
      dispatchAttempt: 0,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
      leaseGeneration: context.command.leaseGeneration,
    },
    data: {
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: input.leaseOwner,
      leaseUntil,
      leaseGeneration: nextGeneration,
      leaseTokenHash,
    },
  }).then((result) => result.count);
}

function notFound(): AcquireRefundExecutionLeaseResult {
  return failure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
}

function ledgerFailure(): AcquireRefundExecutionLeaseResult {
  return failure("LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}

export type {
  AcquireRefundExecutionLeaseFailure,
  AcquireRefundExecutionLeaseFailureCode,
  AcquireRefundExecutionLeaseResult,
  RefundExecutionLeaseHandle,
} from "./lease-contract";
