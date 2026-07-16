import { isDeepStrictEqual } from "util";
import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acquireRefundExecutionLease,
  type AcquireRefundExecutionLeaseResult,
  type RefundExecutionLeaseHandle,
} from "../acquire-lease";
import {
  authorizeRefundExecutionDispatch,
} from "../dispatch-authorization";
import type {
  AuthorizeRefundExecutionDispatchResult,
  RefundDispatchAuthorizationHandle,
} from "../dispatch-authorization-contract";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
} from "../execution-activation";
import { fingerprintRefundRequest } from "../refund-request-fingerprint";
import {
  releaseRefundExecutionLease,
} from "../release-lease";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  redactedDispatchAuthorizationState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const AUTHORIZATION_ENV = {
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
};
const RELEASE_ENV = { [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "ENABLED" };
const WRONG_TOKEN = "f".repeat(64);

interface LeasedFixture {
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
}

describe("authorizeRefundExecutionDispatch", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns FEATURE_DISABLED and CONFIG_INVALID with zero writes", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const disabled = await authorizeRefundExecutionDispatch(db, authorizationInput(leased), {});
    const invalid = await authorizeRefundExecutionDispatch(db, authorizationInput(leased), {
      [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "unexpected-secret-value",
    });

    expect(failureCode(disabled)).toBe("FEATURE_DISABLED");
    expect(failureCode(invalid)).toBe("CONFIG_INVALID");
    if (invalid.ok) throw new Error("Expected invalid configuration failure.");
    expect(invalid.message.includes("unexpected-secret-value")).toBe(false);
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it("returns COMMAND_NOT_FOUND_OR_INELIGIBLE for an absent command", async () => {
    const result = await authorizeRefundExecutionDispatch(db, {
      commandId: "missing-e3a-command",
      leaseGeneration: 1,
      leaseToken: "a".repeat(64),
    }, AUTHORIZATION_ENV);

    expect(failureCode(result)).toBe("COMMAND_NOT_FOUND_OR_INELIGIBLE");
  });

  it("authorizes the exact first MOCK/SANDBOX request atomically", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await redactedDispatchAuthorizationState(leased.fixture);
    const beforeTime = await databaseTime();

    const result = authorizationSuccess(await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    ));

    const afterTime = await databaseTime();
    const after = await redactedDispatchAuthorizationState(leased.fixture);
    const row = await db.refundExecutionDispatchAttempt.findFirstOrThrow({
      where: { commandId: leased.fixture.commandId },
    });
    const expectedFingerprint = fingerprintRefundRequest({
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      providerPaymentReference: leased.fixture.providerPaymentKey,
      amountMinor: leased.fixture.targetAmount,
      currency: "KRW",
      providerOperationKey: leased.fixture.operationKey,
    });

    expect(result.replayed).toBe(false);
    expect(result.authorization.dispatchAttempt).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.authorization)).toBe(true);
    expect(hasExpectedHandleIdentity(result.authorization, leased.fixture)).toBe(true);
    expect(row.providerOperationKey === leased.fixture.operationKey).toBe(true);
    expect(row.requestFingerprint === expectedFingerprint).toBe(true);
    expect(result.authorization.requestFingerprint === expectedFingerprint).toBe(true);
    expect(result.authorization.authorizedAt === row.authorizedAt.toISOString()).toBe(true);
    expect(row.authorizedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(row.authorizedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    expect(after.commandStatus).toBe(RefundExecutionCommandStatus.LEASED);
    expect(after.commandDispatchAttempt).toBe(1);
    expect(after.dispatchAttemptCount).toBe(1);
    expect(after.dispatchStates[0]).toBe(RefundExecutionDispatchAttemptState.AUTHORIZED);
    expect(after.dispatchContactMarked[0]).toBe(false);
    expect(after.commandEventCount).toBe(before.commandEventCount);
    expect(after.evidenceCount).toBe(0);
    expect(unchangedDomainProjection(after, before)).toBe(true);
  });

  it("replays the exact authorization with the original immutable facts and zero writes", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const first = authorizationSuccess(await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    ));
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const replay = authorizationSuccess(await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    ));

    expect(replay.replayed).toBe(true);
    expect(sameAuthorizationFacts(replay.authorization, first.authorization)).toBe(true);
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it.each([
    {
      label: "wrong generation",
      expected: "LEASE_FENCE_MISMATCH",
      input: (leased: LeasedFixture) => ({
        ...authorizationInput(leased),
        leaseGeneration: leased.lease.leaseGeneration + 1,
      }),
    },
    {
      label: "wrong token",
      expected: "LEASE_FENCE_MISMATCH",
      input: (leased: LeasedFixture) => ({ ...authorizationInput(leased), leaseToken: WRONG_TOKEN }),
    },
  ])("returns $expected with zero writes for $label", async ({ expected, input }) => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(db, input(leased), AUTHORIZATION_ENV);

    expect(failureCode(result)).toBe(expected);
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it("rejects an exact expired lease without exposing a replay handle", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    });
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    );

    expect(failureCode(result)).toBe("LEASE_EXPIRED");
    expect(Object.keys(result).includes("authorization")).toBe(false);
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it.each([
    {
      label: "TOSS SANDBOX",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    },
    {
      label: "MOCK LIVE",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.LIVE,
    },
  ])("returns NOT_AUTHORIZATION_READY for coherent $label binding", async ({ provider, mode }) => {
    const leased = await trackedLeasedFixture(fixtures);
    await setProviderBinding(leased.fixture, provider, mode);
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    );

    expect(failureCode(result)).toBe("NOT_AUTHORIZATION_READY");
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it.each([
    {
      label: "aggregate corruption",
      mutate: (leased: LeasedFixture) => db.order.update({
        where: { id: leased.fixture.orderId },
        data: { status: OrderStatus.CANCELLED },
      }),
    },
    {
      label: "missing current acquisition event",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommandEvent.deleteMany({
        where: { commandId: leased.fixture.commandId },
      }),
    },
    {
      label: "malformed current acquisition event",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommandEvent.updateMany({
        where: { commandId: leased.fixture.commandId },
        data: { dispatchAttempt: 1 },
      }),
    },
    {
      label: "current release contradiction",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommandEvent.create({
        data: {
          commandId: leased.fixture.commandId,
          eventType: RefundExecutionCommandEventType.PRE_CONTACT_RELEASED,
          leaseGeneration: leased.lease.leaseGeneration,
          dispatchAttempt: 0,
          occurredAt: new Date(),
        },
      }),
    },
    {
      label: "execution evidence",
      mutate: (leased: LeasedFixture) => db.refundExecutionEvidence.create({
        data: {
          commandId: leased.fixture.commandId,
          source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
          sourceDedupKey: `e3a-evidence-${crypto.randomUUID()}`,
          outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
          application: RefundExecutionEvidenceApplication.PARKED,
          observedAt: new Date(),
        },
      }),
    },
    {
      label: "provider refund identity",
      mutate: (leased: LeasedFixture) => db.refundAttempt.update({
        where: { id: leased.fixture.refundAttemptId },
        data: { providerRefundId: `e3a-observed-${crypto.randomUUID()}` },
      }),
    },
    {
      label: "command projection without row",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommand.update({
        where: { id: leased.fixture.commandId },
        data: { dispatchAttempt: 1 },
      }),
    },
    {
      label: "row without command projection",
      mutate: (leased: LeasedFixture) => db.refundExecutionDispatchAttempt.create({
        data: dispatchRowData(leased),
      }),
    },
    {
      label: "operation-key mismatch",
      mutate: (leased: LeasedFixture) => db.refundAttempt.update({
        where: { id: leased.fixture.refundAttemptId },
        data: { idempotencyKey: `mismatched-${crypto.randomUUID()}` },
      }),
    },
  ])("returns LEDGER_INCONSISTENT with zero writes for $label", async ({ mutate }) => {
    const leased = await trackedLeasedFixture(fixtures);
    await mutate(leased);
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    );

    expect(failureCode(result)).toBe("LEDGER_INCONSISTENT");
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it("rejects a persisted fingerprint mismatch on replay with zero writes", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await authorizeRefundExecutionDispatch(db, authorizationInput(leased), AUTHORIZATION_ENV);
    await db.refundExecutionDispatchAttempt.update({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
      data: { requestFingerprint: "c".repeat(64) },
    });
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    );

    expect(failureCode(result)).toBe("LEDGER_INCONSISTENT");
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it("requires contact recovery for a contacted ordinal-one row", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const first = authorizationSuccess(await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    ));
    await db.refundExecutionDispatchAttempt.update({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
      data: {
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        contactMarkedAt: new Date(first.authorization.authorizedAt),
      },
    });
    const before = await redactedDispatchAuthorizationState(leased.fixture);

    const result = await authorizeRefundExecutionDispatch(
      db,
      authorizationInput(leased),
      AUTHORIZATION_ENV,
    );

    expect(failureCode(result)).toBe("CONTACT_RECOVERY_REQUIRED");
    await expectRedactedStateUnchanged(leased.fixture, before);
  });

  it("rolls back command state when dispatch-row insertion fails", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const constraint = "e3a_test_dispatch_insert_conflict";
    await addScopedCheck(
      "RefundExecutionDispatchAttempt",
      constraint,
      `"commandId" <> '${safeSqlId(leased.fixture.commandId)}'`,
    );
    const before = await redactedDispatchAuthorizationState(leased.fixture);
    try {
      const result = await authorizeRefundExecutionDispatch(
        db,
        authorizationInput(leased),
        AUTHORIZATION_ENV,
      );

      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      await expectRedactedStateUnchanged(leased.fixture, before);
    } finally {
      await dropCheck("RefundExecutionDispatchAttempt", constraint);
    }
  });

  it("rolls back the inserted dispatch row when command CAS persistence loses", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const constraint = "e3a_test_command_cas_conflict";
    await addScopedCheck(
      "RefundExecutionCommand",
      constraint,
      `"id" <> '${safeSqlId(leased.fixture.commandId)}' OR "dispatchAttempt" <> 1`,
    );
    const before = await redactedDispatchAuthorizationState(leased.fixture);
    try {
      const result = await authorizeRefundExecutionDispatch(
        db,
        authorizationInput(leased),
        AUTHORIZATION_ENV,
      );

      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      await expectRedactedStateUnchanged(leased.fixture, before);
    } finally {
      await dropCheck("RefundExecutionCommand", constraint);
    }
  });

  it("serializes two authorizers into one allocation and one exact replay", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const firstSession = createNamedDbSession("e3a_authorize_first");
    const secondSession = createNamedDbSession("e3a_authorize_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => authorizeRefundExecutionDispatch(
          firstSession.client,
          authorizationInput(leased),
          AUTHORIZATION_ENV,
        ),
        secondSession,
        () => authorizeRefundExecutionDispatch(
          secondSession.client,
          authorizationInput(leased),
          AUTHORIZATION_ENV,
        ),
      );
      const results = await Promise.all([queued.first, queued.second]);
      const successes = results.filter((result) => result.ok);
      const newCount = successes.filter((result) => !result.replayed).length;
      const replayCount = successes.filter((result) => result.replayed).length;
      expect(successes.length).toBe(2);
      expect(newCount).toBe(1);
      expect(replayCount).toBe(1);
      if (!successes[0]?.ok || !successes[1]?.ok) throw new Error("Expected two successes.");
      expect(sameAuthorizationFacts(
        successes[0].authorization,
        successes[1].authorization,
      )).toBe(true);
      const state = await redactedDispatchAuthorizationState(leased.fixture);
      expect(state.commandDispatchAttempt).toBe(1);
      expect(state.dispatchAttemptCount).toBe(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes authorization before release into authorization plus NOT_PRE_CONTACT", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const authorizationSession = createNamedDbSession("e3a_authorize_then_release_authorize");
    const releaseSession = createNamedDbSession("e3a_authorize_then_release_release");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        authorizationSession,
        () => authorizeRefundExecutionDispatch(
          authorizationSession.client,
          authorizationInput(leased),
          AUTHORIZATION_ENV,
        ),
        releaseSession,
        () => releaseRefundExecutionLease(releaseSession.client, authorizationInput(leased), RELEASE_ENV),
      );
      const [authorization, release] = await Promise.all([queued.first, queued.second]);
      expect(authorization.ok).toBe(true);
      expect(release.ok ? "unexpected" : release.code).toBe("NOT_PRE_CONTACT");
      const state = await redactedDispatchAuthorizationState(leased.fixture);
      expect(state.commandStatus).toBe(RefundExecutionCommandStatus.LEASED);
      expect(state.commandDispatchAttempt).toBe(1);
      expect(state.dispatchAttemptCount).toBe(1);
    } finally {
      await disconnectSessions(authorizationSession, releaseSession);
    }
  });

  it("serializes release before authorization into READY plus fence mismatch", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const releaseSession = createNamedDbSession("e3a_release_then_authorize_release");
    const authorizationSession = createNamedDbSession("e3a_release_then_authorize_authorize");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        releaseSession,
        () => releaseRefundExecutionLease(releaseSession.client, authorizationInput(leased), RELEASE_ENV),
        authorizationSession,
        () => authorizeRefundExecutionDispatch(
          authorizationSession.client,
          authorizationInput(leased),
          AUTHORIZATION_ENV,
        ),
      );
      const [release, authorization] = await Promise.all([queued.first, queued.second]);
      expect(release.ok).toBe(true);
      expect(failureCode(authorization)).toBe("LEASE_FENCE_MISMATCH");
      const state = await redactedDispatchAuthorizationState(leased.fixture);
      expect(state.commandStatus).toBe(RefundExecutionCommandStatus.READY);
      expect(state.commandDispatchAttempt).toBe(0);
      expect(state.dispatchAttemptCount).toBe(0);
    } finally {
      await disconnectSessions(releaseSession, authorizationSession);
    }
  });

  it.each([
    {
      label: "expiry mutation",
      expected: "LEASE_EXPIRED",
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    },
    {
      label: "fence mutation",
      expected: "LEASE_FENCE_MISMATCH",
      data: { leaseTokenHash: "e".repeat(64) },
    },
  ])("observes Order-lock serialization against $label", async ({ expected, data }) => {
    const leased = await trackedLeasedFixture(fixtures);
    const mutationSession = createNamedDbSession(`e3a_${expected.toLowerCase()}_mutator`);
    const authorizationSession = createNamedDbSession(`e3a_${expected.toLowerCase()}_authorizer`);
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        mutationSession,
        () => mutateLeaseUnderCanonicalLocks(mutationSession.client, leased.fixture, data),
        authorizationSession,
        () => authorizeRefundExecutionDispatch(
          authorizationSession.client,
          authorizationInput(leased),
          AUTHORIZATION_ENV,
        ),
      );
      const [, authorization] = await Promise.all([queued.first, queued.second]);
      expect(failureCode(authorization)).toBe(expected);
      const state = await redactedDispatchAuthorizationState(leased.fixture);
      expect(state.commandDispatchAttempt).toBe(0);
      expect(state.dispatchAttemptCount).toBe(0);
    } finally {
      await disconnectSessions(mutationSession, authorizationSession);
    }
  });
});

