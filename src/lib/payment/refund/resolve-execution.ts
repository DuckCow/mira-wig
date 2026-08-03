import { createHash } from "node:crypto";
import {
  PaymentProvider, Prisma,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type PrismaClient,
  type RefundExecutionDispatchAttempt,
} from "@prisma/client";
import {
  RefundExecutionActivationConfigError,
  isRefundExecutionObservationApplicationEnabled,
} from "./execution-activation";
import {
  buildRefundResultDedupKey,
  normalizePersistFreshRefundExecutionObservationInput,
  normalizeReplayRefundExecutionResultInput,
  resultFailure,
  type NormalizedPersistFreshRefundExecutionObservationInput,
  type NormalizedReplayRefundExecutionResultInput,
  type NormalizedRefundResultInput,
  type PersistFreshRefundExecutionObservationInput,
  type RefundExecutionResult,
  type ReplayRefundExecutionResultInput,
} from "./execution-result-contract";
import {
  buildResolutionPlan,
  hasRefundProviderIdentityConflict,
  matchesAuthorizedResultRequest,
  validateFreshResolutionAggregate,
  validatePlanTransition,
  type ResolutionAggregate,
  type ResolutionTarget,
} from "./execution-result-plan";
import {
  captureRefundResultDatabaseTime,
  lockRefundResultRows,
  persistResolution,
  ResolutionRollbackError,
} from "./execution-result-persistence";
import { resolveRefundEvidenceReplay } from "./execution-result-replay";

type ResolutionTx = Prisma.TransactionClient;
type ActivationEnv = Readonly<Record<string, string | undefined>>;
type Ownership = { orderId: string; refundAttemptId: string };
type LockedContext = {
  aggregate: ResolutionAggregate;
  target: ResolutionTarget;
  command: NonNullable<ResolutionTarget["executionCommand"]>;
  dispatch: RefundExecutionDispatchAttempt | null;
  capturedAt: Date;
};
type ResultOperation =
  | { kind: "fresh"; input: NormalizedPersistFreshRefundExecutionObservationInput; env: ActivationEnv }
  | { kind: "replay"; input: NormalizedReplayRefundExecutionResultInput };

export async function persistFreshRefundExecutionObservation(
  client: PrismaClient,
  input: PersistFreshRefundExecutionObservationInput,
  env: ActivationEnv = process.env,
): Promise<RefundExecutionResult> {
  const normalized = normalizePersistFreshRefundExecutionObservationInput(input);
  if (!normalized.ok) return normalized;
  return executeResultOperation(client, { kind: "fresh", input: normalized.input, env });
}

export async function replayRefundExecutionResult(
  client: PrismaClient,
  input: ReplayRefundExecutionResultInput,
): Promise<RefundExecutionResult> {
  const normalized = normalizeReplayRefundExecutionResultInput(input);
  if (!normalized.ok) return normalized;
  return executeResultOperation(client, { kind: "replay", input: normalized.input });
}

async function executeResultOperation(
  client: PrismaClient,
  operation: ResultOperation,
): Promise<RefundExecutionResult> {
  const ownership = await discoverOwnership(client, operation.input.commandId);
  if (!ownership) return commandNotFound();
  try {
    return await runResultTransaction(client, ownership, operation);
  } catch (error) {
    if (error instanceof ResolutionRollbackError) return persistenceConflict();
    if (!isUniqueConflict(error)) throw error;
    return retryUniqueConflict(client, operation);
  }
}

async function retryUniqueConflict(
  client: PrismaClient,
  operation: ResultOperation,
): Promise<RefundExecutionResult> {
  const ownership = await discoverOwnership(client, operation.input.commandId);
  if (!ownership) return commandNotFound();
  try {
    return await runResultTransaction(client, ownership, operation);
  } catch (error) {
    if (error instanceof ResolutionRollbackError || isUniqueConflict(error)) return persistenceConflict();
    throw error;
  }
}

function runResultTransaction(
  client: PrismaClient,
  ownership: Ownership,
  operation: ResultOperation,
): Promise<RefundExecutionResult> {
  return client.$transaction((tx) => resolveInTransaction(tx, ownership, operation));
}

async function resolveInTransaction(
  tx: ResolutionTx,
  ownership: Ownership,
  operation: ResultOperation,
): Promise<RefundExecutionResult> {
  const context = await lockAndLoad(tx, ownership, operation.input);
  if (!context) return commandNotFound();
  // Generic E4 stays MOCK-only; provider-specific continuations own response authority.
  if (context.target.provider === PaymentProvider.TOSS
    || context.target.provider === PaymentProvider.EXIMBAY) return ledgerFailure();
  const sourceDedupKey = buildRefundResultDedupKey(
    operation.input.commandId,
    operation.input.dispatchAttempt,
  );
  const evidence = await tx.refundExecutionEvidence.findUnique({
    where: { sourceDedupKey },
  });
  // Durable evidence is final: exact replay remains available after the fresh-write gate closes.
  if (evidence) {
    if (!context.dispatch) return ledgerFailure();
    return resolveRefundEvidenceReplay(tx, context, context.dispatch, evidence, operation.input);
  }
  if (operation.kind === "replay") {
    return resultFailure("FRESH_FENCE_REQUIRED", "No durable result exists for replay.");
  }
  return resolveFreshInTransaction(tx, context, operation);
}

