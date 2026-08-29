import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATION_PATH = new URL(
  "../../../../prisma/migrations/20260829100000_promo_c5_refund_recovery/migration.sql",
  import.meta.url,
);

describe("promotion C5 migration 46", () => {
  let client: Client;
  let schema: string;
  let migrationSql: string;

  beforeEach(async () => {
    client = new Client({ connectionString: disposableDatabaseUrl() });
    await client.connect();
    schema = `promo_c5_${randomUUID().replaceAll("-", "")}`;
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

  it("has the exact append-only migration identity and no historical row rewrite", () => {
    expect(createHash("sha256").update(migrationSql).digest("hex"))
      .toBe("d9578049534c5bd6af17f0158f058ba1a14b72515a01ab4caa71c7e03e803563");
    expect(migrationSql).not.toMatch(/^\s*(?:INSERT|UPDATE)\b/gmu);
    expect(migrationSql).toContain('CREATE TABLE "RefundAttemptLineEconomicAllocation"');
    expect(migrationSql).toContain('NEW."recoveryGraceDays" IS DISTINCT FROM OLD."recoveryGraceDays"');
  });

  it("adds exactly the required allocation and recovery columns", async () => {
    await client.query(migrationSql);
    const columns = await client.query<{ tableName: string; columnName: string }>(`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = $1
        AND (
          (table_name = 'PromotionPolicyVersion' AND column_name = 'recoveryGraceDays')
          OR (table_name = 'PromotionGrant' AND column_name IN ('recoveredFromGrantId', 'recoveryEligibleAt'))
          OR table_name = 'RefundAttemptLineEconomicAllocation'
        )
      ORDER BY table_name, ordinal_position
    `, [schema]);
    expect(columns.rows).toEqual([
      { tableName: "PromotionGrant", columnName: "recoveredFromGrantId" },
      { tableName: "PromotionGrant", columnName: "recoveryEligibleAt" },
      { tableName: "PromotionPolicyVersion", columnName: "recoveryGraceDays" },
      { tableName: "RefundAttemptLineEconomicAllocation", columnName: "refundAttemptId" },
      { tableName: "RefundAttemptLineEconomicAllocation", columnName: "orderItemId" },
      { tableName: "RefundAttemptLineEconomicAllocation", columnName: "merchandiseRefundAmount" },
      { tableName: "RefundAttemptLineEconomicAllocation", columnName: "createdAt" },
    ]);
  });

  it("enforces allocation immutability and recovery provenance constraints", async () => {
    await client.query(migrationSql);
    await seedPolicyAndRefundLine(client);
    await client.query(`
      INSERT INTO "RefundAttemptLineEconomicAllocation"
        ("refundAttemptId", "orderItemId", "merchandiseRefundAmount")
      VALUES ('attempt-1', 'item-1', 900)
    `);
    await expect(client.query(`
      UPDATE "RefundAttemptLineEconomicAllocation"
      SET "merchandiseRefundAmount" = 899
      WHERE "refundAttemptId" = 'attempt-1'
    `)).rejects.toThrow("Refund line economic allocation is immutable");
    await expect(client.query(`
      DELETE FROM "RefundAttemptLineEconomicAllocation"
      WHERE "refundAttemptId" = 'attempt-1'
    `)).rejects.toThrow("Refund line economic allocation is immutable");
    await expect(client.query(`
      INSERT INTO "PromotionGrant" (
        "id", "userId", "policyVersionId", "grantKey", "issuedAt", "validFrom",
        "recoveredFromGrantId", "recoveryEligibleAt"
      ) VALUES (
        'self', 'user-1', 'policy-1', 'recovery:self', now(), now(), 'self', now()
      )
    `)).rejects.toThrow("PromotionGrant_recovery_not_self_check");
    await client.query(`
      INSERT INTO "PromotionGrant" (
        "id", "userId", "policyVersionId", "grantKey", "issuedAt", "validFrom", "redeemedAt"
      ) VALUES ('source', 'user-1', 'policy-1', 'source-key', now(), now(), now())
    `);
    await expect(client.query(`
      INSERT INTO "PromotionGrant" (
        "id", "userId", "policyVersionId", "grantKey", "issuedAt", "validFrom",
        "recoveredFromGrantId", "recoveryEligibleAt"
      ) VALUES ('bad-key', 'user-1', 'policy-1', 'wrong', now(), now(), 'source', now())
    `)).rejects.toThrow("PromotionGrant_recovery_key_check");
    await client.query(`
      INSERT INTO "PromotionGrant" (
        "id", "userId", "policyVersionId", "grantKey", "issuedAt", "validFrom",
        "recoveredFromGrantId", "recoveryEligibleAt"
      ) VALUES ('recovery', 'user-1', 'policy-1', 'recovery:source', now(), now(), 'source', now())
    `);
    await expect(client.query(`
      UPDATE "PromotionGrant" SET "recoveryEligibleAt" = now() + interval '1 second'
      WHERE "id" = 'recovery'
    `)).rejects.toThrow("Promotion grant recovery provenance is immutable");
  });

  it("makes recoveryGraceDays immutable after activation or grant use", async () => {
    await client.query(migrationSql);
    await seedPolicyAndRefundLine(client);
    await client.query(`
      UPDATE "PromotionPolicyVersion" SET "status" = 'ACTIVE' WHERE "id" = 'policy-1';
      INSERT INTO "PromotionGrant" (
        "id", "userId", "policyVersionId", "grantKey", "issuedAt", "validFrom"
      ) VALUES ('source', 'user-1', 'policy-1', 'source-key', now(), now())
    `);
    await expect(client.query(`
      UPDATE "PromotionPolicyVersion" SET "recoveryGraceDays" = 31 WHERE "id" = 'policy-1'
    `)).rejects.toThrow("Promotion policy economics are immutable after activation or use");
  });
});

async function installPrerequisites(client: Client): Promise<void> {
  await client.query(`
    CREATE TYPE "PromotionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
    CREATE TABLE "PromotionPolicyVersion" (
      "id" TEXT PRIMARY KEY,
      "programKey" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "kind" TEXT NOT NULL,
      "status" "PromotionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
      "startsAt" TIMESTAMP(3) NOT NULL,
      "endsAt" TIMESTAMP(3),
      "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
      "requiresQualifyingPurchase" BOOLEAN NOT NULL DEFAULT false,
      "grantValidityDays" INTEGER,
      "birthdayWindowBeforeDays" INTEGER,
      "birthdayWindowAfterDays" INTEGER,
      "birthdayLeapDayObservation" TEXT
    );
    CREATE TABLE "PromotionGrant" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "policyVersionId" TEXT NOT NULL REFERENCES "PromotionPolicyVersion"("id"),
      "grantKey" TEXT NOT NULL,
      "benefitYear" INTEGER,
      "originMarketCode" TEXT,
      "issuedAt" TIMESTAMP(3) NOT NULL,
      "validFrom" TIMESTAMP(3) NOT NULL,
      "expiresAt" TIMESTAMP(3),
      "revokedAt" TIMESTAMP(3),
      "redeemedAt" TIMESTAMP(3)
    );
    CREATE TABLE "RefundAttempt" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "RefundAttemptLine" (
      "refundAttemptId" TEXT NOT NULL,
      "orderItemId" TEXT NOT NULL,
      PRIMARY KEY ("refundAttemptId", "orderItemId")
    );
    CREATE FUNCTION "protect_promotion_policy_economics"()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER "PromotionPolicyVersion_economics_immutable"
    BEFORE INSERT OR UPDATE OR DELETE ON "PromotionPolicyVersion"
    FOR EACH ROW EXECUTE FUNCTION "protect_promotion_policy_economics"();
  `);
}

async function seedPolicyAndRefundLine(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO "PromotionPolicyVersion" (
      "id", "programKey", "version", "kind", "startsAt", "recoveryGraceDays"
    ) VALUES ('policy-1', 'program-1', 1, 'SIGNUP', now(), 30);
    INSERT INTO "RefundAttempt" ("id") VALUES ('attempt-1');
    INSERT INTO "RefundAttemptLine" ("refundAttemptId", "orderItemId")
    VALUES ('attempt-1', 'item-1');
  `);
}

function disposableDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for promotion C5 migration tests.");
  const parsed = new URL(value);
  if (!(["127.0.0.1", "localhost"].includes(parsed.hostname))
    || parsed.pathname.replace(/^\//u, "") !== "wig_platform_test") {
    throw new Error("Promotion C5 migration tests require the disposable local database.");
  }
  return value;
}
