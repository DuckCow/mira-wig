import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { createDispatchFixture, cleanupDispatchFixtures, type DispatchFixture } from "../../../__tests__/refund-dispatch-fixture";
import { requireOwnedRefundTestCluster } from "../../../__tests__/retained-refund-test-history";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../../eximbay-refund-reentry-authority";
import { applyEximbayContactedRefundSuccess } from "../apply-contacted-success";
import { parseContactedRefundSuccessProof } from "../contacted-evidence-parser";
import { contactedEvidenceSelect, recoverContactedEvidenceAuthority } from "../contacted-evidence-state";
import { config, env, facts, fixture, response, fakeFetch } from "./contacted-success-fixture";

import { main as commandMain } from "../../../../../../../scripts/eximbay-contacted-refund-success-close-once";

vi.mock("../../../eximbay-refund-canary-secret-reader", () => ({
  readExactEximbayRefundCanarySecret: () => Promise.resolve("fake-secret"),
}));

let owned: DispatchFixture | undefined;
beforeAll(async () => { await requireOwnedRefundTestCluster(); });
afterEach(async () => { if (owned) await cleanupDispatchFixtures(owned); owned = undefined; });

async function prepare() {
  owned = await createDispatchFixture({ ...target, totalAmount: 100, targetAmount: 100, communicationLocale: "en" });
  await db.$transaction(async tx => {
    await requireOwnedRefundTestCluster(tx);
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.payment.update({ where: { id: target.paymentId }, data: {
      provider: "EXIMBAY", providerOrderId: syntheticEximbayProviderOrderId(), adapterExecutionKind: "EXTERNAL",
    } });
  });
  const payment = await db.payment.findUniqueOrThrow({ where: { id: target.paymentId } });
  if (!payment.providerOrderId) throw new Error("missing synthetic provider order");
  const row = fixture(payment.providerOrderId);
  await db.checkoutSession.update({ where: { id: owned.sessionId }, data: { currency: "USD" } });
  await db.payment.update({ where: { id: target.paymentId }, data: { currency: "USD", providerPaymentKey: facts.providerTransactionId } });
  await db.order.update({ where: { id: target.orderId }, data: { currency: "USD" } });
  await db.refundAttempt.update({ where: { id: target.refundAttemptId }, data: { currency: "USD", provider: "EXIMBAY", idempotencyKey: row.refundAttempt.idempotencyKey } });
  await db.refundExecutionCommand.update({ where: { id: target.commandId }, data: {
    status: "WAITING_EVIDENCE", leaseGeneration: 6, dispatchAttempt: 1,
  } });
  const binding = row.refundAttempt.providerOperationBinding;
  if (!binding) throw new Error("missing synthetic binding");
  const { eximbayPreflightObservations, ...bindingData } = binding;
  await db.refundExecutionProviderOperationBinding.create({ data: bindingData });
  await db.refundExecutionEximbayPreflightObservation.create({ data: eximbayPreflightObservations[0] });
  await db.refundExecutionDispatchAttempt.create({ data: { ...row.dispatchAttempts[0], authorizedAt: new Date("2026-09-14T00:00:00Z") } });
  await db.eximbayRefundSandboxCanaryApproval.create({ data: {
    id: target.approvalId, formatVersion: "mira-refund-eximbay-sandbox-canary-approval/v1",
    provider: "EXIMBAY", mode: "SANDBOX", commandId: target.commandId,
    approvalEvidenceDigest: target.approvalEvidenceDigest, releaseBindingDigest: target.releaseBindingDigest,
    canaryJobBindingDigest: target.canaryJobBindingDigest, preflightJobBindingDigest: target.preflightJobBindingDigest,
    imageBindingDigest: target.imageBindingDigest, secretGenerationBindingDigest: target.secretGenerationBindingDigest,
    targetBindingDigest: target.targetBindingDigest, approvedAt: new Date("2026-09-14T00:00:00Z"),
    expiresAt: new Date("2026-09-14T00:15:00Z"), issuedByPrincipalId: "synthetic-pl08",
    consumedAt: new Date("2026-09-14T00:00:00Z"), consumedExecutionId: "synthetic-pl08",
    consumedExecutionBindingDigest: "a".repeat(64),
  } });
  await db.refundExecutionEvidence.create({ data: {
    commandId: target.commandId, dispatchAttemptId: row.dispatchAttempts[0].id,
    authorizingLeaseGeneration: 6, source: "ADAPTER_RESPONSE",
    sourceDedupKey: `refund-result:${target.commandId}:1`, outcome: "UNKNOWN", application: "PARKED",
    safeCode: "PROVIDER_OUTCOME_UNKNOWN", observedAt: new Date("2026-09-14T00:00:01Z"),
  } });
  const stored = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId }, select: contactedEvidenceSelect });
  const authority = recoverContactedEvidenceAuthority(stored, config);
  if (!authority) throw new Error("synthetic authority mismatch");
  const proof = parseContactedRefundSuccessProof(response({ order_id: payment.providerOrderId }), authority);
  if (!proof) throw new Error("synthetic proof rejected");
  return { proof, authority, providerOrderId: payment.providerOrderId };
}
async function financialState() {
  return {
    attempt: await db.refundAttempt.findUniqueOrThrow({ where: { id: target.refundAttemptId } }),
    command: await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: target.commandId } }),
    order: await db.order.findUniqueOrThrow({ where: { id: target.orderId } }),
    evidence: await db.refundExecutionEvidence.findMany({ where: { commandId: target.commandId } }),
    transitions: await db.refundAttemptTransition.findMany({ where: { refundAttemptId: target.refundAttemptId } }),
    outbox: await db.paymentOutbox.findMany({ where: { dedupKey: `customer-refund-succeeded:v1:${target.refundAttemptId}` } }),
  };
}

