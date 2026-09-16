import { createHash, randomUUID } from "node:crypto";
import {
  PaymentAdapterExecutionKind,
  PaymentMode,
  PaymentProvider,
  PrismaClient,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  OrderStatus,
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
import { runEximbayRefundCanaryOnce } from "../run-eximbay-refund-canary-once-main-v1";
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
        readDatabaseIdentity: async (database) => {
          const observed = await defaultRefundSandboxProviderFreePreflightDependencies
            .readDatabaseIdentity(database);
          expect(observed).toEqual({
            currentUser: "mira_refund_preflight",
            currentDatabase: "wig_platform_test",
          });
          return Object.freeze({
            currentUser: "mira_refund_preflight",
            currentDatabase: "refund_sandbox",
          });
        },
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

  it("waits on Order and rejects committed money drift before secret access", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    await expectInterleavedRuntimeRejection(
      prepared,
      ['SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', prepared.fixture.orderId],
      (blocker) => blocker.query(`
        UPDATE "Order"
        SET "subtotalAmount" = "subtotalAmount" + 1,
          "totalAmount" = "totalAmount" + 1
        WHERE "id" = $1
      `, [prepared.fixture.orderId]),
    );
  });

  it("waits on Payment and rejects committed payment money drift before secret access", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    await expectInterleavedRuntimeRejection(
      prepared,
      ['SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', prepared.fixture.paymentId],
      (blocker) => blocker.query(`
        UPDATE "Payment" SET "amount" = "amount" + 1 WHERE "id" = $1
      `, [prepared.fixture.paymentId]),
    );
  });

  it("waits on the intended RefundAttempt and rejects committed attempt drift", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    await expectInterleavedRuntimeRejection(
      prepared,
      ['SELECT "id" FROM "RefundAttempt" WHERE "id" = $1 FOR UPDATE',
        prepared.fixture.refundAttemptId],
      (blocker) => blocker.query(`
        UPDATE "RefundAttempt" SET "amount" = "amount" + 1 WHERE "id" = $1
      `, [prepared.fixture.refundAttemptId]),
    );
  });

  it("serializes on Order and rejects a newly committed SUCCEEDED sibling refund", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const siblingId = `interleaved_succeeded_${randomUUID()}`;
    await expectInterleavedRuntimeRejection(
      prepared,
      ['SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', prepared.fixture.orderId],
      (blocker) => blocker.query(`
        INSERT INTO "RefundAttempt" (
          "id", "orderId", "paymentId", "amount", "currency", "status", "reason",
          "actorType", "actorUserId", "provider", "mode", "providerRefundId",
          "idempotencyKey", "processedAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, 1, 'USD', 'SUCCEEDED', 'interleaved prior success',
          'SYSTEM', NULL, 'EXIMBAY', 'SANDBOX', $4, $5, clock_timestamp(), clock_timestamp()
        )
      `, [siblingId, prepared.fixture.orderId, prepared.fixture.paymentId,
        `provider-refund-${siblingId}`, `idempotency-${siblingId}`]),
    );
  });

  it("waits on the provider binding and rejects committed binding mutation", async () => {
    const prepared = await prepareTarget();
    await createApproval(prepared);
    await expectInterleavedRuntimeRejection(
      prepared,
      [`SELECT "id" FROM "RefundExecutionProviderOperationBinding"
        WHERE "refundAttemptId" = $1 FOR UPDATE`, prepared.fixture.refundAttemptId],
      (blocker) => blocker.query(`
        UPDATE "RefundExecutionProviderOperationBinding"
        SET "merchantAccountBindingId" = 'mutated-merchant'
        WHERE "refundAttemptId" = $1
      `, [prepared.fixture.refundAttemptId]),
    );
  });

  it("uses post-wait wall time and rejects an approval that expires during lock wait", async () => {
    const prepared = await prepareTarget();
    const blocker = await connectedAdmin();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
        [prepared.fixture.orderId],
      );
      const approval = await createApproval(prepared, 3_000);
      const before = await approvalFor(prepared.fixture.commandId);
      const running = startCanaryRuntime(prepared);
      await waitForApprovalRowLock(prepared.fixture.commandId);
      expect(running.isSettled()).toBe(false);
      expect((await databaseWallClock()).getTime()).toBeLessThan(approval.expiresAt.getTime());
      await waitForDatabaseWallClockAfter(approval.expiresAt);
      await blocker.query("COMMIT");
      const result = await running.promise;
      expect(result).toMatchObject({
        ok: false,
        code: "CONFIG_MISMATCH",
        preflightRetrieveCount: 0,
        reconciliationLookupCount: 0,
        cancellationCount: 0,
      });
      expect(running.readSecret).not.toHaveBeenCalled();
      expect(running.fetch).not.toHaveBeenCalled();
      expect(await approvalFor(prepared.fixture.commandId)).toEqual(before);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await blocker.end();
    }
  });

  it("commits the exact refund-success transaction under the restricted canary role", async () => {
    await installRestrictedRoleAuthority();
    const prepared = await prepareTarget();
    await createApproval(prepared);
    const canary = restrictedPrisma("mira_refund_canary");
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: prepared.fixture.paymentId },
      select: { providerOrderId: true },
    });
    if (!payment.providerOrderId) throw new Error("PROVIDER_ORDER_ID_REQUIRED");
    const fetch = providerSuccessFetch(prepared, payment.providerOrderId);
    try {
      await expect(canary.$queryRaw<{ currentUser: string }[]>`
        SELECT current_user AS "currentUser"
      `).resolves.toEqual([{ currentUser: "mira_refund_canary" }]);
      await expect(runEximbayRefundCanaryOnce({
        ...prepared.env,
        DATABASE_URL: restrictedDatabaseUrl("mira_refund_canary"),
      }, {
        createDatabase: () => canary,
        disconnectDatabase: () => Promise.resolve(),
        readSecret: () => Promise.resolve("synthetic-api-key-never-log"),
        fetch,
        runAdmission: (_env, operation) => Promise.resolve({
          outcome: "ACQUIRED" as const,
          result: operation(),
        }).then(async ({ outcome, result }) => ({ outcome, result: await result })),
      })).resolves.toEqual({
        ok: true,
        code: "KNOWN_SUCCESS",
        preflightRetrieveCount: 1,
        reconciliationLookupCount: 0,
        cancellationCount: 1,
      });
    } finally {
      await canary.$disconnect();
    }

    await expect(db.refundAttempt.findUniqueOrThrow({
      where: { id: prepared.fixture.refundAttemptId }, select: { status: true },
    })).resolves.toEqual({ status: RefundAttemptStatus.SUCCEEDED });
    await expect(db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: prepared.fixture.commandId }, select: { status: true },
    })).resolves.toEqual({ status: RefundExecutionCommandStatus.DONE });
    await expect(db.order.findUniqueOrThrow({
      where: { id: prepared.fixture.orderId }, select: { status: true },
    })).resolves.toEqual({ status: OrderStatus.REFUNDED });
    await expect(db.refundAttemptTransition.count({
      where: { refundAttemptId: prepared.fixture.refundAttemptId, toStatus: RefundAttemptStatus.SUCCEEDED },
    })).resolves.toBe(1);
    await expect(db.refundExecutionEvidence.count({
      where: { commandId: prepared.fixture.commandId },
    })).resolves.toBe(1);
    await expect(db.paymentOutbox.count({
      where: { dedupKey: `customer-refund-succeeded:v1:${prepared.fixture.refundAttemptId}` },
    })).resolves.toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["ineligible", "retrieve failure", "refund uncertainty", "refund transport failure"] as const)(
    "stops after one pass for %s with no recovery or second refund",
    async (scenario) => {
      const prepared = await prepareTarget();
      await createApproval(prepared);
      const payment = await db.payment.findUniqueOrThrow({
        where: { id: prepared.fixture.paymentId }, select: { providerOrderId: true },
      });
      if (!payment.providerOrderId) throw new Error("PROVIDER_ORDER_ID_REQUIRED");
      const success = providerSuccessFetch(prepared, payment.providerOrderId);
      const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/retrieve")) {
          if (scenario === "retrieve failure") return Promise.reject(new Error("SYNTHETIC_FAILURE"));
          if (scenario === "ineligible") return Promise.resolve(jsonResponse({ rescode: "9999" }));
          return success(input, init);
        }
        if (scenario === "refund transport failure") return Promise.reject(new Error("SYNTHETIC_FAILURE"));
        return Promise.resolve(jsonResponse({ rescode: "9999" }));
      });
      const dependencies = {
        createDatabase: () => db,
        disconnectDatabase: () => Promise.resolve(),
        readSecret: () => Promise.resolve("synthetic-api-key-never-log"),
        fetch,
        runAdmission: async (_env: Readonly<Record<string, string | undefined>>, operation: () => ReturnType<typeof runEximbayRefundCanaryOnce>) => ({
          outcome: "ACQUIRED" as const, result: await operation(),
        }),
      };
      const refundExpected = scenario.startsWith("refund") ? 1 : 0;
      const result = await runEximbayRefundCanaryOnce(prepared.env, dependencies);
      expect(result).toMatchObject({
        ok: false,
        preflightRetrieveCount: 1,
        reconciliationLookupCount: 0,
        cancellationCount: refundExpected,
        reentry: "SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED",
      });
      expect(fetch).toHaveBeenCalledTimes(1 + refundExpected);
      const command = await db.refundExecutionCommand.findUniqueOrThrow({
        where: { id: prepared.fixture.commandId },
      });
      expect(command.dispatchAttempt).toBe(refundExpected);
      if (refundExpected === 1) {
        expect(result.code).toBe("CANCEL_CONTACT_MAY_HAVE_OCCURRED");
        expect(command.status).toBe("WAITING_EVIDENCE");
      }
      expect(await selectExactEximbayRefundCanaryCandidate(db, prepared.fixture.commandId)).toBeNull();
      expect(await db.paymentOutbox.count({
        where: { dedupKey: `customer-refund-succeeded:v1:${prepared.fixture.refundAttemptId}` },
      })).toBe(0);
      await expect(runEximbayRefundCanaryOnce(prepared.env, dependencies)).resolves.toMatchObject({
        code: "APPROVAL_ALREADY_CONSUMED", cancellationCount: 0, preflightRetrieveCount: 0,
      });
      expect(fetch).toHaveBeenCalledTimes(1 + refundExpected);
    },
  );

  it("fails the real success transaction when PaymentOutbox INSERT is absent", async () => {
    await installRestrictedRoleAuthority();
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    try {
      await admin.query('REVOKE INSERT ON TABLE "PaymentOutbox" FROM mira_refund_canary');
      const prepared = await prepareTarget();
      await createApproval(prepared);
      const payment = await db.payment.findUniqueOrThrow({
        where: { id: prepared.fixture.paymentId }, select: { providerOrderId: true },
      });
      if (!payment.providerOrderId) throw new Error("PROVIDER_ORDER_ID_REQUIRED");
      const canary = restrictedPrisma("mira_refund_canary");
      try {
        const result = await runEximbayRefundCanaryOnce({
          ...prepared.env,
          DATABASE_URL: restrictedDatabaseUrl("mira_refund_canary"),
        }, {
          createDatabase: () => canary,
          disconnectDatabase: () => Promise.resolve(),
          readSecret: () => Promise.resolve("synthetic-api-key-never-log"),
          fetch: providerSuccessFetch(prepared, payment.providerOrderId),
          runAdmission: (_env, operation) => Promise.resolve({
            outcome: "ACQUIRED" as const,
            result: operation(),
          }).then(async ({ outcome, result }) => ({ outcome, result: await result })),
        });
        expect(result.ok).toBe(false);
        expect(result.code).not.toBe("KNOWN_SUCCESS");
      } finally {
        await canary.$disconnect();
      }
      await expect(db.refundAttempt.findUniqueOrThrow({
        where: { id: prepared.fixture.refundAttemptId }, select: { status: true },
      })).resolves.not.toEqual({ status: RefundAttemptStatus.SUCCEEDED });
      await expect(db.paymentOutbox.count({
        where: { dedupKey: `customer-refund-succeeded:v1:${prepared.fixture.refundAttemptId}` },
      })).resolves.toBe(0);
    } finally {
      await admin.end();
      await installRestrictedRoleAuthority();
    }
  });

  it("does not broaden the two new table privileges", async () => {
    await installRestrictedRoleAuthority();
    const client = await restrictedPg("mira_refund_canary");
    try {
      await expect(client.query('SELECT "communicationLocale" FROM "CheckoutSession" WHERE false'))
        .resolves.toMatchObject({ rowCount: 0 });
      await expect(client.query(`
        INSERT INTO "PaymentOutbox" ("id", "topic", "payload", "updatedAt")
        VALUES ($1, 'synthetic.permission.probe', '{}'::jsonb, now())
      `, [`permission_probe_${randomUUID()}`])).resolves.toMatchObject({ rowCount: 1 });
      await expectPermissionDenied(client, 'UPDATE "CheckoutSession" SET "communicationLocale" = "communicationLocale" WHERE false');
      await expectPermissionDenied(client, 'DELETE FROM "PaymentOutbox" WHERE false');
      await expectPermissionDenied(client, 'UPDATE "PaymentOutbox" SET "status" = "status" WHERE false');
      await expectPermissionDenied(client, 'UPDATE "Payment" SET "currency" = "currency" WHERE false');
      await expectPermissionDenied(client, 'UPDATE "RefundExecutionEvidence" SET "safeMessage" = "safeMessage" WHERE false');
    } finally {
      await client.end();
      await db.paymentOutbox.deleteMany({ where: { topic: "synthetic.permission.probe" } });
    }
  });
});

