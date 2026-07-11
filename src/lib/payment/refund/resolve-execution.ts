import {
  OrderStatus,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  normalizeRefundAdapterResponse,
  resolutionFailure as failure,
  type NormalizedRefundAdapterResponse,
  type ResolveRefundAdapterResponseInput,
  type ResolveRefundAdapterResponseResult,
} from "./execution-result-contract";
import {
  buildResolutionPlan,
  validateFreshResolutionAggregate,
  validatePlanTransition,
  type ResolutionAggregate,
  type ResolutionTarget,
} from "./execution-result-plan";
import {
  persistResolution,
  ResolutionRollbackError,
} from "./execution-result-persistence";
import { resolveRefundEvidenceReplay } from "./execution-result-replay";

type ResolutionTx = Prisma.TransactionClient;
type LockedContext = {
  aggregate: ResolutionAggregate;
  target: ResolutionTarget;
  command: NonNullable<ResolutionTarget["executionCommand"]>;
};

export async function resolveRefundAdapterResponse(
  client: PrismaClient,
  input: ResolveRefundAdapterResponseInput,
): Promise<ResolveRefundAdapterResponseResult> {
  const normalized = normalizeRefundAdapterResponse(input);
  if (!normalized.ok) return normalized;
  const ownership = await discoverOwnership(client, normalized.input.commandId);
  if (!ownership) return failure("COMMAND_NOT_FOUND", "Refund execution command was not found.");
  try {
    return await runResolution(client, ownership, normalized.input);
  } catch (error) {
    if (error instanceof ResolutionRollbackError) return persistenceConflict();
    if (!isUniqueConflict(error)) throw error;
    return retryUniqueConflict(client, normalized.input);
  }
}

async function retryUniqueConflict(
  client: PrismaClient,
  input: NormalizedRefundAdapterResponse,
): Promise<ResolveRefundAdapterResponseResult> {
  const ownership = await discoverOwnership(client, input.commandId);
  if (!ownership) return failure("COMMAND_NOT_FOUND", "Refund execution command was not found.");
  try {
    return await runResolution(client, ownership, input);
  } catch (error) {
    if (error instanceof ResolutionRollbackError || isUniqueConflict(error)) return persistenceConflict();
    throw error;
  }
}

function runResolution(
  client: PrismaClient,
  ownership: { orderId: string; refundAttemptId: string },
  input: NormalizedRefundAdapterResponse,
): Promise<ResolveRefundAdapterResponseResult> {
  return client.$transaction((tx) => resolveInTransaction(tx, ownership, input));
}

async function resolveInTransaction(
  tx: ResolutionTx,
  ownership: { orderId: string; refundAttemptId: string },
  input: NormalizedRefundAdapterResponse,
): Promise<ResolveRefundAdapterResponseResult> {
  const locked = await lockAndLoad(tx, ownership, input.commandId);
  if (!locked.ok) return locked.result;
  const existing = await tx.refundExecutionEvidence.findUnique({ where: { sourceDedupKey: input.sourceDedupKey } });
  if (existing) return resolveRefundEvidenceReplay(tx, locked.context.target, existing, input);
  const freshFailure = validateFresh(locked.context, input);
  if (freshFailure) return freshFailure;
  const providerConflict = await hasProviderIdentityConflict(tx, locked.context.target, input);
  const plan = buildResolutionPlan(locked.context.aggregate, locked.context.target, input, providerConflict);
  if ("ok" in plan) return plan;
  if (!validatePlanTransition(plan)) return failure("REFUND_LEDGER_INCONSISTENT", "Resolution transition is invalid.");
  return persistResolution(tx, locked.context, input, plan);
}

async function discoverOwnership(client: PrismaClient, commandId: string) {
  const command = await client.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  if (!command) return null;
  return { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId };
}

async function lockAndLoad(
  tx: ResolutionTx,
  ownership: { orderId: string; refundAttemptId: string },
  commandId: string,
): Promise<{ ok: true; context: LockedContext } | { ok: false; result: ResolveRefundAdapterResponseResult }> {
  if (!(await lockOwnershipRows(tx, ownership, commandId))) return ownershipFailure();
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return ownershipFailure();
  const context = contextFromAggregate(aggregate, ownership.refundAttemptId, commandId);
  return context ? { ok: true, context } : ownershipFailure();
}

async function lockOwnershipRows(
  tx: ResolutionTx,
  ownership: { orderId: string; refundAttemptId: string },
  commandId: string,
): Promise<boolean> {
  if (!(await lockOrder(tx, ownership.orderId))) return false;
  if (!(await lockAttempt(tx, ownership))) return false;
  return lockCommand(tx, commandId, ownership.refundAttemptId);
}

function contextFromAggregate(
  aggregate: ResolutionAggregate,
  refundAttemptId: string,
  commandId: string,
): LockedContext | null {
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function lockOrder(tx: ResolutionTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockAttempt(
  tx: ResolutionTx,
  ownership: { orderId: string; refundAttemptId: string },
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockCommand(tx: ResolutionTx, commandId: string, refundAttemptId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${refundAttemptId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: ResolutionTx, orderId: string) {
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

function validateFresh(context: LockedContext, input: NormalizedRefundAdapterResponse) {
  if (context.aggregate.status !== OrderStatus.REFUND_PENDING) return commandStateFailure();
  if (context.target.status !== RefundAttemptStatus.PROCESSING) return commandStateFailure();
  if (context.command.status !== RefundExecutionCommandStatus.LEASED) return commandStateFailure();
  if (context.command.dispatchAttempt !== input.dispatchAttempt || context.command.dispatchAttempt <= 0) {
    return commandStateFailure();
  }
  return validateFreshResolutionAggregate(context.aggregate, context.target, context.command);
}

async function hasProviderIdentityConflict(
  tx: ResolutionTx,
  target: ResolutionTarget,
  input: NormalizedRefundAdapterResponse,
): Promise<boolean> {
  const observed = input.observedProviderRefundId;
  if (observed === null) return false;
  if (target.providerRefundId !== null && target.providerRefundId !== observed) return true;
  const owner = await tx.refundAttempt.findFirst({
    where: { provider: target.provider, providerRefundId: observed, id: { not: target.id } },
    select: { id: true },
  });
  return owner !== null;
}

function ownershipFailure(): { ok: false; result: ResolveRefundAdapterResponseResult } {
  return { ok: false, result: failure("COMMAND_ATTEMPT_MISMATCH", "Command ownership is inconsistent.") };
}

function commandStateFailure() {
  return failure("COMMAND_STATE_CONFLICT", "Command is not eligible for a fresh adapter response.");
}

function persistenceConflict() {
  return failure("PERSISTENCE_CONFLICT", "Refund execution persistence conflicted with stored state.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}

export type {
  ResolveRefundAdapterResponseFailureCode,
  ResolveRefundAdapterResponseInput,
  ResolveRefundAdapterResponseResult,
} from "./execution-result-contract";
