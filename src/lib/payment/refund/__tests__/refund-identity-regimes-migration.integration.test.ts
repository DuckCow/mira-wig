import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveEximbayMerchantRefundId } from "../providers/eximbay/refund-id";

const MIGRATION_DIRECTORY = "20260820120000_refund_identity_regimes";
const MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations",
  MIGRATION_DIRECTORY,
  "migration.sql",
);

describe("refund identity-regime migration", () => {
  let client: Client;
  let schemaName: string;
  let migrationSql: string;

  beforeEach(async () => {
    client = new Client({ connectionString: requireSafeTestDatabaseUrl() });
    await client.connect();
    schemaName = `refund_identity_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    if (schemaName) {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    }
    await client.end();
  });

  it("preserves historical Toss bytes and installs both closed identity branches", async () => {
    await createPriorSurface(client, true);
    const before = await readHistoricalBinding(client);

    await client.query(migrationSql);

    expect(await readHistoricalBinding(client)).toEqual(before);
    await expect(insertEximbayFamily(client, "eximbay-family"))
      .resolves.toBeUndefined();
    await expect(insertUnknownTuple(client)).rejects.toMatchObject({ code: "23514" });
    await expect(insertMismatchedEximbayTuple(client)).rejects.toMatchObject({ code: "23514" });
  });

  it("allows repeated Toss wire keys and rejects duplicate Eximbay wire keys", async () => {
    await createPriorSurface(client, true);
    await client.query(migrationSql);

    await expect(insertDispatch(client, "toss-1", "TOSS", "same-toss-key"))
      .resolves.toBeUndefined();
    await expect(insertDispatch(client, "toss-2", "TOSS", "same-toss-key"))
      .resolves.toBeUndefined();
    const refundId = deriveEximbayMerchantRefundId("a".repeat(64), 1);
    await expect(insertDispatch(client, "eximbay-1", "EXIMBAY", refundId))
      .resolves.toBeUndefined();
    await expect(insertDispatch(client, "eximbay-2", "EXIMBAY", refundId))
      .rejects.toMatchObject({ code: "23505" });
  });

  it("persists one distinct R2 after R1 no-effect evidence under concurrent authorization", async () => {
    await createPriorSurface(client, true);
    await client.query(migrationSql);
    await insertPhysicalDispatch(
      client,
      "eximbay-r1",
      "command-unique",
      1,
      deriveEximbayMerchantRefundId("b".repeat(64), 1),
      "1".repeat(64),
    );
    await client.query(`
      INSERT INTO "RefundExecutionEvidence" ("id", "dispatchAttemptId", "outcome")
      VALUES ('r1-no-effect', 'eximbay-r1', 'NOT_EXECUTED_RETRYABLE')
    `);

    const challenger = await connectToSchema(schemaName);
    try {
      const contenders = await Promise.allSettled([
        insertPhysicalDispatch(
          client,
          "eximbay-r2-a",
          "command-unique",
          2,
          deriveEximbayMerchantRefundId("b".repeat(64), 2),
          "2".repeat(64),
        ),
        insertPhysicalDispatch(
          challenger,
          "eximbay-r2-b",
          "command-unique",
          2,
          deriveEximbayMerchantRefundId("b".repeat(64), 2),
          "3".repeat(64),
        ),
      ]);
      expect(contenders.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(contenders.filter((result) => result.status === "rejected")).toHaveLength(1);
    } finally {
      await challenger.end();
    }

    const reloaded = await connectToSchema(schemaName);
    try {
      const dispatches = await reloaded.query<{
        id: string;
        ordinal: number;
        providerOperationKey: string;
        requestFingerprint: string;
      }>(`
        SELECT "id", "ordinal", "providerOperationKey", "requestFingerprint"
        FROM "RefundExecutionDispatchAttempt"
        WHERE "commandId" = 'command-unique'
        ORDER BY "ordinal"
      `);
      const evidence = await reloaded.query<{ dispatchAttemptId: string }>(`
        SELECT "dispatchAttemptId" FROM "RefundExecutionEvidence" WHERE "id" = 'r1-no-effect'
      `);

      expect(dispatches.rows).toHaveLength(2);
      expect(dispatches.rows[0]).toMatchObject({
        id: "eximbay-r1",
        ordinal: 1,
        providerOperationKey: deriveEximbayMerchantRefundId("b".repeat(64), 1),
        requestFingerprint: "1".repeat(64),
      });
      expect(dispatches.rows[1]?.ordinal).toBe(2);
      expect(dispatches.rows[1]?.providerOperationKey)
        .toBe(deriveEximbayMerchantRefundId("b".repeat(64), 2));
      expect(dispatches.rows[1]?.requestFingerprint).not.toBe("1".repeat(64));
      expect(evidence.rows).toEqual([{ dispatchAttemptId: "eximbay-r1" }]);
    } finally {
      await reloaded.end();
    }
  });

  it("fails before DDL when a historical row is outside the installed Toss tuple", async () => {
    await createPriorSurface(client, false);

    await expect(client.query(migrationSql)).rejects.toThrow(
      "every historical binding to satisfy the installed Toss tuple",
    );
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);

    expect(await indexExists(client, "RefundDispatch_eximbay_operation_key_key")).toBe(false);
    expect(await constraintExists(client, "RefundProviderBinding_provider_toss_check")).toBe(true);
  });

  it("contains one constraint/index-only migration with no data rewrite", () => {
    expect(/CREATE\s+TABLE|ADD\s+COLUMN|\bUPDATE\b|\bINSERT\s+INTO\b/i.test(migrationSql))
      .toBe(false);
    expect((migrationSql.match(/CREATE\s+UNIQUE\s+INDEX/gi) ?? []).length).toBe(1);
    expect(migrationSql).toContain("WHERE \"provider\" = 'EXIMBAY'::\"PaymentProvider\"");
  });
});

async function createPriorSurface(client: Client, historicalTossValid: boolean): Promise<void> {
  await client.query(`
    CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'TOSS', 'PAYPAL', 'EXIMBAY');
    CREATE TYPE "PaymentMode" AS ENUM ('SANDBOX', 'LIVE');
    CREATE TABLE "RefundExecutionProviderOperationBinding" (
      "id" TEXT PRIMARY KEY,
      "refundAttemptId" TEXT NOT NULL,
      "provider" "PaymentProvider" NOT NULL,
      "mode" "PaymentMode" NOT NULL,
      "providerOperationKey" VARCHAR(300) NOT NULL,
      "operationKeyAlgorithmVersion" VARCHAR(64) NOT NULL,
      "wireContractVersion" VARCHAR(64) NOT NULL,
      "wireRequestFingerprint" VARCHAR(64) NOT NULL,
      "merchantAccountBindingId" VARCHAR(64) NOT NULL,
      "credentialGenerationBindingId" VARCHAR(64) NOT NULL
    );
    CREATE TABLE "RefundExecutionDispatchAttempt" (
      "id" TEXT PRIMARY KEY,
      "commandId" TEXT NOT NULL,
      "ordinal" INTEGER NOT NULL,
      "provider" "PaymentProvider" NOT NULL,
      "providerOperationKey" VARCHAR(512) NOT NULL,
      "requestFingerprint" VARCHAR(64) NOT NULL
    );
    CREATE TABLE "RefundExecutionEvidence" (
      "id" TEXT PRIMARY KEY,
      "dispatchAttemptId" TEXT NOT NULL UNIQUE
        REFERENCES "RefundExecutionDispatchAttempt"("id") ON DELETE RESTRICT,
      "outcome" TEXT NOT NULL
    );
    CREATE UNIQUE INDEX "RefundProviderBinding_operationKey_key"
      ON "RefundExecutionProviderOperationBinding"("providerOperationKey");
    CREATE UNIQUE INDEX "RefundExecutionDispatchAttempt_command_ordinal_key"
      ON "RefundExecutionDispatchAttempt"("commandId", "ordinal");
  `);
  await insertHistoricalBinding(client, historicalTossValid);
  await installHistoricalChecksNotValid(client);
}

async function insertHistoricalBinding(client: Client, valid: boolean): Promise<void> {
  await client.query(`
    INSERT INTO "RefundExecutionProviderOperationBinding" (
      "id", "refundAttemptId", "provider", "mode", "providerOperationKey",
      "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
      "merchantAccountBindingId", "credentialGenerationBindingId"
    ) VALUES (
      'historical', 'attempt-1', $1, 'SANDBOX', $2, $3, $4, $5, 'merchant_1', 'generation_1'
    )
  `, valid
    ? ["TOSS", tossFamily("a"), "toss-refund-v1", "refund-provider-toss-wire/v1", "b".repeat(64)]
    : ["EXIMBAY", tossFamily("a"), "toss-refund-v1", "refund-provider-toss-wire/v1", "b".repeat(64)]);
}

async function installHistoricalChecksNotValid(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE "RefundExecutionProviderOperationBinding"
      ADD CONSTRAINT "RefundProviderBinding_provider_toss_check"
        CHECK ("provider" = 'TOSS'::"PaymentProvider") NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_mode_sandbox_check"
        CHECK ("mode" = 'SANDBOX'::"PaymentMode") NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_operation_key_format_check"
        CHECK ("providerOperationKey" ~ '^toss-refund-v1-[0-9a-f]{64}$') NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_algorithm_version_check"
        CHECK ("operationKeyAlgorithmVersion" = 'toss-refund-v1') NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_wire_version_check"
        CHECK ("wireContractVersion" = 'refund-provider-toss-wire/v1') NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_wire_fingerprint_check"
        CHECK ("wireRequestFingerprint" ~ '^[0-9a-f]{64}$') NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_merchant_label_check"
        CHECK ("merchantAccountBindingId" ~ '^[A-Za-z0-9._-]{1,64}$') NOT VALID,
      ADD CONSTRAINT "RefundProviderBinding_generation_label_check"
        CHECK ("credentialGenerationBindingId" ~ '^[A-Za-z0-9._-]{1,64}$') NOT VALID;
  `);
}

async function readHistoricalBinding(client: Client): Promise<unknown> {
  const result = await client.query(`
    SELECT * FROM "RefundExecutionProviderOperationBinding" WHERE "id" = 'historical'
  `);
  return result.rows[0];
}

function insertEximbayFamily(client: Client, id: string): Promise<void> {
  return insertBinding(client, [
    id,
    `attempt-${id}`,
    "EXIMBAY",
    eximbayFamily("c"),
    "eximbay-refund-family-v1",
    "refund-provider-eximbay-cancel-wire/v1",
  ]);
}

function insertUnknownTuple(client: Client): Promise<void> {
  return insertBinding(client, [
    "unknown",
    "attempt-unknown",
    "MOCK",
    eximbayFamily("d"),
    "eximbay-refund-family-v1",
    "refund-provider-eximbay-cancel-wire/v1",
  ]);
}

function insertMismatchedEximbayTuple(client: Client): Promise<void> {
  return insertBinding(client, [
    "mismatch",
    "attempt-mismatch",
    "EXIMBAY",
    eximbayFamily("e"),
    "toss-refund-v1",
    "refund-provider-eximbay-cancel-wire/v1",
  ]);
}

function insertBinding(client: Client, values: readonly string[]): Promise<void> {
  return client.query(`
    INSERT INTO "RefundExecutionProviderOperationBinding" (
      "id", "refundAttemptId", "provider", "mode", "providerOperationKey",
      "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
      "merchantAccountBindingId", "credentialGenerationBindingId"
    ) VALUES ($1, $2, $3, 'SANDBOX', $4, $5, $6, $7, 'merchant_1', 'generation_1')
  `, [...values, "f".repeat(64)]).then(() => undefined);
}

function insertDispatch(
  client: Client,
  id: string,
  provider: "TOSS" | "EXIMBAY",
  providerOperationKey: string,
): Promise<void> {
  return client.query(`
    INSERT INTO "RefundExecutionDispatchAttempt" (
      "id", "commandId", "ordinal", "provider", "providerOperationKey", "requestFingerprint"
    ) VALUES ($1, $2, 1, $3, $4, $5)
  `, [id, `command-${id}`, provider, providerOperationKey, "a".repeat(64)]).then(() => undefined);
}

function insertPhysicalDispatch(
  client: Client,
  id: string,
  commandId: string,
  ordinal: number,
  providerOperationKey: string,
  requestFingerprint: string,
): Promise<void> {
  return client.query(`
    INSERT INTO "RefundExecutionDispatchAttempt" (
      "id", "commandId", "ordinal", "provider", "providerOperationKey", "requestFingerprint"
    ) VALUES ($1, $2, $3, 'EXIMBAY', $4, $5)
  `, [id, commandId, ordinal, providerOperationKey, requestFingerprint]).then(() => undefined);
}

async function indexExists(client: Client, name: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1
    ) AS "exists"
  `, [name]);
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

function tossFamily(character: string): string {
  return `toss-refund-v1-${character.repeat(64)}`;
}

function eximbayFamily(character: string): string {
  return `eximbay-refund-family-v1-${character.repeat(64)}`;
}

function requireSafeTestDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for refund identity migration tests.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!local || url.pathname !== "/wig_platform_test" || url.searchParams.get("schema") !== "public") {
    throw new Error("Refund identity migration tests require local wig_platform_test public schema.");
  }
  return value;
}

async function connectToSchema(schemaName: string): Promise<Client> {
  const connection = new Client({ connectionString: requireSafeTestDatabaseUrl() });
  await connection.connect();
  await connection.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
  return connection;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
