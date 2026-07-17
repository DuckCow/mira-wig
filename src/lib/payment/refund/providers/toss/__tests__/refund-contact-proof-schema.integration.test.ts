import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import {
  PaymentMode,
  PaymentProvider,
  Prisma,
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
import { deriveTossRefundOperationKey } from "../refund-operation-key";

const NOW = new Date("2026-07-17T05:00:00.123Z");
const MIGRATION_NAME = "20260717150000_e3b2a_toss_contact_proof_contracts";
const MIGRATION_PATH = join(process.cwd(), "prisma/migrations", MIGRATION_NAME, "migration.sql");

describe("E3B2A Toss contact-time proof schema", () => {
  let fixture: DispatchFixture;
  let dispatchId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("E3B2A contact-proof schema tests require wig_platform_test configuration.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
      throw new Error("E3B2A contact-proof schema tests require independently proven wig_platform_test.");
    }
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
    const dispatch = await db.refundExecutionDispatchAttempt.create({
      data: dispatchData(fixture),
    });
    dispatchId = dispatch.id;
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(fixture);
  });

  it("has the pristine migration applied without fabricated contact-proof rows", async () => {
    const migrations = await db.$queryRaw<{ applied: number }[]>(Prisma.sql`
      SELECT count(*)::int AS applied
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `);
    const before = await db.refundExecutionProviderContactEligibilityProof.count({
      where: { dispatchAttemptId: dispatchId },
    });

    await expect(runMigrationPreflight()).resolves.toBeUndefined();
    const after = await db.refundExecutionProviderContactEligibilityProof.count({
      where: { dispatchAttemptId: dispatchId },
    });
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migrations.length === 1 && migrations[0].applied === 1).toBe(true);
    expect(before === 0 && after === 0).toBe(true);
    expect(/(?:INSERT\s+INTO|UPDATE)\s+"RefundExecutionProviderContact/i.test(migration))
      .toBe(false);
  });

  it.each([false, true])(
    "executes the whole migration in an isolated schema with authorized dispatch present: %s",
    async (withAuthorizedDispatch) => {
      const result = await executeWholeMigrationInScratchSchema(withAuthorizedDispatch);

      expect(result.databaseName === "wig_platform_test").toBe(true);
      expect(result.dispatchCount === (withAuthorizedDispatch ? 1 : 0)).toBe(true);
      expect(result.proofCount === 0).toBe(true);
    },
  );

  it("owns exactly one proof through the direct dispatch FK and inverse relation", async () => {
    const proof = await db.refundExecutionProviderContactEligibilityProof.create({
      data: proofData(dispatchId),
      include: { dispatchAttempt: true },
    });
    const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { id: dispatchId },
      include: { contactEligibilityProof: true },
    });

    expect(proof.dispatchAttempt.id === dispatchId).toBe(true);
    expect(dispatch.contactEligibilityProof?.id === proof.id).toBe(true);
    expect(proof.createdAt instanceof Date).toBe(true);
    expect(proof.localReceivedAt.getTime() === NOW.getTime()).toBe(true);
  });

  it.each([
    ["blank payment key", { paymentKey: "   " }, "RefundContactProof_payment_key_check"],
    ["control payment key", { paymentKey: "key\nvalue" }, "RefundContactProof_payment_key_check"],
    ["oversize payment key", { paymentKey: "가".repeat(201) }, "value too long"],
    ["method", { method: "CARD" }, "RefundContactProof_method_check"],
    ["easy pay", { easyPayPresent: true }, "RefundContactProof_easy_pay_check"],
    ["currency", { currency: "USD" }, "RefundContactProof_currency_check"],
    ["status", { providerStatus: "CANCELED" }, "RefundContactProof_status_check"],
    ["total zero", { totalAmount: 0 }, "RefundContactProof_total_positive_check"],
    ["balance zero", { balanceAmount: 0 }, "RefundContactProof_balance_positive_check"],
    ["tax free", { taxFreeAmount: 1 }, "RefundContactProof_tax_free_zero_check"],
    ["tax exempt", { taxExemptionAmount: 1 }, "RefundContactProof_tax_exempt_zero_check"],
    ["cancels", { cancelsCount: 1 }, "RefundContactProof_cancels_zero_check"],
    ["uppercase fingerprint", { eligibilityFingerprint: "A".repeat(64) }, "RefundContactProof_fingerprint_check"],
    ["short fingerprint", { eligibilityFingerprint: "a".repeat(63) }, "RefundContactProof_fingerprint_check"],
  ])("rejects an invalid contact proof $label", async (_label, override, marker) => {
    await expectDatabaseFailure(
      db.refundExecutionProviderContactEligibilityProof.create({
        data: proofData(dispatchId, override),
      }),
      marker,
    );
  });

  it("accepts payment-key and integer maxima", async () => {
    const proof = await db.refundExecutionProviderContactEligibilityProof.create({
      data: proofData(dispatchId, {
        paymentKey: "가".repeat(200),
        totalAmount: 2_147_483_647,
        balanceAmount: 2_147_483_647,
      }),
    });

    expect(Array.from(proof.paymentKey).length === 200).toBe(true);
    expect(proof.totalAmount === 2_147_483_647 && proof.balanceAmount === 2_147_483_647)
      .toBe(true);
  });

  it("enforces unique dispatch ownership", async () => {
    await db.refundExecutionProviderContactEligibilityProof.create({
      data: proofData(dispatchId),
    });

    await expectPrismaCode(
      db.refundExecutionProviderContactEligibilityProof.create({
        data: proofData(dispatchId, { paymentKey: "synthetic-second-payment" }),
      }),
      "P2002",
    );
  });

  it("enforces direct FK ownership and restricts dispatch deletion", async () => {
    await expectPrismaCode(
      db.refundExecutionProviderContactEligibilityProof.create({
        data: proofData("missing-dispatch"),
      }),
      "P2003",
    );
    await db.refundExecutionProviderContactEligibilityProof.create({
      data: proofData(dispatchId),
    });

    await expectDatabaseFailure(
      db.refundExecutionDispatchAttempt.delete({ where: { id: dispatchId } }),
      "RefundContactProof_dispatch_fkey",
    );
  });

  it("allows a coherent TOSS AUTHORIZED dispatch through actual migration preflight", async () => {
    await expect(runMigrationPreflight()).resolves.toBeUndefined();
  });

  it("blocks actual migration preflight for a contacted Toss dispatch", async () => {
    await db.refundExecutionDispatchAttempt.update({
      where: { id: dispatchId },
      data: {
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        contactMarkedAt: NOW,
      },
    });

    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss contact-proof migration requires zero contacted Toss dispatch rows.",
    );
  });

  it("blocks actual migration preflight for Toss execution evidence", async () => {
    await db.refundExecutionEvidence.create({
      data: {
        commandId: fixture.commandId,
        source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
        sourceDedupKey: `e3b2a-evidence-${fixture.commandId}`,
        outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
        application: RefundExecutionEvidenceApplication.PARKED,
        safeCode: "SYNTHETIC_UNKNOWN",
        safeMessage: "Synthetic migration preflight fixture.",
        observedAt: NOW,
      },
    });

    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss contact-proof migration requires zero Toss execution evidence rows.",
    );
  });

  it("blocks actual migration preflight for a Toss provider refund identity", async () => {
    await db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { providerRefundId: "synthetic-provider-refund" },
    });

    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss contact-proof migration requires zero Toss provider refund identities.",
    );
  });

  it("leaves the existing authorization-time proof unchanged", async () => {
    const binding = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(fixture),
    });
    const before = await db.refundExecutionProviderEligibilityProof.create({
      data: authorizationProofData(binding.id),
    });

    await runMigrationPreflight();
    const after = await db.refundExecutionProviderEligibilityProof.findUniqueOrThrow({
      where: { bindingId: binding.id },
    });

    expect(after.id === before.id).toBe(true);
    expect(after.paymentKey === before.paymentKey).toBe(true);
    expect(after.eligibilityFingerprint === before.eligibilityFingerprint).toBe(true);
    expect(after.localReceivedAt.getTime() === before.localReceivedAt.getTime()).toBe(true);
  });
});

