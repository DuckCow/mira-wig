import { Prisma } from "@prisma/client";
import {
  identifyDispatchAuthorizationStructure,
  type DispatchAuthorizationContext,
  type DispatchAuthorizationHistory,
  type DispatchAuthorizationStructure,
} from "../../dispatch-authorization-contract";

export type AuthorizationTx = Prisma.TransactionClient;
export type Ownership = Readonly<{ orderId: string; refundAttemptId: string }>;
export type BindingWithProof = Prisma.RefundExecutionProviderOperationBindingGetPayload<{
  include: { eligibilityProof: true };
}>;
export type LockedTossAuthorizationState = Readonly<{
  context: DispatchAuthorizationContext;
  history: DispatchAuthorizationHistory;
  structure: DispatchAuthorizationStructure;
  binding: BindingWithProof | null;
  capturedAt: Date;
}>;
export type FreshTossLookupAuthority = Readonly<{
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  paymentKey: string;
  conservativeNoLaterThanLookupTimestamp: number;
}>;

export function isConservativeTossLookupTimeValid(
  authority: FreshTossLookupAuthority,
  phaseFourCapturedAt: Date,
): boolean {
  return authority.conservativeNoLaterThanLookupTimestamp <= phaseFourCapturedAt.getTime();
}

export async function discoverTossAuthorizationOwnership(
  tx: AuthorizationTx,
  commandId: string,
): Promise<Ownership | null> {
  const command = await tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command
    ? { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId }
    : null;
}

export async function lockAndLoadTossAuthorizationState(
  tx: AuthorizationTx,
  ownership: Ownership,
  commandId: string,
): Promise<LockedTossAuthorizationState | null> {
  if (!(await lockOwnershipRows(tx, ownership, commandId))) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  const target = aggregate.refundAttempts.find((row) => row.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  const context: DispatchAuthorizationContext = {
    aggregate,
    target,
    command: target.executionCommand,
  };
  const [history, binding, capturedAt] = await Promise.all([
    loadHistory(tx, commandId),
    tx.refundExecutionProviderOperationBinding.findUnique({
      where: { refundAttemptId: ownership.refundAttemptId },
      include: { eligibilityProof: true },
    }),
    captureDatabaseTime(tx),
  ]);
  const structure = identifyDispatchAuthorizationStructure(
    context.command.dispatchAttempt,
    history.dispatchAttempts,
  );
  return { context, history, structure, binding, capturedAt };
}

async function lockOwnershipRows(
  tx: AuthorizationTx,
  ownership: Ownership,
  commandId: string,
): Promise<boolean> {
  const order = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${ownership.orderId} FOR UPDATE
  `);
  if (order.length !== 1) return false;
  const attempt = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  if (attempt.length !== 1) return false;
  const command = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${ownership.refundAttemptId}
    FOR UPDATE
  `);
  return command.length === 1;
}

function loadAggregate(tx: AuthorizationTx, orderId: string) {
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

async function loadHistory(
  tx: AuthorizationTx,
  commandId: string,
): Promise<DispatchAuthorizationHistory> {
  const [events, dispatchAttempts, evidenceCount] = await Promise.all([
    tx.refundExecutionCommandEvent.findMany({ where: { commandId }, orderBy: { occurredAt: "asc" } }),
    tx.refundExecutionDispatchAttempt.findMany({ where: { commandId }, orderBy: { ordinal: "asc" } }),
    tx.refundExecutionEvidence.count({ where: { commandId } }),
  ]);
  return { events, dispatchAttempts, evidenceCount };
}

async function captureDatabaseTime(tx: AuthorizationTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative Toss refund authorization time.");
  }
  return rows[0].capturedAt;
}
