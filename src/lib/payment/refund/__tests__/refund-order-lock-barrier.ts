import { createPrismaPg } from "../../../database/prisma-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export interface NamedDbSession {
  applicationName: string;
  client: PrismaClient;
}

export interface OrderLockWait {
  pid: number;
  blockingPids: number[];
  query: string;
  waitEventType: string | null;
  waitEvent: string | null;
}

const LOCK_OBSERVATION_TIMEOUT_MS = 5_000;
const LOCK_OBSERVATION_POLL_MS = 15;

export function createNamedDbSession(label: string): NamedDbSession {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Test database URL is required.");
  const applicationName = `refund_race_${label}_${crypto.randomUUID().slice(0, 8)}`;
  const url = new URL(connectionString);
  url.searchParams.set("application_name", applicationName);
  return {
    applicationName,
    client: new PrismaClient({ adapter: createPrismaPg({ connectionString: url.toString() }) }),
  };
}

export async function queueBehindObservedOrderLock<First, Second>(
  orderId: string,
  firstSession: NamedDbSession,
  startFirst: () => Promise<First>,
  secondSession: NamedDbSession,
  startSecond: () => Promise<Second>,
) {
  let first: Promise<First> | undefined;
  let second: Promise<Second> | undefined;
  let holderPid = 0;
  let firstWait: OrderLockWait | undefined;
  let secondWait: OrderLockWait | undefined;

  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    holderPid = await backendPid(tx);
    first = startFirst();
    firstWait = await waitForObservedOrderLock(firstSession.applicationName, holderPid);
    second = startSecond();
    secondWait = await waitForObservedOrderLock(secondSession.applicationName, firstWait.pid);
  });

  if (!first || !second || !firstWait || !secondWait) {
    throw new Error("Order-lock race barrier did not initialize both contenders.");
  }
  return { first, second, holderPid, firstWait, secondWait };
}

export function disconnectSessions(...sessions: readonly NamedDbSession[]): Promise<unknown[]> {
  return Promise.all(sessions.map((session) => session.client.$disconnect()));
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
}

async function backendPid(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ pid: number }[]>(Prisma.sql`SELECT pg_backend_pid() AS pid`);
  if (rows.length !== 1) throw new Error("Unable to identify Order-lock holder.");
  return rows[0].pid;
}

async function waitForObservedOrderLock(
  applicationName: string,
  expectedBlockerPid: number,
): Promise<OrderLockWait> {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MS;
  let lastObserved: OrderLockWait | undefined;

  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<OrderLockWait[]>(Prisma.sql`
      SELECT
        pid,
        pg_blocking_pids(pid) AS "blockingPids",
        query,
        wait_event_type AS "waitEventType",
        wait_event AS "waitEvent"
      FROM pg_stat_activity
      WHERE application_name = ${applicationName}
    `);
    lastObserved = rows.find((row) => row.query.includes('FROM "Order"')) ?? rows[0];
    const observed = rows.find((row) => (
      row.waitEventType === "Lock"
      && row.query.includes('FROM "Order"')
      && row.blockingPids.includes(expectedBlockerPid)
    ));
    if (observed) return observed;
    await delay(LOCK_OBSERVATION_POLL_MS);
  }

  const lastState = lastObserved
    ? `pid=${lastObserved.pid}, waitEventType=${lastObserved.waitEventType ?? "none"}, waitEvent=${lastObserved.waitEvent ?? "none"}, blockers=[${lastObserved.blockingPids.join(",")}]`
    : "not observed";
  throw new Error(
    `Timed out observing Order lock: applicationName=${applicationName}, expectedBlockerPid=${expectedBlockerPid}, lastObserved=${lastState}`,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