type RowBarrier = readonly [sql: string, id: string];

async function expectInterleavedRuntimeRejection(
  prepared: PreparedTarget,
  barrier: RowBarrier,
  mutate: (blocker: Client) => Promise<unknown>,
): Promise<void> {
  const before = await approvalFor(prepared.fixture.commandId);
  const blocker = await connectedAdmin();
  try {
    await blocker.query("BEGIN");
    await blocker.query(barrier[0], [barrier[1]]);
    const running = startCanaryRuntime(prepared);
    await waitForApprovalRowLock(prepared.fixture.commandId);
    expect(running.isSettled()).toBe(false);
    await mutate(blocker);
    await blocker.query("COMMIT");
    const result = await running.promise;
    expect(result).toMatchObject({
      ok: false,
      code: "TARGET_MISMATCH",
      preflightRetrieveCount: 0,
      reconciliationLookupCount: 0,
      cancellationCount: 0,
    });
    expect(running.readSecret).not.toHaveBeenCalled();
    expect(running.fetch).not.toHaveBeenCalled();
    expect(await approvalFor(prepared.fixture.commandId)).toEqual(before);
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    await blocker.end();
  }
}

function startCanaryRuntime(prepared: PreparedTarget) {
  const readSecret = vi.fn(() => Promise.reject(new Error("MUST_NOT_READ_SECRET")));
  const fetch = vi.fn(() => Promise.reject(new Error("MUST_NOT_CONTACT_PROVIDER")));
  let settled = false;
  const promise = runEximbayRefundCanaryOnce(prepared.env, {
    createDatabase: () => db,
    disconnectDatabase: () => Promise.resolve(),
    readSecret,
    fetch,
    runAdmission: async (_env, operation) => Object.freeze({
      outcome: "ACQUIRED" as const,
      result: await operation(),
    }),
  }).finally(() => { settled = true; });
  return Object.freeze({ promise, readSecret, fetch, isSettled: () => settled });
}

