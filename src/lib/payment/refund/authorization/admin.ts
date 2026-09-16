import { Prisma, type PrismaClient, type RefundExecutionAuthorization } from "@prisma/client";
import { captureDatabaseTime } from "../providers/eximbay/lifecycle-state";
import {
  parseGrantInput, parseIssueInput, parseReadInput, REFUND_AUTHORIZATION_TTL_MS,
  REFUND_REENTRY_OPERATION, RefundAuthorizationError, requireAuthorizationEnabled,
  type AuthorizationEnv, type IssueRefundAuthorizationInput,
} from "./contract";
import { lockAuthorizationTarget, validateAuthorizationTarget } from "./target";
import { type LoadRefundReentryRelease } from "./release";

export type RefundAuthorizationSession = Readonly<{ user: Readonly<{ id: string; role?: string }> }> | null;
export type RefundAuthorizationSessionProvider = () => Promise<RefundAuthorizationSession>;

export function createRefundAuthorizationAdmin(
  client: PrismaClient, session: RefundAuthorizationSessionProvider,
  loadRelease: LoadRefundReentryRelease, env: AuthorizationEnv = process.env,
) {
  return {
    async issue(raw: unknown) {
      requireAuthorizationEnabled(env);
      const input = parseIssueInput(raw);
      const actor = await authenticatedUser(session);
      return issueWithReplay(client, actor, input, loadRelease);
    },
    async read(raw: unknown) {
      const input = parseReadInput(raw);
      const actor = await authenticatedUser(session);
      return client.$transaction(async (tx) => {
        await lockCurrentAdmin(tx, actor);
        return readForCommand(tx, input);
      });
    },
    async revoke(raw: unknown) {
      const grantId = parseGrantInput(raw);
      const actor = await authenticatedUser(session);
      return client.$transaction(async (tx) => {
        await lockCurrentAdmin(tx, actor);
        await lockGrant(tx, grantId);
        const grant = await tx.refundExecutionAuthorization.findUnique({ where: { id: grantId } });
        if (!grant) throw new RefundAuthorizationError("NOT_FOUND");
        if (grant.consumedAt) throw new RefundAuthorizationError("ALREADY_CONSUMED");
        const now = await captureDatabaseTime(tx);
        const row = grant.revokedAt ? grant : await tx.refundExecutionAuthorization.update({
          where: { id: grant.id }, data: { revokedAt: now, revokedByUserId: actor },
        });
        return authorizationReceipt(row, now);
      });
    },
  };
}

async function authenticatedUser(session: RefundAuthorizationSessionProvider): Promise<string> {
  const current = await session();
  if (!current?.user.id || current.user.role !== "ADMIN") throw new RefundAuthorizationError("UNAUTHORIZED");
  return current.user.id;
}

async function lockCurrentAdmin(tx: Prisma.TransactionClient, actor: string): Promise<void> {
  const users = await tx.$queryRaw<{ role: string }[]>(Prisma.sql`
    SELECT "role" FROM "User" WHERE "id" = ${actor} FOR SHARE
  `);
  if (users.length !== 1 || users[0].role !== "ADMIN") throw new RefundAuthorizationError("UNAUTHORIZED");
}

export async function lockGrant(tx: Prisma.TransactionClient, grantId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RefundExecutionAuthorization" WHERE "id" = ${grantId} FOR UPDATE`);
}