async function trackedLeasedFixture(fixtures: DispatchFixture[]): Promise<LeasedFixture> {
  const fixture = await createDispatchFixture();
  fixtures.push(fixture);
  const result = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e3a-worker",
  }, LEASE_ENV);
  return { fixture, lease: leaseSuccess(result).lease };
}

function leaseSuccess(
  result: AcquireRefundExecutionLeaseResult,
): Extract<AcquireRefundExecutionLeaseResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected lease success, received ${result.code}.`);
  return result;
}

function authorizationSuccess(
  result: AuthorizeRefundExecutionDispatchResult,
): Extract<AuthorizeRefundExecutionDispatchResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected authorization success, received ${result.code}.`);
  return result;
}

function failureCode(result: AuthorizeRefundExecutionDispatchResult): string {
  return result.ok ? "<unexpected-authorization-success>" : result.code;
}

function authorizationInput(leased: LeasedFixture) {
  return {
    commandId: leased.fixture.commandId,
    leaseGeneration: leased.lease.leaseGeneration,
    leaseToken: leased.lease.leaseToken,
  };
}

function hasExpectedHandleIdentity(
  handle: RefundDispatchAuthorizationHandle,
  fixture: DispatchFixture,
): boolean {
  return handle.commandId === fixture.commandId
    && handle.refundAttemptId === fixture.refundAttemptId
    && handle.provider === PaymentProvider.MOCK
    && handle.mode === PaymentMode.SANDBOX
    && handle.providerPaymentReference === fixture.providerPaymentKey
    && handle.amountMinor === fixture.targetAmount
    && handle.currency === "KRW"
    && handle.providerOperationKey === fixture.operationKey
    && /^[0-9a-f]{64}$/.test(handle.requestFingerprint);
}

