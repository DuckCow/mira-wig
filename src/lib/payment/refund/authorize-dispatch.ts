import {
  OrderStatus,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  dispatchFailure as failure,
  dispatchSuccess as success,
  normalizeAuthorizeRefundDispatchInput,
  type AuthorizeRefundDispatchInput,
  type AuthorizeRefundDispatchResult,
  type NormalizedAuthorizeRefundDispatchInput,
} from "./dispatch-contract";
import {
  validateInitialRefundExecutionSuitability,
  type InitialExecutionAggregate,
  type InitialExecutionTarget,
} from "./execution-suitability";
import { RefundProviderContractError, normalizeRefundProviderRequest } from "./provider-port";

const POSTGRES_INT_MAX = 2_147_483_647;
type DispatchTx = Prisma.TransactionClient;
type Ownership = { orderId: string; refundAttemptId: string };
type DispatchContext = {
  aggregate: InitialExecutionAggregate;
  target: InitialExecutionTarget;
  command: NonNullable<InitialExecutionTarget["executionCommand"]>;
};

export async function authorizeRefundDispatch(
  client: PrismaClient,
  input: AuthorizeRefundDispatchInput,
): Promise<AuthorizeRefundDispatchResult> {
  const normalized = normalizeAuthorizeRefundDispatchInput(input);
  if (!normalized.ok) return normalized;
  const ownership = await discoverOwnership(client, normalized.input.commandId);
  if (!ownership) return failure("COMMAND_NOT_FOUND", "Refund execution command was not found.");
  return client.$transaction((tx) => authorizeInTransaction(tx, ownership, normalized.input));
}

async function authorizeInTransaction(
  tx: DispatchTx,
  ownership: Ownership,
  input: NormalizedAuthorizeRefundDispatchInput,
): Promise<AuthorizeRefundDispatchResult> {
  const context = await lockAndLoad(tx, ownership, input.commandId);
  if (!context) return failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
  const eligibilityFailure = validateAuthorizationEligibility(context, input);
  if (eligibilityFailure) return eligibilityFailure;
  const suitability = validateInitialRefundExecutionSuitability(context.aggregate, context.target, context.command);
  if (!suitability.ok) return failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
  const providerRequest = deriveProviderRequest(context);
  if (!providerRequest) return failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
  const dispatchAttempt = context.command.dispatchAttempt + 1;
  const update = await leaseCommand(tx, context, input, dispatchAttempt);
  if (update !== 1) return failure("PERSISTENCE_CONFLICT", "Refund dispatch authorization conflicted.");
  return success(context.command.id, context.target.id, dispatchAttempt, input.leaseUntil, providerRequest);
}

function validateAuthorizationEligibility(
  context: DispatchContext,
  input: NormalizedAuthorizeRefundDispatchInput,
): AuthorizeRefundDispatchResult | null {
  if (context.aggregate.status !== OrderStatus.REFUND_PENDING
    || context.target.status !== RefundAttemptStatus.PROCESSING) {
    return failure("COMMAND_STATE_CONFLICT", "Refund execution state does not allow dispatch.");
  }
  if (context.command.status !== RefundExecutionCommandStatus.READY) {
    return failure("COMMAND_NOT_READY", "Refund execution command is not ready.");
  }
  if (context.command.availableAt.getTime() > input.now.getTime()) {
    return failure("COMMAND_NOT_YET_AVAILABLE", "Refund execution command is not yet available.");
  }
  if (hasCorruptInitialDispatchState(context)) {
    return failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
  }
  if (context.command.dispatchAttempt >= POSTGRES_INT_MAX) {
    return failure("DISPATCH_ATTEMPT_EXHAUSTED", "Refund dispatch attempt limit is exhausted.");
  }
  return null;
}

function hasCorruptInitialDispatchState(context: DispatchContext): boolean {
  return context.command.leaseOwner !== null
    || context.command.leaseUntil !== null
    || context.target.providerRefundId !== null
    || context.command.dispatchAttempt < 0;
}

function deriveProviderRequest(context: DispatchContext) {
  const providerPaymentReference = context.aggregate.payment.providerPaymentKey;
  if (providerPaymentReference === null) return null;
  try {
    return normalizeRefundProviderRequest({
      providerPaymentReference,
      amount: context.target.amount,
      currency: context.target.currency,
      operationKey: context.target.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof RefundProviderContractError) return null;
    throw error;
  }
}

function discoverOwnership(client: PrismaClient, commandId: string): Promise<Ownership | null> {
  return client.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  }).then((command) => command
    ? { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId }
    : null);
}

async function lockAndLoad(
  tx: DispatchTx,
  ownership: Ownership,
  commandId: string,
): Promise<DispatchContext | null> {
  if (!(await lockOrder(tx, ownership.orderId))) return null;
  if (!(await lockAttempt(tx, ownership))) return null;
  if (!(await lockCommand(tx, commandId, ownership.refundAttemptId))) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function lockOrder(tx: DispatchTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockAttempt(tx: DispatchTx, ownership: Ownership): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockCommand(tx: DispatchTx, commandId: string, refundAttemptId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${refundAttemptId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadAggregate(tx: DispatchTx, orderId: string) {
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

function leaseCommand(
  tx: DispatchTx,
  context: DispatchContext,
  input: NormalizedAuthorizeRefundDispatchInput,
  dispatchAttempt: number,
): Promise<number> {
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.READY,
      leaseOwner: null,
      leaseUntil: null,
      availableAt: { lte: input.now },
      dispatchAttempt: context.command.dispatchAttempt,
    },
    data: {
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: input.leaseOwner,
      leaseUntil: input.leaseUntil,
      dispatchAttempt,
    },
  }).then((result) => result.count);
}

export type {
  AuthorizedRefundDispatch,
  AuthorizeRefundDispatchFailure,
  AuthorizeRefundDispatchFailureCode,
  AuthorizeRefundDispatchInput,
  AuthorizeRefundDispatchResult,
} from "./dispatch-contract";
