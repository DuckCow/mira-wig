import { randomBytes } from "node:crypto";
import { RefundAttemptActorType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db";
import {
  AcceptanceBootstrap,
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
import { verifyAcceptanceDatabase } from "../../../scripts/refund-sandbox-acceptance/database-verifier";

type Owned = Readonly<{ handle: AcceptanceBootstrapHandle; refund: RefundFixtureIds | null }>;
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
    let driftCalled = false;
    await expect(verifyAcceptanceDatabase(db, {
      configuredUrl: process.env.DATABASE_URL,
      migrationsDirectory: "prisma/migrations",
      driftCheck: () => {
        driftCalled = true;
        return Promise.resolve();
      },
    })).rejects.toThrow("ACCEPTANCE_DATABASE_REQUIRED");
    expect(driftCalled).toBe(false);
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
      orderItems: 0,
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
    const input = bootstrapInput("S4");
    await expect(bootstrap.createOrLoad({ ...input, ledgerPhase: "POST_INTENT_RECORDED" }))
      .rejects.toThrow("BOOTSTRAP_SEALED_AFTER_CONTACT");
  });

  it("keeps another run and a pre-existing KR market when exact owned cleanup runs", async () => {
    const first = await bootstrap.createOrLoad(bootstrapInput("S5"));
    const second = await bootstrap.createOrLoad(bootstrapInput("S5"));
    owned.push({ handle: first.handle, refund: null }, { handle: second.handle, refund: null });
    const removed = owned.shift();
    if (!removed) throw new Error("TEST_OWNERSHIP_MISSING");
    await cleanupRunDatabase(db, bootstrap, removed.handle, null);
    owned.unshift(removed);
    expect(await db.order.count({ where: { id: second.handle.orderId } })).toBe(1);
    expect(await db.market.count({ where: { code: "KR" } })).toBe(1);
  });
});

function bootstrapInput(scenarioId: "S1" | "S2" | "S3" | "S4" | "S5") {
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