function dispatchData(
  fixture: DispatchFixture,
): Prisma.RefundExecutionDispatchAttemptUncheckedCreateInput {
  return {
    commandId: fixture.commandId,
    ordinal: 1,
    leaseGeneration: 1,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerOperationKey: deriveTossRefundOperationKey(fixture.operationKey),
    requestFingerprint: "c".repeat(64),
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    authorizedAt: NOW,
  };
}

function proofData(
  dispatchAttemptId: string,
  override: Partial<Prisma.RefundExecutionProviderContactEligibilityProofUncheckedCreateInput> = {},
): Prisma.RefundExecutionProviderContactEligibilityProofUncheckedCreateInput {
  return {
    dispatchAttemptId,
    paymentKey: "synthetic-contact-payment",
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
    eligibilityFingerprint: "d".repeat(64),
    ...override,
  };
}

function bindingData(
  fixture: DispatchFixture,
): Prisma.RefundExecutionProviderOperationBindingUncheckedCreateInput {
  return {
    refundAttemptId: fixture.refundAttemptId,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerOperationKey: deriveTossRefundOperationKey(fixture.operationKey),
    operationKeyAlgorithmVersion: "toss-refund-v1",
    wireContractVersion: "refund-provider-toss-wire/v1",
    wireRequestFingerprint: "a".repeat(64),
    merchantAccountBindingId: "merchant_sandbox_1",
    credentialGenerationBindingId: "credential_generation_1",
  };
}

