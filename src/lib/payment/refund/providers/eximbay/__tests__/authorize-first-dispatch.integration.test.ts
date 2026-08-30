import {
  PaymentAdapterExecutionKind,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
} from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { acquireRefundExecutionLease, type RefundExecutionLeaseHandle } from "../../../acquire-lease";
import {
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
} from "../../../execution-activation";
import { releaseRefundExecutionLease } from "../../../release-lease";
import { sealEximbayRefundCanaryTarget } from
  "../../../eximbay-refund-canary-target-binding";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import {
  createEximbayFirstRefundDispatchAuthorizer,
  type AuthorizeEximbayFirstRefundDispatchResult,
} from "../authorize-first-dispatch";
import type { EximbayRefundRetrieveTransport } from "../preflight-retrieve";
import {
  deriveEximbayMerchantRefundId,
  isCanonicalEximbayMerchantRefundId,
} from "../refund-id";

const LEASE_ENV = Object.freeze({ [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
const RELEASE_ENV = Object.freeze({ [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "ENABLED" });
const BLOCK_CONSTRAINT = "eximbay_preflight_test_block_dispatch";
const CONFIG = Object.freeze({
  mode: PaymentMode.SANDBOX,
  mid: "synthetic-merchant-mid",
  merchantAccountBindingId: "merchant-test-1",
  credentialGenerationBindingId: "generation-test-1",
});

type LeasedFixture = Readonly<{
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
  providerOrderId: string;
}>;

describe("dormant Eximbay first-refund preflight and R1", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//u, "") !== "wig_platform_test") {
      throw new Error("Eximbay preflight integration tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    await dropDispatchBlock();
    await cleanupEximbayObservations(fixtures);
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("admits one full proof, authorizes one R1, and replays without retrieve", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234);
    const calls: number[] = [];
    const authorize = authorizer(leased, async () => {
      calls.push(await dispatchCount(leased.fixture.commandId));
      return response(leased, 1_234);
    });
    const first = await authorize(db, input(leased.lease));
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.code);
    expect(first.replayed).toBe(false);
    expect(first.authorization.refundType).toBe("F");
    expect(calls).toEqual([0]);

    const state = await durableState(leased.fixture);
    expect(state.bindings).toHaveLength(1);
    expect(state.observations).toHaveLength(1);
    expect(state.dispatches).toHaveLength(1);
    expect(state.evidence).toHaveLength(0);
    expect(state.tossProofs).toHaveLength(0);
    expect(state.observations[0].observingLeaseGeneration).toBe(leased.lease.leaseGeneration);
    expect(state.observations[0].observedAt.getTime())
      .toBeLessThanOrEqual(state.dispatches[0].authorizedAt.getTime());
    expect(isCanonicalEximbayMerchantRefundId(state.dispatches[0].providerOperationKey)).toBe(true);
    expect(state.dispatches[0].providerOperationKey).toBe(deriveEximbayMerchantRefundId(
      state.bindings[0].operationFamilyFingerprint,
      1,
    ));

    let replayCalls = 0;
    const replay = await authorizer(leased, () => {
      replayCalls += 1;
      return Promise.reject(new Error("retrieve must not run on exact replay"));
    })(db, input(leased.lease));
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.code);
    expect(replay.replayed).toBe(true);
    expect(replayCalls).toBe(0);
    expect((await durableState(leased.fixture)).dispatches).toHaveLength(1);
  });

  it("serializes identical concurrent observations and conflicts differing facts", async () => {
    const identical = await trackedFixture(fixtures, 1_234, 1_234);
    const same = pairedTransport(identical, [1_234, 1_234]);
    const sameResults = await Promise.all([
      authorizer(identical, same.transport)(db, input(identical.lease)),
      authorizer(identical, same.transport)(db, input(identical.lease)),
    ]);
    expect(same.calls()).toBe(2);
    expect(sameResults.every((result) => result.ok)).toBe(true);
    expect((await durableState(identical.fixture)).observations).toHaveLength(1);
    expect((await durableState(identical.fixture)).dispatches).toHaveLength(1);

    const differing = await trackedFixture(fixtures, 1_234, 1_000);
    const different = pairedTransport(differing, [1_000, 900]);
    const differentResults = await Promise.all([
      authorizer(differing, different.transport)(db, input(differing.lease)),
      authorizer(differing, different.transport)(db, input(differing.lease)),
    ]);
    expect(different.calls()).toBe(2);
    expect(differentResults.filter((result) => result.ok)).toHaveLength(0);
    expect(differentResults.map(failureCode).sort())
      .toEqual(["PREFLIGHT_CONFLICT", "REFUND_NOT_LAWFUL"]);
    expect((await durableState(differing.fixture)).observations).toHaveLength(1);
    expect((await durableState(differing.fixture)).dispatches).toHaveLength(0);
  });

  it("reuses a persisted proof after R1 persistence failure under the same lease", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234);
    await addDispatchBlock();
    const first = await authorizer(leased, () => Promise.resolve(response(leased, 1_234)))(
      db, input(leased.lease),
    );
    expect(failureCode(first)).toBe("PERSISTENCE_CONFLICT");
    expect((await durableState(leased.fixture)).observations).toHaveLength(1);
    expect((await durableState(leased.fixture)).dispatches).toHaveLength(0);
    await dropDispatchBlock();

    let calls = 0;
    const replay = await authorizer(leased, () => {
      calls += 1;
      return Promise.reject(new Error("same-generation proof must be reused"));
    })(db, input(leased.lease));
    expect(replay.ok).toBe(true);
    expect(calls).toBe(0);
    expect((await durableState(leased.fixture)).dispatches).toHaveLength(1);
  });

  it("requires a new retrieve for a new lease generation", async () => {
    const first = await trackedFixture(fixtures, 1_234, 1_234);
    await addDispatchBlock();
    expect(failureCode(await authorizer(first, () => Promise.resolve(response(first, 1_234)))(
      db, input(first.lease),
    ))).toBe("PERSISTENCE_CONFLICT");
    await dropDispatchBlock();

    const released = await releaseRefundExecutionLease(db, input(first.lease), RELEASE_ENV);
    expect(released.ok).toBe(true);
    const reacquired = await acquireRefundExecutionLease(db, {
      commandId: first.fixture.commandId,
      leaseOwner: "eximbay-preflight-generation-2",
    }, LEASE_ENV);
    expect(reacquired.ok).toBe(true);
    if (!reacquired.ok) throw new Error(reacquired.code);
    const second: LeasedFixture = { ...first, lease: reacquired.lease };
    let calls = 0;
    const result = await authorizer(second, () => {
      calls += 1;
      return Promise.resolve(response(second, 1_234));
    })(db, input(second.lease));
    expect(result.ok).toBe(true);
    expect(calls).toBe(1);
    const state = await durableState(first.fixture);
    expect(state.observations.map((row) => row.observingLeaseGeneration)).toEqual([1, 2]);
  });

  it("blocks credential drift and an invalid persisted fingerprint without contact or R1", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234);
    await addDispatchBlock();
    await authorizer(leased, () => Promise.resolve(response(leased, 1_234)))(db, input(leased.lease));
    await dropDispatchBlock();

    let driftCalls = 0;
    const drifted = createEximbayFirstRefundDispatchAuthorizer({
      config: { ...CONFIG, credentialGenerationBindingId: "generation-test-2" },
      retrieve: () => { driftCalls += 1; return Promise.resolve(response(leased, 1_234)); },
    });
    expect(failureCode(await drifted(db, input(leased.lease)))).toBe("BINDING_MISMATCH");
    expect(driftCalls).toBe(0);

    await mutateFingerprintForTest(leased.fixture, "b".repeat(64));
    let invalidCalls = 0;
    const invalid = await authorizer(leased, () => {
      invalidCalls += 1;
      return Promise.resolve(response(leased, 1_234));
    })(db, input(leased.lease));
    expect(failureCode(invalid)).toBe("REFUND_LEDGER_INCONSISTENT");
    expect(invalidCalls).toBe(0);
    expect((await durableState(leased.fixture)).dispatches).toHaveLength(0);
  });

  it("accepts the canary's exact presealed operation binding and rejects drift without a second binding", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234, true);
    expect(await bindingCount(leased.fixture)).toBe(1);

    let driftCalls = 0;
    const drifted = createEximbayFirstRefundDispatchAuthorizer({
      config: { ...CONFIG, credentialGenerationBindingId: "generation-test-drift" },
      retrieve: () => {
        driftCalls += 1;
        return Promise.resolve(response(leased, 1_234));
      },
    });
    expect(failureCode(await drifted(db, input(leased.lease)))).toBe("BINDING_MISMATCH");
    expect(driftCalls).toBe(0);
    expect(await bindingCount(leased.fixture)).toBe(1);

    const accepted = await authorizer(
      leased, () => Promise.resolve(response(leased, 1_234)),
    )(db, input(leased.lease));
    expect(accepted.ok).toBe(true);
    expect(await bindingCount(leased.fixture)).toBe(1);
  });

  it("reloads Payment authority after waiting for its canonical lock", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234);
    const blocker = await pgClient();
    let transactionOpen = false;
    try {
      const pending = authorizer(leased, async () => {
        await blocker.query("BEGIN");
        transactionOpen = true;
        await blocker.query('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', [
          leased.fixture.paymentId,
        ]);
        return response(leased, 1_234);
      })(db, input(leased.lease));

      const blockerPid = await backendPid(blocker);
      await waitUntilBlocking(blocker, blockerPid);
      await blocker.query(
        'UPDATE "Payment" SET "providerPaymentKey" = $1 WHERE "id" = $2',
        [`drift-${leased.fixture.refundAttemptId}`, leased.fixture.paymentId],
      );
      await blocker.query("COMMIT");
      transactionOpen = false;

      expect(failureCode(await pending)).toBe("BINDING_MISMATCH");
      const state = await durableState(leased.fixture);
      expect(state.observations).toHaveLength(0);
      expect(state.dispatches).toHaveLength(0);
    } finally {
      if (transactionOpen) await blocker.query("ROLLBACK");
      await blocker.end();
    }
  });

  it("reloads a binding changed while waiting for its canonical lock", async () => {
    const leased = await trackedFixture(fixtures, 1_234, 1_234);
    await addDispatchBlock();
    expect(failureCode(await authorizer(
      leased, () => Promise.resolve(response(leased, 1_234)),
    )(db, input(leased.lease)))).toBe("PERSISTENCE_CONFLICT");
    await dropDispatchBlock();
    const stateBefore = await durableState(leased.fixture);
    expect(stateBefore.bindings).toHaveLength(1);
    const binding = stateBefore.bindings[0];
    if (!binding) throw new Error("Missing Eximbay binding fixture.");

    const blocker = await pgClient();
    let transactionOpen = false;
    try {
      await blocker.query("BEGIN");
      transactionOpen = true;
      await blocker.query(
        'SELECT "id" FROM "RefundExecutionProviderOperationBinding" WHERE "id" = $1 FOR UPDATE',
        [binding.id],
      );
      let retrieveCalls = 0;
      const pending = authorizer(leased, () => {
        retrieveCalls += 1;
        return Promise.resolve(response(leased, 1_234));
      })(db, input(leased.lease));

      const blockerPid = await backendPid(blocker);
      await waitUntilBlocking(blocker, blockerPid);
      await blocker.query(
        'UPDATE "RefundExecutionProviderOperationBinding" '
          + 'SET "credentialGenerationBindingId" = $1 WHERE "id" = $2',
        ["generation-test-drift", binding.id],
      );
      await blocker.query("COMMIT");
      transactionOpen = false;

      expect(failureCode(await pending)).toBe("BINDING_MISMATCH");
      expect(retrieveCalls).toBe(0);
      expect((await durableState(leased.fixture)).dispatches).toHaveLength(0);
    } finally {
      if (transactionOpen) await blocker.query("ROLLBACK");
      await blocker.end();
    }
  });
});

