import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireOwnedRefundTestCluster } from "../../refund/__tests__/retained-refund-test-history";

const MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260801120000_c0_commerce_integrity_foundation/migration.sql",
);
const execFileAsync = promisify(execFile);

describe("C0 commerce-integrity migration", () => {
  let client: Client;
  let schemaName: string;
  let migrationSql: string;

  beforeEach(async () => {
    const connectionString = requireSafeTestDatabaseUrl();
    client = new Client({ connectionString });
    await client.connect();
    schemaName = `c0_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await createLegacySurface(client);
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
    await client.end();
  });

  it("migrates an empty legacy surface and enforces blocking singularity and parent immutability", async () => {
    await client.query(migrationSql);

    await insertAuthorizedPayment(client, "payment_one", "session_one");
    await expect(insertAuthorizedPayment(client, "payment_two", "session_one"))
      .rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK");

    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
        "idempotencyKey", "routingRuleId", "contactIntentAt", "providerRef"
      ) VALUES (
        'bad_authorized', 'bad_authorized_session', 'INITIATED', 'CONTACT_AUTHORIZED', 100, 'KRW',
        'bad_authorized_key', 'route', NOW(), 'impossible_ref'
      )
    `)).rejects.toMatchObject({ code: "23514" });
    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
        "idempotencyKey", "contactIntentAt", "contactStartedAt"
      ) VALUES ('bad_success', 'bad_success_session', 'SUCCEEDED', 'CONTACTED', 100, 'KRW',
        'bad_success_key', NOW(), NOW())
    `)).rejects.toMatchObject({ code: "23514" });

    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await client.query(`INSERT INTO "WigVariant" ("id", "wigStyleId") VALUES ('variant_one', 'style_one')`);
    await expect(client.query(`UPDATE "WigVariant" SET "wigStyleId" = 'style_two' WHERE "id" = 'variant_one'`))
      .rejects.toThrow("WigVariant.wigStyleId is immutable");
  });

  it("enforces C0 payment evidence while preserving the two legitimate remediation shapes", async () => {
    await client.query(migrationSql);

    await expect(insertAuthorizedPayment(client, "negative", "negative_session", { amount: -1 }))
      .rejects.toMatchObject({ code: "23514" });
    for (const currency of ["", " krw", "krw", "KR W", "KRWW"]) {
      await expect(insertAuthorizedPayment(client, `currency_${randomUUID()}`, `currency_${randomUUID()}`, { currency }))
        .rejects.toMatchObject({ code: "23514" });
    }
    await expect(insertAuthorizedPayment(client, "missing_route", "missing_route_session", { routingRuleId: null }))
      .rejects.toMatchObject({ code: "23514" });

    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
        "idempotencyKey", "contactIntentAt", "contactStartedAt", "supersededAt", "blockingEndedAt"
      ) VALUES (
        'bad_superseded', 'bad_superseded_session', 'INITIATED', 'SUPERSEDED', 100, 'KRW',
        'bad_superseded_key', NOW(), NOW(), NOW(), NOW()
      )
    `)).rejects.toMatchObject({ code: "23514" });

    await insertAuthorizedPayment(client, "release_owner", "release_session");
    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "remediationStatus",
        "amount", "currency", "idempotencyKey", "contactIntentAt", "contactStartedAt",
        "providerPaymentKey", "financialSucceededAt", "blockingEndedAt", "suspendedByPaymentId"
      ) VALUES (
        'bad_release', 'release_session', 'SUCCEEDED', 'SUSPENDED', 'NONE',
        100, 'KRW', 'bad_release_key', NOW(), NOW(), 'financial-key', NOW(), NOW(), 'release_owner'
      )
    `)).rejects.toMatchObject({ code: "23514" });

    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
        "idempotencyKey", "providerPaymentKey", "financialSucceededAt", "blockingEndedAt"
      ) VALUES (
        'bad_voided', 'bad_voided_session', 'VOIDED', 'TERMINAL_REMEDIATED', 100, 'KRW',
        'bad_voided_key', 'bad-voided-provider-key', NOW(), NOW()
      )
    `)).rejects.toMatchObject({ code: "23514" });

    await insertDefensiveLateSuccess(client, "late_success", "late_success_session");
    await insertAuthorizedPayment(client, "webhook_owner", "webhook_session");
    await insertSuspendedPendingSuccess(client, "webhook_success", "webhook_session", "webhook_owner");
    await insertVerifiedTerminalRemediation(client, "terminal_remediated", "terminal_session");

    await expect(client.query(`SELECT "id" FROM "Payment" WHERE "id" IN (
      'late_success', 'webhook_success', 'terminal_remediated'
    )`)).resolves.toMatchObject({ rowCount: 3 });
    await expect(enumLabelExists(client, "PaymentAttemptLifecycle", "PRISTINE")).resolves.toBe(false);
  });

  it("enforces same-session suspension lineage, rejects self-links, and deliberately permits a cycle", async () => {
    await client.query(migrationSql);
    await insertAuthorizedPayment(client, "session_a_owner", "session_a");

    await expect(insertSuspendedPendingSuccess(client, "cross_session", "session_b", "session_a_owner"))
      .rejects.toMatchObject({ code: "23503" });
    await expect(client.query(`
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
        "idempotencyKey", "blockingEndedAt", "suspendedByPaymentId"
      ) VALUES (
        'self_link', 'self_session', 'INITIATED', 'SUSPENDED', 100, 'KRW',
        'self_link_key', NOW(), 'self_link'
      )
    `)).rejects.toMatchObject({ code: "23514" });

    await insertOrdinarySuperseded(client, "cycle_a", "cycle_session");
    await insertOrdinarySuperseded(client, "cycle_b", "cycle_session");
    await client.query(`
      UPDATE "Payment"
      SET "attemptLifecycle" = 'SUSPENDED',
          "suspendedByPaymentId" = CASE "id"
            WHEN 'cycle_a' THEN 'cycle_b'
            WHEN 'cycle_b' THEN 'cycle_a'
          END
      WHERE "id" IN ('cycle_a', 'cycle_b')
    `);
    await expect(client.query(`
      SELECT COUNT(*)::integer AS "count"
      FROM "Payment"
      WHERE "checkoutSessionId" = 'cycle_session' AND "attemptLifecycle" = 'SUSPENDED'
    `)).resolves.toMatchObject({ rows: [{ count: 2 }] });
  });

  it("applies the repository migration history through Prisma's migration runner", async () => {
    await requireOwnedRefundTestCluster();
    const baseUrl = requireSafeTestDatabaseUrl();
    const runnerDatabase = `c0_prisma_runner_${randomUUID().replaceAll("-", "")}`;
    const runnerUrl = new URL(baseUrl);
    runnerUrl.pathname = `/${runnerDatabase}`;
    runnerUrl.searchParams.set("schema", "public");
    // Current SECURITY DEFINER migrations deliberately bind canonical public
    // objects. Isolate the whole database instead of relocating those objects.
    await client.query(`CREATE DATABASE ${quoteIdentifier(runnerDatabase)}`);
    const runner = new Client({ connectionString: runnerUrl.toString() });
    try {
      await runner.connect();
      await execFileAsync(process.execPath, [
        join(process.cwd(), "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: runnerUrl.toString() },
      });
      const result = await runner.query<{ migration_name: string }>(`
        SELECT "migration_name"
        FROM public."_prisma_migrations"
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ORDER BY "migration_name"
      `);
      const expected = (await readdir(join(process.cwd(), "prisma/migrations")))
        .filter((name) => /^\d{14}_/u.test(name)).sort();
      expect(result.rows.map((row) => row.migration_name)).toEqual(expected);
      await expect(columnExistsInSchema(runner, "public", "Payment", "suspendedByPaymentId"))
        .resolves.toBe(true);
    } finally {
      await runner.end();
      await client.query(`DROP DATABASE ${quoteIdentifier(runnerDatabase)}`);
    }
  });

  it("rejects duplicate legacy blockers before any authoritative schema mutation", async () => {
    await client.query(`
      INSERT INTO "Payment" ("id", "checkoutSessionId", "status") VALUES
        ('legacy_one', 'legacy_session', 'INITIATED'),
        ('legacy_two', 'legacy_session', 'AWAITING')
    `);

    await expectMigrationFailure(client, schemaName, migrationSql, "duplicate legacy blocking payment attempts");
    await expect(columnExists(client, "Payment", "attemptLifecycle")).resolves.toBe(false);
    await expect(columnExists(client, "CheckoutSessionLine", "wigStyleId")).resolves.toBe(false);
  });

  it("rejects unclassifiable contacted or unknown legacy payment evidence atomically", async () => {
    await client.query(`
      INSERT INTO "Payment" ("id", "checkoutSessionId", "status", "providerRef")
      VALUES ('legacy_contacted', 'legacy_session', 'AWAITING', 'provider_ref')
    `);

    await expectMigrationFailure(client, schemaName, migrationSql, "legacy provider-contact outcome cannot be classified safely");
    await expect(columnExists(client, "Payment", "contactIntentAt")).resolves.toBe(false);
    await expect(typeExists(client, "PaymentAttemptLifecycle")).resolves.toBe(false);
  });

  it("never reconstructs historical line identity from the variant current parent", async () => {
    await client.query(`INSERT INTO "WigVariant" ("id", "wigStyleId") VALUES ('legacy_variant', 'current_parent')`);
    await client.query(`INSERT INTO "CheckoutSessionLine" ("id", "variantId") VALUES ('legacy_line', 'legacy_variant')`);
    await client.query(`INSERT INTO "OrderItem" ("id", "variantId") VALUES ('legacy_item', 'legacy_variant')`);

    await expectMigrationFailure(client, schemaName, migrationSql, "historical style identity is unavailable");
    await expect(columnExists(client, "CheckoutSessionLine", "wigStyleId")).resolves.toBe(false);
    await expect(columnExists(client, "OrderItem", "wigStyleId")).resolves.toBe(false);
    await expect(client.query(`SELECT "wigStyleId" FROM "CheckoutSessionLine"`)).rejects.toMatchObject({ code: "42703" });
  });

  it("rolls every preceding DDL statement back when a later migration constraint fails", async () => {
    const brokenMigration = migrationSql.replace(
      "CREATE UNIQUE INDEX \"Payment_one_blocking_attempt_per_session_key\"",
      "CREATE UNIQUE INDEX \"Payment_one_blocking_attempt_per_session_key\" ON \"MissingTable\"(\"id\");\nCREATE UNIQUE INDEX \"ignored\"",
    );

    await expectMigrationFailure(client, schemaName, brokenMigration, "MissingTable");
    await expect(columnExists(client, "Payment", "attemptLifecycle")).resolves.toBe(false);
    await expect(columnExists(client, "CheckoutSessionLine", "wigStyleId")).resolves.toBe(false);
    await expect(typeExists(client, "PaymentRemediationStatus")).resolves.toBe(false);
  });
});

