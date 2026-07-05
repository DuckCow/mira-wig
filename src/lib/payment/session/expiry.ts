import { CheckoutSessionStatus } from "@prisma/client";
import type { CheckoutSession, Prisma } from "@prisma/client";
import { SESSION_SWEEP_LIMIT_DEFAULT, type ExpireStaleInput } from "./types";

type SessionClient = Pick<Prisma.TransactionClient, "checkoutSession">;
type UsableSession = Pick<CheckoutSession, "status" | "expiresAt">;

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
  const result = await client.checkoutSession.updateMany({
    where: { id: { in: ids }, status: CheckoutSessionStatus.SUBMITTED, expiresAt: { lte: input.now } },
    data: { status: CheckoutSessionStatus.EXPIRED },
  });
  return result.count;
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
    where: { status: CheckoutSessionStatus.SUBMITTED, expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
