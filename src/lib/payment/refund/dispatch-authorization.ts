import { createHash } from "crypto";
import {
  Prisma,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type PrismaClient,
  type RefundExecutionDispatchAttempt,
} from "@prisma/client";
import {
  buildDispatchAuthorizationHandle,
  currentDispatchAuthorityFailure,
  dispatchAuthorizationFailure as failure,
  dispatchAuthorizationSuccess as success,
  identifyDispatchAuthorizationStructure,
  isDispatchAuthorizationLedgerCoherent,
  isMockSandboxAuthorization,
  matchesDispatchAuthorizationReplay,
  normalizeAuthorizeRefundExecutionDispatchInput,
  type AuthorizeRefundExecutionDispatchInput,
  type AuthorizeRefundExecutionDispatchResult,
  type AuthorizedRefundRequest,
  type DispatchAuthorizationContext,
  type DispatchAuthorizationHistory,
  type DispatchAuthorizationStructure,
  type NormalizedAuthorizeRefundExecutionDispatchInput,
} from "./dispatch-authorization-contract";
import { isRefundExecutionDispatchAuthorizationEnabled, RefundExecutionActivationConfigError } from "./execution-activation";
import { fingerprintRefundRequest, normalizeRefundRequestFingerprintInput, RefundRequestFingerprintInputError } from "./refund-request-fingerprint";

type ActivationEnv = Readonly<Record<string, string | undefined>>;
type AuthorizationTx = Prisma.TransactionClient;
type Ownership = Readonly<{ orderId: string; refundAttemptId: string }>;

class DispatchAuthorizationPersistenceRollbackError extends Error {}

export async function authorizeRefundExecutionDispatch(
  client: PrismaClient,
  input: AuthorizeRefundExecutionDispatchInput,
  env: ActivationEnv = process.env,
): Promise<AuthorizeRefundExecutionDispatchResult> {
  const normalized = normalizeAuthorizeRefundExecutionDispatchInput(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.$transaction((tx) => authorizeInTransaction(tx, normalized.input, env));
  } catch (error) {
    if (error instanceof DispatchAuthorizationPersistenceRollbackError) {
      return failure("PERSISTENCE_CONFLICT", "Refund dispatch authorization persistence conflicted.");
    }
    throw error;
  }
}

async function authorizeInTransaction(
  tx: AuthorizationTx,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  env: ActivationEnv,
): Promise<AuthorizeRefundExecutionDispatchResult> {
  const gateFailure = validateGate(env);
  if (gateFailure) return gateFailure;
  const ownership = await discoverOwnership(tx, input.commandId);
  if (!ownership) return failure(
    "COMMAND_NOT_FOUND_OR_INELIGIBLE",
    "Refund execution command is not eligible.",
  );
  const context = await lockAndLoad(tx, ownership, input.commandId);
  if (!context) return failure(
    "COMMAND_NOT_FOUND_OR_INELIGIBLE",
    "Refund execution command is not eligible.",
  );
  const history = await loadHistory(tx, context.command.id);
  const capturedAt = await captureDatabaseTime(tx);
  const structure = identifyDispatchAuthorizationStructure(
    context.command.dispatchAttempt,
    history.dispatchAttempts,
  );
  return authorizeLockedState(tx, context, history, structure, input, capturedAt);
}

function authorizeLockedState(
  tx: AuthorizationTx,
  context: DispatchAuthorizationContext,
  history: DispatchAuthorizationHistory,
  structure: DispatchAuthorizationStructure,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  capturedAt: Date,
): Promise<AuthorizeRefundExecutionDispatchResult> | AuthorizeRefundExecutionDispatchResult {
  const authorityFailure = currentDispatchAuthorityFailure(context.command, input, capturedAt);
  if (authorityFailure === "LEASE_FENCE_MISMATCH") {
    return failure("LEASE_FENCE_MISMATCH", "Refund execution lease fence does not match.");
  }
  if (authorityFailure === "LEASE_EXPIRED") {
    return failure("LEASE_EXPIRED", "Refund execution lease has expired.");
  }
  if (structure.kind === "contacted") return failure(
    "CONTACT_RECOVERY_REQUIRED",
    "Refund dispatch contact state requires recovery.",
  );
  if (!isDispatchAuthorizationLedgerCoherent(context, history, structure)) return ledgerFailure();
  if (!isMockSandboxAuthorization(context)) return failure(
    "NOT_AUTHORIZATION_READY",
    "Refund dispatch authorization is not ready.",
  );
  return authorizeSupportedState(tx, context, structure, input, capturedAt);
}

function authorizeSupportedState(
  tx: AuthorizationTx,
  context: DispatchAuthorizationContext,
  structure: DispatchAuthorizationStructure,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  capturedAt: Date,
): Promise<AuthorizeRefundExecutionDispatchResult> | AuthorizeRefundExecutionDispatchResult {
  const authorizedRequest = deriveAuthorizedRequest(context);
  if (!authorizedRequest) return ledgerFailure();
  if (structure.kind === "replay") {
    return replayAuthorization(context, structure.attempt, authorizedRequest);
  }
  if (structure.kind !== "new") return ledgerFailure();
  return persistFirstAuthorization(tx, context, input, authorizedRequest, capturedAt);
}