function sameAuthorizationFacts(
  left: RefundDispatchAuthorizationHandle,
  right: RefundDispatchAuthorizationHandle,
): boolean {
  return [
    Object.keys(left).length === Object.keys(right).length,
    left.commandId === right.commandId,
    left.refundAttemptId === right.refundAttemptId,
    left.dispatchAttempt === right.dispatchAttempt,
    left.leaseGeneration === right.leaseGeneration,
    left.authorizedAt === right.authorizedAt,
    left.provider === right.provider,
    left.mode === right.mode,
    left.providerPaymentReference === right.providerPaymentReference,
    left.amountMinor === right.amountMinor,
    left.currency === right.currency,
    left.providerOperationKey === right.providerOperationKey,
    left.requestFingerprint === right.requestFingerprint,
  ].every(Boolean);
}

function unchangedDomainProjection(
  after: Awaited<ReturnType<typeof redactedDispatchAuthorizationState>>,
  before: Awaited<ReturnType<typeof redactedDispatchAuthorizationState>>,
): boolean {
  return [
    after.orderStatus === before.orderStatus,
    after.orderTotalAmount === before.orderTotalAmount,
    after.orderCurrency === before.orderCurrency,
    after.orderUpdatedAt === before.orderUpdatedAt,
    after.paymentStatus === before.paymentStatus,
    after.paymentAmount === before.paymentAmount,
    after.paymentCurrency === before.paymentCurrency,
    after.paymentProvider === before.paymentProvider,
    after.paymentMode === before.paymentMode,
    after.attemptStatus === before.attemptStatus,
    after.attemptAmount === before.attemptAmount,
    after.attemptCurrency === before.attemptCurrency,
    after.attemptProvider === before.attemptProvider,
    after.attemptMode === before.attemptMode,
    after.providerRefundIdPresent === before.providerRefundIdPresent,
    after.commandStatus === before.commandStatus,
    after.commandLeaseGeneration === before.commandLeaseGeneration,
    after.commandLeaseUntilMs === before.commandLeaseUntilMs,
    after.commandAvailableAtMs === before.commandAvailableAtMs,
    after.commandLeaseOwnerPresent === before.commandLeaseOwnerPresent,
    after.commandTokenHashPresent === before.commandTokenHashPresent,
    after.commandTokenHashFormatValid === before.commandTokenHashFormatValid,
    after.commandSafeErrorCodePresent === before.commandSafeErrorCodePresent,
    after.commandSafeErrorMessagePresent === before.commandSafeErrorMessagePresent,
    after.transitionCount === before.transitionCount,
  ].every(Boolean);
}