function authorizationProofData(
  bindingId: string,
): Prisma.RefundExecutionProviderEligibilityProofUncheckedCreateInput {
  return {
    bindingId,
    paymentKey: "synthetic-authorization-payment",
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
  };
}

async function runMigrationPreflight(): Promise<void> {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!preflight) throw new Error("E3B2A migration preflight block was not found.");
  await db.$executeRawUnsafe(preflight);
}

async function expectDatabaseFailure(promise: Promise<unknown>, marker: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(databaseErrorDetails(error).includes(marker)).toBe(true);
    return;
  }
  throw new Error("Expected E3B2A database constraint to reject the test write.");
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Prisma.PrismaClientKnownRequestError && error.code === code).toBe(true);
    return;
  }
  throw new Error("Expected E3B2A database ownership constraint to reject the test write.");
}

function databaseErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}

async function executeWholeMigrationInScratchSchema(
  withAuthorizedDispatch: boolean,
): Promise<Readonly<{ databaseName: string; dispatchCount: number; proofCount: number }>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("E3B2A scratch migration requires test database configuration.");
  const schema = `e3b2a_${randomUUID().replaceAll("-", "")}`;
  if (!/^[a-z0-9_]+$/.test(schema)) throw new Error("Unsafe E3B2A scratch schema name.");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const database = await client.query<{ databaseName: string }>(
      'SELECT current_database() AS "databaseName"',
    );
    if (database.rows.length !== 1 || database.rows[0].databaseName !== "wig_platform_test") {
      throw new Error("E3B2A scratch migration is restricted to wig_platform_test.");
    }
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE "RefundAttempt" (
        "id" TEXT PRIMARY KEY,
        "provider" public."PaymentProvider" NOT NULL,
        "providerRefundId" TEXT
      );
      CREATE TABLE "RefundExecutionCommand" (
        "id" TEXT PRIMARY KEY,
        "refundAttemptId" TEXT NOT NULL
      );
      CREATE TABLE "RefundExecutionDispatchAttempt" (
        "id" TEXT PRIMARY KEY,
        "commandId" TEXT NOT NULL,
        "state" public."RefundExecutionDispatchAttemptState" NOT NULL
      );
      CREATE TABLE "RefundExecutionEvidence" (
        "id" TEXT PRIMARY KEY,
        "commandId" TEXT NOT NULL
      );
    `);
    if (withAuthorizedDispatch) await insertScratchAuthorizedDispatch(client);
    await client.query(readFileSync(MIGRATION_PATH, "utf8"));
    const counts = await client.query<{ dispatchCount: number; proofCount: number }>(`
      SELECT
        (SELECT count(*)::int FROM "RefundExecutionDispatchAttempt") AS "dispatchCount",
        (SELECT count(*)::int FROM "RefundExecutionProviderContactEligibilityProof") AS "proofCount"
    `);
    if (counts.rows.length !== 1) throw new Error("E3B2A scratch migration count failed.");
    return Object.freeze({ databaseName: database.rows[0].databaseName, ...counts.rows[0] });
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}

async function insertScratchAuthorizedDispatch(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO "RefundAttempt" ("id", "provider", "providerRefundId")
    VALUES ('attempt', 'TOSS', NULL);
    INSERT INTO "RefundExecutionCommand" ("id", "refundAttemptId")
    VALUES ('command', 'attempt');
    INSERT INTO "RefundExecutionDispatchAttempt" ("id", "commandId", "state")
    VALUES ('dispatch', 'command', 'AUTHORIZED');
  `);
}
