import { CheckoutSessionStatus, Prisma } from "@prisma/client";
import type { CheckoutSession, PrismaClient } from "@prisma/client";
import { unresolvedSessionExposureWhere } from "@/lib/payment/remediation";
import { SESSION_SWEEP_LIMIT_DEFAULT, type ExpireStaleInput } from "./types";

type SessionClient = Pick<PrismaClient, "$transaction" | "checkoutSession">;
type ExpiryTx = Pick<Prisma.TransactionClient, "$queryRaw" | "checkoutSession" | "payment" | "promotionGrant">;
type UsableSession = Pick<CheckoutSession, "status" | "expiresAt">;
type LockedSession = Pick<
  CheckoutSession,
  "id" | "status" | "expiresAt" | "promotionGrantId" | "firstOrderPromotionClaimedAt"
>;

const expiryBlockingPaymentWhere = {
  OR: [
    { contactStartedAt: { not: null }, blockingEndedAt: null },
    unresolvedSessionExposureWhere,
  ],
} satisfies Prisma.PaymentWhereInput;

export function isUsable(session: UsableSession, now: Date): boolean {
  return session.status === CheckoutSessionStatus.SUBMITTED && session.expiresAt.getTime() > now.getTime();
}

export async function expireStale(
  client: SessionClient,
  input: ExpireStaleInput,
): Promise<number> {
  const limit = normalizeLimit(input.limit);
  const ids = await findExpiredIds(client, input.now, limit);
  if (ids.length === 0) return 0;
  let count = 0;
  for (const id of ids) {
    count += await client.$transaction((tx) => expireCandidate(tx, id));
  }
  return count;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return SESSION_SWEEP_LIMIT_DEFAULT;
  return Math.max(0, Math.floor(limit));
}

async function findExpiredIds(
  client: SessionClient,
  now: Date,
  limit: number,
): Promise<string[]> {
  if (limit < 1) return [];
  const rows = await client.checkoutSession.findMany({
    where: expiredSessionWhere(now),
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function expireCandidate(tx: ExpiryTx, id: string): Promise<number> {
  const session = await lockExactCheckoutSession(tx, id);
  if (!session) return 0;
  const freshNow = await captureFreshDatabaseTime(tx);
  if (session.status !== CheckoutSessionStatus.SUBMITTED || isUsable(session, freshNow)) return 0;
  if (await hasExpiryBlocker(tx, session.id)) return 0;
  const result = await tx.checkoutSession.updateMany({
    where: {
      id: session.id,
      status: CheckoutSessionStatus.SUBMITTED,
      expiresAt: { lte: freshNow },
    },
    data: {
      status: CheckoutSessionStatus.EXPIRED,
      firstOrderPromotionClaimedAt: null,
    },
  });
  if (result.count === 1) await releaseExactPromotionReservation(tx, session);
  return result.count;
}

async function lockExactCheckoutSession(tx: ExpiryTx, id: string): Promise<LockedSession | null> {
  const rows = await tx.$queryRaw<LockedSession[]>(Prisma.sql`
    SELECT "id", "status", "expiresAt", "promotionGrantId", "firstOrderPromotionClaimedAt"
    FROM "CheckoutSession"
    WHERE "id" = ${id}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function releaseExactPromotionReservation(
  tx: ExpiryTx,
  session: LockedSession,
): Promise<void> {
  if (session.promotionGrantId === null) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "PromotionGrant"
    WHERE "id" = ${session.promotionGrantId}
    FOR UPDATE
  `);
  await tx.promotionGrant.updateMany({
    where: {
      id: session.promotionGrantId,
      reservedCheckoutSessionId: session.id,
    },
    data: { reservedCheckoutSessionId: null, reservedAt: null },
  });
}

async function captureFreshDatabaseTime(tx: ExpiryTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAtMs: bigint }[]>(Prisma.sql`
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "capturedAtMs"
  `);
  const capturedAtMs = rows[0]?.capturedAtMs;
  if (typeof capturedAtMs !== "bigint") throw new Error("Expiry time is unavailable");
  return new Date(Number(capturedAtMs));
}

async function hasExpiryBlocker(tx: ExpiryTx, checkoutSessionId: string): Promise<boolean> {
  const blocker = await tx.payment.findFirst({
    where: { checkoutSessionId, ...expiryBlockingPaymentWhere },
    select: { id: true },
  });
  return blocker !== null;
}

function expiredSessionWhere(now: Date): Prisma.CheckoutSessionWhereInput {
  return {
    status: CheckoutSessionStatus.SUBMITTED,
    expiresAt: { lte: now },
    payments: { none: expiryBlockingPaymentWhere },
  };
}