async function waitForApprovalRowLock(commandId: string): Promise<void> {
  const probe = await connectedAdmin();
  const deadline = Date.now() + 10_000;
  try {
    while (Date.now() < deadline) {
      if (await approvalRowIsLocked(probe, commandId)) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    await probe.end();
  }
  throw new Error("CONSUMER_DID_NOT_HOLD_APPROVAL_WHILE_WAITING");
}

async function approvalRowIsLocked(probe: Client, commandId: string): Promise<boolean> {
  try {
    await probe.query(`
      SELECT "id" FROM "EximbayRefundSandboxCanaryApproval"
      WHERE "commandId" = $1 FOR UPDATE NOWAIT
    `, [commandId]);
    return false;
  } catch (error) {
    if (postgresErrorCode(error) === "55P03") return true;
    throw error;
  }
}

async function waitForDatabaseWallClockAfter(limit: Date): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await databaseWallClock()).getTime() > limit.getTime()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("DATABASE_WALL_CLOCK_DID_NOT_ADVANCE_PAST_EXPIRY");
}

async function databaseWallClock(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new Error("DATABASE_WALL_CLOCK_UNAVAILABLE");
  }
  return capturedAt;
}

async function connectedAdmin(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

function postgresErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" ? error.code : null;
}

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
    communicationLocale: "ko",
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
    custodyArtifactSha256: "f".repeat(64),
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