function authorizer(_leased: LeasedFixture, retrieve: EximbayRefundRetrieveTransport) {
  return createEximbayFirstRefundDispatchAuthorizer({
    config: CONFIG,
    retrieve,
  });
}

async function trackedFixture(
  fixtures: DispatchFixture[],
  totalAmount: number,
  targetAmount: number,
  presealCanary = false,
): Promise<LeasedFixture> {
  const fixture = await createDispatchFixture({
    totalAmount,
    targetAmount,
    ...(presealCanary ? {
      refundActorType: RefundAttemptActorType.SYSTEM,
      refundActorUserId: null,
    } : {}),
  });
  fixtures.push(fixture);
  await seedEximbayPaymentForTest(fixture);
  await Promise.all([
    db.order.update({ where: { id: fixture.orderId }, data: { currency: "USD" } }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: {
        currency: "USD",
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
      },
    }),
    ...(presealCanary ? [db.payment.update({
      where: { id: fixture.paymentId },
      data: { adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL },
    })] : []),
  ]);
  const payment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  if (!payment.providerOrderId) throw new Error("Missing Eximbay provider order id fixture.");
  if (presealCanary) {
    await sealEximbayRefundCanaryTarget(db, {
      commandId: fixture.commandId,
      merchantAccountBindingId: CONFIG.merchantAccountBindingId,
      credentialGenerationBindingId: CONFIG.credentialGenerationBindingId,
      custodyArtifactSha256: "a".repeat(64),
    });
  }
  const leased = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "eximbay-preflight-test",
  }, LEASE_ENV);
  if (!leased.ok) throw new Error(leased.code);
  return { fixture, lease: leased.lease, providerOrderId: payment.providerOrderId };
}