async function createLegacySurface(client: Client): Promise<void> {
  await client.query(`
    CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'AWAITING', 'SUCCEEDED', 'FAILED', 'VOIDED');
    CREATE TABLE "Payment" (
      "id" TEXT PRIMARY KEY,
      "checkoutSessionId" TEXT NOT NULL,
      "status" "PaymentAttemptStatus" NOT NULL,
      "amount" INTEGER NOT NULL DEFAULT 0,
      "currency" TEXT NOT NULL DEFAULT 'KRW',
      "idempotencyKey" TEXT NOT NULL DEFAULT 'legacy-key',
      "providerRef" TEXT,
      "providerPaymentKey" TEXT
    );
    CREATE TABLE "CheckoutSessionLine" ("id" TEXT PRIMARY KEY, "variantId" TEXT NOT NULL);
    CREATE TABLE "OrderItem" ("id" TEXT PRIMARY KEY, "variantId" TEXT NOT NULL);
    CREATE TABLE "WigVariant" ("id" TEXT PRIMARY KEY, "wigStyleId" TEXT NOT NULL);
  `);
}

async function insertAuthorizedPayment(
  client: Client,
  paymentId: string,
  sessionId: string,
  options: { amount?: number; currency?: string; routingRuleId?: string | null } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO "Payment" (
      "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
      "idempotencyKey", "routingRuleId", "contactIntentAt"
    ) VALUES ($1, $2, 'INITIATED', 'CONTACT_AUTHORIZED', $3, $4, $5, $6, NOW())`,
    [
      paymentId,
      sessionId,
      options.amount ?? 100,
      options.currency ?? "KRW",
      `authorized:${paymentId}`,
      options.routingRuleId === undefined ? "test.route" : options.routingRuleId,
    ],
  );
}

async function insertDefensiveLateSuccess(client: Client, paymentId: string, sessionId: string): Promise<void> {
  await client.query(`
    INSERT INTO "Payment" (
      "id", "checkoutSessionId", "status", "attemptLifecycle", "remediationStatus",
      "amount", "currency", "idempotencyKey", "providerPaymentKey", "financialSucceededAt",
      "supersededAt"
    ) VALUES ($1, $2, 'SUCCEEDED', 'SUPERSEDED', 'PENDING', 100, 'KRW', $3, $4, NOW(), NOW())
  `, [paymentId, sessionId, `late:${paymentId}`, `provider:${paymentId}`]);
}

async function insertSuspendedPendingSuccess(
  client: Client,
  paymentId: string,
  sessionId: string,
  suspendedByPaymentId: string,
): Promise<void> {
  await client.query(`
    INSERT INTO "Payment" (
      "id", "checkoutSessionId", "status", "attemptLifecycle", "remediationStatus",
      "amount", "currency", "idempotencyKey", "contactIntentAt", "contactStartedAt",
      "providerPaymentKey", "financialSucceededAt", "blockingEndedAt", "suspendedByPaymentId"
    ) VALUES (
      $1, $2, 'SUCCEEDED', 'SUSPENDED', 'PENDING', 100, 'KRW', $3, NOW(), NOW(), $4, NOW(), NOW(), $5
    )
  `, [paymentId, sessionId, `suspended:${paymentId}`, `provider:${paymentId}`, suspendedByPaymentId]);
}

async function insertVerifiedTerminalRemediation(client: Client, paymentId: string, sessionId: string): Promise<void> {
  await client.query(`
    INSERT INTO "Payment" (
      "id", "checkoutSessionId", "status", "attemptLifecycle", "remediationStatus",
      "amount", "currency", "idempotencyKey", "providerPaymentKey", "financialSucceededAt",
      "blockingEndedAt", "remediationOperation", "remediationResultRef", "remediatedAt"
    ) VALUES (
      $1, $2, 'VOIDED', 'TERMINAL_REMEDIATED', 'REMEDIATED', 100, 'KRW', $3, $4, NOW(),
      NOW(), 'VOID', $5, NOW()
    )
  `, [paymentId, sessionId, `terminal:${paymentId}`, `provider:${paymentId}`, `result:${paymentId}`]);
}

async function insertOrdinarySuperseded(client: Client, paymentId: string, sessionId: string): Promise<void> {
  await client.query(`
    INSERT INTO "Payment" (
      "id", "checkoutSessionId", "status", "attemptLifecycle", "amount", "currency",
      "idempotencyKey", "contactIntentAt", "supersededAt", "blockingEndedAt"
    ) VALUES ($1, $2, 'INITIATED', 'SUPERSEDED', 100, 'KRW', $3, NOW(), NOW(), NOW())
  `, [paymentId, sessionId, `superseded:${paymentId}`]);
}

async function expectMigrationFailure(
  client: Client,
  schemaName: string,
  sql: string,
  message: string,
): Promise<void> {
  await expect(client.query(sql)).rejects.toThrow(message);
  await client.query("ROLLBACK");
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
}

async function columnExists(client: Client, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
    ) AS "exists"
  `, [tableName, columnName]);
  return result.rows[0]?.exists ?? false;
}

async function columnExistsInSchema(
  client: Client,
  schema: string,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    ) AS "exists"
  `, [schema, tableName, columnName]);
  return result.rows[0]?.exists ?? false;
}

async function enumLabelExists(client: Client, typeName: string, label: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum enum
      JOIN pg_type type ON type.oid = enum.enumtypid
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = current_schema() AND type.typname = $1 AND enum.enumlabel = $2
    ) AS "exists"
  `, [typeName, label]);
  return result.rows[0]?.exists ?? false;
}

async function typeExists(client: Client, typeName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type type
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = current_schema() AND type.typname = $1
    ) AS "exists"
  `, [typeName]);
  return result.rows[0]?.exists ?? false;
}

function requireSafeTestDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for C0 migration tests");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const database = url.pathname.slice(1);
  if (!local || (!database.startsWith("wig_platform_test") && !database.includes("c0_cod_c1"))) {
    throw new Error("C0 migration tests require a localhost test database");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
