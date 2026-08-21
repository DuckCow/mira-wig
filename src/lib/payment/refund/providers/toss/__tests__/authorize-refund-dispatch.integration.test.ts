import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acquireRefundExecutionLease, type RefundExecutionLeaseHandle } from "../../../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
} from "../../../execution-activation";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  markDispatchContactForTest,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "../../../__tests__/refund-order-lock-barrier";
import {
  createTossRefundExecutionAuthorizer,
  type TossRefundAuthorizerDependencies,
} from "../refund-authorization-orchestrator";
import type { TossRefundLookupPort } from "../refund-lookup-http";
import { deriveTossRefundOperationKey, TOSS_REFUND_OPERATION_KEY_VERSION } from "../refund-operation-key";
import { TOSS_REFUND_WIRE_VERSION } from "../refund-wire-fingerprint";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const ENABLED_ENV = {
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  TOSS_SANDBOX_SECRET_KEY: "synthetic_test_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};

type LeasedTossFixture = Readonly<{ fixture: DispatchFixture; lease: RefundExecutionLeaseHandle }>;

describe("authorizeTossRefundExecutionDispatch integration", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Toss refund authorization integration tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("persists one complete binding, proof, AUTHORIZED ordinal 1, and command CAS", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const calls: string[] = [];
    const result = await authorizer(eligibleLookup(leased.fixture, calls))(
      db, authorizationInput(leased), ENABLED_ENV,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected authorization success: ${result.code}`);
    expect(result.replayed).toBe(false);
    expect(calls).toEqual([leased.fixture.providerPaymentKey]);
    const state = await durableState(leased.fixture);
    expect(state.command.dispatchAttempt).toBe(1);
    expect(state.bindings).toHaveLength(1);
    expect(state.proofs).toHaveLength(1);
    expect(state.dispatches).toHaveLength(1);
    expect(state.dispatches[0].state).toBe(RefundExecutionDispatchAttemptState.AUTHORIZED);
    expect(state.dispatches[0].contactMarkedAt).toBeNull();
    expect(state.proofs[0].localReceivedAt.getMilliseconds()).toBeGreaterThanOrEqual(0);
    expect(state.proofs[0].localReceivedAt.getTime())
      .toBeLessThanOrEqual(state.dispatches[0].authorizedAt.getTime());
  });

  it("does not refresh the conservative no-later-than lookup timestamp during a delayed lookup", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    let lookupStarted: (() => void) | undefined;
    let releaseLookup: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const lookup: TossRefundLookupPort = async () => {
      lookupStarted?.();
      await released;
      return { kind: "response", body: JSON.stringify(eligibleBody(leased.fixture)) };
    };
    const pending = authorizer(lookup)(db, authorizationInput(leased), ENABLED_ENV);
    await started;
    const barrierTime = await databaseTime();
    releaseLookup?.();
    const result = await pending;
    expect(result.ok).toBe(true);
    const state = await durableState(leased.fixture);
    expect(state.proofs[0].localReceivedAt.getTime()).toBeLessThanOrEqual(barrierTime.getTime());
  });

  it("replays from complete durable state without lookup, including with lookup gate disabled", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstCalls: string[] = [];
    const first = await authorizer(eligibleLookup(leased.fixture, firstCalls))(
      db, authorizationInput(leased), ENABLED_ENV,
    );
    expect(first.ok).toBe(true);
    const replayCalls: string[] = [];
    const replay = await authorizer(eligibleLookup(leased.fixture, replayCalls))(
      db,
      authorizationInput(leased),
      { ...ENABLED_ENV, [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "" },
    );
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(`Expected replay success: ${replay.code}`);
    expect(replay.replayed).toBe(true);
    expect(replayCalls).toHaveLength(0);
    expect((await durableState(leased.fixture)).dispatches).toHaveLength(1);
  });

  it("rejects a durable proof timestamp later than the replay database clock", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await authorizer(eligibleLookup(leased.fixture, []))(db, authorizationInput(leased), ENABLED_ENV);
    await db.refundExecutionProviderEligibilityProof.updateMany({
      where: { binding: { refundAttemptId: leased.fixture.refundAttemptId } },
      data: { localReceivedAt: new Date("2999-01-01T00:00:00.000Z") },
    });
    const calls: string[] = [];
    const replay = await authorizer(eligibleLookup(leased.fixture, calls))(
      db, authorizationInput(leased), ENABLED_ENV,
    );
    expect(failureCode(replay)).toBe("REFUND_LEDGER_INCONSISTENT");
    expect(calls).toHaveLength(0);
  });

  it("authorization gates block replay while disabled lookup blocks only fresh calls", async () => {
    const fresh = await trackedLeasedTossFixture(fixtures);
    const calls: string[] = [];
    const disabledLookup = await authorizer(eligibleLookup(fresh.fixture, calls))(
      db,
      authorizationInput(fresh),
      { ...ENABLED_ENV, [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "" },
    );
    expect(failureCode(disabledLookup)).toBe("FEATURE_DISABLED");
    expect(calls).toHaveLength(0);

    const replay = await trackedLeasedTossFixture(fixtures);
    await authorizer(eligibleLookup(replay.fixture, []))(db, authorizationInput(replay), ENABLED_ENV);
    const authDisabled = await authorizer(eligibleLookup(replay.fixture, calls))(
      db,
      authorizationInput(replay),
      { ...ENABLED_ENV, [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "" },
    );
    expect(failureCode(authDisabled)).toBe("FEATURE_DISABLED");
    const genericDisabled = await authorizer(eligibleLookup(replay.fixture, calls))(
      db,
      authorizationInput(replay),
      { ...ENABLED_ENV, [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "" },
    );
    expect(failureCode(genericDisabled)).toBe("FEATURE_DISABLED");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["ineligible", "TOSS_PAYMENT_NOT_ELIGIBLE"],
    ["rejected", "TOSS_LOOKUP_REJECTED"],
    ["unavailable", "TOSS_LOOKUP_UNAVAILABLE"],
  ] as const)("maps %s lookup to %s with zero authorization writes", async (kind, code) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const lookup: TossRefundLookupPort = kind === "ineligible"
      ? responseLookup({ ...eligibleBody(leased.fixture), status: "CANCELED" })
      : () => Promise.resolve(Object.freeze({ kind }));
    const result = await authorizer(lookup)(db, authorizationInput(leased), ENABLED_ENV);
    expect(failureCode(result)).toBe(code);
    expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
  });

  it("fails stale token and generation before lookup with zero writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const calls: string[] = [];
    const authorize = authorizer(eligibleLookup(leased.fixture, calls));
    const wrongToken = await authorize(db, {
      ...authorizationInput(leased), leaseToken: "f".repeat(64),
    }, ENABLED_ENV);
    const wrongGeneration = await authorize(db, {
      ...authorizationInput(leased), leaseGeneration: leased.lease.leaseGeneration + 1,
    }, ENABLED_ENV);
    expect(failureCode(wrongToken)).toBe("LEASE_FENCE_MISMATCH");
    expect(failureCode(wrongGeneration)).toBe("LEASE_FENCE_MISMATCH");
    expect(calls).toHaveLength(0);
    expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
  });

  it("fails an expired lease before lookup with zero writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    });
    const calls: string[] = [];
    const result = await authorizer(eligibleLookup(leased.fixture, calls))(
      db, authorizationInput(leased), ENABLED_ENV,
    );
    expect(failureCode(result)).toBe("LEASE_EXPIRED");
    expect(calls).toHaveLength(0);
    expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
  });

  it("fails credential-label drift between lookup and Phase 4 with zero writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const env = { ...ENABLED_ENV };
    const lookup: TossRefundLookupPort = () => {
      env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-2";
      return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(leased.fixture)) });
    };
    const result = await authorizer(lookup)(db, authorizationInput(leased), env);
    expect(failureCode(result)).toBe("CREDENTIAL_BINDING_MISMATCH");
    expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
  });

  it.each([
    ["amount", "REFUND_LEDGER_INCONSISTENT"],
    ["currency", "REFUND_LEDGER_INCONSISTENT"],
    ["payment key", "TOSS_PAYMENT_NOT_ELIGIBLE"],
  ] as const)("fails %s drift after lookup with zero writes", async (kind, expected) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const lookup: TossRefundLookupPort = async () => {
      if (kind === "amount") {
        await db.payment.update({ where: { id: leased.fixture.paymentId }, data: { amount: 84_999 } });
      } else if (kind === "currency") {
        await db.refundAttempt.update({
          where: { id: leased.fixture.refundAttemptId }, data: { currency: "USD" },
        });
      } else {
        await db.payment.update({
          where: { id: leased.fixture.paymentId }, data: { providerPaymentKey: "different_payment_key" },
        });
      }
      return { kind: "response", body: JSON.stringify(eligibleBody(leased.fixture)) };
    };
    const result = await authorizer(lookup)(db, authorizationInput(leased), ENABLED_ENV);
    expect(failureCode(result)).toBe(expected);
    expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
  });

  it("requires recovery after contact and does not issue another lookup", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await authorizer(eligibleLookup(leased.fixture, []))(db, authorizationInput(leased), ENABLED_ENV);
    await markDispatchContactForTest(leased.fixture);
    const calls: string[] = [];
    const result = await authorizer(eligibleLookup(leased.fixture, calls))(
      db, authorizationInput(leased), ENABLED_ENV,
    );
    expect(failureCode(result)).toBe("CONTACT_RECOVERY_REQUIRED");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["binding", true, false, false],
    ["binding plus proof", true, true, false],
    ["dispatch", false, false, true],
    ["binding plus dispatch", true, false, true],
  ] as const)("rejects the partial %s artifact combination", async (_label, binding, proof, dispatch) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const createdBinding = binding ? await createPartialBinding(leased.fixture) : null;
    if (proof && createdBinding) await createPartialProof(createdBinding.id, leased.fixture);
    if (dispatch) await createPartialDispatch(leased);
    const result = await authorizer(eligibleLookup(leased.fixture, []))(
      db, authorizationInput(leased), ENABLED_ENV,
    );
    expect(failureCode(result)).toBe("REFUND_LEDGER_INCONSISTENT");
  });

  it.each([
    ["RefundExecutionProviderEligibilityProof", "paymentKey"],
    ["RefundExecutionDispatchAttempt", "commandId"],
    ["RefundExecutionCommand", "dispatchAttempt"],
  ] as const)("rolls back the complete transaction when %s persistence fails", async (table, column) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const constraint = `e3b1lb_fault_${crypto.randomUUID().replaceAll("-", "")}`;
    const predicate = faultPredicate(table, column, leased.fixture);
    await addScopedCheck(table, constraint, predicate);
    try {
      const result = await authorizer(eligibleLookup(leased.fixture, []))(
        db, authorizationInput(leased), ENABLED_ENV,
      );
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      expect(await authorizationWriteCounts(leased.fixture)).toEqual([0, 0, 0, 0]);
    } finally {
      await dropCheck(table, constraint);
    }
  });

  it("bounds a unique-conflict recovery to one locked reread and no second lookup", async () => {
    const target = await trackedLeasedTossFixture(fixtures);
    const blocker = await trackedLeasedTossFixture(fixtures);
    await db.refundExecutionProviderOperationBinding.create({
      data: {
        refundAttemptId: blocker.fixture.refundAttemptId,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        providerOperationFamilyKey: deriveTossRefundOperationKey(target.fixture.operationKey),
        operationFamilyKeyAlgorithmVersion: TOSS_REFUND_OPERATION_KEY_VERSION,
        wireContractVersion: TOSS_REFUND_WIRE_VERSION,
        operationFamilyFingerprint: "d".repeat(64),
        merchantAccountBindingId: "merchant-test",
        credentialGenerationBindingId: "generation-1",
      },
    });
    const calls: string[] = [];
    const result = await authorizer(eligibleLookup(target.fixture, calls))(
      db, authorizationInput(target), ENABLED_ENV,
    );
    expect(failureCode(result)).toBe("DISPATCH_AUTHORIZATION_CONFLICT");
    expect(calls).toHaveLength(1);
    expect(await authorizationWriteCounts(target.fixture)).toEqual([0, 0, 0, 0]);
  });

  it("serializes two identical observed-lock contenders into one fresh commit and one replay", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e3b1lb_first");
    const secondSession = createNamedDbSession("e3b1lb_second");
    const lookup = pairedLookup([
      eligibleBody(leased.fixture),
      { ...eligibleBody(leased.fixture), ignoredObservation: "different" },
    ]);
    const authorize = authorizer(lookup.port);
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorize(firstSession.client, authorizationInput(leased), ENABLED_ENV),
        secondSession,
        () => authorize(secondSession.client, authorizationInput(leased), ENABLED_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(lookup.calls()).toBe(2);
      expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
      expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
      expect(await authorizationWriteCounts(leased.fixture)).toEqual([1, 1, 1, 1]);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("discards a differing transient eligible observation after a durable winner commits", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e3b1lb_different_first");
    const secondSession = createNamedDbSession("e3b1lb_different_second");
    let calls = 0;
    let markBothLookupsEntered: (() => void) | undefined;
    const bothLookupsEntered = new Promise<void>((resolve) => {
      markBothLookupsEntered = resolve;
    });
    let releaseSecond: (() => void) | undefined;
    const secondMayReturn = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const lookup: TossRefundLookupPort = async () => {
      const index = calls;
      calls += 1;
      if (calls === 2) markBothLookupsEntered?.();
      await bothLookupsEntered;
      if (index === 0) {
        return { kind: "response", body: JSON.stringify(eligibleBody(leased.fixture)) };
      }
      if (index !== 1) throw new Error("Unexpected extra Toss lookup invocation.");
      await secondMayReturn;
      return {
        kind: "response",
        body: JSON.stringify({ ...eligibleBody(leased.fixture), totalAmount: 84_999 }),
      };
    };
    const authorize = authorizer(lookup);
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorize(firstSession.client, authorizationInput(leased), ENABLED_ENV),
        secondSession,
        () => authorize(secondSession.client, authorizationInput(leased), ENABLED_ENV),
      );
      await bothLookupsEntered;
      expect(calls).toBe(2);
      const first = await queued.first;
      expect(first.ok && !first.replayed).toBe(true);
      releaseSecond?.();
      const second = await queued.second;
      expect(second.ok && second.replayed).toBe(true);
      expect(calls).toBe(2);
      const state = await durableState(leased.fixture);
      expect([
        state.bindings.length,
        state.proofs.length,
        state.dispatches.length,
        state.command.dispatchAttempt,
      ]).toEqual([1, 1, 1, 1]);
      expect(state.proofs[0].totalAmount).toBe(leased.fixture.totalAmount);
    } finally {
      markBothLookupsEntered?.();
      releaseSecond?.();
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("lets one eligible contender commit while an ineligible contender writes nothing", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e3b1lb_ineligible");
    const secondSession = createNamedDbSession("e3b1lb_eligible");
    const lookup = pairedLookup([
      { ...eligibleBody(leased.fixture), status: "CANCELED" },
      eligibleBody(leased.fixture),
    ]);
    const authorize = authorizer(lookup.port);
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorize(firstSession.client, authorizationInput(leased), ENABLED_ENV),
        secondSession,
        () => authorize(secondSession.client, authorizationInput(leased), ENABLED_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.some((result) => failureCode(result) === "TOSS_PAYMENT_NOT_ELIGIBLE")).toBe(true);
      expect(results.some((result) => result.ok)).toBe(true);
      expect(await authorizationWriteCounts(leased.fixture)).toEqual([1, 1, 1, 1]);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("lets one eligible contender commit while an unavailable contender writes nothing", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e3b1lb_unavailable");
    const secondSession = createNamedDbSession("e3b1lb_available");
    let calls = 0;
    const lookup: TossRefundLookupPort = () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve({ kind: "unavailable" })
        : Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(leased.fixture)) });
    };
    const authorize = authorizer(lookup);
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorize(firstSession.client, authorizationInput(leased), ENABLED_ENV),
        secondSession,
        () => authorize(secondSession.client, authorizationInput(leased), ENABLED_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.some((result) => failureCode(result) === "TOSS_LOOKUP_UNAVAILABLE")).toBe(true);
      expect(results.some((result) => result.ok)).toBe(true);
      expect(await authorizationWriteCounts(leased.fixture)).toEqual([1, 1, 1, 1]);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("fails closed when concurrent contenders use different credential labels", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e3b1lb_credential_first");
    const secondSession = createNamedDbSession("e3b1lb_credential_second");
    const lookup = pairedLookup([eligibleBody(leased.fixture), eligibleBody(leased.fixture)]);
    const authorize = authorizer(lookup.port);
    const secondEnv = {
      ...ENABLED_ENV,
      TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-2",
    };
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorize(firstSession.client, authorizationInput(leased), ENABLED_ENV),
        secondSession,
        () => authorize(secondSession.client, authorizationInput(leased), secondEnv),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.some((result) => failureCode(result) === "CREDENTIAL_BINDING_MISMATCH")).toBe(true);
      expect(await authorizationWriteCounts(leased.fixture)).toEqual([1, 1, 1, 1]);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });
});

function authorizer(lookup: TossRefundLookupPort) {
  const dependencies: TossRefundAuthorizerDependencies = { lookup };
  return createTossRefundExecutionAuthorizer(dependencies);
}

async function trackedLeasedTossFixture(fixtures: DispatchFixture[]): Promise<LeasedTossFixture> {
  const fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
  fixtures.push(fixture);
  const result = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e3b1lb-test-worker",
  }, LEASE_ENV);
  if (!result.ok) throw new Error(`Expected lease success: ${result.code}`);
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
  return { fixture, lease: result.lease };
}

function authorizationInput(leased: LeasedTossFixture) {
  return {
    commandId: leased.fixture.commandId,
    leaseGeneration: leased.lease.leaseGeneration,
    leaseToken: leased.lease.leaseToken,
  };
}

function eligibleLookup(fixture: DispatchFixture, calls: string[]): TossRefundLookupPort {
  return (paymentKey) => {
    calls.push(paymentKey);
    return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(fixture)) });
  };
}

function responseLookup(body: unknown): TossRefundLookupPort {
  return () => Promise.resolve({ kind: "response", body: JSON.stringify(body) });
}

function eligibleBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    method: "카드",
    easyPay: null,
    currency: "KRW",
    status: "DONE",
    totalAmount: fixture.totalAmount,
    balanceAmount: fixture.targetAmount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
  };
}

async function durableState(fixture: DispatchFixture) {
  const [command, bindings, proofs, dispatches] = await Promise.all([
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    db.refundExecutionProviderOperationBinding.findMany({ where: { refundAttemptId: fixture.refundAttemptId } }),
    db.refundExecutionProviderEligibilityProof.findMany({
      where: { binding: { refundAttemptId: fixture.refundAttemptId } },
    }),
    db.refundExecutionDispatchAttempt.findMany({ where: { commandId: fixture.commandId } }),
  ]);
  return { command, bindings, proofs, dispatches };
}

async function authorizationWriteCounts(fixture: DispatchFixture): Promise<number[]> {
  const state = await durableState(fixture);
  return [state.bindings.length, state.proofs.length, state.dispatches.length, state.command.dispatchAttempt];
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (rows.length !== 1) throw new Error("Unable to observe test database time.");
  return rows[0].capturedAt;
}

function failureCode(result: Awaited<ReturnType<ReturnType<typeof authorizer>>>): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

function pairedLookup(bodies: readonly [unknown, unknown]) {
  let callCount = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const port: TossRefundLookupPort = async () => {
    const index = callCount;
    callCount += 1;
    if (callCount === 2) release?.();
    await ready;
    return { kind: "response", body: JSON.stringify(bodies[index]) };
  };
  return { port, calls: () => callCount };
}

function faultPredicate(table: string, column: string, fixture: DispatchFixture): string {
  const safeCommand = safeSqlId(fixture.commandId);
  const safePaymentKey = safeSqlId(fixture.providerPaymentKey);
  if (table === "RefundExecutionProviderEligibilityProof") {
    return `"${column}" <> '${safePaymentKey}'`;
  }
  if (table === "RefundExecutionDispatchAttempt") return `"${column}" <> '${safeCommand}'`;
  return `"id" <> '${safeCommand}' OR "${column}" <> 1`;
}

function safeSqlId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Fixture id is not SQL-safe.");
  return value;
}

async function addScopedCheck(table: string, constraint: string, predicate: string): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${predicate})`);
}

async function dropCheck(table: string, constraint: string): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
}

function createPartialBinding(fixture: DispatchFixture) {
  return db.refundExecutionProviderOperationBinding.create({
    data: {
      refundAttemptId: fixture.refundAttemptId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: deriveTossRefundOperationKey(fixture.operationKey),
      operationFamilyKeyAlgorithmVersion: TOSS_REFUND_OPERATION_KEY_VERSION,
      wireContractVersion: TOSS_REFUND_WIRE_VERSION,
      operationFamilyFingerprint: "a".repeat(64),
      merchantAccountBindingId: "merchant-test",
      credentialGenerationBindingId: "generation-1",
    },
  });
}

function createPartialProof(bindingId: string, fixture: DispatchFixture) {
  return db.refundExecutionProviderEligibilityProof.create({
    data: {
      bindingId,
      paymentKey: fixture.providerPaymentKey,
      method: "카드",
      easyPayPresent: false,
      currency: "KRW",
      providerStatus: "DONE",
      totalAmount: fixture.totalAmount,
      balanceAmount: fixture.targetAmount,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancelsCount: 0,
      localReceivedAt: new Date(),
      eligibilityFingerprint: "b".repeat(64),
    },
  });
}

function createPartialDispatch(leased: LeasedTossFixture) {
  return db.refundExecutionDispatchAttempt.create({
    data: {
      commandId: leased.fixture.commandId,
      ordinal: 1,
      leaseGeneration: leased.lease.leaseGeneration,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: deriveTossRefundOperationKey(leased.fixture.operationKey),
      requestFingerprint: "c".repeat(64),
      state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      authorizedAt: new Date(),
    },
  });
}
