import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, RefundExecutionAuthorization } from "@prisma/client";
import { persistRefundExecutionTakeover } from "../uncontacted-recovery-persistence";
import { lockGrant } from "./admin";
import { RefundAuthorizationError, REFUND_REENTRY_OPERATION, requireAuthorizationEnabled, type AuthorizationEnv } from "./contract";
import { lockAuthorizationTarget, validateAuthorizationTarget } from "./target";
import type { LoadRefundReentryRelease } from "./release";
import { VerifiedRefundExecution } from "./runtime";

export async function consumeRefundExecutionAuthorization(
  client: PrismaClient, execution: VerifiedRefundExecution, loadRelease: LoadRefundReentryRelease,
  env: AuthorizationEnv = process.env,
) {
  requireAuthorizationEnabled(env);
  if (!(execution instanceof VerifiedRefundExecution)) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  // A locator read only. Every authority/financial fact is re-read after canonical locks.
  const locator = await client.refundExecutionAuthorization.findUnique({ where: { id: execution.grantId }, select: { commandId: true } });
  if (!locator) throw new RefundAuthorizationError("NOT_FOUND");
  const release = await loadRelease(execution.releasePolicyDigest);
  return client.$transaction(async (tx) => {
    const state = await lockAuthorizationTarget(tx, locator.commandId);
    await lockGrant(tx, execution.grantId);
    const grant = await tx.refundExecutionAuthorization.findUnique({ where: { id: execution.grantId } });
    requireConsumable(grant, execution);
    const checked = await validateAuthorizationTarget(tx, state, grant.expectedPredecessorGeneration, release);
    const now = checked.state.capturedAt;
    if (now < grant.issuedAt || now >= grant.expiresAt) throw new RefundAuthorizationError("EXPIRED");
    if (checked.targetBindingDigest !== grant.targetBindingDigest
      || grant.refundAttemptId !== state.context.target.id
      || grant.providerOperationBindingId !== state.binding?.id) throw new RefundAuthorizationError("TARGET_MISMATCH");
    const eventId = randomUUID();
    await consumeLocked(tx, grant, execution, eventId, now);
    const result = await persistRefundExecutionTakeover(tx, {
      ...checked.state.context, capturedAt: now,
    }, { commandId: grant.commandId, recoveryOwner: execution.executionId }, eventId);
    if (!result.ok) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
    // $transaction returns the handle only after COMMIT (including deferred constraints).
    return { grantId: grant.id, lease: result.lease, releasePolicyDigest: release.digest };
  });
}

function requireConsumable(grant: RefundExecutionAuthorization | null, execution: VerifiedRefundExecution): asserts grant is RefundExecutionAuthorization {
  if (!grant) throw new RefundAuthorizationError("NOT_FOUND");
  if (grant.consumedAt) throw new RefundAuthorizationError("ALREADY_CONSUMED");
  if (grant.revokedAt) throw new RefundAuthorizationError("REVOKED");
  if (grant.releasePolicyDigest !== execution.releasePolicyDigest) throw new RefundAuthorizationError("RELEASE_MISMATCH");
  if (grant.operationClass !== REFUND_REENTRY_OPERATION) throw new RefundAuthorizationError("TARGET_MISMATCH");
}

async function consumeLocked(tx: Prisma.TransactionClient, grant: RefundExecutionAuthorization, execution: VerifiedRefundExecution, eventId: string, now: Date): Promise<void> {
  const changed = await tx.refundExecutionAuthorization.updateMany({
    where: { id: grant.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now, consumedByPrincipalId: execution.principalId,
      consumedExecutionId: execution.executionId, consumedExecutionUid: execution.executionUid, consumedLeaseEventId: eventId },
  });
  if (changed.count !== 1) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
}
