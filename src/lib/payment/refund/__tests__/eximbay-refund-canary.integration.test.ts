import { createHash, randomUUID } from "node:crypto";
import {
  PaymentAdapterExecutionKind,
  PaymentMode,
  PaymentProvider,
  PrismaClient,
  RefundAttemptActorType,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  bootstrapEximbayP3eDatabaseRoles,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { consumeEximbayRefundCanaryApproval } from
  "../consume-eximbay-refund-canary-approval";
import { parseEximbayRefundCanaryEnvironment } from
  "../eximbay-refund-canary-environment";
import { selectExactEximbayRefundCanaryCandidate } from
  "../eximbay-refund-canary-exact-selector";
import { sealEximbayRefundCanaryTarget } from
  "../eximbay-refund-canary-target-binding";
import { EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION } from
  "../eximbay-refund-sandbox-canary-approval-contract";
import { runWithRefundProviderContactAdmission } from
  "../refund-provider-contact-admission";
import { runEximbayRefundCanaryOnce } from "../run-eximbay-refund-canary-once";
import { defaultRefundSandboxProviderFreePreflightDependencies } from
  "../run-refund-sandbox-provider-free-preflight";
import { runRefundSandboxProviderFreePreflight } from
  "../run-refund-sandbox-provider-free-preflight";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const fixtures: DispatchFixture[] = [];
let databaseUrl: string;
const RESTRICTED_ROLE_PASSWORD = "r12_restricted_fixture_only";

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

afterEach(async () => {
  await cleanupDispatchFixtures(...fixtures);
  fixtures.length = 0;
});

describe("exact Eximbay refund canary authority against disposable PostgreSQL", () => {
  it("admits exactly one concurrent CAS consumer for the same durable approval", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);

    const results = await Promise.all([
      consumeEximbayRefundCanaryApproval(db, prepared.authority),
      consumeEximbayRefundCanaryApproval(db, prepared.authority),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "ADMITTED", "APPROVAL_ALREADY_CONSUMED",
    ]);
    const approval = await approvalFor(prepared.fixture.commandId);
    expect(approval.consumedAt).toBeInstanceOf(Date);
    expect(approval.consumedExecutionId).toBe(prepared.authority.consumedExecutionId);
  });

  it("leaves authority untouched for the global admission loser with zero secret/provider work", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const entered = deferred<void>();
    const release = deferred<void>();
    const holder = runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl },
      async () => {
        entered.resolve();
        await release.promise;
        return "HELD";
      },
    );
    await entered.promise;
    const readSecret = vi.fn(() => Promise.reject(new Error("MUST_NOT_READ")));
    const fetch = vi.fn(() => Promise.reject(new Error("MUST_NOT_CONTACT")));
    const result = await runEximbayRefundCanaryOnce(prepared.env, {
      createDatabase: () => db,
      disconnectDatabase: () => Promise.resolve(),
      readSecret,
      fetch,
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 1,
      runAdmission: (env, operation) => runWithRefundProviderContactAdmission(env, operation),
    });
    expect(result.code).toBe("OVERLAP_SKIPPED");
    expect(readSecret).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect((await approvalFor(prepared.fixture.commandId)).consumedAt).toBeNull();
    release.resolve();
    await expect(holder).resolves.toEqual({ outcome: "ACQUIRED", result: "HELD" });
  });

  it("keeps consumption permanent when the post-commit secret read fails", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const readSecret = vi.fn(() => Promise.reject(new Error("SYNTHETIC_SECRET_FAILURE")));
    const fetch = vi.fn(() => Promise.reject(new Error("MUST_NOT_CONTACT")));

    const result = await runEximbayRefundCanaryOnce(prepared.env, {
      createDatabase: () => db,
      disconnectDatabase: () => Promise.resolve(),
      readSecret,
      fetch,
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 1,
      runAdmission: (env, operation) => runWithRefundProviderContactAdmission(env, operation),
    });
    expect(result.code).toBe("CREDENTIAL_UNAVAILABLE");
    expect(readSecret).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect((await approvalFor(prepared.fixture.commandId)).consumedAt).toBeInstanceOf(Date);
  });

  it("rolls back an uncommitted consumption tuple and permanently rejects reset after commit", async () => {
    const prepared = await prepareTarget();
    const approval = await createApproval(prepared);
    const capturedAt = new Date(approval.approvedAt.getTime() + 1_000);
    await expect(db.$transaction(async (tx) => {
      await tx.eximbayRefundSandboxCanaryApproval.update({
        where: { id: approval.id },
        data: {
          consumedAt: capturedAt,
          consumedExecutionId: prepared.authority.consumedExecutionId,
          consumedExecutionBindingDigest: prepared.authority.consumedExecutionBindingDigest,
        },
      });
      throw new Error("ROLLBACK_BEFORE_COMMIT");
    })).rejects.toThrow("ROLLBACK_BEFORE_COMMIT");
    expect((await approvalFor(prepared.fixture.commandId)).consumedAt).toBeNull();

    expect((await consumeEximbayRefundCanaryApproval(db, prepared.authority)).outcome)
      .toBe("ADMITTED");
    await expect(db.eximbayRefundSandboxCanaryApproval.update({
      where: { id: approval.id },
      data: {
        consumedAt: null,
        consumedExecutionId: null,
        consumedExecutionBindingDigest: null,
      },
    })).rejects.toThrow();
    expect((await approvalFor(prepared.fixture.commandId)).consumedAt).toBeInstanceOf(Date);
  });

  it("selects only the sealed command among multiple eligible commands", async () => {
    const first = await prepareTarget();
    const second = await prepareTarget();
    const selected = await selectExactEximbayRefundCanaryCandidate(db, first.fixture.commandId);
    expect(selected).toEqual({
      commandId: first.fixture.commandId,
      candidateClass: "READY",
      provider: "EXIMBAY",
    });
    expect(selected?.commandId).not.toBe(second.fixture.commandId);
  });

  it("counts only unconsumed approvals while preserving consumed historical evidence", async () => {
    const historical = await prepareTarget();
    await createApproval(historical);
    expect((await consumeEximbayRefundCanaryApproval(db, historical.authority)).outcome)
      .toBe("ADMITTED");
    const future = await prepareTarget();
    await createApproval(future);

    expect(await defaultRefundSandboxProviderFreePreflightDependencies
      .readUnconsumedEximbayCanaryApprovalCount(db)).toBe(1);
    expect(await db.eximbayRefundSandboxCanaryApproval.count()).toBe(2);
    await db.eximbayRefundSandboxCanaryApproval.delete({
      where: { commandId: future.fixture.commandId },
    });
    expect(await defaultRefundSandboxProviderFreePreflightDependencies
      .readUnconsumedEximbayCanaryApprovalCount(db)).toBe(0);
    expect(await db.eximbayRefundSandboxCanaryApproval.count()).toBe(1);
  });

  it("enforces provider, lifetime, digest, and all-or-none consumption constraints in PostgreSQL", async () => {
    const prepared = await prepareTarget();
    const base = approvalData(prepared, new Date());
    await expect(db.eximbayRefundSandboxCanaryApproval.create({
      data: { ...base, id: `invalid_provider_${randomUUID()}`, provider: PaymentProvider.TOSS },
    })).rejects.toThrow();
    await expect(db.eximbayRefundSandboxCanaryApproval.create({
      data: {
        ...base,
        id: `invalid_lifetime_${randomUUID()}`,
        expiresAt: new Date(base.approvedAt.getTime() + 60 * 60_000 + 1),
      },
    })).rejects.toThrow();
    await expect(db.eximbayRefundSandboxCanaryApproval.create({
      data: {
        ...base,
        id: `invalid_digest_${randomUUID()}`,
        approvalEvidenceDigest: "A".repeat(64),
      },
    })).rejects.toThrow();
    await expect(db.eximbayRefundSandboxCanaryApproval.create({
      data: {
        ...base,
        id: `invalid_consumption_${randomUUID()}`,
        consumedAt: new Date(base.approvedAt.getTime() + 1_000),
      },
    })).rejects.toThrow();
  });

  it("runs provider-free readiness with the exact restricted preflight role", async () => {
    await installRestrictedRoleAuthority();
    const preflight = restrictedPrisma("mira_refund_preflight");
    try {
      await expect(runRefundSandboxProviderFreePreflight({}, {
        ...defaultRefundSandboxProviderFreePreflightDependencies,
        inspectEnvironment: () => Object.freeze({
          DATABASE_URL: restrictedDatabaseUrl("mira_refund_preflight"),
          activationEnvironment: Object.freeze({}),
        }),
      })).resolves.toMatchObject({
        ok: true,
        code: "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE",
        providerExecution: "NOT_PERFORMED",
      });

      const historical = await prepareTarget();
      await createApproval(historical);
      expect((await consumeEximbayRefundCanaryApproval(db, historical.authority)).outcome)
        .toBe("ADMITTED");
      await expect(defaultRefundSandboxProviderFreePreflightDependencies
        .readUnconsumedEximbayCanaryApprovalCount(preflight)).resolves.toBe(0);
      await expect(preflight.eximbayRefundSandboxCanaryApproval.count()).resolves.toBe(1);
    } finally {
      await preflight.$disconnect();
    }

    const client = await restrictedPg("mira_refund_preflight");
    try {
      await expectPermissionDenied(client, `
        INSERT INTO "EximbayRefundSandboxCanaryApproval" DEFAULT VALUES
      `);
      await expectPermissionDenied(client, `
        UPDATE "EximbayRefundSandboxCanaryApproval"
        SET "consumedAt" = "consumedAt" WHERE false
      `);
      await expectPermissionDenied(client, `
        DELETE FROM "EximbayRefundSandboxCanaryApproval" WHERE false
      `);
    } finally {
      await client.end();
    }
  });

  it("allows only exact one-way approval consumption through the restricted canary role", async () => {
    await installRestrictedRoleAuthority();
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const canary = restrictedPrisma("mira_refund_canary");
    try {
      await expect(consumeEximbayRefundCanaryApproval(canary, prepared.authority)).resolves
        .toEqual({ outcome: "ADMITTED", commandId: prepared.fixture.commandId });
    } finally {
      await canary.$disconnect();
    }

    const client = await restrictedPg("mira_refund_canary");
    try {
      await expect(client.query(`
        SELECT "id" FROM "EximbayRefundSandboxCanaryApproval"
        WHERE "commandId" = $1
      `, [prepared.fixture.commandId])).resolves.toMatchObject({ rowCount: 1 });
      await expectPermissionDenied(client, `
        INSERT INTO "EximbayRefundSandboxCanaryApproval" DEFAULT VALUES
      `);
      await expectPermissionDenied(client, `
        DELETE FROM "EximbayRefundSandboxCanaryApproval" WHERE false
      `);
      await expectPermissionDenied(client, `
        UPDATE "EximbayRefundSandboxCanaryApproval"
        SET "issuedByPrincipalId" = 'forbidden' WHERE "commandId" = $1
      `, [prepared.fixture.commandId]);
      await expect(client.query(`
        UPDATE "EximbayRefundSandboxCanaryApproval"
        SET "consumedAt" = NULL,
            "consumedExecutionId" = NULL,
            "consumedExecutionBindingDigest" = NULL
        WHERE "commandId" = $1
      `, [prepared.fixture.commandId])).rejects.toThrow(
        "EXIMBAY_CANARY_APPROVAL_CONSUMPTION_IMMUTABLE",
      );
      await expectPermissionDenied(client, "CREATE TABLE forbidden_canary_table (id integer)");
      await expectPermissionDenied(client, `
        UPDATE "_prisma_migrations" SET logs = logs WHERE false
      `);
    } finally {
      await client.end();
    }
  });

  it("admits exactly one concurrent restricted-role CAS consumer", async () => {
    await installRestrictedRoleAuthority();
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const first = restrictedPrisma("mira_refund_canary");
    const second = restrictedPrisma("mira_refund_canary");
    try {
      const results = await Promise.all([
        consumeEximbayRefundCanaryApproval(first, prepared.authority),
        consumeEximbayRefundCanaryApproval(second, prepared.authority),
      ]);
      expect(results.map((result) => result.outcome).sort()).toEqual([
        "ADMITTED", "APPROVAL_ALREADY_CONSUMED",
      ]);
    } finally {
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  });
});

