import { Prisma, type PrismaClient } from "@prisma/client";
import {
  isPromotionRecoveryIssuanceEnabled,
  isPromotionRecoveryReconciliationEnabled,
  PromotionRecoveryActivationConfigError,
} from "./recovery-activation";
import { ensurePromotionRecoveryForOrder } from "./recovery";

const RECOVERY_RECONCILIATION_BATCH_SIZE = 25;
export const PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY = "PROMOTION_REFUND_RECOVERY";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export type PromotionRecoveryPostCommitOutcome =
  | "DISABLED"
  | "NOT_APPLICABLE"
  | "NOT_YET_ELIGIBLE"
  | "ISSUED"
  | "REPLAYED"
  | "INCONSISTENT"
  | "CONFIG_INVALID"
  | "FAILED";

export interface PromotionRecoveryReconciliationOutcome {
  readonly kind: "DISABLED" | "COMPLETED" | "CONFIG_INVALID";
  readonly examinedCount: number;
  readonly issuedCount: number;
  readonly replayedCount: number;
  readonly inconsistentCount: number;
  readonly failedCount: number;
}

type PromotionRecoveryReconciliationGateOutcome = Readonly<
  Omit<PromotionRecoveryReconciliationOutcome, "kind">
  & { kind: "DISABLED" | "CONFIG_INVALID" }
>;

export type PromotionRecoveryReconciliationClaim = Readonly<
  | { kind: "DISABLED" | "CONFIG_INVALID"; orderIds: readonly string[] }
  | { kind: "CLAIMED"; orderIds: readonly string[] }
>;

export async function attemptPromotionRecoveryAfterRefundCommand(
  client: PrismaClient,
  commandId: string,
  env: ActivationEnv = process.env,
): Promise<PromotionRecoveryPostCommitOutcome> {
  try {
    if (!isPromotionRecoveryIssuanceEnabled(env)) return "DISABLED";
    const command = await client.refundExecutionCommand.findUnique({
      where: { id: commandId },
      select: { refundAttempt: { select: { orderId: true } } },
    });
    if (!command) return "FAILED";
    const result = await ensurePromotionRecoveryForOrder(
      client,
      command.refundAttempt.orderId,
      env,
    );
    if (!result.ok) return result.code === "FEATURE_DISABLED" ? "DISABLED" : "FAILED";
    return postCommitOutcome(result.snapshot.classification.kind, result.issuedNow);
  } catch (error) {
    return error instanceof PromotionRecoveryActivationConfigError
      ? "CONFIG_INVALID"
      : "FAILED";
  }
}

export async function reconcilePromotionRecoveries(
  client: PrismaClient,
  env: ActivationEnv = process.env,
): Promise<PromotionRecoveryReconciliationOutcome> {
  const claim = await claimPromotionRecoveryReconciliationBatch(client, env);
  if (claim.kind !== "CLAIMED") return emptyReconciliationOutcome(claim.kind);
  const counts = { issuedCount: 0, replayedCount: 0, inconsistentCount: 0, failedCount: 0 };
  for (const orderId of claim.orderIds) {
    const outcome = await ensureOneReconciliationCandidate(client, orderId, env);
    counts[outcome] += 1;
  }
  return Object.freeze({
    kind: "COMPLETED",
    examinedCount: claim.orderIds.length,
    ...counts,
  });
}

export async function claimPromotionRecoveryReconciliationBatch(
  client: PrismaClient,
  env: ActivationEnv = process.env,
): Promise<PromotionRecoveryReconciliationClaim> {
  const gate = reconciliationGate(env);
  if (gate) return Object.freeze({ kind: gate.kind, orderIds: Object.freeze([]) });
  const orderIds = await client.$transaction(claimReconciliationBatchInTransaction);
  return Object.freeze({ kind: "CLAIMED", orderIds: Object.freeze(orderIds) });
}

