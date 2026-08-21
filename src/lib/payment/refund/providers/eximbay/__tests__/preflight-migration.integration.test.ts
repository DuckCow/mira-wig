import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATION_PATH = new URL(
  "../../../../../../../prisma/migrations/20260820150000_eximbay_refund_preflight_observation/migration.sql",
  import.meta.url,
);

describe("Eximbay refund preflight observation migration", () => {
  let client: Client;
  let schema: string;
  let migrationSql: string;

  beforeEach(async () => {
    const connectionString = disposableDatabaseUrl();
    client = new Client({ connectionString });
    await client.connect();
    schema = `eximbay_preflight_${randomUUID().replaceAll("-", "")}`;
    migrationSql = await readFile(MIGRATION_PATH, "utf8");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await installPrerequisites(client);
  });

  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  it("fails closed before installation when an Eximbay dispatch already exists", async () => {
    await client.query(`INSERT INTO "RefundExecutionDispatchAttempt" ("provider") VALUES ('EXIMBAY')`);
    await expect(client.query(migrationSql)).rejects.toThrow(
      "requires zero historical Eximbay dispatch rows",
    );
    await client.query("ROLLBACK");
    const table = await client.query<{ tableName: string }>(`
      SELECT table_name AS "tableName" FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'RefundExecutionEximbayPreflightObservation'
    `, [schema]);
    expect(table.rows).toHaveLength(0);
  });

  it("adds one table with adjudicated widths, no backfill, and preserves Toss rows", async () => {
    await client.query(`INSERT INTO "RefundExecutionDispatchAttempt" ("provider") VALUES ('TOSS')`);
    await client.query(migrationSql);
    const columns = await client.query<{ columnName: string; maximumLength: number | null }>(`
      SELECT column_name AS "columnName", character_maximum_length AS "maximumLength"
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'RefundExecutionEximbayPreflightObservation'
    `, [schema]);
    const widths = Object.fromEntries(columns.rows.map((row) => [row.columnName, row.maximumLength]));
    expect(widths).toMatchObject({
      mid: 512,
      providerOrderId: 512,
      providerTransactionId: 512,
      providerStatus: 32,
      currency: 3,
      inquiryContractVersion: 64,
      parserVersion: 64,
      observationFingerprint: 64,
    });
    expect(await scalarCount(client, `SELECT count(*) FROM "RefundExecutionDispatchAttempt" WHERE "provider" = 'TOSS'`)).toBe(1);
    expect(migrationSql.match(/CREATE TABLE /gu)).toHaveLength(1);
    expect(migrationSql).not.toMatch(/^\s*(?:INSERT|UPDATE)\s/imu);
  });

  it("enforces identity, amount, version, uniqueness, FK, and immutability constraints", async () => {
    await client.query(migrationSql);
    await client.query(`INSERT INTO "RefundExecutionProviderOperationBinding" ("id") VALUES ('binding-1')`);
    await insertObservation(client, {});
    await expect(insertObservation(client, { id: "generation", observingLeaseGeneration: 0 }))
      .rejects.toThrow("EximbayPreflight_generation_check");
    await expect(insertObservation(client, { id: "blank", mid: " " }))
      .rejects.toThrow("EximbayPreflight_mid_check");
    await expect(insertObservation(client, { id: "control", providerOrderId: "bad\u0001" }))
      .rejects.toThrow("EximbayPreflight_order_check");
    await expect(insertObservation(client, { id: "currency", currency: "KRW" }))
      .rejects.toThrow("EximbayPreflight_currency_check");
    await expect(insertObservation(client, { id: "amount", originalAmount: 0, refundableBalance: 0 }))
      .rejects.toThrow("EximbayPreflight_original_amount_check");
    await expect(insertObservation(client, { id: "negative", refundableBalance: -1 }))
      .rejects.toThrow("EximbayPreflight_balance_nonnegative_check");
    await expect(insertObservation(client, { id: "excess", refundableBalance: 1_235 }))
      .rejects.toThrow("EximbayPreflight_balance_ceiling_check");
    await expect(insertObservation(client, { id: "version", inquiryContractVersion: "other" }))
      .rejects.toThrow("EximbayPreflight_inquiry_version_check");
    await expect(insertObservation(client, { id: "parser", parserVersion: "other" }))
      .rejects.toThrow("EximbayPreflight_parser_version_check");
    await expect(insertObservation(client, { id: "fingerprint", observationFingerprint: "A".repeat(64) }))
      .rejects.toThrow("EximbayPreflight_fingerprint_check");
    await expect(insertObservation(client, { id: "duplicate-generation", observationFingerprint: "b".repeat(64) }))
      .rejects.toThrow("EximbayPreflight_binding_generation_key");
    await client.query(`INSERT INTO "RefundExecutionProviderOperationBinding" ("id") VALUES ('binding-2')`);
    await expect(insertObservation(client, { id: "duplicate-fingerprint", bindingId: "binding-2" }))
      .rejects.toThrow("duplicate key value violates unique constraint");
    await expect(client.query(`DELETE FROM "RefundExecutionProviderOperationBinding" WHERE "id" = 'binding-1'`))
      .rejects.toThrow("bindingId_fkey");
    await expect(client.query(`UPDATE "RefundExecutionEximbayPreflightObservation" SET "refundableBalance" = 999 WHERE "id" = 'observation-1'`))
      .rejects.toThrow("is immutable");
  });
});