async function installRestrictedRoleAuthority(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await bootstrapEximbayP3eDatabaseRoles(admin, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "wig_platform_test",
    });
    await admin.query(`
      ALTER ROLE mira_refund_preflight PASSWORD '${RESTRICTED_ROLE_PASSWORD}';
      ALTER ROLE mira_refund_canary PASSWORD '${RESTRICTED_ROLE_PASSWORD}';
    `);
  } finally {
    await admin.end();
  }
}

function restrictedPrisma(role: "mira_refund_preflight" | "mira_refund_canary"): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: restrictedDatabaseUrl(role) }) });
}

async function restrictedPg(
  role: "mira_refund_preflight" | "mira_refund_canary",
): Promise<Client> {
  const client = new Client({ connectionString: restrictedDatabaseUrl(role) });
  await client.connect();
  return client;
}

function restrictedDatabaseUrl(role: "mira_refund_preflight" | "mira_refund_canary"): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = RESTRICTED_ROLE_PASSWORD;
  return url.toString();
}

async function expectPermissionDenied(
  client: Client,
  sql: string,
  values: readonly string[] = [],
): Promise<void> {
  await expect(client.query(sql, [...values])).rejects.toThrow(/permission denied/iu);
}

type PreparedTarget = Readonly<{
  fixture: DispatchFixture;
  targetBindingDigest: string;
  env: Readonly<Record<string, string>>;
  authority: NonNullable<ReturnType<typeof parseEximbayRefundCanaryEnvironment>>;
}>;

