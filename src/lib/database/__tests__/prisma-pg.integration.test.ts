import { PrismaClient, type Prisma } from "@prisma/client";
import { Client, type PoolConfig } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createPrismaPg } from "../prisma-pg";
import { requireEximbayCanarySaleFreshness } from "../../payment/refund/eximbay-refund-canary-target-producer";

function testDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/wig_platform_test") throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  return value;
}

function seoulUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.searchParams.set("options", "-c timezone=Asia/Seoul -c search_path=public");
  return url.toString();
}

describe("Prisma UTC session boundary against non-UTC PostgreSQL", () => {
  it("writes the correct timestamptz instant and preserves DB-clock freshness admission", async () => {
    const reference = new Client({ connectionString: seoulUrl() });
    await reference.connect();
    const client = new PrismaClient({ adapter: createPrismaPg({ connectionString: seoulUrl() }) });
    try {
      expect((await reference.query<{ TimeZone: string }>("SHOW TIME ZONE")).rows[0]?.TimeZone)
        .toBe("Asia/Seoul");
      await client.$transaction(assertTimestampRoundTrip);
    } finally {
      await client.$disconnect();
      await reference.end();
    }
  });

  it.each(["url", "config", "environment"])("keeps every concurrent and replacement connection UTC with %s options", async (source) => {
    const config: PoolConfig = { connectionString: testDatabaseUrl(), max: 3, maxUses: 1 };
    if (source === "url") config.connectionString = seoulUrl();
    if (source === "config") config.options = "-c timezone=Asia/Seoul -c search_path=public";
    if (source === "environment") vi.stubEnv("PGOPTIONS", "-c timezone=Asia/Seoul -c search_path=public");
    const client = new PrismaClient({ adapter: createPrismaPg(config) });
    try {
      const first = await concurrentSessionIds(client);
      const second = await concurrentSessionIds(client);
      expect(new Set([...first, ...second]).size).toBe(6);
    } finally {
      await client.$disconnect();
      vi.unstubAllEnvs();
    }
  });
});

async function assertTimestampRoundTrip(tx: Prisma.TransactionClient): Promise<void> {
  const [clock] = await tx.$queryRaw<{ now: Date; epochMs: number }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS now,
      floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision AS "epochMs"
  `;
  expect(Math.abs(clock.now.getTime() - clock.epochMs)).toBeLessThan(100);
  const fresh = new Date(clock.epochMs - 58_000);
  const expired = new Date(clock.epochMs - 31 * 60_000);
  await tx.$executeRaw`CREATE TEMP TABLE mira_timezone_roundtrip (
    label text PRIMARY KEY, occurred_at timestamptz NOT NULL
  ) ON COMMIT DROP`;
  await tx.$executeRaw`INSERT INTO mira_timezone_roundtrip VALUES ('fresh', ${fresh}), ('expired', ${expired})`;
  const rows = await tx.$queryRaw<{ label: string; instant: Date; epochMs: number }[]>`
    SELECT label, occurred_at AS instant,
      (extract(epoch FROM occurred_at) * 1000)::double precision AS "epochMs"
    FROM mira_timezone_roundtrip ORDER BY label
  `;
  expect(rows).toEqual([
    { label: "expired", instant: expired, epochMs: expired.getTime() },
    { label: "fresh", instant: fresh, epochMs: fresh.getTime() },
  ]);
  const [current] = await tx.$queryRaw<{ now: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS now
  `;
  expect(() => requireEximbayCanarySaleFreshness(sale(rows[1].instant), current.now)).not.toThrow();
  expect(() => requireEximbayCanarySaleFreshness(sale(rows[0].instant), current.now)).toThrow("SALE_NOT_FRESH");
}

function sale(at: Date) {
  return { financialSucceededAt: at, session: { completedAt: at }, order: { paidAt: at } };
}

async function concurrentSessionIds(client: PrismaClient): Promise<number[]> {
  let release = () => {};
  const allConnected = new Promise<void>((resolve) => { release = resolve; });
  let connected = 0;
  return Promise.all([0, 1, 2].map(() => client.$transaction(async (tx) => {
    const [session] = await tx.$queryRaw<{ pid: number; timezone: string; searchPath: string }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('TimeZone') AS timezone,
        current_setting('search_path') AS "searchPath"
    `;
    connected += 1;
    if (connected === 3) release();
    await allConnected;
    expect(session.timezone).toBe("UTC");
    expect(session.searchPath).toBe("public");
    return session.pid;
  })));
}