function bindingCount(fixture: DispatchFixture): Promise<number> {
  return db.refundExecutionProviderOperationBinding.count({
    where: { refundAttemptId: fixture.refundAttemptId },
  });
}

async function seedEximbayPaymentForTest(fixture: DispatchFixture): Promise<void> {
  await requireDisposableDatabase();
  await db.$executeRawUnsafe(`ALTER TABLE "Payment" DISABLE TRIGGER "Payment_provider_order_id_immutable"`);
  try {
    await db.payment.update({
      where: { id: fixture.paymentId },
      data: {
        currency: "USD",
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        providerOrderId: syntheticEximbayProviderOrderId(),
      },
    });
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "Payment" ENABLE TRIGGER "Payment_provider_order_id_immutable"`);
  }
}

function input(lease: RefundExecutionLeaseHandle) {
  return {
    commandId: lease.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  };
}

function response(leased: LeasedFixture, balance: number): Response {
  return new Response(JSON.stringify({
      rescode: "0000",
      resmsg: "ok",
      mid: CONFIG.mid,
      payment: {
        order_id: leased.providerOrderId,
        currency: "USD",
        amount: encodeEximbayAmount("USD", leased.fixture.totalAmount),
        transaction_id: leased.fixture.providerPaymentKey,
        status: "SALE",
        transaction_date: "20260820010203",
        balance: encodeEximbayAmount("USD", balance),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function pairedTransport(leased: LeasedFixture, balances: readonly [number, number]) {
  let callCount = 0;
  let release: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => { release = resolve; });
  const transport: EximbayRefundRetrieveTransport = async () => {
    const index = callCount;
    callCount += 1;
    if (callCount === 2) release?.();
    await bothStarted;
    const balance = balances[index];
    if (balance === undefined) throw new Error("Unexpected retrieve invocation.");
    return response(leased, balance);
  };
  return { transport, calls: () => callCount };
}

async function durableState(fixture: DispatchFixture) {
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: fixture.refundAttemptId },
  });
  const bindingIds = bindings.map((binding) => binding.id);
  const [observations, dispatches, evidence, tossProofs] = await Promise.all([
    db.refundExecutionEximbayPreflightObservation.findMany({
      where: { bindingId: { in: bindingIds } },
      orderBy: { observingLeaseGeneration: "asc" },
    }),
    db.refundExecutionDispatchAttempt.findMany({ where: { commandId: fixture.commandId } }),
    db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId } }),
    db.refundExecutionProviderEligibilityProof.findMany({ where: { bindingId: { in: bindingIds } } }),
  ]);
  return { bindings, observations, dispatches, evidence, tossProofs };
}

async function dispatchCount(commandId: string): Promise<number> {
  return db.refundExecutionDispatchAttempt.count({ where: { commandId } });
}

function failureCode(result: AuthorizeEximbayFirstRefundDispatchResult): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

async function addDispatchBlock(): Promise<void> {
  await db.$executeRawUnsafe(`
    ALTER TABLE "RefundExecutionDispatchAttempt"
    ADD CONSTRAINT "${BLOCK_CONSTRAINT}"
    CHECK ("provider" <> 'EXIMBAY'::"PaymentProvider")
  `);
}

async function dropDispatchBlock(): Promise<void> {
  await db.$executeRawUnsafe(`
    ALTER TABLE "RefundExecutionDispatchAttempt"
    DROP CONSTRAINT IF EXISTS "${BLOCK_CONSTRAINT}"
  `);
}

async function mutateFingerprintForTest(fixture: DispatchFixture, fingerprint: string): Promise<void> {
  await requireDisposableDatabase();
  await db.$executeRawUnsafe(`ALTER TABLE "RefundExecutionEximbayPreflightObservation" DISABLE TRIGGER "EximbayPreflight_immutable"`);
  try {
    await db.refundExecutionEximbayPreflightObservation.updateMany({
      where: { binding: { refundAttemptId: fixture.refundAttemptId } },
      data: { observationFingerprint: fingerprint },
    });
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "RefundExecutionEximbayPreflightObservation" ENABLE TRIGGER "EximbayPreflight_immutable"`);
  }
}