async function issueWithReplay(
  client: PrismaClient, actor: string, input: IssueRefundAuthorizationInput, loadRelease: LoadRefundReentryRelease,
) {
  try {
    return await client.$transaction(async (tx) => {
      await lockCurrentAdmin(tx, actor);
      return issueLocked(tx, actor, input, loadRelease);
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return client.$transaction(async (tx) => {
      await lockCurrentAdmin(tx, actor);
      const replay = await findIssuanceReplay(tx, actor, input);
      if (!replay) throw new RefundAuthorizationError("AUTHORIZATION_CONFLICT");
      return replay;
    });
  }
}

async function issueLocked(tx: Prisma.TransactionClient, actor: string, input: IssueRefundAuthorizationInput, loadRelease: LoadRefundReentryRelease) {
  const existing = await findIssuanceReplay(tx, actor, input);
  if (existing) return existing;
  const release = await loadRelease(input.releasePolicyDigest);
  const state = await lockAuthorizationTarget(tx, input.commandId);
  const concurrent = await findIssuanceReplay(tx, actor, input);
  if (concurrent) return concurrent;
  const target = await validateAuthorizationTarget(tx, state, input.expectedPredecessorGeneration, release);
  if (target.targetBindingDigest !== input.confirmedTargetBindingDigest) throw new RefundAuthorizationError("TARGET_MISMATCH");
  if (!state.binding) throw new RefundAuthorizationError("TARGET_MISMATCH");
  const now = target.state.capturedAt;
  const row = await tx.refundExecutionAuthorization.create({ data: {
    issuanceRequestId: input.issuanceRequestId, commandId: input.commandId,
    refundAttemptId: state.context.target.id, providerOperationBindingId: state.binding.id,
    targetBindingDigest: target.targetBindingDigest, expectedPredecessorGeneration: input.expectedPredecessorGeneration,
    operationClass: REFUND_REENTRY_OPERATION, releasePolicyDigest: release.digest,
    issuedByUserId: actor, issuedAt: now, expiresAt: new Date(now.getTime() + REFUND_AUTHORIZATION_TTL_MS),
  } });
  return authorizationReceipt(row, now);
}

async function findIssuanceReplay(tx: Prisma.TransactionClient, actor: string, input: IssueRefundAuthorizationInput) {
  const row = await tx.refundExecutionAuthorization.findUnique({ where: { issuanceRequestId: input.issuanceRequestId } });
  if (!row) return null;
  const same = [row.issuedByUserId === actor, row.commandId === input.commandId,
    row.expectedPredecessorGeneration === input.expectedPredecessorGeneration,
    row.targetBindingDigest === input.confirmedTargetBindingDigest, row.releasePolicyDigest === input.releasePolicyDigest].every(Boolean);
  if (!same) throw new RefundAuthorizationError("IDEMPOTENCY_CONFLICT");
  return authorizationReceipt(row, await captureDatabaseTime(tx));
}

async function readForCommand(tx: Prisma.TransactionClient, input: ReturnType<typeof parseReadInput>) {
  const command = await tx.refundExecutionCommand.findUnique({ where: { id: input.commandId }, include: {
    eximbaySandboxCanaryApproval: true, refundAttempt: { include: { providerOperationBinding: true } },
  } });
  if (!command) throw new RefundAuthorizationError("NOT_FOUND");
  const cursor = await scopedCursor(tx, input);
  const rows = await tx.refundExecutionAuthorization.findMany({
    where: { commandId: input.commandId }, orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: input.pageSize + 1, ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
  });
  const now = await captureDatabaseTime(tx);
  const page = rows.slice(0, input.pageSize);
  return {
    target: targetReceipt(command),
    grants: page.map((row) => authorizationReceipt(row, now)),
    nextCursor: rows.length > input.pageSize ? page.at(-1)?.id ?? null : null,
  };
}

async function scopedCursor(tx: Prisma.TransactionClient, input: ReturnType<typeof parseReadInput>) {
  if (!input.cursor) return null;
  const cursor = await tx.refundExecutionAuthorization.findUnique({ where: { id: input.cursor } });
  if (!cursor || cursor.commandId !== input.commandId) throw new RefundAuthorizationError("INVALID_INPUT");
  return cursor;
}

type InspectedCommand = Prisma.RefundExecutionCommandGetPayload<{ include: {
  eximbaySandboxCanaryApproval: true; refundAttempt: { include: { providerOperationBinding: true } };
} }>;

function targetReceipt(command: InspectedCommand) {
  return { commandId: command.id, refundAttemptId: command.refundAttemptId,
      paymentId: command.refundAttempt.paymentId, orderId: command.refundAttempt.orderId,
      providerOperationBindingId: command.refundAttempt.providerOperationBinding?.id ?? null,
      targetBindingDigest: command.eximbaySandboxCanaryApproval?.targetBindingDigest ?? null,
      generation: command.leaseGeneration, amount: command.refundAttempt.amount, currency: command.refundAttempt.currency,
      status: command.status, dispatchAttempt: command.dispatchAttempt };
}

export function authorizationReceipt(row: RefundExecutionAuthorization, now: Date) {
  return { ...row, issuedAt: row.issuedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null, consumedAt: row.consumedAt?.toISOString() ?? null,
    state: authorizationState(row, now) };
}

function authorizationState(row: RefundExecutionAuthorization, now: Date) {
  if (row.consumedAt) return "CONSUMED";
  if (row.revokedAt) return "REVOKED";
  return row.expiresAt <= now ? "EXPIRED" : "UNUSED";
}
