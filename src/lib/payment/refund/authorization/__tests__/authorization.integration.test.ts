import { requireOwnedRefundTestCluster } from "../../__tests__/retained-refund-test-history";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { createRefundAuthorizationAdmin } from "../admin";
import { consumeRefundExecutionAuthorization } from "../admission";
import { createRefundAuthorizationAdmissionHandler } from "../http";
import {
  setupRoles, teardownRoles, cleanupTargets, targetFixture, issueInput, adminService, verified,
  loadRelease, release, enabled, issuerId, appRole, prismaFor, pgFor, rawConsumption, seedGrant, rvhbhLiveShapedRuntimePort,
} from "./fixture";

let app: PrismaClient;
beforeAll(async () => { await setupRoles(); app = prismaFor(appRole); });
afterEach(cleanupTargets);
afterAll(async () => { await app?.$disconnect(); await teardownRoles(); });
const consume = async (id: string) => consumeRefundExecutionAuthorization(app, await verified(id), loadRelease, enabled);

describe("authenticated durable refund authorization on real PostgreSQL", () => {
  it("denies missing sessions, stale ADMIN roles and forged actor fields", async () => {
    const target = await targetFixture();
    const anonymous = createRefundAuthorizationAdmin(app, () => Promise.resolve(null), loadRelease, enabled);
    await expect(anonymous.issue(issueInput(target))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.read({ commandId: target.commandId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adminService(app, target.fixture.userId).issue(issueInput(target))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adminService(app).issue({ ...issueInput(target), issuedByUserId: issuerId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const grant = await adminService(app).issue(issueInput(target));
    await expect(anonymous.revoke({ grantId: grant.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adminService(app, target.fixture.userId).revoke({ grantId: grant.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adminService(app).revoke({ grantId: grant.id, actor: issuerId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("keeps default OFF and scopes paginated inspection to the requested command", async () => {
    const a = await targetFixture(); const b = await targetFixture();
    const off = createRefundAuthorizationAdmin(app, () => Promise.resolve({ user: { id: issuerId, role: "ADMIN" } }), loadRelease, {});
    await expect(off.issue(issueInput(a))).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    const first = await adminService(app).issue(issueInput(a));
    await off.revoke({ grantId: first.id });
    const replacement = await adminService(app).issue(issueInput(a));
    const foreign = await adminService(app).issue(issueInput(b));
    const read = await off.read({ commandId: a.commandId, pageSize: 1 });
    expect(read.grants.map((g) => g.id)).toEqual([replacement.id]);
    expect(read.nextCursor).toBe(replacement.id);
    expect((await off.read({ commandId: a.commandId, cursor: read.nextCursor })).grants.map((g) => g.id)).toEqual([first.id]);
    await expect(off.read({ commandId: a.commandId, cursor: foreign.id })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(JSON.stringify(read)).not.toMatch(/leaseToken|credential|secretResource/u);
  });

  it("replays issuance without extending expiry and requires explicit replacement after revocation", async () => {
    const target = await targetFixture(); const input = issueInput(target); const owner = adminService(app);
    const grant = await owner.issue(input);
    expect(await owner.issue(input)).toEqual(grant);
    await expect(owner.issue({ ...input, expectedPredecessorGeneration: 2 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(owner.issue({ ...input, releasePolicyDigest: "f".repeat(64) })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(owner.issue(issueInput(target))).rejects.toMatchObject({ code: "AUTHORIZATION_CONFLICT" });
    const revoked = await owner.revoke({ grantId: grant.id });
    expect(await owner.revoke({ grantId: grant.id })).toEqual(revoked);
    expect((await owner.issue(input)).state).toBe("REVOKED");
    await expect(consume(grant.id)).rejects.toMatchObject({ code: "REVOKED" });
    expect((await owner.issue(issueInput(target))).id).not.toBe(grant.id);
  });

  it("serializes identical and conflicting concurrent issuance", async () => {
    const target = await targetFixture(); const input = issueInput(target); const owner = adminService(app);
    const same = await Promise.all([owner.issue(input), owner.issue(input)]);
    expect(same[0].id).toBe(same[1].id);
    await owner.revoke({ grantId: same[0].id });
    const competing = await Promise.allSettled([owner.issue(issueInput(target)), owner.issue(issueInput(target))]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("retains expired slots and consumption, without raw token replay after a lost response", async () => {
    const expiredTarget = await targetFixture();
    const expired = await seedGrant(expiredTarget, new Date(Date.now() - 600_000), new Date(Date.now() - 300_000));
    await expect(consume(expired.id)).rejects.toMatchObject({ code: "EXPIRED" });
    expect((await adminService(app).read({ commandId: expiredTarget.commandId })).grants[0].state).toBe("EXPIRED");
    await expect(adminService(app).issue(issueInput(expiredTarget))).rejects.toMatchObject({ code: "AUTHORIZATION_CONFLICT" });
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    await consume(grant.id); // Simulate the child dying/the commit response being discarded.
    await expect(consume(grant.id)).rejects.toMatchObject({ code: "ALREADY_CONSUMED" });
    await expect(adminService(app).revoke({ grantId: grant.id })).rejects.toMatchObject({ code: "ALREADY_CONSUMED" });
    const read = await adminService(app).read({ commandId: target.commandId });
    expect(read.grants[0]).toMatchObject({ state: "CONSUMED", consumedByPrincipalId: release.serviceAccountSubject });
    expect(JSON.stringify(read)).not.toContain("leaseToken");
  });

  it("admits one concurrent consumer and atomically links the actual event", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const races = await Promise.allSettled([consume(grant.id), consume(grant.id)]);
    const winners = races.filter((r) => r.status === "fulfilled");
    expect(winners).toHaveLength(1);
    const stored = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } });
    const event = await db.refundExecutionCommandEvent.findUniqueOrThrow({ where: { id: stored.consumedLeaseEventId ?? "missing" } });
    expect(event).toMatchObject({ commandId: target.commandId, leaseGeneration: 2, dispatchAttempt: 0, eventType: "LEASE_ACQUIRED", occurredAt: stored.consumedAt });
    expect(command.leaseOwner).toBe(stored.consumedExecutionId);
    expect(winners[0]?.value.lease.leaseGeneration).toBe(2);
  });

  it("serializes revocation against consumption without a half-consumed grant", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const races = await Promise.allSettled([adminService(app).revoke({ grantId: grant.id }), consume(grant.id)]);
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } });
    expect(Boolean(row.revokedAt)).not.toBe(Boolean(row.consumedAt));
    expect(command.leaseGeneration).toBe(row.consumedAt ? 2 : 1);
  });

  it.each([0, 2, 17])("rejects stale/future generation %i", async (generation) => {
    const target = await targetFixture();
    await expect(adminService(app).issue({ ...issueInput(target), expectedPredecessorGeneration: generation })).rejects.toThrow();
  });

  it("rechecks state and canonical financial correspondence at admission", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    await db.refundExecutionCommand.update({ where: { id: target.commandId }, data: { status: "PARKED", leaseOwner: null, leaseUntil: null, leaseTokenHash: null } });
    await expect(consume(grant.id)).rejects.toMatchObject({ code: "TARGET_INELIGIBLE" });
    expect((await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).consumedAt).toBeNull();
  });

  it("rejects preexisting provider identity drift through the current canonical binding owner", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    await db.$transaction(async (tx) => {
      await requireOwnedRefundTestCluster(tx); await tx.$executeRaw`SET LOCAL session_replication_role=replica`;
      await tx.payment.update({ where: { id: target.paymentId }, data: { providerPaymentKey: `synthetic-drift-${randomUUID()}` } });
    });
    await expect(consume(grant.id)).rejects.toThrow("TARGET_MISMATCH");
    expect((await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).consumedAt).toBeNull();
  });

  it("executes the real HTTP boundary with the partial-rvhbh env order and omitted Task defaults, and rejects a caller actor/image claim", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const executionName = `${release.jobName}/executions/http-${randomUUID()}`;
    const diagnostics = { emit: vi.fn() };
    const handler = createRefundAuthorizationAdmissionHandler({ database: app, diagnostics, loadRelease, env: enabled, runtime: rvhbhLiveShapedRuntimePort(grant.id, executionName, randomUUID()) });
    const body = { grantId: grant.id, executionName };
    const request = (extra = {}) => new Request(release.audience, { method: "POST", headers: { authorization: "Bearer synthetic.token" }, body: JSON.stringify({ ...body, ...extra }) });
    expect((await handler(request({ actor: release.serviceAccountSubject, image: "trusted" }))).status).toBe(400);
    const response = await handler(request());
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, grantId: grant.id, lease: { commandId: target.commandId, leaseGeneration: 2 } });
    expect(diagnostics.emit).toHaveBeenCalledTimes(3);
    expect(diagnostics.emit.mock.calls[2]?.[0]).toMatchObject({ event: "refund_reentry_admission_entered", route: "refund_reentry_admission", method: "POST" });
    expect((await handler(request())).status).toBe(409);
  });
});

describe("real transaction rollback and immutable transition history", () => {
  it.each(["RefundExecutionAuthorization", "RefundExecutionCommand", "RefundExecutionCommandEvent", "DEFERRED"])("rolls back all writes when %s fails", async (table) => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const admin = await pgFor();
    const actualTable = table === "DEFERRED" ? "RefundExecutionCommand" : table;
    const column = actualTable === "RefundExecutionCommand" ? "id" : "commandId";
    const suffix = randomUUID().replaceAll("-", "");
    const trigger = `test_auth_fault_${suffix}`;
    const timing = table === "DEFERRED" ? "CONSTRAINT" : "";
    const event = actualTable === "RefundExecutionCommandEvent" ? "INSERT" : "UPDATE";
    const when = table === "DEFERRED" ? "AFTER" : "BEFORE";
    const defer = table === "DEFERRED" ? "DEFERRABLE INITIALLY DEFERRED" : "";
    try {
      await admin.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_AUTH_WRITE_FAILURE'; END $$;
        CREATE ${timing} TRIGGER ${trigger} ${when} ${event} ON "${actualTable}" ${defer} FOR EACH ROW WHEN (NEW."${column}"='${target.commandId}') EXECUTE FUNCTION ${trigger}()`);
      await expect(consume(grant.id)).rejects.toThrow();
      expect((await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).consumedAt).toBeNull();
      expect((await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } })).leaseGeneration).toBe(1);
      expect(await db.refundExecutionCommandEvent.count({ where: { commandId: target.commandId } })).toBe(1);
    } finally {
      await admin.query(`DROP TRIGGER ${trigger} ON "${actualTable}"; DROP FUNCTION ${trigger}()`); await admin.end();
    }
  });

  it.each([[false, false], [true, false], [false, true]])("rejects incomplete/split transactions command=%s event=%s", async (command, event) => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target)); const client = await pgFor(appRole);
    try {
      await expect(transaction(client, () => rawConsumption(client, grant.id, target.commandId, new Date(), 1, randomUUID(), command, event))).rejects.toThrow();
      expect((await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: grant.id } })).consumedAt).toBeNull();
      expect((await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } })).leaseGeneration).toBe(1);
    } finally { await client.end(); }
  });

  it("cannot reuse an already committed lease event", async () => {
    const target = await targetFixture(); const grant = await adminService(app).issue(issueInput(target));
    const old = await db.refundExecutionCommandEvent.findFirstOrThrow({ where: { commandId: target.commandId } });
    const client = await pgFor(appRole);
    try { await expect(transaction(client, () => rawConsumption(client, grant.id, target.commandId, new Date(), 1, old.id))).rejects.toThrow(/FRESH_TRANSITION/u); }
    finally { await client.end(); }
  });

  it("preserves a prior grant after a later separately authorized generation and lease clearing", async () => {
    const target = await targetFixture();
    const past = new Date(Date.now() - 600_000);
    const first = await seedGrant(target, new Date(past.getTime() - 1000), new Date(past.getTime() + 600_000));
    const client = await pgFor(appRole);
    try { await transaction(client, () => rawConsumption(client, first.id, target.commandId, past, 1)); }
    finally { await client.end(); }
    const history = await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: first.id } });
    const second = await adminService(app).issue(issueInput({ ...target, generation: 2 }));
    expect((await consume(second.id)).lease.leaseGeneration).toBe(3);
    await db.refundExecutionCommand.update({ where: { id: target.commandId }, data: { status: "PARKED", leaseOwner: null, leaseUntil: null, leaseTokenHash: null } });
    expect(await db.refundExecutionAuthorization.findUniqueOrThrow({ where: { id: first.id } })).toEqual(history);
    await expect(db.refundExecutionAuthorization.delete({ where: { id: first.id } })).rejects.toThrow(/HISTORY_IMMUTABLE/u);
    await expect(db.refundExecutionCommandEvent.delete({ where: { id: history.consumedLeaseEventId ?? "missing" } })).rejects.toThrow();
  });
});

async function transaction(client: Awaited<ReturnType<typeof pgFor>>, operation: () => Promise<unknown>) {
  await client.query("BEGIN");
  try { await operation(); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
}
