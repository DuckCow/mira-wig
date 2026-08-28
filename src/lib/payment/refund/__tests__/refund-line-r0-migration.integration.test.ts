import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260828170000_refund_line_r0/migration.sql",
);

let admin: Client | null = null;
const schemas: string[] = [];

beforeAll(async () => {
  const connectionString = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  admin = new Client({ connectionString });
  await admin.connect();
});

afterAll(async () => {
  const client = currentClient();
  for (const schema of schemas.splice(0)) {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await client.end();
  admin = null;
});

describe("RefundAttemptLine R0 forward migration", () => {
  it("preserves historical Attempt facts with zero guessed lines and installs exact constraints", async () => {
    const client = currentClient();
    const schema = `refund_line_r0_${randomUUID().replaceAll("-", "")}`;
    schemas.push(schema);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "RefundAttempt" (
        "id" TEXT PRIMARY KEY,
        "orderId" TEXT NOT NULL,
        "amount" INTEGER NOT NULL,
        "status" TEXT NOT NULL
      );
      CREATE TABLE "OrderItem" (
        "id" TEXT PRIMARY KEY,
        "orderId" TEXT NOT NULL
      );
      INSERT INTO "RefundAttempt" ("id", "orderId", "amount", "status")
      VALUES ('historical_attempt', 'order_1', 700, 'SUCCEEDED');
      INSERT INTO "OrderItem" ("id", "orderId")
      VALUES ('item_1', 'order_1'), ('item_zero', 'order_1'), ('item_other', 'order_2');
    `);
    const migration = await readFile(MIGRATION_PATH, "utf8");

    expect(migration).not.toMatch(/^\s*(?:INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/mu);
    await client.query(migration);

    await expect(client.query(`
      SELECT "id", "orderId", "amount", "status"
      FROM "RefundAttempt"
    `)).resolves.toMatchObject({
      rows: [{ id: "historical_attempt", orderId: "order_1", amount: 700, status: "SUCCEEDED" }],
    });
    await expect(client.query(`SELECT count(*)::int AS count FROM "RefundAttemptLine"`))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });

    await client.query(`
      INSERT INTO "RefundAttemptLine" ("refundAttemptId", "orderItemId", "orderId", quantity)
      VALUES ('historical_attempt', 'item_1', 'order_1', 1)
    `);
    await expect(client.query(`
      INSERT INTO "RefundAttemptLine" ("refundAttemptId", "orderItemId", "orderId", quantity)
      VALUES ('historical_attempt', 'item_1', 'order_1', 1)
    `)).rejects.toMatchObject({ code: "23505" });
    await expect(client.query(`
      INSERT INTO "RefundAttemptLine" ("refundAttemptId", "orderItemId", "orderId", quantity)
      VALUES ('historical_attempt', 'item_other', 'order_1', 1)
    `)).rejects.toMatchObject({ code: "23503" });
    await expect(client.query(`
      INSERT INTO "RefundAttemptLine" ("refundAttemptId", "orderItemId", "orderId", quantity)
      VALUES ('historical_attempt', 'item_zero', 'order_1', 0)
    `)).rejects.toMatchObject({ code: "23514" });

    const catalog = await client.query<{ name: string; type: string }>(`
      SELECT conname AS name, contype::text AS type
      FROM pg_constraint
      WHERE conrelid = '"RefundAttemptLine"'::regclass
        AND contype IN ('c', 'f', 'p')
      ORDER BY conname
    `);
    expect(catalog.rows).toEqual([
      { name: "RefundAttemptLine_orderItemId_orderId_fkey", type: "f" },
      { name: "RefundAttemptLine_pkey", type: "p" },
      { name: "RefundAttemptLine_quantity_positive_check", type: "c" },
      { name: "RefundAttemptLine_refundAttemptId_orderId_fkey", type: "f" },
    ]);
  });
});

function currentClient(): Client {
  if (!admin) throw new Error("Disposable migration test client is unavailable.");
  return admin;
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for refund line migration tests.");
  const parsed = new URL(value);
  const database = parsed.pathname.replace(/^\//u, "");
  if (!isLocalHost(parsed.hostname) || database !== "wig_platform_test") {
    throw new Error("Refund line migration tests require local wig_platform_test.");
  }
  return value;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
