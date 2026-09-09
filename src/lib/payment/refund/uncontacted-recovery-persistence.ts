import { createHash, randomBytes } from "node:crypto";
import {
  Prisma,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import { REFUND_EXECUTION_LEASE_DURATION_MS } from "./acquire-lease";
import {
  isRefundExecutionUncontactedRecoveryEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import { leaseSuccess } from "./lease-contract";
import {
  reclaimFailure,
  type NormalizedReclaimUncontactedRefundExecutionInput,
  type ReclaimUncontactedRefundExecutionResult,
} from "./uncontacted-recovery-contract";
import {
  classifyUncontactedRefundExecutionState,
  uncontactedRecoveryAggregateArgs,
  type LockedUncontactedRecoveryState,
  type UncontactedRecoveryAggregate,
  type UncontactedRecoveryCommand,
  type UncontactedRecoveryTarget,
  type UncontactedRecoveryClassification,
} from "./uncontacted-recovery-state";

type RecoveryTx = Prisma.TransactionClient;
type ActivationEnv = Readonly<Record<string, string | undefined>>;
type Ownership = Readonly<{ orderId: string; refundAttemptId: string }>;
type AggregateContext = Readonly<{
  aggregate: UncontactedRecoveryAggregate;
  target: UncontactedRecoveryTarget;
  command: UncontactedRecoveryCommand;
}>;
type TakeoverState = AggregateContext & Readonly<{ capturedAt: Date }>;
type TakeoverCandidate = Readonly<{
  generation: number;
  rawToken: string;
  tokenHash: string;
  leaseUntil: Date;
}>;

export class UncontactedRecoveryCasConflictError extends Error {}

export async function performUncontactedRefundExecutionRecovery(
  client: PrismaClient,
  input: NormalizedReclaimUncontactedRefundExecutionInput,
  env: ActivationEnv,
): Promise<ReclaimUncontactedRefundExecutionResult> {
  return client.$transaction((tx) => reclaimInTransaction(tx, input, env));
}

export async function rereadUncontactedRefundExecutionAfterConflict(
  client: PrismaClient,
  input: NormalizedReclaimUncontactedRefundExecutionInput,
  fallback: "LEASE_CONFLICT" | "PERSISTENCE_CONFLICT",
): Promise<ReclaimUncontactedRefundExecutionResult> {
  return client.$transaction(async (tx) => {
    const locked = await lockAndLoad(tx, input.commandId);
    if (!locked) return reclaimFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE");
    const classification = classifyUncontactedRefundExecutionState(locked);
    return resultForClassification(classification, fallback);
  });
}

async function reclaimInTransaction(
  tx: RecoveryTx,
  input: NormalizedReclaimUncontactedRefundExecutionInput,
  env: ActivationEnv,
): Promise<ReclaimUncontactedRefundExecutionResult> {
  const locked = await lockAndLoad(tx, input.commandId);
  if (!locked) return reclaimFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE");
  const classification = classifyUncontactedRefundExecutionState(locked);
  if (classification.kind !== "EXPIRED_U1"
    && classification.kind !== "EXPIRED_SEALED_EXIMBAY_REENTRY"
    && classification.kind !== "EXPIRED_AUTHORIZED_EXIMBAY_R1") {
    return resultForClassification(classification, "LEASE_CONFLICT");
  }
  const gateFailure = validateRecoveryGate(env);
  if (gateFailure) return gateFailure;
  return persistRefundExecutionTakeover(tx, locked, input);
}

async function lockAndLoad(
  tx: RecoveryTx,
  commandId: string,
): Promise<LockedUncontactedRecoveryState | null> {
  const ownership = await discoverOwnership(tx, commandId);
  if (!ownership || !(await lockCanonicalRows(tx, ownership, commandId))) return null;
  const capturedAt = await captureDatabaseTime(tx);
  const context = await loadAggregateContext(tx, ownership, commandId);
  if (!context) return null;
  const artifacts = await loadRecoveryArtifacts(tx, ownership, commandId);
  return { ...context, ...artifacts, capturedAt };
}

async function loadAggregateContext(
  tx: RecoveryTx,
  ownership: Ownership,
  commandId: string,
): Promise<AggregateContext | null> {
  const aggregate = await tx.order.findUnique({
    where: { id: ownership.orderId },
    ...uncontactedRecoveryAggregateArgs,
  });
  if (!aggregate) return null;
  const target = aggregate.refundAttempts.find((row) => row.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function loadRecoveryArtifacts(
  tx: RecoveryTx,
  ownership: Ownership,
  commandId: string,
) {
  const events = await tx.refundExecutionCommandEvent.findMany({
    where: { commandId },
    orderBy: [{ leaseGeneration: "asc" }, { occurredAt: "asc" }],
  });
  const dispatches = await tx.refundExecutionDispatchAttempt.findMany({
    where: { commandId },
    orderBy: { ordinal: "asc" },
  });
  const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId: ownership.refundAttemptId },
    include: {
      eligibilityProof: true,
      eximbayPreflightObservations: {
        orderBy: [{ observingLeaseGeneration: "asc" }, { id: "asc" }],
      },
    },
  });
  const contactProofCount = await tx.refundExecutionProviderContactEligibilityProof.count({
    where: { dispatchAttempt: { commandId } },
  });
  const evidence = await tx.refundExecutionEvidence.findMany({
    where: { commandId },
    orderBy: [{ observedAt: "asc" }, { id: "asc" }],
  });
  return {
    events,
    dispatches,
    binding,
    contactProofCount,
    evidence,
    evidenceCount: evidence.length,
  };
}

async function discoverOwnership(
  tx: RecoveryTx,
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

async function lockCanonicalRows(
  tx: RecoveryTx,
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

async function captureDatabaseTime(tx: RecoveryTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative uncontacted recovery time.");
  }
  return rows[0].capturedAt;
}

// Shared persistence boundary. Migration M requires application-owned grant consumption
// for the historical canary ordinal-zero lane; generic callers cannot bypass it.
export async function persistRefundExecutionTakeover(
  tx: RecoveryTx,
  locked: TakeoverState,
  input: NormalizedReclaimUncontactedRefundExecutionInput,
  eventId?: string,
): Promise<ReclaimUncontactedRefundExecutionResult> {
  const candidate = buildTakeoverCandidate(locked);
  const updated = await updateCommandByFullCas(tx, locked, input, candidate);
  if (updated !== 1) throw new UncontactedRecoveryCasConflictError();
  await appendTakeoverEvent(tx, locked, candidate.generation, eventId);
  const leased = leaseSuccess(
    locked.command.id,
    locked.target.id,
    locked.aggregate.id,
    candidate.generation,
    candidate.rawToken,
    candidate.leaseUntil,
  );
  return Object.freeze({
    ...leased,
    recoveredState: locked.command.dispatchAttempt === 1
      ? "AUTHORIZED_EXIMBAY_R1"
      : "ORDINAL_ZERO",
  });
}

function buildTakeoverCandidate(
  locked: TakeoverState,
): TakeoverCandidate {
  const rawToken = randomBytes(32).toString("hex");
  return Object.freeze({
    generation: locked.command.leaseGeneration + 1,
    rawToken,
    tokenHash: createHash("sha256").update(rawToken, "utf8").digest("hex"),
    leaseUntil: new Date(locked.capturedAt.getTime() + REFUND_EXECUTION_LEASE_DURATION_MS),
  });
}

async function updateCommandByFullCas(
  tx: RecoveryTx,
  locked: TakeoverState,
  input: NormalizedReclaimUncontactedRefundExecutionInput,
  candidate: TakeoverCandidate,
): Promise<number> {
  const result = await tx.refundExecutionCommand.updateMany({
    where: {
      id: locked.command.id,
      refundAttemptId: locked.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: locked.command.dispatchAttempt,
      leaseGeneration: locked.command.leaseGeneration,
      leaseOwner: locked.command.leaseOwner,
      leaseTokenHash: locked.command.leaseTokenHash,
      AND: [
        { leaseUntil: locked.command.leaseUntil },
        { leaseUntil: { lte: locked.capturedAt } },
      ],
    },
    data: {
      leaseGeneration: candidate.generation,
      leaseOwner: input.recoveryOwner,
      leaseUntil: candidate.leaseUntil,
      leaseTokenHash: candidate.tokenHash,
    },
  });
  return result.count;
}

async function appendTakeoverEvent(
  tx: RecoveryTx,
  locked: TakeoverState,
  generation: number,
  eventId?: string,
): Promise<void> {
  await tx.refundExecutionCommandEvent.create({
    data: {
      id: eventId,
      commandId: locked.command.id,
      eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED,
      leaseGeneration: generation,
      dispatchAttempt: locked.command.dispatchAttempt,
      occurredAt: locked.capturedAt,
    },
  });
}

function validateRecoveryGate(
  env: ActivationEnv,
): ReclaimUncontactedRefundExecutionResult | null {
  try {
    return isRefundExecutionUncontactedRecoveryEnabled(env)
      ? null
      : reclaimFailure("FEATURE_DISABLED");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return reclaimFailure("CONFIG_INVALID");
    }
    throw error;
  }
}

function resultForClassification(
  classification: UncontactedRecoveryClassification,
  expiredFallback: "LEASE_CONFLICT" | "PERSISTENCE_CONFLICT",
): ReclaimUncontactedRefundExecutionResult {
  if ([
    "EXPIRED_U1",
    "EXPIRED_SEALED_EXIMBAY_REENTRY",
    "EXPIRED_AUTHORIZED_EXIMBAY_R1",
  ].includes(classification.kind)) {
    return reclaimFailure(expiredFallback);
  }
  if (["ACTIVE_U1", "ACTIVE_SEALED_EXIMBAY_REENTRY"].includes(classification.kind)) {
    return reclaimFailure("LEASE_NOT_EXPIRED");
  }
  if (classification.kind === "AUTHORIZED_U2") {
    return reclaimFailure("AUTHORIZED_RECOVERY_UNSUPPORTED");
  }
  if (classification.kind === "CONTACTED") return reclaimFailure("CONTACTED_RECOVERY_REQUIRED");
  if (classification.kind === "INCONSISTENT") return reclaimFailure("LEDGER_INCONSISTENT");
  return reclaimFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE");
}