async function cleanupEximbayObservations(fixtures: readonly DispatchFixture[]): Promise<void> {
  if (fixtures.length === 0) return;
  await requireDisposableDatabase();
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: { in: fixtures.map((fixture) => fixture.refundAttemptId) } },
    select: { id: true },
  });
  await db.$executeRawUnsafe(`ALTER TABLE "RefundExecutionEximbayPreflightObservation" DISABLE TRIGGER "EximbayPreflight_immutable"`);
  try {
    await db.refundExecutionEximbayPreflightObservation.deleteMany({
      where: { bindingId: { in: bindings.map((binding) => binding.id) } },
    });
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "RefundExecutionEximbayPreflightObservation" ENABLE TRIGGER "EximbayPreflight_immutable"`);
  }
}

async function requireDisposableDatabase(): Promise<void> {
  const rows = await db.$queryRaw<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
    throw new Error("Eximbay test-only trigger control requires wig_platform_test.");
  }
}

async function pgClient(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL for Eximbay lock-race test.");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function backendPid(client: Client): Promise<number> {
  const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS "pid"');
  const pid = result.rows[0]?.pid;
  if (!pid) throw new Error("Unable to identify PostgreSQL blocker backend.");
  return pid;
}

async function waitUntilBlocking(client: Client, blockerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.query<{ blocked: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE $1 = ANY(pg_blocking_pids(pid))
      ) AS "blocked"
    `, [blockerPid]);
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the Eximbay admission transaction to block.");
}
