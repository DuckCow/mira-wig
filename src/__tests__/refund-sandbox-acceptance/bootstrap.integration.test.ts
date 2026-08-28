import { createHash, randomBytes } from "node:crypto";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import {
  AcceptanceBootstrap,
  acceptanceBootstrapOrderItemId,
  type AcceptanceBootstrapHandle,
} from "../../../scripts/refund-sandbox-acceptance/bootstrap";
import {
  assertRunResidueZero,
  cleanupRunDatabase,
  type RefundFixtureIds,
} from "../../../scripts/refund-sandbox-acceptance/cleanup";
import { requestRefundAttempt } from "../../lib/payment/refund/request";
import { claimRefundAttemptForExecution } from "../../lib/payment/refund/claim";
import { acquireRefundExecutionLease } from "../../lib/payment/refund/acquire-lease";
import {
  defaultDriftCheck,
  PRISMA_VERIFY_TIMEOUT_MS,
  repositoryMigrations,
  verifyAcceptanceDatabase,
  verifyMigrationRecords,
  type MigrationRecord,
} from "../../../scripts/refund-sandbox-acceptance/database-verifier";
import {
  DATABASE_CHECK_INVARIANTS_INVALID,
  EXPECTED_CHECK_INVARIANT_COUNT,
  readDatabaseInvariantCatalog,
  verifyDatabaseInvariantCatalog,
  verifyDatabaseInvariants,
  type DatabaseInvariantQueryClient,
} from "../../../scripts/refund-sandbox-acceptance/database-invariants";
import { H1ArtifactStore } from "../../../scripts/refund-sandbox-acceptance/artifact-store";
import { atomicWriteJson, ordinaryDelete } from "../../../scripts/refund-sandbox-acceptance/atomic-files";
import { cleanupCommand } from "../../../scripts/refund-sandbox-acceptance/cli-runtime";
import { RunLedgerStore, type H1Ledger } from "../../../scripts/refund-sandbox-acceptance/run-ledger";

type Owned = Readonly<{ handle: AcceptanceBootstrapHandle; refund: RefundFixtureIds | null }>;
type CatalogMutationOutcome =
  | Readonly<{ kind: "EXPECTED_M3_REJECTION"; message: string }>
  | Readonly<{ kind: "UNEXPECTED_M3_SUCCESS" }>
  | Readonly<{ kind: "MUTATION_OR_VERIFIER_ERROR"; error: unknown }>;
type CatalogMutation = (transaction: Prisma.TransactionClient) => Promise<void>;
type CatalogVerifier = (client: DatabaseInvariantQueryClient) => Promise<void>;

const FORCED_CATALOG_ROLLBACK = new Error("TEST_FORCED_CATALOG_ROLLBACK");
// Two serial Prisma children each own a kill-and-close deadline. The outer test must
// outlive both so their bounded runner, rather than Vitest's default, owns termination.
const DATABASE_VERIFICATION_TEST_TIMEOUT_MS = (2 * PRISMA_VERIFY_TIMEOUT_MS) + 5_000;
const owned: Owned[] = [];
const bootstrap = new AcceptanceBootstrap(db, "wig_platform_test");

