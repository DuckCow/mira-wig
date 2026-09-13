import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { createDispatchFixture, markDispatchContactForTest } from "../../__tests__/refund-dispatch-fixture";
import { authorizeRefundExecutionDispatch } from "../../dispatch-authorization";
import { persistFreshRefundExecutionObservation } from "../../resolve-execution";
import { reclaimUncontactedRefundExecution } from "../../reclaim-uncontacted-execution";
import { requireOwnedRefundTestCluster } from "../../__tests__/retained-refund-test-history";
import { createSingleShotEximbayCanaryTransport } from "../../run-eximbay-refund-canary-once";
import { createEximbayFirstRefundDispatchAuthorizer } from "../../providers/eximbay/authorize-first-dispatch";
import { createEximbayRefundReconciler } from "../../providers/eximbay/reconcile-refund";
import { createEximbayRefundContactExecutor } from "../../providers/eximbay/execute-contact";
import { acquireRefundExecutionLease } from "../../acquire-lease";
import { runEximbayRefundReentryOnce, defaultEximbayRefundReentryDependencies } from "../../run-eximbay-refund-reentry-once";
import { consumeRefundExecutionAuthorization } from "../admission";
import { record } from "../contract";
import { createRefundAuthorizationAdmissionHandler } from "../http";
import { parseAdmissionReceipt } from "../worker-client";
import { restoreCanaryRefundRoleGrants, verifyExactEffectivePrivileges } from "../../../../../../scripts/eximbay-p3e-database-bootstrap";
import {
  setupRoles, teardownRoles, cleanupTargets, targetFixture, issueInput, adminService, verified, release, loadRelease, enabled, workerEnvironmentForGrant, runtimePort,
  appRole, prismaFor, pgFor, roleUrl, bootstrapInput, restoreDependencies, fixtures, type Target,
} from "./fixture";

let app: PrismaClient; let worker: PrismaClient;
beforeAll(async () => { await setupRoles(); app = prismaFor(appRole); worker = prismaFor("mira_refund_canary"); });
afterEach(cleanupTargets);
afterAll(async () => { await app?.$disconnect(); await worker?.$disconnect(); await teardownRoles(); });

