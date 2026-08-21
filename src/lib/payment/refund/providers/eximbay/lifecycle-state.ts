import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DispatchAuthorizationContext,
  DispatchAuthorizationHistory,
} from "../../dispatch-authorization-contract";

export type EximbayLifecycleTx = Prisma.TransactionClient;
export type EximbayLifecycleOwnership = Readonly<{
  orderId: string;
  refundAttemptId: string;
}>;

export type LockedEximbayLifecycleState = Readonly<{
  context: DispatchAuthorizationContext;
  history: DispatchAuthorizationHistory;
  binding: Awaited<ReturnType<typeof loadBinding>>;
  observations: Awaited<ReturnType<typeof loadObservations>>;
  evidence: Awaited<ReturnType<typeof loadEvidence>>;
  capturedAt: Date;
}>;

export async function discoverEximbayLifecycleOwnership(
  client: PrismaClient | EximbayLifecycleTx,
  commandId: string,
): Promise<EximbayLifecycleOwnership | null> {
  const command = await client.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command ? Object.freeze({
    orderId: command.refundAttempt.orderId,
    refundAttemptId: command.refundAttemptId,
  }) : null;
}

export async function lockAndLoadEximbayLifecycleState(
  tx: EximbayLifecycleTx,
  ownership: EximbayLifecycleOwnership,
  commandId: string,
): Promise<LockedEximbayLifecycleState | null> {
  const core = await lockCoreRows(tx, ownership, commandId);
  if (!core) return null;
  const bindingId = await discoverBindingId(tx, ownership.refundAttemptId);
  if (!(await lockPayment(tx, core.paymentId))) return null;
  if (bindingId && !(await lockBinding(tx, bindingId))) return null;
  await lockDispatches(tx, commandId);
  await lockEvidence(tx, commandId);
  await lockEvents(tx, commandId);
  return loadPostLockState(tx, ownership, commandId, core.paymentId, bindingId);
}

async function loadPostLockState(
  tx: EximbayLifecycleTx,
  ownership: EximbayLifecycleOwnership,
  commandId: string,
  paymentId: string,
  bindingId: string | null,
): Promise<LockedEximbayLifecycleState | null> {
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate || aggregate.payment.id !== paymentId) return null;
  const core = selectLifecycleCore(aggregate, ownership.refundAttemptId, commandId);
  if (!core) return null;
  const binding = await loadBinding(tx, ownership.refundAttemptId);
  if ((binding?.id ?? null) !== bindingId) return null;
  const [events, dispatchAttempts, observations, evidence, capturedAt] = await Promise.all([
    tx.refundExecutionCommandEvent.findMany({
      where: { commandId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
    tx.refundExecutionDispatchAttempt.findMany({
      where: { commandId }, orderBy: { ordinal: "asc" },
    }),
    binding ? loadObservations(tx, binding.id) : Promise.resolve([]),
    loadEvidence(tx, commandId),
    captureDatabaseTime(tx),
  ]);
  return Object.freeze({
    context: Object.freeze({ aggregate, target: core.target, command: core.command }),
    history: Object.freeze({ events, dispatchAttempts, evidenceCount: evidence.length }),
    binding,
    observations,
    evidence,
    capturedAt,
  });
}

function selectLifecycleCore(
  aggregate: NonNullable<Awaited<ReturnType<typeof loadAggregate>>>,
  refundAttemptId: string,
  commandId: string,
) {
  const target = aggregate.refundAttempts.find((row) => row.id === refundAttemptId);
  const command = target?.executionCommand;
  return target && command?.id === commandId ? Object.freeze({ target, command }) : null;
}

async function lockCoreRows(
  tx: EximbayLifecycleTx,
  ownership: EximbayLifecycleOwnership,
  commandId: string,
): Promise<Readonly<{ paymentId: string }> | null> {
  const order = await tx.$queryRaw<{ id: string; paymentId: string }[]>(Prisma.sql`
    SELECT "id", "paymentId" FROM "Order" WHERE "id" = ${ownership.orderId} FOR UPDATE
  `);
  if (order.length !== 1) return null;
  const attempts = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "orderId" = ${ownership.orderId} ORDER BY "id" FOR UPDATE
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
  tx: EximbayLifecycleTx,
  refundAttemptId: string,
): Promise<string | null> {
  const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId }, select: { id: true },
  });
  return binding?.id ?? null;
}

async function lockPayment(tx: EximbayLifecycleTx, paymentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockBinding(tx: EximbayLifecycleTx, bindingId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionProviderOperationBinding"
    WHERE "id" = ${bindingId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockDispatches(tx: EximbayLifecycleTx, commandId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionDispatchAttempt"
    WHERE "commandId" = ${commandId} ORDER BY "ordinal" FOR UPDATE
  `);
}

async function lockEvidence(tx: EximbayLifecycleTx, commandId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionEvidence"
    WHERE "commandId" = ${commandId} ORDER BY "id" FOR UPDATE
  `);
}

async function lockEvents(tx: EximbayLifecycleTx, commandId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommandEvent"
    WHERE "commandId" = ${commandId} ORDER BY "occurredAt", "id" FOR UPDATE
  `);
}

function loadAggregate(tx: EximbayLifecycleTx, orderId: string) {
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

function loadBinding(tx: EximbayLifecycleTx, refundAttemptId: string) {
  return tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId }, include: { eligibilityProof: true },
  });
}

function loadObservations(tx: EximbayLifecycleTx, bindingId: string) {
  return tx.refundExecutionEximbayPreflightObservation.findMany({
    where: { bindingId }, orderBy: [{ observingLeaseGeneration: "asc" }, { id: "asc" }],
  });
}

function loadEvidence(tx: EximbayLifecycleTx, commandId: string) {
  return tx.refundExecutionEvidence.findMany({
    where: { commandId }, orderBy: [{ observedAt: "asc" }, { id: "asc" }],
  });
}

async function captureDatabaseTime(tx: EximbayLifecycleTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative Eximbay refund lifecycle time.");
  }
  return rows[0].capturedAt;
}