async function installPrerequisites(client: Client): Promise<void> {
  await client.query(`CREATE TYPE "PaymentProvider" AS ENUM ('TOSS', 'EXIMBAY')`);
  await client.query(`CREATE TABLE "RefundExecutionProviderOperationBinding" ("id" TEXT PRIMARY KEY)`);
  await client.query(`CREATE TABLE "RefundExecutionDispatchAttempt" ("provider" "PaymentProvider" NOT NULL)`);
}

type ObservationOverride = Readonly<{
  id?: string;
  bindingId?: string;
  observingLeaseGeneration?: number;
  mid?: string;
  providerOrderId?: string;
  currency?: string;
  originalAmount?: number;
  refundableBalance?: number;
  inquiryContractVersion?: string;
  parserVersion?: string;
  observationFingerprint?: string;
}>;

async function insertObservation(client: Client, override: ObservationOverride): Promise<void> {
  const value = {
    id: "observation-1",
    bindingId: "binding-1",
    observingLeaseGeneration: 1,
    mid: "merchant-mid",
    providerOrderId: "order-1",
    providerTransactionId: "transaction-1",
    providerStatus: "SALE",
    currency: "USD",
    originalAmount: 1_234,
    refundableBalance: 1_000,
    observedAt: new Date("2026-08-20T01:02:03.456Z"),
    inquiryContractVersion: "refund-provider-eximbay-inquiry/v1",
    parserVersion: "refund-provider-eximbay-inquiry-parser/v1",
    observationFingerprint: "a".repeat(64),
    ...override,
  };
  await client.query(`
    INSERT INTO "RefundExecutionEximbayPreflightObservation" (
      "id", "bindingId", "observingLeaseGeneration", "mid", "providerOrderId",
      "providerTransactionId", "providerStatus", "currency", "originalAmount",
      "refundableBalance", "observedAt", "inquiryContractVersion", "parserVersion",
      "observationFingerprint"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    value.id, value.bindingId, value.observingLeaseGeneration, value.mid,
    value.providerOrderId, value.providerTransactionId, value.providerStatus,
    value.currency, value.originalAmount, value.refundableBalance, value.observedAt,
    value.inquiryContractVersion, value.parserVersion, value.observationFingerprint,
  ]);
}

async function scalarCount(client: Client, sql: string): Promise<number> {
  const result = await client.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count);
}

function disposableDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for Eximbay preflight migration tests.");
  const parsed = new URL(value);
  if (parsed.hostname !== "127.0.0.1"
    || parsed.pathname.replace(/^\//u, "") !== "wig_platform_test") {
    throw new Error("Eximbay preflight migration tests require the disposable local database.");
  }
  return value;
}