describe("post-M lane constraints under the actual shared worker role", () => {
  it.each([
    '"leaseGeneration"="leaseGeneration"+1',
    '"leaseGeneration"="leaseGeneration"+2',
    '"leaseGeneration"=0',
    '"status"=\'READY\',"leaseOwner"=NULL,"leaseUntil"=NULL,"leaseTokenHash"=NULL',
    '"leaseOwner"=\'replacement\'',
    '"leaseUntil"="leaseUntil"+interval \'1 hour\'',
    '"leaseTokenHash"=repeat(\'a\',64)',
    '"dispatchAttempt"=1',
  ])("rejects ungranted UPDATE %s", async (set) => {
    const target = await targetFixture(); const client = await pgFor("mira_refund_canary");
    try { await expect(client.query(`UPDATE "RefundExecutionCommand" SET ${set} WHERE id=$1`, [target.commandId])).rejects.toThrow(); }
    finally { await client.end(); }
  });

  it("rejects multi-statement status/ordinal detours and renamed/event-only takeover", async () => {
    const target = await targetFixture(); const client = await pgFor("mira_refund_canary");
    try {
      await client.query("BEGIN");
      await client.query('UPDATE "RefundExecutionCommand" SET status=\'PARKED\',"leaseOwner"=NULL,"leaseUntil"=NULL,"leaseTokenHash"=NULL WHERE id=$1', [target.commandId]);
      await expect(client.query('UPDATE "RefundExecutionCommand" SET status=\'READY\' WHERE id=$1', [target.commandId])).rejects.toThrow();
      await client.query("ROLLBACK");
      for (const type of ["LEASE_ACQUIRED", "RECOVERY_LEASE_ACQUIRED", "PRE_CONTACT_RELEASED"]) {
        await expect(client.query(`INSERT INTO "RefundExecutionCommandEvent" (id,"commandId","eventType","leaseGeneration","dispatchAttempt","occurredAt")
          VALUES ($1,$2,$3,2,0,now())`, [randomUUID(), target.commandId, type])).rejects.toThrow();
      }
      await client.query("SET TIME ZONE 'Pacific/Pago_Pago'");
      await expect(client.query('UPDATE "RefundExecutionCommand" SET "dispatchAttempt"=1 WHERE id=$1', [target.commandId])).rejects.toThrow();
    } finally { await client.end(); }
  });

  it("keeps initial 0→1 acquisition and its lease event under the existing owner", async () => {
    const target = await targetFixture(0);
    const acquired = await acquireRefundExecutionLease(worker, { commandId: target.commandId, leaseOwner: "synthetic-initial-worker" }, { REFUND_EXECUTION_LEASE_ENABLED: "ENABLED" });
    expect(acquired).toMatchObject({ ok: true, lease: { leaseGeneration: 1 } });
    expect(await db.refundExecutionCommandEvent.count({ where: { commandId: target.commandId, eventType: "LEASE_ACQUIRED", leaseGeneration: 1 } })).toBe(1);
  });

  it("preserves outside-S acquisition/recovery and authoritative terminal failure persistence", async () => {
    const outside = await createDispatchFixture({ totalAmount: 1000, targetAmount: 1000 }); fixtures.push(outside);
    await db.payment.update({ where: { id: outside.paymentId }, data: { provider: "TOSS" } });
    await db.refundAttempt.update({ where: { id: outside.refundAttemptId }, data: { provider: "TOSS" } });
    const initial = await acquireRefundExecutionLease(worker, { commandId: outside.commandId, leaseOwner: "outside-s-worker" }, { REFUND_EXECUTION_LEASE_ENABLED: "ENABLED" });
    expect(initial.ok).toBe(true);
    await db.refundExecutionCommand.update({ where: { id: outside.commandId }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    const recovered = await reclaimUncontactedRefundExecution(worker, { commandId: outside.commandId, recoveryOwner: "outside-s-recovery" }, { REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED" });
    expect(recovered).toMatchObject({ ok: true, lease: { leaseGeneration: 2 } });
    const fixture = await createDispatchFixture({ communicationLocale: "en" }); fixtures.push(fixture);
    const recovery = await acquireRefundExecutionLease(worker, { commandId: fixture.commandId, leaseOwner: "mock-worker" }, { REFUND_EXECUTION_LEASE_ENABLED: "ENABLED" });
    if (!recovery.ok) throw new Error(recovery.code);
    const authorized = await authorizeRefundExecutionDispatch(worker, { commandId: fixture.commandId,
      leaseGeneration: recovery.lease.leaseGeneration, leaseToken: recovery.lease.leaseToken }, { REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED" });
    if (!authorized.ok) throw new Error(authorized.code);
    await markDispatchContactForTest(fixture, 1);
    const result = await persistFreshRefundExecutionObservation(worker, { commandId: fixture.commandId, dispatchAttempt: 1,
      leaseGeneration: recovery.lease.leaseGeneration, leaseToken: recovery.lease.leaseToken,
      observation: { outcome: "NOT_EXECUTED_TERMINAL", observedProviderRefundId: null, reportedAmount: null,
        reportedCurrency: null, safeCode: null, safeMessage: null, observedAt: new Date() },
    }, { REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED" });
    expect(result).toMatchObject({ ok: true, application: "APPLIED" });
    expect((await db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } })).status).toBe("FAILED_TERMINAL");
    expect((await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } })).status).toBe("DONE");
  });

  it("denies direct grant writes/reads, broad UPDATE, SET ROLE and callable privileged functions", async () => {
    const client = await pgFor("mira_refund_canary");
    try {
      expect((await client.query("SELECT current_user AS name")).rows).toEqual([{ name: "mira_refund_canary" }]);
      for (const sql of [
        'SELECT id FROM "RefundExecutionAuthorization"', 'UPDATE "RefundExecutionAuthorization" SET "consumedAt"=now() WHERE false',
        'INSERT INTO "RefundExecutionAuthorization" DEFAULT VALUES', 'DELETE FROM "RefundExecutionAuthorization" WHERE false',
        'TRUNCATE "RefundExecutionAuthorization"', 'UPDATE "RefundAttempt" SET amount=0 WHERE false',
        'UPDATE "Order" SET "totalAmount"=0 WHERE false', 'SELECT id FROM "PaymentOutbox"',
        `SET ROLE ${appRole}`, 'SELECT public.refund_authorization_lane(\'unknown\')',
        'SET session_replication_role=replica', 'ALTER TABLE "RefundExecutionCommand" DISABLE TRIGGER ALL',
      ]) await expect(client.query(sql)).rejects.toThrow();
    } finally { await client.end(); }
  });

  it("canonical restore narrows obsolete UPDATE and detects PUBLIC/membership/ownership/function bypass", async () => {
    const admin = await pgFor();
    try {
      await admin.query('GRANT UPDATE ON "RefundExecutionCommand" TO mira_refund_canary');
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, restoreDependencies);
      expect((await admin.query("SELECT has_table_privilege('mira_refund_canary', '\"RefundExecutionCommand\"', 'UPDATE') AS broad")).rows).toEqual([{ broad: false }]);
      await verifyExactEffectivePrivileges(admin);
      const unsafe = [
        ['GRANT SELECT (id) ON "PaymentOutbox" TO PUBLIC', 'REVOKE SELECT (id) ON "PaymentOutbox" FROM PUBLIC'],
        [`GRANT ${appRole} TO mira_refund_canary`, `REVOKE ${appRole} FROM mira_refund_canary`],
        ['CREATE TABLE test_auth_owned(id int); ALTER TABLE test_auth_owned OWNER TO mira_refund_canary', 'DROP TABLE test_auth_owned'],
        ["CREATE FUNCTION test_auth_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'", 'DROP FUNCTION test_auth_definer()'],
      ];
      for (const [install, remove] of unsafe) {
        await admin.query(install);
        try { await expect(verifyExactEffectivePrivileges(admin)).rejects.toThrow(); }
        finally { await admin.query(remove); }
      }
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, restoreDependencies);
      await verifyExactEffectivePrivileges(admin);
    } finally { await admin.end(); }
  });

  it("protects sealed identities and money while allowing current financial status writes", async () => {
    const target = await targetFixture();
    await expect(db.refundAttempt.update({ where: { id: target.refundAttemptId }, data: { amount: 99 } })).rejects.toThrow();
    await expect(db.refundExecutionProviderOperationBinding.update({ where: { id: target.providerOperationBindingId }, data: { merchantAccountBindingId: "changed" } })).rejects.toThrow();
    await expect(db.payment.update({ where: { id: target.paymentId }, data: { amount: 99 } })).rejects.toThrow();
    await expect(db.order.update({ where: { id: target.fixture.orderId }, data: { totalAmount: 99 } })).rejects.toThrow();
    await expect(db.eximbayRefundSandboxCanaryApproval.delete({ where: { commandId: target.commandId } })).rejects.toThrow();
    await expect(adminService(app).issue({ ...issueInput(target), confirmedTargetBindingDigest: "e".repeat(64) })).rejects.toMatchObject({ code: "TARGET_MISMATCH" });
  });
});