beforeEach(async () => {
  const configured = process.env.DATABASE_URL;
  expect(configured && new URL(configured).pathname.replace(/^\//, "")).toBe("wig_platform_test");
  expect(await db.$queryRaw<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`)
    .toEqual([{ databaseName: "wig_platform_test" }]);
});

afterEach(async () => {
  for (const entry of owned.splice(0).reverse()) {
    await cleanupRunDatabase(db, bootstrap, entry.handle, entry.refund);
    await assertRunResidueZero(db, entry.handle, entry.refund);
  }
});

describe("acceptance-only pre-refund bootstrap", () => {
  it("guards the exact database before creating any row", async () => {
    const input = bootstrapInput("S1");
    const guarded = new AcceptanceBootstrap(db, "wig_platform_acceptance");
    const before = await h1AggregateCounts();
    await expect(guarded.createOrLoad(input)).rejects.toThrow("BOOTSTRAP_DATABASE_GUARD_FAILED");
    expect(await h1AggregateCounts()).toEqual(before);
  });

  it("makes the real CLI database verifier reject wig_platform_test before drift tooling", async () => {
    const prismaCommandRunner = vi.fn();
    await expect(verifyAcceptanceDatabase(db, {
      configuredUrl: process.env.DATABASE_URL,
      migrationsDirectory: "prisma/migrations",
      prismaCommandRunner,
    })).rejects.toThrow("ACCEPTANCE_DATABASE_REQUIRED");
    expect(prismaCommandRunner).not.toHaveBeenCalled();
  });

  it("composes exact M1, actual read-only M2, and PostgreSQL-18 M3 without residue", async () => {
    const before = await validationSnapshot();
    expect(before.advisoryLocks).toEqual([{ count: 0 }]);
    const repository = await repositoryMigrations("prisma/migrations");
    const applied = await appliedMigrations();

    verifyMigrationRecords(repository, applied);
    await defaultDriftCheck(testDatabaseUrl());
    const catalog = await readDatabaseInvariantCatalog(db);
    expect(Math.trunc(catalog.serverVersionNum / 10_000)).toBe(18);
    expect(catalog.checks).toHaveLength(EXPECTED_CHECK_INVARIANT_COUNT);
    expect(() => verifyDatabaseInvariantCatalog(catalog)).not.toThrow();

    expect(await validationSnapshot()).toEqual(before);
  }, DATABASE_VERIFICATION_TEST_TIMEOUT_MS);

  it("rejects CHECK TRUE through the actual M3 verifier and rolls catalog DDL back", async () => {
    const before = await readDatabaseInvariantCatalog(db);
    const outcome = await runCatalogMutationWithForcedRollback(
      replaceReasonCheckWithTrue,
      verifyDatabaseInvariants,
    );
    await expectCatalogRestored(before);
    expect(outcome.kind).toBe("EXPECTED_M3_REJECTION");
    expect(() => requireExpectedM3Rejection(outcome)).not.toThrow();
  });

  it("rolls CHECK TRUE back and reports simulated unexpected M3 acceptance", async () => {
    const before = await readDatabaseInvariantCatalog(db);
    const outcome = await runCatalogMutationWithForcedRollback(
      replaceReasonCheckWithTrue,
      () => Promise.resolve(),
    );
    await expectCatalogRestored(before);
    expect(outcome.kind).toBe("UNEXPECTED_M3_SUCCESS");
    expect(() => requireExpectedM3Rejection(outcome))
      .toThrow("DATABASE_INVARIANT_UNEXPECTED_SUCCESS");
  });

  it("rolls prior DDL back and reports a later ALTER failure", async () => {
    const before = await readDatabaseInvariantCatalog(db);
    const outcome = await runCatalogMutationWithForcedRollback(
      failAfterDroppingReasonCheck,
      verifyDatabaseInvariants,
    );
    await expectCatalogRestored(before);
    expect(outcome.kind).toBe("MUTATION_OR_VERIFIER_ERROR");
    expect(() => requireExpectedM3Rejection(outcome)).toThrow();
  });

  it("creates exactly the five-model pre-refund aggregate with a PAID order and no refund facts", async () => {
    const created = await bootstrap.createOrLoad(bootstrapInput("S1"));
    owned.push({ handle: created.handle, refund: null });
    expect(created.projection).toEqual({
      orderStatus: "PAID",
      paymentStatus: "SUCCEEDED",
      paymentProvider: "TOSS",
      paymentMode: "SANDBOX",
      checkoutStatus: "COMPLETED",
      currency: "KRW",
      amount: 1_001,
      refundAttempts: 0,
      refundTransitions: 0,
      commands: 0,
      commandEvents: 0,
      dispatches: 0,
      bindings: 0,
      eligibilityProofs: 0,
      contactProofs: 0,
      evidence: 0,
      orderItems: 1,
      orderShipping: 0,
      checkoutLines: 0,
    });
  });

  it("uses committed request, claim, and lease operations after bootstrap", async () => {
    const input = bootstrapInput("S2");
    const created = await bootstrap.createOrLoad(input);
    owned.push({ handle: created.handle, refund: null });
    const refundAttemptId = `h1_refund_${randomBytes(12).toString("hex")}`;
    const requested = await requestRefundAttempt(db, {
      refundAttemptId,
      orderId: created.handle.orderId,
      amount: input.fixture.amount,
      reason: "H1 test refund request",
      lines: [{ orderItemId: acceptanceBootstrapOrderItemId(created.handle), quantity: 1 }],
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "h1_test_actor",
      now: new Date("2026-07-18T02:00:00.000Z"),
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error("REQUEST_UNEXPECTED_FAILURE");
    expect(requested.orderStatus).toBe("REFUND_PENDING");
    const claimed = await claimRefundAttemptForExecution(db, {
      orderId: created.handle.orderId,
      refundAttemptId,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "h1_test_actor",
      now: new Date("2026-07-18T02:00:01.000Z"),
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) throw new Error("CLAIM_UNEXPECTED_FAILURE");
    owned[owned.length - 1] = {
      handle: created.handle,
      refund: { refundAttemptId, commandId: claimed.commandId },
    };
    const leased = await acquireRefundExecutionLease(db, {
      commandId: claimed.commandId,
      leaseOwner: "h1-test-owner",
    }, { REFUND_EXECUTION_LEASE_ENABLED: "ENABLED" });
    expect(leased.ok).toBe(true);
    expect(await db.refundAttemptTransition.count({ where: { refundAttemptId } })).toBe(2);
  });

  it("is mutation-free on an exact pre-contact rerun and fails closed on immutable mismatch", async () => {
    const input = bootstrapInput("S3");
    const first = await bootstrap.createOrLoad(input);
    owned.push({ handle: first.handle, refund: null });
    const before = await rowTimestamps(first.handle);
    const replay = await bootstrap.createOrLoad({ ...input, priorHandle: first.handle });
    expect(replay).toEqual(first);
    expect(await rowTimestamps(first.handle)).toEqual(before);
    await expect(bootstrap.createOrLoad({
      ...input,
      fixture: { ...input.fixture, amount: input.fixture.amount + 1 },
      priorHandle: first.handle,
    })).rejects.toThrow("BOOTSTRAP_OWNERSHIP_REQUIRED");
  });

  it("permanently refuses bootstrap after any possible provider-contact phase", async () => {
    const input = bootstrapInput("S2");
    await expect(bootstrap.createOrLoad({ ...input, ledgerPhase: "POST_INTENT_RECORDED" }))
      .rejects.toThrow("BOOTSTRAP_SEALED_AFTER_CONTACT");
  });

  it("keeps another run and a pre-existing KR market when exact owned cleanup runs", async () => {
    const first = await bootstrap.createOrLoad(bootstrapInput("S2"));
    const second = await bootstrap.createOrLoad(bootstrapInput("S2"));
    owned.push({ handle: first.handle, refund: null }, { handle: second.handle, refund: null });
    const removed = owned.shift();
    if (!removed) throw new Error("TEST_OWNERSHIP_MISSING");
    await cleanupRunDatabase(db, bootstrap, removed.handle, null);
    owned.unshift(removed);
    expect(await db.order.count({ where: { id: second.handle.orderId } })).toBe(1);
    expect(await db.market.count({ where: { code: "KR" } })).toBe(1);
  });

  it.each([
    ["S5", "S5_ACCEPTANCE_SCENARIO_RETIRED"],
    ["S6", "S6_ACCEPTANCE_SCENARIO_RETIRED"],
  ] as const)("retires direct %s bootstrap before database access", async (scenarioId, error) => {
    const databaseAccess = vi.fn(() => {
      throw new Error("RETIRED_BOOTSTRAP_DATABASE_ACCESS");
    });
    const guardedBootstrap = new AcceptanceBootstrap(new Proxy(db, {
      get: databaseAccess,
    }), "wig_platform_test");
    const input = bootstrapInput("S2");
    await expect(guardedBootstrap.createOrLoad({
      ...input,
      scenarioId,
      fixture: Object.freeze({ ...input.fixture, scenarioId }),
    })).rejects.toThrow(error);
    expect(databaseAccess).not.toHaveBeenCalled();
  });
});

describe("provider-only acceptance run retirement", () => {
  it.each(["S5", "S6"] as const)(
    "cleans a valid synthetic historical %s ownership ledger without provider contact",
    async (scenarioId) => {
      const seed = await bootstrap.createOrLoad(bootstrapInput("S1"));
      owned.push({ handle: seed.handle, refund: null });
      const historical = await createHistoricalOwnership(scenarioId);
      owned.push(historical);
      const root = await mkdtemp(join(tmpdir(), "mira-p2-historical-cleanup-"));
      const ledger = new RunLedgerStore(join(root, "ledger"));
      await ledger.append({
        runId: historical.handle.runId,
        scenarioId,
        phase: "SEALED",
        repositoryCommit: "a".repeat(40),
        runnerSourceHash: "b".repeat(64),
        policyHashes: Object.freeze({ policy: "c".repeat(64) }),
        migrationFingerprint: "d".repeat(64),
        scenarioInputHash: "e".repeat(64),
        payload: Object.freeze({
          scenarioId,
          bootstrapHandle: historical.handle,
          refundFixture: historical.refund,
          completionMarker: "SEALED",
        }),
      });

      try {
        await expect(cleanupCommand(
          historical.handle.runId,
          cleanupEnv(historical.handle.runId),
          { prisma: db, bootstrap, ledger },
        )).resolves.toEqual({
          code: "DATABASE_CLEANED",
          runId: historical.handle.runId,
        });
        owned.splice(owned.indexOf(historical), 1);
        await assertRunResidueZero(db, historical.handle, historical.refund);
        expect((await ledger.loadLatest())?.phase).toBe("DB_CLEANED");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["S3", "sbx-20260719T010203Z-aaaaaaaaaaaaaaaa"],
    ["S4", "sbx-20260719T010204Z-bbbbbbbbbbbbbbbb"],
  ] as const)("retires sealed %s with one ledger append and zero database changes", async (
    scenarioId,
    runId,
  ) => {
    const run = await createProviderOnlyRun(runId, scenarioId, "SEALED");
    try {
      const beforeDatabase = await providerCleanupSnapshot();
      const beforeSealed = await readFile(run.store.path("sealed", `${scenarioId}.json`));
      const beforeSanitized = await readFile(run.store.path("sanitized", `${scenarioId}.json`));
      const result = await cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db,
        bootstrap,
        ledger: run.ledger,
      });
      expect(result).toEqual({ code: "DATABASE_CLEANED", runId });
      expect(await providerCleanupSnapshot()).toEqual(beforeDatabase);
      const latest = await run.ledger.loadLatest();
      expect(latest).toMatchObject({ revision: 2, phase: "DB_CLEANED" });
      expect(latest?.payload.cleanupComplete).toBe(true);
      expect((await stat(run.store.path("raw"))).isDirectory()).toBe(true);
      expect(await readFile(run.store.path("sealed", `${scenarioId}.json`))).toEqual(beforeSealed);
      expect(await readFile(run.store.path("sanitized", `${scenarioId}.json`))).toEqual(beforeSanitized);

      await ordinaryDelete(run.store.path("raw"));
      await expect(access(run.store.path("raw"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(run.store.path("sealed", `${scenarioId}.json`))).toEqual(beforeSealed);
      expect(await readFile(run.store.path("sanitized", `${scenarioId}.json`))).toEqual(beforeSanitized);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it.each(["S1", "S2", "S5", "S6"] as const)(
    "keeps sealed %s cleanup ownership-bound",
    async (scenarioId) => {
      const runId = "sbx-20260719T020203Z-cccccccccccccccc";
      const run = await createProviderOnlyRun(runId, scenarioId, "SEALED");
      try {
        await expect(cleanupCommand(runId, cleanupEnv(runId), {
          prisma: db, bootstrap, ledger: run.ledger,
        })).rejects.toThrow("CLEANUP_LEDGER_INVALID");
        expect((await run.ledger.loadLatest())?.revision).toBe(1);
      } finally {
        await rm(run.root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["PLANNED", "ddddddddddddddd1"],
    ["LOCAL_COMMIT_COMPLETE", "ddddddddddddddd2"],
    ["REVIEW_REQUIRED", "ddddddddddddddd3"],
    ["DB_CLEANED", "ddddddddddddddd4"],
  ] as const)("rejects provider-only cleanup in %s", async (phase, suffix) => {
    const runId = `sbx-20260719T020204Z-${suffix}`;
    const run = await createProviderOnlyRun(runId, "S3", phase);
    try {
      await expect(cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db, bootstrap, ledger: run.ledger,
      })).rejects.toThrow("SEALED_EVIDENCE_REQUIRED");
      expect((await run.ledger.loadLatest())?.revision).toBe(1);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("rejects a second provider-only cleanup after reaching DB_CLEANED", async () => {
    const runId = "sbx-20260719T020205Z-2222222222222222";
    const run = await createProviderOnlyRun(runId, "S3", "SEALED");
    try {
      await expect(cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db, bootstrap, ledger: run.ledger,
      })).resolves.toEqual({ code: "DATABASE_CLEANED", runId });
      await expect(cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db, bootstrap, ledger: run.ledger,
      })).rejects.toThrow("SEALED_EVIDENCE_REQUIRED");
      expect((await run.ledger.loadLatest())?.revision).toBe(2);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it.each(["bootstrapHandle", "refundFixture"] as const)(
    "rejects provider-only cleanup with unexpected %s ownership",
    async (ownershipKey) => {
      const runId = "sbx-20260719T020205Z-eeeeeeeeeeeeeeee";
      const run = await createProviderOnlyRun(runId, "S4", "SEALED", {
        [ownershipKey]: Object.freeze({ synthetic: true }),
      });
      try {
        await expect(cleanupCommand(runId, cleanupEnv(runId), {
          prisma: db, bootstrap, ledger: run.ledger,
        })).rejects.toThrow("PROVIDER_ONLY_OWNERSHIP_INVALID");
        expect((await run.ledger.loadLatest())?.revision).toBe(1);
      } finally {
        await rm(run.root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["malformed ownership", {
      bootstrapHandle: "malformed",
      refundFixture: Object.freeze(["malformed"]),
    }, "3333333333333333"],
    ["bootstrap-only ownership", {
      bootstrapHandle: Object.freeze({ synthetic: true }),
    }, "4444444444444444"],
    ["refund-only ownership", {
      refundFixture: Object.freeze({ synthetic: true }),
    }, "5555555555555555"],
    ["valid unexpected ownership", {
      bootstrapHandle: Object.freeze({
        runId: "sbx-20260719T020205Z-6666666666666666",
        scenarioId: "S3",
        marketCode: "KR",
        marketCreatedByRun: false,
        userId: "h1_user_synthetic",
        checkoutSessionId: "h1_session_synthetic",
        paymentId: "h1_payment_synthetic",
        orderId: "h1_order_synthetic",
        amount: 1_000,
      }),
      refundFixture: Object.freeze({
        refundAttemptId: "h1_refund_synthetic",
        commandId: "h1_command_synthetic",
      }),
    }, "6666666666666666"],
  ] as const)("rejects sealed S3 with %s", async (_case, payload, suffix) => {
    const runId = `sbx-20260719T020205Z-${suffix}`;
    const run = await createProviderOnlyRun(runId, "S3", "SEALED", payload);
    try {
      await expect(cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db, bootstrap, ledger: run.ledger,
      })).rejects.toThrow("PROVIDER_ONLY_OWNERSHIP_INVALID");
      expect((await run.ledger.loadLatest())?.revision).toBe(1);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("rejects a provider-only ledger whose run identity differs from the command", async () => {
    const runId = "sbx-20260719T020206Z-ffffffffffffffff";
    const ledgerRunId = "sbx-20260719T020207Z-1111111111111111";
    const run = await createProviderOnlyRun(runId, "S3", "SEALED", {}, ledgerRunId);
    try {
      await expect(cleanupCommand(runId, cleanupEnv(runId), {
        prisma: db, bootstrap, ledger: run.ledger,
      })).rejects.toThrow("CLEANUP_LEDGER_INVALID");
      expect((await run.ledger.loadLatest())?.revision).toBe(1);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });
});

function testDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured || new URL(configured).pathname.replace(/^\//, "") !== "wig_platform_test") {
    throw new Error("TEST_DATABASE_REQUIRED");
  }
  return configured;
}

async function runCatalogMutationWithForcedRollback(
  mutate: CatalogMutation,
  verifier: CatalogVerifier,
): Promise<CatalogMutationOutcome> {
  let outcome: CatalogMutationOutcome | undefined;
  try {
    await db.$transaction(async (transaction) => {
      try {
        await mutate(transaction);
        try {
          await verifier(transaction);
          outcome = Object.freeze({ kind: "UNEXPECTED_M3_SUCCESS" });
        } catch (error) {
          outcome = error instanceof Error && error.message === DATABASE_CHECK_INVARIANTS_INVALID
            ? Object.freeze({ kind: "EXPECTED_M3_REJECTION", message: error.message })
            : Object.freeze({ kind: "MUTATION_OR_VERIFIER_ERROR", error });
        }
      } catch (error) {
        outcome = Object.freeze({ kind: "MUTATION_OR_VERIFIER_ERROR", error });
      }
      throw FORCED_CATALOG_ROLLBACK;
    });
  } catch (error) {
    if (error !== FORCED_CATALOG_ROLLBACK) throw error;
  }
  if (!outcome) throw new Error("CATALOG_MUTATION_OUTCOME_MISSING");
  return outcome;
}

async function replaceReasonCheckWithTrue(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRawUnsafe(`
    ALTER TABLE "RefundAttemptTransition"
    DROP CONSTRAINT "RefundAttemptTransition_reason_nonblank_check"
  `);
  await transaction.$executeRawUnsafe(`
    ALTER TABLE "RefundAttemptTransition"
    ADD CONSTRAINT "RefundAttemptTransition_reason_nonblank_check" CHECK (TRUE)
  `);
}

async function failAfterDroppingReasonCheck(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRawUnsafe(`
    ALTER TABLE "RefundAttemptTransition"
    DROP CONSTRAINT "RefundAttemptTransition_reason_nonblank_check"
  `);
  await transaction.$executeRawUnsafe(`
    ALTER TABLE "RefundAttemptTransition"
    ADD CONSTRAINT "RefundAttemptTransition_reason_nonblank_check"
    CHECK ("syntheticMissingColumn" IS NULL)
  `);
}

async function expectCatalogRestored(
  before: Awaited<ReturnType<typeof readDatabaseInvariantCatalog>>,
): Promise<void> {
  const after = await readDatabaseInvariantCatalog(db);
  expect(after).toEqual(before);
  expect(() => verifyDatabaseInvariantCatalog(after)).not.toThrow();
  await expect(verifyDatabaseInvariants(db)).resolves.toBeUndefined();
}

function requireExpectedM3Rejection(outcome: CatalogMutationOutcome): void {
  if (outcome.kind === "EXPECTED_M3_REJECTION") {
    expect(outcome.message).toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    return;
  }
  if (outcome.kind === "UNEXPECTED_M3_SUCCESS") {
    throw new Error("DATABASE_INVARIANT_UNEXPECTED_SUCCESS");
  }
  if (outcome.error instanceof Error) throw outcome.error;
  throw new Error("DATABASE_INVARIANT_TEST_ERROR");
}

async function createProviderOnlyRun(
  runId: string,
  scenarioId: H1Ledger["scenarioId"],
  phase: H1Ledger["phase"],
  payload: Readonly<Record<string, unknown>> = {},
  ledgerRunId = runId,
) {
  const root = await mkdtemp(join(tmpdir(), "mira-xp5-provider-cleanup-"));
  const store = new H1ArtifactStore(root, runId);
  await store.initialize();
  await Promise.all([
    atomicWriteJson(store.path("sealed", `${scenarioId}.json`), { evidence: "sealed" }),
    atomicWriteJson(store.path("sanitized", `${scenarioId}.json`), { evidence: "sanitized" }),
  ]);
  const ledger = new RunLedgerStore(store.path("ledger"));
  await ledger.append({
    runId: ledgerRunId,
    scenarioId,
    phase,
    repositoryCommit: "a".repeat(40),
    runnerSourceHash: "b".repeat(64),
    policyHashes: Object.freeze({ policy: "c".repeat(64) }),
    migrationFingerprint: "d".repeat(64),
    scenarioInputHash: "e".repeat(64),
    payload: Object.freeze({ scenarioId, ...payload }),
  });
  return Object.freeze({ root, store, ledger });
}

function cleanupEnv(runId: string): Readonly<Record<string, string>> {
  return Object.freeze({ MIRA_TOSS_SANDBOX_ACCEPTANCE_CLEANUP_CONFIRM: runId });
}

async function createHistoricalOwnership(
  scenarioId: "S5" | "S6",
): Promise<Owned & Readonly<{
  refund: RefundFixtureIds;
}>> {
  const runId = `sbx-20260720T040000Z-${randomBytes(8).toString("hex")}`;
  const digest = createHash("sha256").update(`${runId}:${scenarioId}`).digest("hex").slice(0, 24);
  const amount = scenarioId === "S5" ? 1_005 : 1_006;
  const now = new Date("2026-07-18T02:00:00.000Z");
  const handle: AcceptanceBootstrapHandle = Object.freeze({
    runId,
    scenarioId,
    marketCode: "KR",
    marketCreatedByRun: false,
    userId: `h1_user_${digest}`,
    checkoutSessionId: `h1_session_${digest}`,
    paymentId: `h1_payment_${digest}`,
    orderId: `h1_order_${digest}`,
    amount,
  });
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: handle.userId, email: `h1+${digest}@example.test`, name: `H1 ${scenarioId}` },
    });
    await tx.checkoutSession.create({ data: {
      id: handle.checkoutSessionId,
      userId: handle.userId,
      marketCode: "KR",
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      submittedAt: now,
      completedAt: now,
    } });
    await tx.payment.create({ data: {
      id: handle.paymentId,
      checkoutSessionId: handle.checkoutSessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount,
      currency: "KRW",
      providerRef: `h1-ref-${digest}`,
      providerPaymentKey: `historical-s5-payment-${digest}`,
      contactIntentAt: now,
      contactStartedAt: now,
      financialSucceededAt: now,
      blockingEndedAt: now,
      idempotencyKey: `h1-payment-${digest}`,
    } });
    await tx.wigStyle.create({ data: {
      id: `h1_style_${digest}`,
      name: `H1 ${scenarioId} historical fixture`,
      category: WigCategory.FASHION,
      tags: ["acceptance-refund"],
      imageKeys: [],
    } });
    await tx.wigVariant.create({ data: {
      id: `h1_variant_${digest}`,
      wigStyleId: `h1_style_${digest}`,
      color: "Fixture",
      length: "Fixture",
      curl: "Fixture",
      price: amount,
      sku: `H1-${digest}`,
      fulfillmentType: FulfillmentType.MTO,
    } });
    await tx.order.create({ data: {
      id: handle.orderId,
      checkoutSessionId: handle.checkoutSessionId,
      paymentId: handle.paymentId,
      userId: handle.userId,
      marketCode: "KR",
      currency: "KRW",
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      status: OrderStatus.PAID,
      paidAt: now,
    } });
    await tx.orderItem.create({ data: {
      id: `h1_item_${digest}`,
      orderId: handle.orderId,
      variantId: `h1_variant_${digest}`,
      wigStyleId: `h1_style_${digest}`,
      quantity: 1,
      unitAmount: amount,
      fulfillmentType: FulfillmentType.MTO,
      snapshotData: { source: "H1_HISTORICAL_ACCEPTANCE" },
    } });
  });
  const refundAttemptId = `h1_refund_${digest}`;
  const requested = await requestRefundAttempt(db, {
    refundAttemptId,
    orderId: handle.orderId,
    amount,
    reason: `Historical synthetic ${scenarioId} cleanup fixture`,
    lines: [{ orderItemId: `h1_item_${digest}`, quantity: 1 }],
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: `h1_actor_${digest}`,
    now,
  });
  if (!requested.ok) throw new Error(`HISTORICAL_REQUEST_${requested.code}`);
  const claimed = await claimRefundAttemptForExecution(db, {
    orderId: handle.orderId,
    refundAttemptId,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: `h1_actor_${digest}`,
    now: new Date(now.getTime() + 1_000),
  });
  if (!claimed.ok) throw new Error(`HISTORICAL_CLAIM_${claimed.code}`);
  return Object.freeze({
    handle,
    refund: Object.freeze({ refundAttemptId, commandId: claimed.commandId }),
  });
}

async function providerCleanupSnapshot() {
  const databases = await db.$queryRaw<{ databaseName: string }[]>(Prisma.sql`
    SELECT datname AS "databaseName" FROM pg_database ORDER BY datname
  `);
  const migrations = await appliedMigrations();
  const catalog = await readDatabaseInvariantCatalog(db);
  const applicationTables = await applicationTableCounts();
  return Object.freeze({ databases, migrations, catalog, applicationTables });
}

async function applicationTableCounts() {
  const tables = await db.$queryRaw<{ tableName: string }[]>(Prisma.sql`
    SELECT tablename AS "tableName"
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  const counts: Array<Readonly<{ tableName: string; rowCount: number }>> = [];
  for (const { tableName } of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      throw new Error("TEST_TABLE_IDENTITY_INVALID");
    }
    const rows = await db.$queryRawUnsafe<{ rowCount: number }[]>(
      `SELECT count(*)::int AS "rowCount" FROM "${tableName}"`,
    );
    counts.push(Object.freeze({ tableName, rowCount: rows[0]?.rowCount ?? -1 }));
  }
  return Object.freeze(counts);
}

function bootstrapInput(scenarioId: "S1" | "S2" | "S3" | "S4") {
  const suffix = randomBytes(8).toString("hex");
  const runId = `sbx-20260718T010203Z-${suffix}`;
  return Object.freeze({
    runId,
    scenarioId,
    fixture: Object.freeze({
      scenarioId,
      paymentKey: `h1-payment-${suffix}`,
      providerOrderId: `h1-provider-order-${suffix}`,
      amount: 1_001,
      currency: "KRW" as const,
      reference: `h1-${scenarioId}-${suffix}`,
    }),
    ledgerPhase: "PLANNED" as const,
    now: new Date("2026-07-18T01:00:00.000Z"),
  });
}

async function h1AggregateCounts() {
  const [users, sessions, payments, orders] = await Promise.all([
    db.user.count({ where: { id: { startsWith: "h1_user_" } } }),
    db.checkoutSession.count({ where: { id: { startsWith: "h1_session_" } } }),
    db.payment.count({ where: { id: { startsWith: "h1_payment_" } } }),
    db.order.count({ where: { id: { startsWith: "h1_order_" } } }),
  ]);
  return Object.freeze({ users, sessions, payments, orders });
}

async function appliedMigrations(): Promise<readonly MigrationRecord[]> {
  return db.$queryRaw<MigrationRecord[]>(Prisma.sql`
    SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY migration_name ASC
  `);
}

async function validationSnapshot() {
  const [databases, migrations, catalog, tableCounts, advisoryLocks] = await Promise.all([
    db.$queryRaw<{ databaseName: string }[]>(Prisma.sql`
      SELECT datname AS "databaseName" FROM pg_database ORDER BY datname
    `),
    appliedMigrations(),
    readDatabaseInvariantCatalog(db),
    db.$queryRaw<{ tableName: string; rowCount: number }[]>(Prisma.sql`
      SELECT 'CustomerRefundIntake' AS "tableName", count(*)::int AS "rowCount"
        FROM "CustomerRefundIntake"
      UNION ALL SELECT 'RefundAttemptTransition', count(*)::int FROM "RefundAttemptTransition"
      UNION ALL SELECT 'RefundExecutionCommand', count(*)::int FROM "RefundExecutionCommand"
      UNION ALL SELECT 'RefundExecutionCommandEvent', count(*)::int FROM "RefundExecutionCommandEvent"
      UNION ALL SELECT 'RefundExecutionDispatchAttempt', count(*)::int FROM "RefundExecutionDispatchAttempt"
      UNION ALL SELECT 'RefundExecutionEvidence', count(*)::int FROM "RefundExecutionEvidence"
      UNION ALL SELECT 'RefundExecutionProviderContactEligibilityProof', count(*)::int
        FROM "RefundExecutionProviderContactEligibilityProof"
      UNION ALL SELECT 'RefundExecutionProviderEligibilityProof', count(*)::int
        FROM "RefundExecutionProviderEligibilityProof"
      UNION ALL SELECT 'RefundExecutionProviderOperationBinding', count(*)::int
        FROM "RefundExecutionProviderOperationBinding"
      ORDER BY "tableName"
    `),
    db.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count
      FROM pg_locks
      WHERE pid = pg_backend_pid() AND locktype = 'advisory'
    `),
  ]);
  return Object.freeze({ databases, migrations, catalog, tableCounts, advisoryLocks });
}

async function rowTimestamps(handle: AcceptanceBootstrapHandle) {
  const [user, session, payment, order] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: handle.userId }, select: { updatedAt: true } }),
    db.checkoutSession.findUniqueOrThrow({ where: { id: handle.checkoutSessionId }, select: { updatedAt: true } }),
    db.payment.findUniqueOrThrow({ where: { id: handle.paymentId }, select: { updatedAt: true } }),
    db.order.findUniqueOrThrow({ where: { id: handle.orderId }, select: { updatedAt: true } }),
  ]);
  return Object.freeze({
    user: user.updatedAt.getTime(),
    session: session.updatedAt.getTime(),
    payment: payment.updatedAt.getTime(),
    order: order.updatedAt.getTime(),
  });
}
