import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATION_DIRECTORY = "20260811120000_eximbay_ex2b1_provider_order_identity";
const MIGRATION_PATH = join(process.cwd(), "prisma/migrations", MIGRATION_DIRECTORY, "migration.sql");
const execFileAsync = promisify(execFile);

describe("EX2B1 provider-order identity migration", () => {
  let client: Client;
  let schemaName: string;
  let migrationSql: string;

  beforeEach(async () => {
    client = new Client({ connectionString: requireSafeTestDatabaseUrl() });
    await client.connect();
    schemaName = `ex2b1_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await createPreviousPaymentSurface(client);
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await client.end();
  });

  it("preserves non-EXIMBAY rows and enforces provider-scoped shape and uniqueness", async () => {
    await client.query(`INSERT INTO "Payment" ("id", "provider") VALUES ('mock_before', 'MOCK')`);
    await client.query(migrationSql);

    await expect(client.query(`SELECT "providerOrderId" FROM "Payment" WHERE "id" = 'mock_before'`))
      .resolves.toMatchObject({ rows: [{ providerOrderId: null }] });
    await expect(insertPayment(client, "eximbay_valid", "EXIMBAY", validId("0"))).resolves.toBeUndefined();
    await expect(insertPayment(client, "mock_valid", "MOCK", null)).resolves.toBeUndefined();
    await expect(insertPayment(client, "eximbay_null", "EXIMBAY", null))
      .rejects.toMatchObject({ code: "23514" });
    await expect(insertPayment(client, "eximbay_upper", "EXIMBAY", `c${"A".repeat(24)}`))
      .rejects.toMatchObject({ code: "23514" });
    await expect(insertPayment(client, "mock_identity", "MOCK", validId("1")))
      .rejects.toMatchObject({ code: "23514" });
    await expect(insertPayment(client, "eximbay_duplicate", "EXIMBAY", validId("0")))
      .rejects.toMatchObject({ code: "23505" });
  });

  it("rejects every providerOrderId mutation and provider-transition escape", async () => {
    await client.query(migrationSql);
    await insertPayment(client, "eximbay", "EXIMBAY", validId("2"));
    await insertPayment(client, "mock", "MOCK", null);

    await expect(client.query(`UPDATE "Payment" SET "providerOrderId" = $1 WHERE "id" = 'eximbay'`, [validId("3")]))
      .rejects.toThrow("Payment.providerOrderId is immutable");
    await expect(client.query(`UPDATE "Payment" SET "providerOrderId" = NULL WHERE "id" = 'eximbay'`))
      .rejects.toThrow("Payment.providerOrderId is immutable");
    await expect(client.query(`UPDATE "Payment" SET "providerOrderId" = $1 WHERE "id" = 'mock'`, [validId("4")]))
      .rejects.toThrow("Payment.providerOrderId is immutable");
    await expect(client.query(`UPDATE "Payment" SET "provider" = 'EXIMBAY' WHERE "id" = 'mock'`))
      .rejects.toMatchObject({ code: "23514" });
    await expect(client.query(`
      UPDATE "Payment"
      SET "provider" = 'EXIMBAY', "providerOrderId" = $1
      WHERE "id" = 'mock'
    `, [validId("5")])).rejects.toThrow("Payment.providerOrderId is immutable");
    await expect(client.query(`UPDATE "Payment" SET "provider" = 'MOCK' WHERE "id" = 'eximbay'`))
      .rejects.toMatchObject({ code: "23514" });
    await expect(client.query(`
      UPDATE "Payment"
      SET "provider" = 'MOCK', "providerOrderId" = NULL
      WHERE "id" = 'eximbay'
    `)).rejects.toThrow("Payment.providerOrderId is immutable");
  });

  it("rolls the entire EX2B1 installation back when a later DDL statement fails", async () => {
    const brokenMigration = migrationSql.replace(
      "COMMIT;",
      "CREATE INDEX \"EX2B1_forced_failure\" ON \"MissingTable\"(\"id\");\n\nCOMMIT;",
    );

    await expect(client.query(brokenMigration)).rejects.toThrow("MissingTable");
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);

    await expect(columnExists(client, "Payment", "providerOrderId")).resolves.toBe(false);
    await expect(constraintExists(client, "Payment_provider_order_identity_shape_check")).resolves.toBe(false);
    await expect(functionExists(client, "prevent_payment_provider_order_id_change")).resolves.toBe(false);
    await expect(indexExists(client, "Payment_provider_providerOrderId_key")).resolves.toBe(false);
  });
});

describe("EX2B1 repository migration history", () => {
  const schemas: string[] = [];
  const temporaryRoots: string[] = [];
  let admin: Client;

  beforeEach(async () => {
    admin = new Client({ connectionString: requireSafeTestDatabaseUrl() });
    await admin.connect();
  });

  afterEach(async () => {
    for (const schema of schemas.splice(0)) {
      await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    }
    for (const root of temporaryRoots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
    await admin.end();
  });

  it("deploys the complete repository history into an empty PostgreSQL schema", async () => {
    const schema = trackSchema(schemas, "ex2b1_full");
    await deployRepositoryMigrations(schema);

    await expect(columnExistsInSchema(admin, schema, "Payment", "providerOrderId"))
      .resolves.toBe(true);
    const applied = await admin.query<{ count: number }>(`
      SELECT COUNT(*)::integer AS "count"
      FROM ${quoteIdentifier(schema)}."_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `);
    expect(applied.rows[0]?.count).toBe(34);
  });

  it("fails on a real prior-migration schema with a historical EXIMBAY row before partial installation", async () => {
    const schema = trackSchema(schemas, "ex2b1_prior");
    const temporaryRoot = await createPreviousMigrationProject();
    temporaryRoots.push(temporaryRoot);
    await deployRepositoryMigrations(schema, temporaryRoot);
    const priorClient = new Client({ connectionString: databaseUrlForSchema(schema) });
    await priorClient.connect();
    await priorClient.query(`SET search_path TO ${quoteIdentifier(schema)}`);
    try {
      await insertHistoricalEximbayPayment(priorClient);
      const migrationSql = await readFile(MIGRATION_PATH, "utf8");

      await expect(priorClient.query(migrationSql))
        .rejects.toThrow("historical EXIMBAY Payment requires adjudication");
      await priorClient.query("ROLLBACK");

      await expect(columnExists(priorClient, "Payment", "providerOrderId")).resolves.toBe(false);
      await expect(constraintExists(priorClient, "Payment_provider_order_identity_shape_check"))
        .resolves.toBe(false);
      await expect(functionExists(priorClient, "prevent_payment_provider_order_id_change"))
        .resolves.toBe(false);
      await expect(indexExists(priorClient, "Payment_provider_providerOrderId_key"))
        .resolves.toBe(false);
    } finally {
      await priorClient.end();
    }
  });
});