function validateGate(env: ActivationEnv): AuthorizeRefundExecutionDispatchResult | null {
  try {
    return isRefundExecutionDispatchAuthorizationEnabled(env)
      ? null
      : failure("FEATURE_DISABLED", "Refund dispatch authorization is disabled.");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return failure("CONFIG_INVALID", "Refund dispatch authorization configuration is invalid.");
    }
    throw error;
  }
}

async function discoverOwnership(
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

async function lockAndLoad(
  tx: AuthorizationTx,
  ownership: Ownership,
  commandId: string,
): Promise<DispatchAuthorizationContext | null> {
  if (!(await lockOwnershipRows(tx, ownership, commandId))) return null;
  const aggregate = await loadAggregate(tx, ownership.orderId);
  if (!aggregate) return null;
  const target = aggregate.refundAttempts.find((attempt) => attempt.id === ownership.refundAttemptId);
  if (!target?.executionCommand || target.executionCommand.id !== commandId) return null;
  return { aggregate, target, command: target.executionCommand };
}

async function lockOwnershipRows(
  tx: AuthorizationTx,
  ownership: Ownership,
  commandId: string,
): Promise<boolean> {
  const orders = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${ownership.orderId} FOR UPDATE
  `);
  if (orders.length !== 1) return false;
  const attempts = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "id" = ${ownership.refundAttemptId} AND "orderId" = ${ownership.orderId}
    FOR UPDATE
  `);
  if (attempts.length !== 1) return false;
  const commands = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${ownership.refundAttemptId}
    FOR UPDATE
  `);
  return commands.length === 1;
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
    tx.refundExecutionCommandEvent.findMany({
      where: { commandId },
      orderBy: { occurredAt: "asc" },
    }),
    tx.refundExecutionDispatchAttempt.findMany({
      where: { commandId },
      orderBy: { ordinal: "asc" },
    }),
    tx.refundExecutionEvidence.count({ where: { commandId } }),
  ]);
  return { events, dispatchAttempts, evidenceCount };
}

async function captureDatabaseTime(tx: AuthorizationTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative refund dispatch authorization time.");
  }
  return rows[0].capturedAt;
}

function deriveAuthorizedRequest(context: DispatchAuthorizationContext): AuthorizedRefundRequest | null {
  const providerOperationKey = context.target.idempotencyKey.trim();
  if (!providerOperationKey || Array.from(providerOperationKey).length > 512) return null;
  const providerPaymentReference = context.aggregate.payment.providerPaymentKey?.trim();
  if (!providerPaymentReference) return null;
  try {
    const facts = normalizeRefundRequestFingerprintInput({
      provider: context.target.provider,
      mode: context.target.mode,
      providerPaymentReference,
      amountMinor: context.target.amount,
      currency: context.target.currency,
      providerOperationKey,
    });
    return { facts, requestFingerprint: fingerprintRefundRequest(facts) };
  } catch (error) {
    if (error instanceof RefundRequestFingerprintInputError) return null;
    throw error;
  }
}

function replayAuthorization(
  context: DispatchAuthorizationContext,
  attempt: RefundExecutionDispatchAttempt,
  request: AuthorizedRefundRequest,
): AuthorizeRefundExecutionDispatchResult {
  if (!matchesDispatchAuthorizationReplay(context, attempt, request)) return ledgerFailure();
  return success(buildDispatchAuthorizationHandle(context, attempt.authorizedAt, request), true);
}

async function persistFirstAuthorization(
  tx: AuthorizationTx,
  context: DispatchAuthorizationContext,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  request: AuthorizedRefundRequest,
  capturedAt: Date,
): Promise<AuthorizeRefundExecutionDispatchResult> {
  let attempt: RefundExecutionDispatchAttempt;
  try {
    attempt = await tx.refundExecutionDispatchAttempt.create({
      data: {
        commandId: context.command.id,
        ordinal: 1,
        leaseGeneration: input.leaseGeneration,
        provider: request.facts.provider,
        mode: request.facts.mode,
        providerOperationKey: request.facts.providerOperationKey,
        requestFingerprint: request.requestFingerprint,
        state: RefundExecutionDispatchAttemptState.AUTHORIZED,
        authorizedAt: capturedAt,
        contactMarkedAt: null,
      },
    });
  } catch {
    throw new DispatchAuthorizationPersistenceRollbackError();
  }
  let updated: number;
  try {
    updated = await updateCommandOrdinal(tx, context, input, capturedAt);
  } catch {
    throw new DispatchAuthorizationPersistenceRollbackError();
  }
  if (updated !== 1) throw new DispatchAuthorizationPersistenceRollbackError();
  return success(buildDispatchAuthorizationHandle(context, attempt.authorizedAt, request), false);
}

function updateCommandOrdinal(
  tx: AuthorizationTx,
  context: DispatchAuthorizationContext,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  capturedAt: Date,
): Promise<number> {
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: context.command.id,
      refundAttemptId: context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      leaseGeneration: input.leaseGeneration,
      leaseTokenHash,
      dispatchAttempt: 0,
      leaseUntil: { gt: capturedAt },
    },
    data: { dispatchAttempt: 1 },
  }).then((result) => result.count);
}

function ledgerFailure(): AuthorizeRefundExecutionDispatchResult {
  return failure("LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
}