async function createApproval(prepared: PreparedTarget, lifetimeMs = 15 * 60_000) {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const now = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(now instanceof Date)) throw new Error("DATABASE_TIME_UNAVAILABLE");
  return db.eximbayRefundSandboxCanaryApproval.create({
    data: approvalData(prepared, now, lifetimeMs),
  });
}

function approvalData(prepared: PreparedTarget, now: Date, lifetimeMs = 15 * 60_000) {
  return {
    id: `eximbay_canary_${randomUUID()}`,
    formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    approvalEvidenceDigest: prepared.authority.custodyArtifactSha256,
    releaseBindingDigest: prepared.authority.releaseBindingDigest,
    canaryJobBindingDigest: prepared.authority.canaryJobBindingDigest,
    preflightJobBindingDigest: prepared.authority.preflightJobBindingDigest,
    imageBindingDigest: prepared.authority.imageBindingDigest,
    secretGenerationBindingDigest: prepared.authority.secretGenerationBindingDigest,
    targetBindingDigest: prepared.targetBindingDigest,
    commandId: prepared.fixture.commandId,
    approvedAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date(now.getTime() + lifetimeMs),
    issuedByPrincipalId: "postgres-session/v1:synthetic_reviewer",
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

function providerSuccessFetch(
  prepared: PreparedTarget,
  providerOrderId: string,
) {
  return vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/v1/payments/retrieve")) {
      return Promise.resolve(jsonResponse({
        rescode: "0000",
        resmsg: "Success.",
        mid: prepared.authority.mid,
        payment: {
          order_id: providerOrderId,
          currency: "USD",
          amount: "12.34",
          transaction_id: prepared.fixture.providerPaymentKey,
          status: "SALE",
          transaction_date: "20260821112233",
          balance: "12.34",
        },
      }));
    }
    if (/\/v1\/payments\/[^/]+\/cancel$/u.test(url)) {
      const refund = parseSyntheticCancelRequest(init?.body);
      return Promise.resolve(jsonResponse({
        rescode: "0000",
        resmsg: "Success.",
        mid: prepared.authority.mid,
        refund: {
          refund_amount: refund.amount,
          refund_id: refund.id,
          refund_date: "20260821112233",
          refund_transaction_id: `synthetic-provider-refund-${randomUUID()}`,
        },
        payment: {
          order_id: providerOrderId,
          currency: "USD",
          amount: "12.34",
          transaction_id: prepared.fixture.providerPaymentKey,
          balance: "0.00",
        },
      }));
    }
    throw new Error(`UNEXPECTED_SYNTHETIC_EXIMBAY_URL:${url}`);
  });
}

function parseSyntheticCancelRequest(body: BodyInit | null | undefined): Readonly<{
  id: string;
  amount: string;
}> {
  if (typeof body !== "string") throw new Error("SYNTHETIC_CANCEL_BODY_REQUIRED");
  const request: unknown = JSON.parse(body);
  if (!isRecord(request) || !isRecord(request.refund)
    || typeof request.refund.refund_id !== "string"
    || typeof request.refund.refund_amount !== "string") {
    throw new Error("SYNTHETIC_CANCEL_BODY_INVALID");
  }
  return Object.freeze({
    id: request.refund.refund_id,
    amount: request.refund.refund_amount,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
