import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import {
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";

const MIGRATION_NAME = "20260717220000_e3c_a3_recovery_provenance";
const MIGRATION_PATH = join(process.cwd(), "prisma/migrations", MIGRATION_NAME, "migration.sql");
const NOW = new Date("2026-07-17T12:00:00.000Z");

describe("E3C-A3 recovery provenance schema", () => {
  let fixture: DispatchFixture;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url || new URL(url).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("E3C-A3 schema tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  beforeEach(async () => {
    fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
    await Promise.all([
      db.payment.update({
        where: { id: fixture.paymentId },
        data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
      }),
      db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
      }),
    ]);
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(fixture);
  });

  it("has one applied migration and executes wholly in an isolated pristine schema", async () => {
    const applied = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `);
    const scratch = await executeWholeMigrationInScratchSchema();
    expect(applied[0].count).toBe(1);
    expect(scratch).toEqual({ columns: 2, indexUnique: false, enumPresent: true });
  });

  it("allows nullable provenance, positive generation, and multiple evidence per dispatch", async () => {
    const dispatch = await createAuthorizedDispatch(1);
    const first = await db.refundExecutionEvidence.create({ data: evidenceData("first") });
    const second = await db.refundExecutionEvidence.create({
      data: evidenceData("second", {
        dispatchAttemptId: dispatch.id,
        authorizingLeaseGeneration: 1,
      }),
      include: { dispatchAttempt: true },
    });
    const third = await db.refundExecutionEvidence.create({
      data: evidenceData("third", { dispatchAttemptId: dispatch.id }),
    });
    const inverse = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { id: dispatch.id }, include: { evidence: true },
    });
    expect(first.dispatchAttemptId === null && first.authorizingLeaseGeneration === null).toBe(true);
    expect(second.dispatchAttempt?.id === dispatch.id).toBe(true);
    expect(third.dispatchAttemptId === dispatch.id && inverse.evidence.length === 2).toBe(true);
  });

  it.each([0, -1])("rejects authorizing generation %s", async (generation) => {
    await expectDatabaseFailure(
      db.refundExecutionEvidence.create({
        data: evidenceData(`generation-${generation}`, {
          authorizingLeaseGeneration: generation,
        }),
      }),
      "RefundEvidence_authorizing_generation_check",
    );
  });

  it("enforces the dispatch FK and restricts deletion", async () => {
    await expectPrismaCode(db.refundExecutionEvidence.create({
      data: evidenceData("missing", { dispatchAttemptId: "missing-dispatch" }),
    }), "P2003");
    const dispatch = await createAuthorizedDispatch(1);
    await db.refundExecutionEvidence.create({
      data: evidenceData("linked", { dispatchAttemptId: dispatch.id }),
    });
    await expectDatabaseFailure(
      db.refundExecutionDispatchAttempt.delete({ where: { id: dispatch.id } }),
      "RefundEvidence_dispatch_fkey",
    );
  });

  it("cascades an explicitly updated dispatch primary key", async () => {
    const dispatch = await createAuthorizedDispatch(1);
    const evidence = await db.refundExecutionEvidence.create({
      data: evidenceData("cascade", { dispatchAttemptId: dispatch.id }),
    });
    const replacement = `updated-${dispatch.id}`;
    await db.$executeRaw`UPDATE "RefundExecutionDispatchAttempt" SET "id" = ${replacement} WHERE "id" = ${dispatch.id}`;
    const updated = await db.refundExecutionEvidence.findUniqueOrThrow({ where: { id: evidence.id } });
    expect(updated.dispatchAttemptId).toBe(replacement);
  });

  it("accepts the recovery event and preserves one event per generation/type", async () => {
    await db.refundExecutionCommandEvent.create({ data: recoveryEventData() });
    await expectPrismaCode(
      db.refundExecutionCommandEvent.create({ data: recoveryEventData() }),
      "P2002",
    );
  });

  it("passes pristine preflight without fabricating rows", async () => {
    const before = await counts();
    await runMigrationPreflight();
    const after = await counts();
    expect(before).toEqual(after);
  });

  it("blocks contacted Toss history without a contact proof", async () => {
    await createContactedDispatch(1);
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration rejects contacted dispatch without proof.",
    );
  });

  it("blocks any contacted Toss history even when its contact proof is coherent", async () => {
    const dispatch = await createContactedDispatch(1);
    await db.refundExecutionProviderContactEligibilityProof.create({
      data: {
        dispatchAttemptId: dispatch.id,
        paymentKey: "synthetic-payment",
        method: "카드",
        easyPayPresent: false,
        currency: "KRW",
        providerStatus: "DONE",
        totalAmount: 85_000,
        balanceAmount: 85_000,
        taxFreeAmount: 0,
        taxExemptionAmount: 0,
        cancelsCount: 0,
        localReceivedAt: NOW,
        eligibilityFingerprint: "b".repeat(64),
      },
    });
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration requires zero contacted dispatch rows.",
    );
  });

  it("blocks a higher Toss ordinal", async () => {
    await createAuthorizedDispatch(2);
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration requires zero higher dispatch ordinals.",
    );
  });

  it("blocks any Toss evidence and any provider refund identity", async () => {
    await db.refundExecutionEvidence.create({ data: evidenceData("preflight") });
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration requires zero Toss evidence rows.",
    );
    await db.refundExecutionEvidence.deleteMany({ where: { commandId: fixture.commandId } });
    await db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { providerRefundId: "synthetic-refund" },
    });
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration requires zero Toss provider refund identities.",
    );
  });

  it("blocks multiple applied success authorities before the generic evidence predicate", async () => {
    await db.refundExecutionEvidence.createMany({ data: [
      evidenceData("success-1", {
        outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
        application: RefundExecutionEvidenceApplication.APPLIED,
      }),
      evidenceData("success-2", {
        outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
        application: RefundExecutionEvidenceApplication.APPLIED,
      }),
    ] });
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration rejects multiple applied success authorities.",
    );
  });

  it("blocks conflicting Toss provider identities in one order aggregate", async () => {
    await db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { providerRefundId: "synthetic-refund-a" },
    });
    const secondId = `second-${randomUUID()}`;
    await db.refundAttempt.create({
      data: {
        id: secondId,
        orderId: fixture.orderId,
        paymentId: fixture.paymentId,
        amount: fixture.targetAmount,
        currency: "KRW",
        status: RefundAttemptStatus.CANCELLED,
        reason: "Synthetic preflight conflict.",
        actorType: RefundAttemptActorType.SYSTEM,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        idempotencyKey: `synthetic-conflict-${secondId}`,
        providerRefundId: "synthetic-refund-b",
        requestedAt: NOW,
      },
    });
    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss recovery-provenance migration rejects conflicting provider identities.",
    );
  });

  function evidenceData(
    suffix: string,
    override: Partial<Prisma.RefundExecutionEvidenceUncheckedCreateInput> = {},
  ): Prisma.RefundExecutionEvidenceUncheckedCreateInput {
    return {
      commandId: fixture.commandId,
      source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
      sourceDedupKey: `e3c-a3-${suffix}-${fixture.commandId}`,
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      application: RefundExecutionEvidenceApplication.PARKED,
      safeCode: "PROVIDER_OUTCOME_UNKNOWN",
      safeMessage: "Synthetic bounded observation.",
      observedAt: NOW,
      ...override,
    };
  }

  function recoveryEventData(): Prisma.RefundExecutionCommandEventUncheckedCreateInput {
    return {
      commandId: fixture.commandId,
      eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
      leaseGeneration: 1,
      dispatchAttempt: 1,
      occurredAt: NOW,
    };
  }

  async function createAuthorizedDispatch(ordinal: number) {
    return db.refundExecutionDispatchAttempt.create({
      data: {
        commandId: fixture.commandId,
        ordinal,
        leaseGeneration: 1,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        providerOperationKey: "synthetic-operation",
        requestFingerprint: "a".repeat(64),
        state: RefundExecutionDispatchAttemptState.AUTHORIZED,
        authorizedAt: NOW,
      },
    });
  }

  async function createContactedDispatch(ordinal: number) {
    return db.refundExecutionDispatchAttempt.create({
      data: {
        commandId: fixture.commandId,
        ordinal,
        leaseGeneration: 1,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        providerOperationKey: "synthetic-operation",
        requestFingerprint: "a".repeat(64),
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        authorizedAt: NOW,
        contactMarkedAt: NOW,
      },
    });
  }
});

async function runMigrationPreflight(): Promise<void> {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!preflight) throw new Error("E3C-A3 migration preflight block was not found.");
  await db.$executeRawUnsafe(preflight);
}

async function counts() {
  const [evidence, events, dispatches] = await Promise.all([
    db.refundExecutionEvidence.count(),
    db.refundExecutionCommandEvent.count(),
    db.refundExecutionDispatchAttempt.count(),
  ]);
  return { evidence, events, dispatches };
}

async function expectDatabaseFailure(promise: Promise<unknown>, marker: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(databaseErrorDetails(error).includes(marker)).toBe(true);
    return;
  }
  throw new Error("Expected E3C-A3 database operation to fail.");
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Prisma.PrismaClientKnownRequestError && error.code === code).toBe(true);
    return;
  }
  throw new Error("Expected E3C-A3 Prisma operation to fail.");
}

function databaseErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? `${error.message}\n${JSON.stringify(error.meta)}`
    : error.message;
}

async function executeWholeMigrationInScratchSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("E3C-A3 scratch migration requires test database configuration.");
  const schema = `e3c_a3_${randomUUID().replaceAll("-", "")}`;
  if (!/^[a-z0-9_]+$/.test(schema)) throw new Error("Unsafe E3C-A3 scratch schema name.");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const database = await client.query<{ databaseName: string }>(
      'SELECT current_database() AS "databaseName"',
    );
    if (database.rows[0]?.databaseName !== "wig_platform_test") {
      throw new Error("E3C-A3 scratch migration is restricted to wig_platform_test.");
    }
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(scratchBaseSql());
    await client.query(readFileSync(MIGRATION_PATH, "utf8"));
    const result = await client.query<{ columns: number; indexUnique: boolean; enumPresent: boolean }>(`
      SELECT
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = '${schema}' AND table_name = 'RefundExecutionEvidence'
            AND column_name IN ('dispatchAttemptId', 'authorizingLeaseGeneration')) AS columns,
        (SELECT indisunique FROM pg_index WHERE indexrelid = '"${schema}"."RefundEvidence_dispatch_idx"'::regclass) AS "indexUnique",
        EXISTS (SELECT 1 FROM pg_enum enum JOIN pg_type type ON type.oid = enum.enumtypid
          JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
          WHERE namespace.nspname = '${schema}' AND type.typname = 'RefundExecutionCommandEventType'
            AND enum.enumlabel = 'RECOVERY_LEASE_ACQUIRED') AS "enumPresent"
    `);
    return result.rows[0];
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}

function scratchBaseSql(): string {
  return `
    CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'TOSS', 'PAYPAL');
    CREATE TYPE "RefundExecutionDispatchAttemptState" AS ENUM ('AUTHORIZED', 'CONTACT_MAY_HAVE_OCCURRED');
    CREATE TYPE "RefundExecutionEvidenceOutcome" AS ENUM ('SUCCEEDED', 'ACCEPTED_PENDING', 'NOT_EXECUTED_RETRYABLE', 'NOT_EXECUTED_TERMINAL', 'UNKNOWN');
    CREATE TYPE "RefundExecutionEvidenceApplication" AS ENUM ('APPLIED', 'PARKED', 'DUPLICATE', 'CONFLICT');
    CREATE TYPE "RefundExecutionCommandEventType" AS ENUM ('LEASE_ACQUIRED', 'PRE_CONTACT_RELEASED');
    CREATE TABLE "RefundAttempt" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "provider" "PaymentProvider" NOT NULL, "providerRefundId" TEXT);
    CREATE TABLE "RefundExecutionCommand" ("id" TEXT PRIMARY KEY, "refundAttemptId" TEXT NOT NULL);
    CREATE TABLE "RefundExecutionDispatchAttempt" ("id" TEXT PRIMARY KEY, "commandId" TEXT NOT NULL, "ordinal" INTEGER NOT NULL, "state" "RefundExecutionDispatchAttemptState" NOT NULL);
    CREATE TABLE "RefundExecutionProviderContactEligibilityProof" ("id" TEXT PRIMARY KEY, "dispatchAttemptId" TEXT NOT NULL);
    CREATE TABLE "RefundExecutionEvidence" ("id" TEXT PRIMARY KEY, "commandId" TEXT NOT NULL, "outcome" "RefundExecutionEvidenceOutcome" NOT NULL, "application" "RefundExecutionEvidenceApplication" NOT NULL);
  `;
}