describe("admitted lease continuation preserves restricted financial writers", () => {
  it("reproduces kq55l's disabled worker gate before worker admission or provider work", async () => {
    const target = await targetFixture(2);
    const grant = await adminService(app).issue(issueInput(target));
    const admissions = vi.fn();
    const provider = vi.fn();
    const before = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } });
    const events = await db.refundExecutionCommandEvent.count({ where: { commandId: target.commandId } });

    const result = await runWorker(grant.id, provider, {
      ...workerEnvironmentForGrant(grant.id), MIRA_REFUND_AUTHORIZATION_ENABLED: "DISABLED",
    }, admissions);

    expect(result).toMatchObject({ ok: false, code: "CONFIG_MISMATCH", preflightRetrieveCount: 0, cancellationCount: 0 });
    expect(admissions).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({ consumedAt: before.consumedAt, consumedLeaseEventId: before.consumedLeaseEventId });
    expect(await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } })).toMatchObject({ leaseGeneration: command.leaseGeneration });
    expect(await db.refundExecutionCommandEvent.count({ where: { commandId: target.commandId } })).toBe(events);
  });

  it("stops before provider work when Execution verification rejects admission", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const admissions = vi.fn(); const provider = vi.fn();
    const result = await runWorker(grant.id, provider, undefined, admissions, (executionName) => {
      const base = runtimePort(grant.id, executionName);
      return { ...base, getExecution: async (name: string) => {
        const execution = await base.getExecution(name);
        if (!record(execution)) throw new Error("TEST_EXECUTION_REQUIRED");
        return { ...execution, parallelism: 2 };
      } };
    }, 401);

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_FAILURE", preflightRetrieveCount: 0, cancellationCount: 0 });
    expect(admissions).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
    expect((await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).consumedAt).toBeNull();
  });

  it.each([1, 2])("uses the same executable for a synthetic target at predecessor generation %i", async (generation) => {
    const target = await targetFixture(generation); const grant = await adminService(app).issue(issueInput(target));
    const fetch = await successTransport(target);
    const admissions = vi.fn();
    const run = await runWorker(grant.id, fetch, undefined, admissions);
    expect(run).toMatchObject({ ok: true, code: "KNOWN_SUCCESS", preflightRetrieveCount: 1, cancellationCount: 1, reconciliationLookupCount: 0 });
    expect(admissions).toHaveBeenCalledTimes(1);
    const row = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } });
    expect(row).toMatchObject({ status: "DONE", dispatchAttempt: 1, leaseGeneration: generation + 1, leaseOwner: null, leaseTokenHash: null });
    expect((await db.refundAttempt.findUniqueOrThrow({ where: { id: target.refundAttemptId } })).status).toBe("SUCCEEDED");
    expect((await db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId: target.commandId } })).contactMarkedAt).toBeInstanceOf(Date);
    expect(fetch).toHaveBeenCalledTimes(2);
    const outbox = await db.paymentOutbox.findFirstOrThrow({ where: { dedupKey: `customer-refund-succeeded:v1:${target.refundAttemptId}` } });
    // INSERT ON CONFLICT DO NOTHING is supported without granting SELECT.
    const client = await pgFor("mira_refund_canary");
    try {
      await client.query(`INSERT INTO "PaymentOutbox" SELECT * FROM json_populate_record(NULL::"PaymentOutbox", $1::json) ON CONFLICT DO NOTHING`, [JSON.stringify(outbox)]);
      await expect(client.query('SELECT id FROM "PaymentOutbox"')).rejects.toThrow(/permission denied/u);
    } finally { await client.end(); }
    expect(await db.paymentOutbox.count({ where: { dedupKey: outbox.dedupKey } })).toBe(1);
    const consumed = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(consumed.consumedAt).toBeInstanceOf(Date);
    const event = await db.refundExecutionCommandEvent.findUniqueOrThrow({ where: { id: consumed.consumedLeaseEventId ?? "missing" } });
    expect(event).toMatchObject({ commandId: target.commandId, eventType: "LEASE_ACQUIRED", leaseGeneration: generation + 1, dispatchAttempt: 0 });
    const replayAdmissions = vi.fn(); const replayProvider = vi.fn();
    const replay = await runWorker(grant.id, replayProvider, undefined, replayAdmissions);
    expect(replay).toMatchObject({ ok: false, code: "INTERNAL_FAILURE", preflightRetrieveCount: 0, cancellationCount: 0 });
    expect(replayAdmissions).toHaveBeenCalledTimes(1);
    expect(replayProvider).not.toHaveBeenCalled();
  });

  it("preserves separately authorized ordinal-one reclaim without another grant, retrieve or dispatch", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const admitted = await consumeRefundExecutionAuthorization(app, await verified(grant.id), loadRelease, enabled);
    const transport = createSingleShotEximbayCanaryTransport(await successTransport(target));
    const config = { mode: "SANDBOX", mid: release.mid, merchantAccountBindingId: release.merchantAccountBindingId,
      credentialGenerationBindingId: release.credentialGenerationBindingId } as const;
    const authorize = createEximbayFirstRefundDispatchAuthorizer({ config, retrieve: transport.retrieve });
    expect(await authorize(worker, { commandId: admitted.lease.commandId, leaseGeneration: admitted.lease.leaseGeneration, leaseToken: admitted.lease.leaseToken })).toMatchObject({ ok: true });
    // Advance only the synthetic fixture's lease clock to model a later process loss.
    await db.$transaction(async (tx) => {
      await requireOwnedRefundTestCluster(tx); await tx.$executeRaw`SET LOCAL session_replication_role=replica`;
      await tx.refundExecutionCommand.update({ where: { id: target.commandId }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    });
    const recovered = await reclaimUncontactedRefundExecution(worker, { commandId: target.commandId, recoveryOwner: "separately-authorized-r1" }, { REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED" });
    if (!recovered.ok) throw new Error(recovered.code);
    expect(recovered).toMatchObject({ recoveredState: "AUTHORIZED_EXIMBAY_R1", lease: { leaseGeneration: 3 } });
    const contact = createEximbayRefundContactExecutor({ config, cancel: transport.cancellation });
    expect(await contact(worker, { commandId: target.commandId, dispatchAttempt: 1, leaseGeneration: recovered.lease.leaseGeneration, leaseToken: recovered.lease.leaseToken })).toMatchObject({ ok: true, state: "SUCCEEDED" });
    expect(transport.counts).toMatchObject({ preflightRetrieveCount: 1, cancellationCount: 1, reconciliationLookupCount: 0 });
    expect(await db.refundExecutionAuthorization.count({ where: { commandId: target.commandId } })).toBe(1);
  });

  it("retains UNKNOWN custody and preserves separately authorized contacted recovery", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const success = await successTransport(target);
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if ((input instanceof Request ? input.url : String(input)).endsWith("/cancel")) throw new Error("SYNTHETIC_LOST_PROVIDER_RESPONSE");
      return success(input, init);
    });
    const run = await runWorker(grant.id, fetch);
    expect(run).toMatchObject({ ok: false, cancellationCount: 1, preflightRetrieveCount: 1, code: "CANCEL_CONTACT_MAY_HAVE_OCCURRED" });
    expect((await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } })).status).toBe("WAITING_EVIDENCE");
    expect((await db.refundExecutionEvidence.findFirstOrThrow({ where: { commandId: target.commandId } })).outcome).toBe("UNKNOWN");
    await expect(consumeRefundExecutionAuthorization(app, await verified(grant.id), loadRelease, enabled)).rejects.toThrow("ALREADY_CONSUMED");
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(adminService(app).issue(issueInput({ ...target, generation: 2 }))).rejects.toThrow("CONTACTED_RECOVERY_REQUIRED");
    const history = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    const payment = await db.payment.findUniqueOrThrow({ where: { id: target.paymentId } });
    const dispatch = await db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId: target.commandId } });
    await new Promise((resolve) => setTimeout(resolve, 5100));
    const lookup = vi.fn(() => Promise.resolve(Response.json({ rescode: "0000", resmsg: "Success.", mid: release.mid,
      payment: { status: "REFUND", order_id: payment.providerOrderId, currency: "USD", amount: "1.00", balance: "0.00",
        transaction_id: payment.providerPaymentKey, transaction_date: "20260821112233", refund_id: dispatch.providerOperationKey,
        refund_amount: "1.00", refund_transaction_id: `test-lookup-refund-${randomUUID()}` } })));
    const reconcile = createEximbayRefundReconciler({ config: { mode: "SANDBOX", mid: release.mid,
      merchantAccountBindingId: release.merchantAccountBindingId, credentialGenerationBindingId: release.credentialGenerationBindingId }, lookup });
    expect(await reconcile(worker, { commandId: target.commandId, recoveryOwner: "separately-authorized-contacted-recovery" })).toMatchObject({ ok: true, state: "SUCCEEDED" });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).toEqual(history);
  }, 15_000);
});