async function resolveFreshInTransaction(
  tx: ResolutionTx,
  context: LockedContext,
  operation: Extract<ResultOperation, { kind: "fresh" }>,
): Promise<RefundExecutionResult> {
  const gateFailure = validateFreshGate(operation.env);
  if (gateFailure) return gateFailure;
  const fenceFailure = validateFreshFence(context, operation.input);
  if (fenceFailure) return fenceFailure;
  const evidenceCount = await tx.refundExecutionEvidence.count({
    where: { commandId: context.command.id },
  });
  const coherenceFailure = validateFreshCoherence(context, evidenceCount);
  if (coherenceFailure) return coherenceFailure;
  const providerConflict = await hasRefundProviderIdentityConflict(
    tx,
    context.target,
    operation.input.observation,
  );
  const plan = buildResolutionPlan(
    context.aggregate,
    context.target,
    operation.input.observation,
    context.capturedAt,
    providerConflict,
  );
  if ("ok" in plan) return plan;
  if (!validatePlanTransition(plan)) return ledgerFailure();
  return persistResolution(tx, context, operation.input, plan, context.capturedAt);
}

function validateFreshCoherence(
  context: LockedContext,
  evidenceCount: number,
): RefundExecutionResult | null {
  if (evidenceCount !== 0) return ledgerFailure();
  const aggregateFailure = validateFreshResolutionAggregate(
    context.aggregate,
    context.target,
    context.command,
  );
  if (aggregateFailure) return aggregateFailure;
  if (!context.dispatch) return ledgerFailure();
  return matchesAuthorizedResultRequest(context.aggregate, context.target, context.dispatch)
    ? null
    : ledgerFailure();
}

async function discoverOwnership(client: PrismaClient, commandId: string): Promise<Ownership | null> {
  const command = await client.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command
    ? { orderId: command.refundAttempt.orderId, refundAttemptId: command.refundAttemptId }
    : null;
}

async function lockAndLoad(
  tx: ResolutionTx,
  ownership: Ownership,
  input: NormalizedRefundResultInput,
): Promise<LockedContext | null> {
  const locks = await lockCanonicalRows(tx, ownership, input);
  if (!locks.ok) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  const target = aggregate.refundAttempts.find((row) => row.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== input.commandId) return null;
  const dispatch = locks.dispatchId
    ? await tx.refundExecutionDispatchAttempt.findUnique({ where: { id: locks.dispatchId } })
    : null;
  const capturedAt = await captureRefundResultDatabaseTime(tx);
  return { aggregate, target, command: target.executionCommand, dispatch, capturedAt };
}

async function lockCanonicalRows(
  tx: ResolutionTx,
  ownership: Ownership,
  input: NormalizedRefundResultInput,
): Promise<{ ok: true; dispatchId: string | null } | { ok: false }> {
  return lockRefundResultRows(
    tx,
    ownership.orderId,
    ownership.refundAttemptId,
    input.commandId,
    input.dispatchAttempt,
  );
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

function validateFreshGate(env: ActivationEnv): RefundExecutionResult | null {
  try {
    return isRefundExecutionObservationApplicationEnabled(env)
      ? null
      : resultFailure("FEATURE_DISABLED", "Refund observation application is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return resultFailure("CONFIG_INVALID", "Refund observation application configuration is invalid.");
    }
    throw error;
  }
}

function validateFreshFence(
  context: LockedContext,
  input: NormalizedPersistFreshRefundExecutionObservationInput,
): RefundExecutionResult | null {
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  if (!matchesLeaseFence(context, input, leaseTokenHash)) {
    return resultFailure("FRESH_LEASE_FENCE_MISMATCH", "The fresh lease fence does not match.");
  }
  if (context.command.dispatchAttempt !== input.dispatchAttempt) {
    return resultFailure("DISPATCH_ATTEMPT_MISMATCH", "The dispatch attempt ordinal does not match.");
  }
  if (!context.dispatch) {
    return resultFailure("CONTACT_NOT_AUTHORIZED", "Provider contact was not durably authorized.");
  }
  const contacted = [
    context.dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
    context.dispatch.contactMarkedAt !== null,
  ].every(Boolean);
  if (!contacted) return resultFailure(
    "CONTACT_NOT_AUTHORIZED",
    "Provider contact was not durably authorized.",
  );
  const coherentDispatch = [
    context.dispatch.commandId === context.command.id,
    context.dispatch.ordinal === input.dispatchAttempt,
    context.dispatch.leaseGeneration === input.leaseGeneration,
  ].every(Boolean);
  if (!coherentDispatch) return ledgerFailure();
  return null;
}

function matchesLeaseFence(
  context: LockedContext,
  input: NormalizedPersistFreshRefundExecutionObservationInput,
  leaseTokenHash: string,
): boolean {
  return [
    context.command.status === RefundExecutionCommandStatus.LEASED,
    context.command.leaseGeneration === input.leaseGeneration,
    context.command.leaseTokenHash === leaseTokenHash,
  ].every(Boolean);
}

function commandNotFound(): RefundExecutionResult {
  return resultFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command was not found or is ineligible.");
}

function ledgerFailure(): RefundExecutionResult {
  return resultFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}

function persistenceConflict(): RefundExecutionResult {
  return resultFailure("PERSISTENCE_CONFLICT", "Refund execution persistence conflicted with stored state.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export type {
  PersistFreshRefundExecutionObservationInput,
  RefundExecutionResult,
  RefundExecutionResultFailureCode,
  ReplayRefundExecutionResultInput,
} from "./execution-result-contract";