async function createPreviousPaymentSurface(client: Client): Promise<void> {
  await client.query(`
    CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'TOSS', 'PAYPAL', 'EXIMBAY');
    CREATE TABLE "Payment" (
      "id" TEXT PRIMARY KEY,
      "provider" "PaymentProvider" NOT NULL
    );
  `);
}

async function insertPayment(
  client: Client,
  id: string,
  provider: "MOCK" | "EXIMBAY",
  providerOrderId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO "Payment" ("id", "provider", "providerOrderId") VALUES ($1, $2, $3)`,
    [id, provider, providerOrderId],
  );
}

async function createPreviousMigrationProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mira-ex2b1-prior-"));
  const prismaRoot = join(root, "prisma");
  const migrationsTarget = join(prismaRoot, "migrations");
  await mkdir(migrationsTarget, { recursive: true });
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  await cp(join(process.cwd(), "prisma/schema.prisma"), join(prismaRoot, "schema.prisma"));
  await cp(
    join(process.cwd(), "prisma/migrations/migration_lock.toml"),
    join(migrationsTarget, "migration_lock.toml"),
  );
  const entries = await readdir(join(process.cwd(), "prisma/migrations"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === MIGRATION_DIRECTORY) continue;
    await cp(
      join(process.cwd(), "prisma/migrations", entry.name),
      join(migrationsTarget, entry.name),
      { recursive: true },
    );
  }
  await writeFile(join(root, "prisma.config.ts"), [
    "import { defineConfig } from \"prisma/config\";",
    "",
    "export default defineConfig({",
    "  schema: \"prisma/schema.prisma\",",
    "  migrations: { path: \"prisma/migrations\" },",
    "  datasource: { url: process.env[\"DATABASE_URL\"] },",
    "});",
    "",
  ].join("\n"));
  return root;
}

async function deployRepositoryMigrations(schema: string, cwd = process.cwd()): Promise<void> {
  await execFileAsync(process.execPath, [
    join(process.cwd(), "node_modules/prisma/build/index.js"),
    "migrate",
    "deploy",
    "--config",
    join(cwd, "prisma.config.ts"),
  ], {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrlForSchema(schema) },
  });
}

async function insertHistoricalEximbayPayment(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO "User" ("id", "email", "updatedAt")
    VALUES ('ex2b1_user', 'ex2b1-user@example.test', NOW());
    INSERT INTO "Market" ("code", "currency", "shippableCountries", "defaultLocale")
    VALUES ('EX2', 'USD', ARRAY['US'], 'en');
    INSERT INTO "CheckoutSession" (
      "id", "userId", "marketCode", "currency", "status", "subtotalAmount",
      "shippingAmount", "totalAmount", "expiresAt", "updatedAt"
    ) VALUES (
      'ex2b1_session', 'ex2b1_user', 'EX2', 'USD', 'SUBMITTED', 100, 0, 100,
      NOW() + INTERVAL '1 hour', NOW()
    );
    INSERT INTO "Payment" (
      "id", "checkoutSessionId", "provider", "mode", "routingRuleId", "status",
      "attemptLifecycle", "amount", "currency", "idempotencyKey", "contactIntentAt",
      "createdAt", "updatedAt"
    ) VALUES (
      'ex2b1_historical', 'ex2b1_session', 'EXIMBAY', 'SANDBOX', 'historical.route',
      'INITIATED', 'CONTACT_AUTHORIZED', 100, 'USD', 'historical-ex2b1', NOW(), NOW(), NOW()
    );
  `);
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
    ) AS "exists"
  `, [table, column]);
  return result.rows[0]?.exists ?? false;
}

async function columnExistsInSchema(
  client: Client,
  schema: string,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    ) AS "exists"
  `, [schema, table, column]);
  return result.rows[0]?.exists ?? false;
}

async function constraintExists(client: Client, name: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint constraint_record
      JOIN pg_namespace namespace ON namespace.oid = constraint_record.connamespace
      WHERE namespace.nspname = current_schema() AND constraint_record.conname = $1
    ) AS "exists"
  `, [name]);
  return result.rows[0]?.exists ?? false;
}

async function functionExists(client: Client, name: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = current_schema() AND procedure.proname = $1
    ) AS "exists"
  `, [name]);
  return result.rows[0]?.exists ?? false;
}

async function indexExists(client: Client, name: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = $1
    ) AS "exists"
  `, [name]);
  return result.rows[0]?.exists ?? false;
}

function validId(character: string): string {
  return `c${character.repeat(24)}`;
}

function trackSchema(schemas: string[], prefix: string): string {
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  schemas.push(schema);
  return schema;
}

function databaseUrlForSchema(schema: string): string {
  const url = new URL(requireSafeTestDatabaseUrl());
  url.searchParams.set("schema", schema);
  return url.toString();
}

function requireSafeTestDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for EX2B1 migration tests");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (!local || !url.pathname.slice(1).startsWith("wig_platform_test")) {
    throw new Error("EX2B1 migration tests require a localhost wig_platform_test database");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
