import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATION_PATH = new URL(
  "../../../../prisma/migrations/20260829140000_promo_c5_recovery_checkpoint/migration.sql",
  import.meta.url,
);
const SCOPE_KEY = "PROMOTION_REFUND_RECOVERY";

describe("promotion C5 recovery checkpoint migration 47", () => {
  let client: Client;
  let schema: string;
  let migrationSql: string;

  beforeEach(async () => {
    client = new Client({ connectionString: disposableDatabaseUrl() });
    await client.connect();
    schema = `promo_c5_checkpoint_${randomUUID().replaceAll("-", "")}`;
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  it("installs only one empty scheduler-checkpoint table", async () => {
    expect(createHash("sha256").update(migrationSql).digest("hex"))
      .toBe("152840be2fda354ac75c0c4432461a5196d0a110fd44a6715d47895fc5b9bc71");
    expect(migrationSql).not.toMatch(/^\s*(?:INSERT|UPDATE|ALTER)\b/gmu);
    expect(migrationSql).not.toMatch(/"(?:Order|PromotionGrant|RefundAttempt|RefundAttemptLineEconomicAllocation)"/u);
    await client.query(migrationSql);

    const tables = await client.query<{ tableName: string }>(`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `, [schema]);
    expect(tables.rows).toEqual([{
      tableName: "PromotionRecoveryReconciliationCheckpoint",
    }]);
    await expect(client.query(`
      SELECT COUNT(*)::integer AS count
      FROM "PromotionRecoveryReconciliationCheckpoint"
    `)).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("accepts the singleton null cursor and rejects other scope or blank cursor state", async () => {
    await client.query(migrationSql);
    await expect(client.query(`
      INSERT INTO "PromotionRecoveryReconciliationCheckpoint" ("scopeKey", "lastOrderId")
      VALUES ($1, NULL)
    `, [SCOPE_KEY])).resolves.toBeDefined();
    await expect(client.query(`
      UPDATE "PromotionRecoveryReconciliationCheckpoint"
      SET "lastOrderId" = 'order-1'
      WHERE "scopeKey" = $1
    `, [SCOPE_KEY])).resolves.toBeDefined();
    await expect(client.query(`
      INSERT INTO "PromotionRecoveryReconciliationCheckpoint" ("scopeKey")
      VALUES ('OTHER_SCOPE')
    `)).rejects.toMatchObject({ code: "23514" });
    await expect(client.query(`
      UPDATE "PromotionRecoveryReconciliationCheckpoint"
      SET "lastOrderId" = '   '
      WHERE "scopeKey" = $1
    `, [SCOPE_KEY])).rejects.toMatchObject({ code: "23514" });
  });
});

function disposableDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for promotion checkpoint migration tests.");
  const parsed = new URL(value);
  if (!(parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    || parsed.pathname.replace(/^\//u, "") !== "wig_platform_test") {
    throw new Error("Promotion checkpoint migration tests require the disposable local database.");
  }
  return value;
}