async function prepareTarget(): Promise<PreparedTarget> {
  const fixture = await createDispatchFixture({
    totalAmount: 1_234,
    targetAmount: 1_234,
    refundActorType: RefundAttemptActorType.SYSTEM,
    refundActorUserId: null,
  });
  fixtures.push(fixture);
  await seedEximbayPaymentForTest(fixture);
  await Promise.all([
    db.order.update({ where: { id: fixture.orderId }, data: { currency: "USD" } }),
    db.payment.update({
      where: { id: fixture.paymentId },
      data: { currency: "USD", adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL },
    }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: {
        currency: "USD",
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
      },
    }),
  ]);
  const sealed = await sealEximbayRefundCanaryTarget(db, {
    commandId: fixture.commandId,
    merchantAccountBindingId: "merchant-v1",
    credentialGenerationBindingId: "credential-v1",
    syntheticProvenanceDigest: "f".repeat(64),
    noCustomerPiiAttested: true,
  });
  const env = canaryEnvironment(sealed.targetBindingDigest);
  const authority = parseEximbayRefundCanaryEnvironment(env);
  if (!authority) throw new Error("EXPECTED_VALID_CANARY_AUTHORITY");
  return Object.freeze({
    fixture,
    targetBindingDigest: sealed.targetBindingDigest,
    env,
    authority,
  });
}

