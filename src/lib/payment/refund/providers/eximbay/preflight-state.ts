import { PaymentMode, PaymentProvider, Prisma, type PrismaClient } from "@prisma/client";
import {
  identifyDispatchAuthorizationStructure,
  type DispatchAuthorizationContext,
  type DispatchAuthorizationHistory,
  type DispatchAuthorizationStructure,
} from "../../dispatch-authorization-contract";

export type EximbayPreflightTx = Prisma.TransactionClient;
export type EximbayPreflightOwnership = Readonly<{
  orderId: string;
  refundAttemptId: string;
}>;

export type LockedEximbayPreflightState = Readonly<{
  context: DispatchAuthorizationContext;
  history: DispatchAuthorizationHistory;
  structure: DispatchAuthorizationStructure;
  binding: Awaited<ReturnType<typeof loadBinding>>;
  observation: Awaited<ReturnType<typeof loadObservation>>;
  capturedAt: Date;
}>;

export async function discoverEximbayPreflightOwnership(
  client: PrismaClient | EximbayPreflightTx,
  commandId: string,
): Promise<EximbayPreflightOwnership | null> {
  const command = await client.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command ? Object.freeze({
    orderId: command.refundAttempt.orderId,
    refundAttemptId: command.refundAttemptId,
  }) : null;
}

export async function lockAndLoadEximbayPreflightState(
  tx: EximbayPreflightTx,
  ownership: EximbayPreflightOwnership,
  commandId: string,
  leaseGeneration: number,
): Promise<LockedEximbayPreflightState | null> {
  const coreIdentity = await lockCoreRows(tx, ownership, commandId);
  if (!coreIdentity) return null;
  const bindingId = await discoverBindingId(tx, ownership.refundAttemptId);
  if (!(await lockMutableRows(tx, coreIdentity.paymentId, bindingId))) return null;
  await lockDispatches(tx, commandId);

  return loadPostLockState(
    tx, ownership, commandId, leaseGeneration, coreIdentity.paymentId, bindingId,
  );
}

async function loadPostLockState(
  tx: EximbayPreflightTx,
  ownership: EximbayPreflightOwnership,
  commandId: string,
  leaseGeneration: number,
  paymentId: string,
  bindingId: string | null,
): Promise<LockedEximbayPreflightState | null> {
  const core = await loadLockedCore(tx, ownership, commandId, paymentId);
  if (!core) return null;
  const { aggregate, target, command } = core;
  const binding = await loadBinding(tx, ownership.refundAttemptId);
  if ((binding?.id ?? null) !== bindingId) return null;
  const context: DispatchAuthorizationContext = {
    aggregate,
    target,
    command,
  };
  const [history, observation, capturedAt] = await Promise.all([
    loadHistory(tx, commandId),
    binding ? loadObservation(tx, binding.id, leaseGeneration) : Promise.resolve(null),
    captureDatabaseTime(tx),
  ]);
  return Object.freeze({
    context,
    history,
    structure: identifyDispatchAuthorizationStructure(
      context.command.dispatchAttempt,
      history.dispatchAttempts,
    ),
    binding,
    observation,
    capturedAt,
  });
}

async function lockMutableRows(
  tx: EximbayPreflightTx,
  paymentId: string,
  bindingId: string | null,
): Promise<boolean> {
  if (!(await lockPayment(tx, paymentId))) return false;
  return !bindingId || lockBinding(tx, bindingId);
}

async function loadLockedCore(
  tx: EximbayPreflightTx,
  ownership: EximbayPreflightOwnership,
  commandId: string,
  paymentId: string,
) {
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate || aggregate.payment.id !== paymentId) return null;
  const target = aggregate.refundAttempts.find((row) => row.id === ownership.refundAttemptId);
  if (!target) return null;
  const command = target.executionCommand;
  return command?.id === commandId ? { aggregate, target, command } : null;
}

export function isEximbayRefundContext(context: DispatchAuthorizationContext): boolean {
  const payment = context.aggregate.payment;
  const target = context.target;
  return [
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    target.provider === PaymentProvider.EXIMBAY,
    target.mode === PaymentMode.SANDBOX,
    payment.providerOrderId !== null,
    payment.providerPaymentKey !== null,
    payment.amount === context.aggregate.totalAmount,
    payment.currency === context.aggregate.currency,
    target.paymentId === payment.id,
    target.currency === payment.currency,
  ].every(Boolean);
}

async function lockCoreRows(
  tx: EximbayPreflightTx,
  ownership: EximbayPreflightOwnership,
  commandId: string,
): Promise<Readonly<{ paymentId: string }> | null> {
  const order = await tx.$queryRaw<{ id: string; paymentId: string }[]>(Prisma.sql`
    SELECT "id", "paymentId" FROM "Order" WHERE "id" = ${ownership.orderId} FOR UPDATE
  `);
  if (order.length !== 1) return null;
  const attempts = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "orderId" = ${ownership.orderId}
    ORDER BY "id" FOR UPDATE
  `);
  if (!attempts.some((row) => row.id === ownership.refundAttemptId)) return null;
  const command = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${ownership.refundAttemptId}
    FOR UPDATE
  `);
  return command.length === 1 ? Object.freeze({ paymentId: order[0].paymentId }) : null;
}

async function discoverBindingId(
  tx: EximbayPreflightTx,
  refundAttemptId: string,
): Promise<string | null> {
  const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId },
    select: { id: true },
  });
  return binding?.id ?? null;
}

async function lockPayment(tx: EximbayPreflightTx, paymentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockBinding(tx: EximbayPreflightTx, bindingId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionProviderOperationBinding"
    WHERE "id" = ${bindingId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockDispatches(tx: EximbayPreflightTx, commandId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionDispatchAttempt"
    WHERE "commandId" = ${commandId} ORDER BY "ordinal" FOR UPDATE
  `);
}

function loadAggregate(tx: EximbayPreflightTx, orderId: string) {
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

function loadBinding(tx: EximbayPreflightTx, refundAttemptId: string) {
  return tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId },
    include: { eligibilityProof: true },
  });
}

function loadObservation(
  tx: EximbayPreflightTx,
  bindingId: string,
  observingLeaseGeneration: number,
) {
  return tx.refundExecutionEximbayPreflightObservation.findUnique({
    where: { bindingId_observingLeaseGeneration: { bindingId, observingLeaseGeneration } },
  });
}

async function loadHistory(
  tx: EximbayPreflightTx,
  commandId: string,
): Promise<DispatchAuthorizationHistory> {
  const [events, dispatchAttempts, evidenceCount] = await Promise.all([
    tx.refundExecutionCommandEvent.findMany({
      where: { commandId }, orderBy: { occurredAt: "asc" },
    }),
    tx.refundExecutionDispatchAttempt.findMany({
      where: { commandId }, orderBy: { ordinal: "asc" },
    }),
    tx.refundExecutionEvidence.count({ where: { commandId } }),
  ]);
  return { events, dispatchAttempts, evidenceCount };
}

async function captureDatabaseTime(tx: EximbayPreflightTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative Eximbay preflight time.");
  }
  return rows[0].capturedAt;
}