async function runWorker(
  grantId: string,
  fetch: typeof globalThis.fetch,
  environment = workerEnvironmentForGrant(grantId),
  admissions = vi.fn(),
  runtimeFactory = (executionName: string) => runtimePort(grantId, executionName),
  expectedAdmissionStatus = 200,
) {
  return runEximbayRefundReentryOnce({ ...environment, DATABASE_URL: roleUrl("mira_refund_canary") }, {
    ...defaultEximbayRefundReentryDependencies,
    admit: async () => {
      admissions();
      const executionName = `${release.jobName}/executions/${environment.CLOUD_RUN_EXECUTION}`;
      const handler = createRefundAuthorizationAdmissionHandler({
        database: app, loadRelease, env: enabled, runtime: runtimeFactory(executionName),
      });
      const response = await handler(new Request(release.audience, {
        method: "POST", headers: { authorization: "Bearer synthetic.signed.token" },
        body: JSON.stringify({ grantId, executionName }),
      }));
      expect(response.status).toBe(expectedAdmissionStatus);
      return parseAdmissionReceipt(await response.json(), grantId);
    },
    readSecret: () => Promise.resolve("synthetic-api-key"), fetch,
  });
}
async function successTransport(target: Target) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: target.paymentId } });
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const paymentFacts = { order_id: payment.providerOrderId, transaction_id: payment.providerPaymentKey, currency: "USD", amount: "1.00" };
    if (url.endsWith("/retrieve")) return Response.json({ rescode: "0000", resmsg: "Success.", mid: release.mid,
      payment: { ...paymentFacts, status: "SALE", transaction_date: "20260821112233", balance: "1.00" } });
    if (!url.endsWith("/cancel") || typeof init?.body !== "string") throw new Error("UNEXPECTED_TEST_PROVIDER_PATH");
    // Assert contact custody already committed before the external transport seam.
    expect((await db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId: target.commandId } })).contactMarkedAt).toBeInstanceOf(Date);
    const body: unknown = JSON.parse(init.body);
    if (!record(body) || !record(body.refund)) throw new Error("TEST_REFUND_REQUEST_REQUIRED");
    return Response.json({ rescode: "0000", resmsg: "Success.", mid: release.mid, payment: { ...paymentFacts, balance: "0.00" },
      refund: { refund_amount: body.refund.refund_amount, refund_id: body.refund.refund_id, refund_date: "20260821112233", refund_transaction_id: `test-refund-${randomUUID()}` } });
  });
}