async function claimReconciliationBatchInTransaction(
  tx: Prisma.TransactionClient,
): Promise<readonly string[]> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PromotionRecoveryReconciliationCheckpoint" ("scopeKey")
    VALUES (${PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY})
    ON CONFLICT ("scopeKey") DO NOTHING
  `);
  const checkpoints = await tx.$queryRaw<{ lastOrderId: string | null }[]>(Prisma.sql`
    SELECT "lastOrderId"
    FROM "PromotionRecoveryReconciliationCheckpoint"
    WHERE "scopeKey" = ${PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY}
    FOR UPDATE
  `);
  const checkpoint = requireSingletonCheckpoint(checkpoints);
  const candidates = await selectCyclicCandidateBatch(tx, checkpoint.lastOrderId);
  const lastOrderId = candidates.at(-1)?.id ?? null;
  await advanceCheckpoint(tx, checkpoint.lastOrderId, lastOrderId);
  return candidates.map(({ id }) => id);
}

function requireSingletonCheckpoint(
  checkpoints: readonly { lastOrderId: string | null }[],
): { lastOrderId: string | null } {
  const checkpoint = checkpoints[0];
  if (!checkpoint || checkpoints.length !== 1) {
    throw new Error("PROMOTION_RECOVERY_RECONCILIATION_CHECKPOINT_INCONSISTENT");
  }
  return checkpoint;
}

async function selectCyclicCandidateBatch(
  tx: Prisma.TransactionClient,
  lastOrderId: string | null,
): Promise<readonly { id: string }[]> {
  const forward = await discoverBroadRecoveryCandidates(tx, lastOrderId);
  return forward.length === 0 && lastOrderId !== null
    ? discoverBroadRecoveryCandidates(tx, null)
    : forward;
}

async function advanceCheckpoint(
  tx: Prisma.TransactionClient,
  previousLastOrderId: string | null,
  lastOrderId: string | null,
): Promise<void> {
  if (lastOrderId === previousLastOrderId) return;
  const updated = await tx.$queryRaw<{ lastOrderId: string | null }[]>(Prisma.sql`
    UPDATE "PromotionRecoveryReconciliationCheckpoint"
    SET "lastOrderId" = ${lastOrderId}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "scopeKey" = ${PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY}
    RETURNING "lastOrderId"
  `);
  if (updated.length !== 1 || updated[0]?.lastOrderId !== lastOrderId) {
    throw new Error("PROMOTION_RECOVERY_RECONCILIATION_CHECKPOINT_UPDATE_FAILED");
  }
}

async function discoverBroadRecoveryCandidates(
  tx: Prisma.TransactionClient,
  lastOrderId: string | null,
): Promise<readonly { id: string }[]> {
  const afterCursor = lastOrderId === null
    ? Prisma.empty
    : Prisma.sql`AND candidate."id" > ${lastOrderId}`;
  return tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT candidate."id"
    FROM "Order" AS candidate
    WHERE candidate."promotionGrantId" IS NOT NULL
      AND candidate."discountAmount" > 0
      ${afterCursor}
      AND NOT EXISTS (
        SELECT 1
        FROM "PromotionGrant" AS recovery
        WHERE recovery."recoveredFromGrantId" = candidate."promotionGrantId"
      )
      AND EXISTS (
        SELECT 1
        FROM "RefundAttempt" AS succeeded
        WHERE succeeded."orderId" = candidate."id"
          AND succeeded."status" = 'SUCCEEDED'::"RefundAttemptStatus"
      )
    ORDER BY candidate."id" ASC
    LIMIT ${RECOVERY_RECONCILIATION_BATCH_SIZE}
  `);
}

function reconciliationGate(
  env: ActivationEnv,
): PromotionRecoveryReconciliationGateOutcome | null {
  try {
    return isPromotionRecoveryReconciliationEnabled(env)
      && isPromotionRecoveryIssuanceEnabled(env)
      ? null
      : emptyReconciliationOutcome("DISABLED");
  } catch (error) {
    if (error instanceof PromotionRecoveryActivationConfigError) {
      return emptyReconciliationOutcome("CONFIG_INVALID");
    }
    throw error;
  }
}

async function ensureOneReconciliationCandidate(
  client: PrismaClient,
  orderId: string,
  env: ActivationEnv,
): Promise<"issuedCount" | "replayedCount" | "inconsistentCount" | "failedCount"> {
  try {
    const result = await ensurePromotionRecoveryForOrder(client, orderId, env);
    if (!result.ok) return "failedCount";
    if (result.snapshot.classification.kind === "INCONSISTENT") return "inconsistentCount";
    return result.issuedNow ? "issuedCount" : "replayedCount";
  } catch {
    return "failedCount";
  }
}

function postCommitOutcome(
  kind: "NOT_APPLICABLE" | "NOT_YET_ELIGIBLE" | "ELIGIBLE_NOT_ISSUED" | "ISSUED" | "INCONSISTENT",
  issuedNow: boolean,
): PromotionRecoveryPostCommitOutcome {
  if (kind === "ISSUED") return issuedNow ? "ISSUED" : "REPLAYED";
  if (kind === "INCONSISTENT") return "INCONSISTENT";
  if (kind === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (kind === "NOT_YET_ELIGIBLE") return "NOT_YET_ELIGIBLE";
  return "FAILED";
}

function emptyReconciliationOutcome(
  kind: "DISABLED" | "CONFIG_INVALID",
): PromotionRecoveryReconciliationGateOutcome {
  return Object.freeze({
    kind,
    examinedCount: 0,
    issuedCount: 0,
    replayedCount: 0,
    inconsistentCount: 0,
    failedCount: 0,
  });
}