async function seedEximbayPaymentForTest(fixture: DispatchFixture): Promise<void> {
  await requireDisposableDatabase();
  await db.$executeRawUnsafe(
    'ALTER TABLE "Payment" DISABLE TRIGGER "Payment_provider_order_id_immutable"',
  );
  try {
    await db.payment.update({
      where: { id: fixture.paymentId },
      data: {
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        providerOrderId: syntheticEximbayProviderOrderId(),
      },
    });
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "Payment" ENABLE TRIGGER "Payment_provider_order_id_immutable"',
    );
  }
}

async function requireDisposableDatabase(): Promise<void> {
  const rows = await db.$queryRaw<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (rows.length !== 1 || rows[0]?.databaseName !== "wig_platform_test") {
    throw new Error("EXIMBAY_CANARY_TEST_REQUIRES_DISPOSABLE_DATABASE");
  }
}

async function createApproval(prepared: PreparedTarget) {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const now = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(now instanceof Date)) throw new Error("DATABASE_TIME_UNAVAILABLE");
  return db.eximbayRefundSandboxCanaryApproval.create({
    data: approvalData(prepared, now),
  });
}

function approvalData(prepared: PreparedTarget, now: Date) {
  return {
    id: `eximbay_canary_${randomUUID()}`,
    formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    approvalEvidenceDigest: "9".repeat(64),
    releaseBindingDigest: prepared.authority.releaseBindingDigest,
    canaryJobBindingDigest: prepared.authority.canaryJobBindingDigest,
    preflightJobBindingDigest: prepared.authority.preflightJobBindingDigest,
    imageBindingDigest: prepared.authority.imageBindingDigest,
    secretGenerationBindingDigest: prepared.authority.secretGenerationBindingDigest,
    targetBindingDigest: prepared.targetBindingDigest,
    commandId: prepared.fixture.commandId,
    approvedAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date(now.getTime() + 15 * 60_000),
    issuedByPrincipalId: "synthetic-reviewer",
  };
}

function approvalFor(commandId: string) {
  return db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({ where: { commandId } });
}

function canaryEnvironment(targetBindingDigest: string): Readonly<Record<string, string>> {
  const secretResource = "projects/mira-sbx1/secrets/eximbay-canary-key";
  const secretVersion = "7";
  const credential = "credential-v1";
  const secretGenerationBindingDigest = sha256(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1",
    secretResource, secretVersion, credential,
  ]));
  return Object.freeze({
    DATABASE_URL: databaseUrl,
    MIRA_REFUND_EXIMBAY_CANARY_LANE: "EXIMBAY_SANDBOX_V1",
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST: "a".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST: "b".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST: "c".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST: "d".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST:
      secretGenerationBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST: targetBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST: "f".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_NO_CUSTOMER_PII_ATTESTED: "TRUE",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: secretResource,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: secretVersion,
    EXIMBAY_SANDBOX_MID: "MIRA-SBX",
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-v1",
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING: credential,
    REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
    REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
    CLOUD_RUN_JOB: "job-1",
    CLOUD_RUN_EXECUTION: `execution-${randomUUID()}`,
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  });
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
