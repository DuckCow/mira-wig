import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db";
import {
  AcceptanceBootstrap,
  type AcceptanceBootstrapHandle,
} from "../../../scripts/refund-sandbox-acceptance/bootstrap";
import { ProviderCallBudget } from "../../../scripts/refund-sandbox-acceptance/call-budget";
import { cleanupRunDatabase, type RefundFixtureIds } from "../../../scripts/refund-sandbox-acceptance/cleanup";
import { acceptanceOperationEnv } from "../../../scripts/refund-sandbox-acceptance/runtime-ledger";
import { executeScenario } from "../../../scripts/refund-sandbox-acceptance/scenario-orchestrator";
import type { TossRefundLookupPort } from "../../lib/payment/refund/providers/toss/refund-lookup-http";

type ScenarioId = "S1" | "S2" | "S5";
type Owned = Readonly<{ handle: AcceptanceBootstrapHandle; refund: RefundFixtureIds }>;
const owned: Owned[] = [];
const bootstrap = new AcceptanceBootstrap(db, "wig_platform_test");

beforeEach(async () => {
  expect(new URL(process.env.DATABASE_URL ?? "invalid:").pathname.replace(/^\//, ""))
    .toBe("wig_platform_test");
  expect(await db.$queryRaw<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`)
    .toEqual([{ databaseName: "wig_platform_test" }]);
});

afterEach(async () => {
  for (const entry of owned.splice(0).reverse()) {
    await cleanupRunDatabase(db, bootstrap, entry.handle, entry.refund);
  }
});

describe("refund SANDBOX fake-only application scenarios", () => {
  it("S1 uses the committed path with exactly two GETs and one POST", async () => {
    const result = await executeFakeScenario("S1");
    expect(result.result.ok).toBe(true);
    expect(result.budget.counts("S1")).toEqual({ GET: 2, POST: 1 });
    expect(await localProjection(result.ownership.refund.commandId, result.ownership.refund.refundAttemptId))
      .toMatchObject({ orderStatus: "REFUNDED", attemptStatus: "SUCCEEDED", dispatches: 1, proofs: 1, evidence: 1 });
  });

  it("S2 discards one successful response and recovers by the third GET without a second POST", async () => {
    let discarded = false;
    const result = await executeFakeScenario("S2", () => { discarded = true; });
    expect(result.result.ok).toBe(true);
    expect(discarded).toBe(true);
    expect(result.budget.counts("S2")).toEqual({ GET: 3, POST: 1 });
    expect(await localProjection(result.ownership.refund.commandId, result.ownership.refund.refundAttemptId))
      .toMatchObject({ orderStatus: "REFUNDED", attemptStatus: "SUCCEEDED", dispatches: 1, evidence: 1 });
  });

  it("S5 proves ordinal-2 recontact with exactly three GETs and one POST", async () => {
    const result = await executeFakeScenario("S5");
    expect(result.result.ok).toBe(true);
    expect(result.budget.counts("S5")).toEqual({ GET: 3, POST: 1 });
    expect(await localProjection(result.ownership.refund.commandId, result.ownership.refund.refundAttemptId))
      .toMatchObject({ orderStatus: "REFUNDED", attemptStatus: "SUCCEEDED", dispatches: 2, proofs: 2, evidence: 1 });
  });

  it("aborts an eligibility identity mismatch before any cancellation POST", async () => {
    const suffix = randomBytes(8).toString("hex");
    const fixture = fixtureFor("S1", suffix);
    const budget = new ProviderCallBudget();
    let posts = 0;
    await expect(executeScenario({
      client: db,
      bootstrap,
      lookup: () => Promise.resolve(Object.freeze({
        kind: "response",
        body: JSON.stringify({ ...eligibleBody(fixture), totalAmount: fixture.amount + 1 }),
      })),
      cancellation: () => {
        posts += 1;
        return Promise.resolve(Object.freeze({ kind: "unknown" }));
      },
      budget,
      env: acceptanceOperationEnv(credentialEnv()),
      probeAuthorization: "unused",
      recordLocalOwnership: (entry) => {
        owned.push(Object.freeze({ handle: entry.bootstrapHandle, refund: entry.refundFixture }));
        return Promise.resolve();
      },
    }, {
      runId: `sbx-20260718T030000Z-${suffix}`,
      scenarioId: "S1",
      fixture,
      ledgerPhase: "PLANNED",
    })).rejects.toThrow("AUTHORIZATION_FAILED_TOSS_PAYMENT_NOT_ELIGIBLE");
    expect(posts).toBe(0);
    expect(budget.counts("S1")).toEqual({ GET: 1, POST: 0 });
  });
});

async function executeFakeScenario(scenarioId: ScenarioId, onDiscard = () => undefined) {
  const suffix = randomBytes(8).toString("hex");
  const fixture = fixtureFor(scenarioId, suffix);
  const budget = new ProviderCallBudget();
  const captures: Owned[] = [];
  let lookupCount = 0;
  const lookup: TossRefundLookupPort = () => {
    lookupCount += 1;
    const cancelled = scenarioId === "S2" && lookupCount === 3;
    return Promise.resolve(Object.freeze({
      kind: "response",
      body: JSON.stringify(cancelled ? successBody(fixture, suffix) : eligibleBody(fixture)),
    }));
  };
  const result = await executeScenario({
    client: db,
    bootstrap,
    lookup,
    cancellation: () => Promise.resolve(Object.freeze({
      kind: "success",
      body: JSON.stringify(successBody(fixture, suffix)),
    })),
    budget,
    env: acceptanceOperationEnv(credentialEnv()),
    probeAuthorization: "unused-fake-authorization",
    recordDiscardedResponse: () => {
      onDiscard();
      return Promise.resolve();
    },
    recordLocalOwnership: (entry) => {
      const ownership = Object.freeze({
        handle: entry.bootstrapHandle,
        refund: entry.refundFixture,
      });
      captures.push(ownership);
      owned.push(ownership);
      return Promise.resolve();
    },
    now: () => new Date("2026-07-18T03:00:00.000Z"),
  }, {
    runId: `sbx-20260718T030000Z-${suffix}`,
    scenarioId,
    fixture,
    ledgerPhase: "PLANNED",
  });
  const ownership = captures[0];
  if (!ownership) throw new Error("SCENARIO_OWNERSHIP_NOT_RECORDED");
  return Object.freeze({ result, budget, ownership });
}

function fixtureFor(scenarioId: ScenarioId, suffix: string) {
  return Object.freeze({
    scenarioId,
    paymentKey: `h1-payment-${suffix}`,
    providerOrderId: `h1-provider-order-${suffix}`,
    amount: 1_500,
    currency: "KRW" as const,
    reference: `h1-${scenarioId}-${suffix}`,
  });
}

function eligibleBody(fixture: ReturnType<typeof fixtureFor>) {
  return {
    paymentKey: fixture.paymentKey,
    method: "카드",
    easyPay: null,
    currency: "KRW",
    status: "DONE",
    totalAmount: fixture.amount,
    balanceAmount: fixture.amount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
  };
}

function successBody(fixture: ReturnType<typeof fixtureFor>, suffix: string) {
  return {
    paymentKey: fixture.paymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: fixture.amount,
    balanceAmount: 0,
    cancels: [{
      transactionKey: `h1-transaction-${suffix}`,
      cancelStatus: "DONE",
      cancelAmount: fixture.amount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

function credentialEnv(): Readonly<Record<string, string>> {
  return Object.freeze({
    TOSS_SANDBOX_SECRET_KEY: "test_sk_fake-only-never-network",
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
  });
}

async function localProjection(commandId: string, refundAttemptId: string) {
  const [order, attempt, dispatches, proofs, evidence] = await Promise.all([
    db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId }, select: { order: { select: { status: true } } } }),
    db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId }, select: { status: true } }),
    db.refundExecutionDispatchAttempt.count({ where: { commandId } }),
    db.refundExecutionProviderContactEligibilityProof.count({ where: { dispatchAttempt: { commandId } } }),
    db.refundExecutionEvidence.count({ where: { commandId } }),
  ]);
  return Object.freeze({
    orderStatus: order.order.status,
    attemptStatus: attempt.status,
    dispatches,
    proofs,
    evidence,
  });
}