describe("local proof-bound success owner on isolated PostgreSQL", () => {
  it("atomically persists exact success once under concurrent closure", async () => {
    const { proof } = await prepare();
    const results = await Promise.all([applyEximbayContactedRefundSuccess(db, proof, config), applyEximbayContactedRefundSuccess(db, proof, config)]);
    expect(results.map(r => r.outcome).sort()).toEqual(["CLOSED", "REJECTED"]);
    const state = await financialState();
    expect(state.attempt).toMatchObject({ status: "SUCCEEDED", providerRefundId: "fake-refund-transaction", amount: 100 });
    expect(state.order.status).toBe("REFUNDED");
    expect(state.command).toMatchObject({ status: "DONE", leaseGeneration: 6, dispatchAttempt: 1 });
    expect(state.evidence).toHaveLength(2);
    expect(state.evidence.find(e => e.outcome === "SUCCEEDED")).toMatchObject({ outcome: "SUCCEEDED", application: "APPLIED", source: "PROVIDER_LOOKUP", observedProviderRefundId: "fake-refund-transaction" });
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({ topic: "customer.refund-succeeded.email.v1", status: "PENDING" });
    const total = await db.refundAttempt.aggregate({ where: { paymentId: target.paymentId, status: "SUCCEEDED" }, _sum: { amount: true } });
    expect(total._sum.amount).toBe(100); expect(100 - (total._sum.amount ?? 0)).toBe(0);
    expect(await applyEximbayContactedRefundSuccess(db, proof, config)).toEqual({ outcome: "REJECTED" });
    expect(await financialState()).toEqual(state);
  });
  it("executes the CLI with one inquiry, blank auth code and durable success without raw output", async () => {
    const { providerOrderId } = await prepare();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const fetch = fakeFetch(response({ order_id: providerOrderId, auth_code: " " }));
    vi.stubGlobal("fetch", fetch);
    const previous = process.argv;
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      process.argv = ["node", "eximbay-contacted-refund-success-close-once.ts", target.commandId];
      const exitCode = await commandMain();
      const output = write.mock.calls.map(call => String(call[0])).join("");
      expect(exitCode).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(output).toContain('"outcome":"CLOSED"');
      for (const raw of ["fake-refund-transaction", facts.providerTransactionId, providerOrderId, "fake-secret", config.mid]) {
        expect(output.includes(raw)).toBe(false);
      }
      const state = await financialState();
      expect(state.attempt.providerRefundId === "fake-refund-transaction").toBe(true);
      expect(state.outbox).toHaveLength(1);
    } finally {
      process.argv = previous; write.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    }
  });
  it.each(["NON_SUCCESS", "UNKNOWN_SHAPE"])("rejects %s without durable writes", async kind => {
    const { authority, providerOrderId } = await prepare();
    const body = response({ order_id: providerOrderId });
    const rejected = kind === "NON_SUCCESS" ? { ...body, rescode: "9999" } : { ...body, unexpected: true };
    const proof = parseContactedRefundSuccessProof(rejected, authority);
    expect(proof).toBeNull();
    const before = await financialState();
    expect(await applyEximbayContactedRefundSuccess(db, proof ?? { kind: "CONTACTED_REFUND_SUCCESS_PROOF" }, config))
      .toEqual({ outcome: "REJECTED" });
    expect(await financialState()).toEqual(before);
  });
  it.each(["generation", "status"])("rejects durable %s drift without writes", async field => {
    const { proof } = await prepare();
    // Frozen authority fixtures cannot manufacture a generation transition. Drift
    // is tested with an already-existing pre-state before owner invocation.
    await db.$transaction(async tx => {
      await requireOwnedRefundTestCluster(tx);
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.refundExecutionCommand.update({ where: { id: target.commandId }, data:
        field === "generation" ? { leaseGeneration: 5 } : { status: "PARKED" } });
    });
    const before = await financialState();
    expect(await applyEximbayContactedRefundSuccess(db, proof, config)).toEqual({ outcome: "REJECTED" });
    expect(await financialState()).toEqual(before);
  });
  it.each(["refund_id", "transaction_id", "currency", "refund_amount"])("rejects a proof bound to different %s with zero writes", async key => {
    const prepared = await prepare();
    const alternate = { ...prepared.authority };
    if (key === "refund_id") alternate.providerOperationKey = "wrong";
    if (key === "transaction_id") alternate.originalTransactionId = "wrong";
    if (key === "currency") alternate.currency = "JPY";
    if (key === "refund_amount") alternate.expectedRefundAmount = 101;
    const body = response({ order_id: prepared.providerOrderId,
      ...(key === "currency" ? { currency: "JPY", amount: "100", refund_amount: "100" }
        : { [key]: key === "refund_amount" ? "1.01" : "wrong" }),
    });
    const proof = parseContactedRefundSuccessProof(body, alternate);
    expect(proof).not.toBeNull();
    const before = await financialState();
    expect(await applyEximbayContactedRefundSuccess(db, proof ?? { kind: "CONTACTED_REFUND_SUCCESS_PROOF" }, config)).toEqual({ outcome: "REJECTED" });
    expect(await financialState()).toEqual(before);
  });
});
