import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260823090000_persist_payment_adapter_execution_identity/migration.sql",
);

describe("payment adapter execution identity migration", () => {
  let client: Client;
  let schemaName: string;
  let migrationSql: string;

  beforeEach(async () => {
    client = new Client({ connectionString: requireSafeTestDatabaseUrl() });
    await client.connect();
    schemaName = `adapter_execution_identity_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await client.query(`
      CREATE TABLE "Payment" (
        "id" TEXT PRIMARY KEY,
        "attemptLifecycle" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "historicalMarker" TEXT NOT NULL
      )
    `);
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await client.end();
  });

  it("adds only the nullable enum identity and leaves every historical row unclassified", async () => {
    await client.query(`
      INSERT INTO "Payment" ("id", "attemptLifecycle", "status", "historicalMarker") VALUES
        ('terminal', 'FINALIZED', 'SUCCEEDED', 'terminal-preserved'),
        ('uncontacted', 'CONTACT_AUTHORIZED', 'INITIATED', 'uncontacted-preserved'),
        ('contacted', 'CONTACTED', 'AWAITING', 'contacted-preserved')
    `);

    await client.query(migrationSql);

    const rows = await client.query<{
      id: string;
      adapterExecutionKind: string | null;
      attemptLifecycle: string;
      status: string;
      historicalMarker: string;
    }>(`
      SELECT "id", "adapterExecutionKind", "attemptLifecycle", "status", "historicalMarker"
      FROM "Payment"
      ORDER BY "id"
    `);
    expect(rows.rows).toEqual([
      {
        id: "contacted",
        adapterExecutionKind: null,
        attemptLifecycle: "CONTACTED",
        status: "AWAITING",
        historicalMarker: "contacted-preserved",
      },
      {
        id: "terminal",
        adapterExecutionKind: null,
        attemptLifecycle: "FINALIZED",
        status: "SUCCEEDED",
        historicalMarker: "terminal-preserved",
      },
      {
        id: "uncontacted",
        adapterExecutionKind: null,
        attemptLifecycle: "CONTACT_AUTHORIZED",
        status: "INITIATED",
        historicalMarker: "uncontacted-preserved",
      },
    ]);
  });

  it("admits only MOCK or EXTERNAL and contains no default or historical UPDATE", async () => {
    expect(migrationSql).not.toMatch(/\bUPDATE\b/i);
    expect(migrationSql).not.toMatch(/\bDEFAULT\b/i);
    await client.query(migrationSql);

    await expect(insertPayment("mock", "MOCK")).resolves.toBeUndefined();
    await expect(insertPayment("external", "EXTERNAL")).resolves.toBeUndefined();
    await expect(insertPayment("invalid", "UNKNOWN")).rejects.toMatchObject({ code: "22P02" });
  });

  async function insertPayment(id: string, adapterExecutionKind: string): Promise<void> {
    await client.query(`
      INSERT INTO "Payment" (
        "id", "attemptLifecycle", "status", "historicalMarker", "adapterExecutionKind"
      ) VALUES ($1, 'CONTACT_AUTHORIZED', 'INITIATED', 'new-row', $2)
    `, [id, adapterExecutionKind]);
  }
});

function requireSafeTestDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for adapter identity migration tests");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (!local || !url.pathname.slice(1).startsWith("wig_platform_test")) {
    throw new Error("Adapter identity migration tests require a localhost wig_platform_test database");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