async function expectRedactedStateUnchanged(
  fixture: DispatchFixture,
  before: Awaited<ReturnType<typeof redactedDispatchAuthorizationState>>,
): Promise<void> {
  const after = await redactedDispatchAuthorizationState(fixture);
  expect(isDeepStrictEqual(after, before)).toBe(true);
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1) throw new Error("Unable to observe test database time.");
  return rows[0].capturedAt;
}

async function setProviderBinding(
  fixture: DispatchFixture,
  provider: PaymentProvider,
  mode: PaymentMode,
): Promise<void> {
  await db.payment.update({ where: { id: fixture.paymentId }, data: { provider, mode } });
  await db.refundAttempt.update({ where: { id: fixture.refundAttemptId }, data: { provider, mode } });
}

function dispatchRowData(leased: LeasedFixture): Prisma.RefundExecutionDispatchAttemptUncheckedCreateInput {
  return {
    commandId: leased.fixture.commandId,
    ordinal: 1,
    leaseGeneration: leased.lease.leaseGeneration,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerOperationKey: leased.fixture.operationKey,
    requestFingerprint: "d".repeat(64),
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    authorizedAt: new Date(),
  };
}

function safeSqlId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Fixture id is not SQL-safe.");
  return value;
}

async function addScopedCheck(table: string, constraint: string, predicate: string): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${predicate})`,
  );
}

async function dropCheck(table: string, constraint: string): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
}

async function mutateLeaseUnderCanonicalLocks(
  client: PrismaClient,
  fixture: DispatchFixture,
  data: Prisma.RefundExecutionCommandUpdateInput,
): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${fixture.orderId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundAttempt" WHERE "id" = ${fixture.refundAttemptId} FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${fixture.commandId} FOR UPDATE
    `);
    await tx.refundExecutionCommand.update({ where: { id: fixture.commandId }, data });
  });
}
