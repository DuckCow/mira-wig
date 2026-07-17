import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acquireRefundExecutionLease,
  REFUND_EXECUTION_LEASE_DURATION_MS,
  type RefundExecutionLeaseHandle,
} from "../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
} from "../execution-activation";
import { reclaimUncontactedRefundExecution } from "../reclaim-uncontacted-execution";
import { releaseRefundExecutionLease } from "../release-lease";
import { persistFreshRefundExecutionObservation } from "../resolve-execution";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  markDispatchContactForTest,
  type DispatchFixture,
} from "./refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";
import { createTossRefundExecutionAuthorizer } from "../providers/toss/refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../providers/toss/refund-contact-orchestrator";
import type { TossRefundCancellationPort } from "../providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "../providers/toss/refund-lookup-http";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const RELEASE_ENV = { [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "ENABLED" };
const RECLAIM_ENV = { [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED" };
const CREDENTIAL_ENV = {
  TOSS_SANDBOX_SECRET_KEY: "synthetic_uncontacted_recovery_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};
const AUTH_ENV = {
  ...CREDENTIAL_ENV,
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
};
const CONTACT_ENV = {
  ...CREDENTIAL_ENV,
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};
const OBSERVATION_ENV = {
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};
const RECOVERY_OWNER = "e2b2a-recovery-worker";
const EXPIRED_AT = new Date("2000-01-01T00:00:00.000Z");
const POSTGRES_INT_MAX = 2_147_483_647;

type LeasedFixture = Readonly<{
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
}>;

describe("reclaimUncontactedRefundExecution integration", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Uncontacted recovery integration tests require wig_platform_test.");
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

  it("classifies READY U0 without consulting the recovery gate or writing", async () => {
    const fixture = await trackedFixture(fixtures);
    await makeToss(fixture);
    const before = await redactedState(fixture);

    const result = await reclaimUncontactedRefundExecution(db, reclaimInput(fixture), {
      [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "malformed-secret-value",
    });

    expect(failureCode(result)).toBe("COMMAND_NOT_FOUND_OR_INELIGIBLE");
    expect(isDeepStrictEqual(await redactedState(fixture), before)).toBe(true);
  });

  it("classifies active U1 before the gate and writes nothing", async () => {
    const leased = await trackedLeasedTossFixture(fixtures, false);
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(db, reclaimInput(leased.fixture), {});

    expect(failureCode(result)).toBe("LEASE_NOT_EXPIRED");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("applies the gate only to coherent expired U1", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const before = await redactedState(leased.fixture);

    const disabled = await reclaimUncontactedRefundExecution(db, reclaimInput(leased.fixture), {});
    const invalid = await reclaimUncontactedRefundExecution(db, reclaimInput(leased.fixture), {
      [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "malformed-secret-value",
    });

    expect(failureCode(disabled)).toBe("FEATURE_DISABLED");
    expect(failureCode(invalid)).toBe("CONFIG_INVALID");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("takes over coherent expired U1 directly with a five-minute DB-time fence and event", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const oldCommand = await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: leased.fixture.commandId },
    });
    const beforeDbTime = await databaseTime();

    const result = await reclaimUncontactedRefundExecution(
      db,
      { commandId: `  ${leased.fixture.commandId}  `, recoveryOwner: `  ${RECOVERY_OWNER}  ` },
      RECLAIM_ENV,
    );

    const afterDbTime = await databaseTime();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected reclaim success: ${result.code}`);
    const state = await dispatchState(leased.fixture);
    const capturedAt = result.lease.leaseUntil.getTime() - REFUND_EXECUTION_LEASE_DURATION_MS;
    const digestMatches = state.command.leaseTokenHash === createHash("sha256")
      .update(result.lease.leaseToken, "utf8")
      .digest("hex");
    const tokenChanged = result.lease.leaseToken !== leased.lease.leaseToken;
    const digestChanged = state.command.leaseTokenHash !== oldCommand.leaseTokenHash;
    const ownerMatches = state.command.leaseOwner === RECOVERY_OWNER;
    const latestEvent = state.commandEvents.find((event) => (
      event.leaseGeneration === result.lease.leaseGeneration
    ));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lease)).toBe(true);
    expect(Object.keys(result.lease).sort()).toEqual([
      "commandId", "leaseGeneration", "leaseToken", "leaseUntil", "orderId", "refundAttemptId",
    ]);
    expect(REFUND_EXECUTION_LEASE_DURATION_MS).toBe(300_000);
    expect(capturedAt).toBeGreaterThanOrEqual(beforeDbTime.getTime());
    expect(capturedAt).toBeLessThanOrEqual(afterDbTime.getTime());
    expect(result.lease.leaseGeneration).toBe(leased.lease.leaseGeneration + 1);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.LEASED);
    expect(state.command.dispatchAttempt).toBe(0);
    expect(state.command.leaseUntil?.getTime()).toBe(result.lease.leaseUntil.getTime());
    expect(ownerMatches).toBe(true);
    expect(tokenChanged).toBe(true);
    expect(digestChanged).toBe(true);
    expect(digestMatches).toBe(true);
    expect(latestEvent?.eventType).toBe(RefundExecutionCommandEventType.LEASE_ACQUIRED);
    expect(latestEvent?.dispatchAttempt).toBe(0);
    expect(latestEvent?.occurredAt.getTime()).toBe(capturedAt);
    expect(state.commandEvents.filter((event) => (
      event.leaseGeneration === result.lease.leaseGeneration
        && event.eventType === RefundExecutionCommandEventType.PRE_CONTACT_RELEASED
    )).length).toBe(0);
    expect(state.evidence.length).toBe(0);
  });

  it("treats expiry equality as expired", async () => {
    const leased = await trackedLeasedTossFixture(fixtures, false);
    const equalityTime = await databaseTime();
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseUntil: equalityTime },
    });

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(result.ok).toBe(true);
  });

  it("accepts coherent earlier release and reacquisition history", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const released = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);
    expect(released.ok).toBe(true);
    const reacquired = await acquireRefundExecutionLease(db, {
      commandId: leased.fixture.commandId,
      leaseOwner: "e2b2a-second-ordinary-worker",
    }, LEASE_ENV);
    expect(reacquired.ok).toBe(true);
    if (!reacquired.ok) throw new Error(`Expected reacquisition success: ${reacquired.code}`);
    await expire(leased.fixture);

    const reclaimed = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(reclaimed.ok).toBe(true);
    if (!reclaimed.ok) throw new Error(`Expected reclaim success: ${reclaimed.code}`);
    expect(reclaimed.lease.leaseGeneration).toBe(reacquired.lease.leaseGeneration + 1);
    const state = await redactedState(leased.fixture);
    expect(state.acquisitionCount).toBe(3);
    expect(state.releaseCount).toBe(1);
  });

  it("fails closed before mutation at generation overflow", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseGeneration: POSTGRES_INT_MAX },
    });
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("LEDGER_INCONSISTENT");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it.each([
    {
      label: "missing current acquisition event",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommandEvent.deleteMany({
        where: {
          commandId: leased.fixture.commandId,
          leaseGeneration: leased.lease.leaseGeneration,
          eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED,
        },
      }),
    },
    {
      label: "lease generation mismatch",
      mutate: (leased: LeasedFixture) => db.refundExecutionCommand.update({
        where: { id: leased.fixture.commandId },
        data: { leaseGeneration: leased.lease.leaseGeneration + 1 },
      }),
    },
    {
      label: "partial terminal projection",
      mutate: (leased: LeasedFixture) => db.refundAttempt.update({
        where: { id: leased.fixture.refundAttemptId },
        data: { status: RefundAttemptStatus.MANUAL_REVIEW },
      }),
    },
  ])("classifies U3 $label without writes", async ({ mutate }) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await mutate(leased);
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("LEDGER_INCONSISTENT");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it.each([
    {
      commandStatus: RefundExecutionCommandStatus.PARKED,
      attemptStatus: RefundAttemptStatus.MANUAL_REVIEW,
      withEvidence: true,
    },
    {
      commandStatus: RefundExecutionCommandStatus.WAITING_RETRY,
      attemptStatus: RefundAttemptStatus.PROCESSING,
      withEvidence: false,
    },
  ])("keeps coherent terminal or reserved state ineligible", async ({
    commandStatus,
    attemptStatus,
    withEvidence,
  }) => {
    const leased = await trackedLeasedTossFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { status: commandStatus, leaseOwner: null, leaseUntil: null, leaseTokenHash: null },
    });
    await db.refundAttempt.update({
      where: { id: leased.fixture.refundAttemptId },
      data: { status: attemptStatus },
    });
    if (withEvidence) {
      await db.refundExecutionEvidence.create({
        data: {
          commandId: leased.fixture.commandId,
          source: RefundExecutionEvidenceSource.OPERATOR,
          sourceDedupKey: `e2b2a-terminal-${randomUUID()}`,
          outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
          application: RefundExecutionEvidenceApplication.PARKED,
          observedAt: await databaseTime(),
        },
      });
    }
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("COMMAND_NOT_FOUND_OR_INELIGIBLE");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("defers coherent expired U2 without another lookup, ordinal, generation, or write", async () => {
    const leased = await trackedLeasedTossFixture(fixtures, false);
    let lookupCalls = 0;
    const authorization = await authorizer(leased.fixture, () => { lookupCalls += 1; })(
      db,
      authorityInput(leased.lease, leased.fixture),
      AUTH_ENV,
    );
    expect(authorization.ok).toBe(true);
    await expire(leased.fixture);
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("AUTHORIZED_RECOVERY_UNSUPPORTED");
    expect(lookupCalls).toBe(1);
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("routes contacted truth to E3C authority without mutation", async () => {
    const leased = await trackedLeasedTossFixture(fixtures, false);
    const authorization = await authorizer(leased.fixture)(
      db,
      authorityInput(leased.lease, leased.fixture),
      AUTH_ENV,
    );
    expect(authorization.ok).toBe(true);
    await markDispatchContactForTest(leased.fixture);
    await expire(leased.fixture);
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("CONTACTED_RECOVERY_REQUIRED");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("rejects malformed authorized generation overlap without writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures, false);
    const authorization = await authorizer(leased.fixture)(
      db,
      authorityInput(leased.lease, leased.fixture),
      AUTH_ENV,
    );
    expect(authorization.ok).toBe(true);
    await db.refundExecutionDispatchAttempt.updateMany({
      where: { commandId: leased.fixture.commandId },
      data: { leaseGeneration: leased.lease.leaseGeneration + 1 },
    });
    await expire(leased.fixture);
    const before = await redactedState(leased.fixture);

    const result = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(result)).toBe("LEDGER_INCONSISTENT");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);
  });

  it("rolls back command mutation when LEASE_ACQUIRED insertion fails", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const constraint = `e2b2a_event_${randomUUID().replaceAll("-", "")}`;
    const rollbackUnchanged = await captureExactRollbackCheck(leased.fixture);
    await addCheck(
      "RefundExecutionCommandEvent",
      constraint,
      `"commandId" <> '${safeSqlId(leased.fixture.commandId)}' OR "leaseGeneration" <> ${leased.lease.leaseGeneration + 1}`,
    );
    try {
      const result = await reclaimUncontactedRefundExecution(
        db,
        reclaimInput(leased.fixture),
        RECLAIM_ENV,
      );
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
    } finally {
      await dropCheck("RefundExecutionCommandEvent", constraint);
    }
    expect(await rollbackUnchanged()).toBe(true);
  });

  it("rolls back an update rejected by the command CAS write", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const constraint = `e2b2a_command_${randomUUID().replaceAll("-", "")}`;
    const rollbackUnchanged = await captureExactRollbackCheck(leased.fixture);
    await addCheck(
      "RefundExecutionCommand",
      constraint,
      `"id" <> '${safeSqlId(leased.fixture.commandId)}' OR "leaseGeneration" <> ${leased.lease.leaseGeneration + 1}`,
    );
    try {
      const result = await reclaimUncontactedRefundExecution(
        db,
        reclaimInput(leased.fixture),
        RECLAIM_ENV,
      );
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
    } finally {
      await dropCheck("RefundExecutionCommand", constraint);
    }
    expect(await rollbackUnchanged()).toBe(true);
  });

  it("rolls back command and event when commit fails after both writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `e2b2a_commit_fn_${suffix}`;
    const triggerName = `e2b2a_commit_trigger_${suffix}`;
    const rollbackUnchanged = await captureExactRollbackCheck(leased.fixture);
    await addDeferredFailureTrigger(
      functionName,
      triggerName,
      leased.fixture.commandId,
      leased.lease.leaseGeneration + 1,
    );
    try {
      const result = await reclaimUncontactedRefundExecution(
        db,
        reclaimInput(leased.fixture),
        RECLAIM_ENV,
      );
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
    } finally {
      await dropDeferredFailureTrigger(functionName, triggerName);
    }
    expect(await rollbackUnchanged()).toBe(true);
  });

  it("serializes two reclaimers into one winner and one bounded active-lease loser", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const firstSession = createNamedDbSession("e2b2a_reclaim_first");
    const secondSession = createNamedDbSession("e2b2a_reclaim_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => reclaimUncontactedRefundExecution(firstSession.client, reclaimInput(leased.fixture), RECLAIM_ENV),
        secondSession,
        () => reclaimUncontactedRefundExecution(secondSession.client, reclaimInput(leased.fixture), RECLAIM_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok).length).toBe(1);
      expect(results.filter((result) => failureCode(result) === "LEASE_NOT_EXPIRED").length).toBe(1);
      const state = await redactedState(leased.fixture);
      expect(state.leaseGeneration).toBe(leased.lease.leaseGeneration + 1);
      expect(state.acquisitionCount).toBe(2);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes release-first against reclaim into READY and zero takeover writes", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const releaseSession = createNamedDbSession("e2b2a_release_first");
    const reclaimSession = createNamedDbSession("e2b2a_reclaim_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        releaseSession,
        () => releaseRefundExecutionLease(releaseSession.client, releaseInput(leased), RELEASE_ENV),
        reclaimSession,
        () => reclaimUncontactedRefundExecution(reclaimSession.client, reclaimInput(leased.fixture), RECLAIM_ENV),
      );
      const [released, reclaimed] = await Promise.all([queued.first, queued.second]);
      expect(released.ok).toBe(true);
      expect(failureCode(reclaimed)).toBe("COMMAND_NOT_FOUND_OR_INELIGIBLE");
      const state = await redactedState(leased.fixture);
      expect(state.commandStatus).toBe(RefundExecutionCommandStatus.READY);
      expect(state.releaseCount).toBe(1);
      expect(state.acquisitionCount).toBe(1);
    } finally {
      await disconnectSessions(releaseSession, reclaimSession);
    }
  });

  it("serializes reclaim-first against release and invalidates the old fence", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const reclaimSession = createNamedDbSession("e2b2a_reclaim_first_release_race");
    const releaseSession = createNamedDbSession("e2b2a_release_second_reclaim_race");
    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        reclaimSession,
        () => reclaimUncontactedRefundExecution(reclaimSession.client, reclaimInput(leased.fixture), RECLAIM_ENV),
        releaseSession,
        () => releaseRefundExecutionLease(releaseSession.client, releaseInput(leased), RELEASE_ENV),
      );
      const [reclaimed, released] = await Promise.all([queued.first, queued.second]);
      expect(reclaimed.ok).toBe(true);
      expect(releaseFailureCode(released)).toBe("LEASE_FENCE_MISMATCH");
      const state = await redactedState(leased.fixture);
      expect(state.commandStatus).toBe(RefundExecutionCommandStatus.LEASED);
      expect(state.releaseCount).toBe(0);
      expect(state.acquisitionCount).toBe(2);
    } finally {
      await disconnectSessions(reclaimSession, releaseSession);
    }
  });

  it("does not mint another generation after a committed response is lost", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const first = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );
    expect(first.ok).toBe(true);
    const before = await redactedState(leased.fixture);

    const second = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );

    expect(failureCode(second)).toBe("LEASE_NOT_EXPIRED");
    expect(isDeepStrictEqual(await redactedState(leased.fixture), before)).toBe(true);

    await expire(leased.fixture);
    const third = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );
    expect(third.ok).toBe(true);
    if (!third.ok) throw new Error(`Expected later reclaim success: ${third.code}`);
    expect(third.lease.leaseGeneration).toBe(leased.lease.leaseGeneration + 2);
  });

  it("rejects the old holder at all four fences and composes the new handle into E3B1", async () => {
    const leased = await trackedLeasedTossFixture(fixtures);
    const reclaimed = await reclaimUncontactedRefundExecution(
      db,
      reclaimInput(leased.fixture),
      RECLAIM_ENV,
    );
    expect(reclaimed.ok).toBe(true);
    if (!reclaimed.ok) throw new Error(`Expected reclaim success: ${reclaimed.code}`);

    const oldRelease = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);
    expect(releaseFailureCode(oldRelease)).toBe("LEASE_FENCE_MISMATCH");

    let staleAuthorizationLookups = 0;
    const staleAuthorization = await authorizer(
      leased.fixture,
      () => { staleAuthorizationLookups += 1; },
    )(db, authorityInput(leased.lease, leased.fixture), AUTH_ENV);
    expect(authorizationFailureCode(staleAuthorization)).toBe("LEASE_FENCE_MISMATCH");
    expect(staleAuthorizationLookups).toBe(0);

    let currentAuthorizationLookups = 0;
    const currentAuthorization = await authorizer(
      leased.fixture,
      () => { currentAuthorizationLookups += 1; },
    )(db, authorityInput(reclaimed.lease, leased.fixture), AUTH_ENV);
    expect(currentAuthorization.ok).toBe(true);
    expect(currentAuthorizationLookups).toBe(1);

    let contactLookups = 0;
    let cancellationCalls = 0;
    const cancellation: TossRefundCancellationPort = () => {
      cancellationCalls += 1;
      return Promise.resolve({ kind: "unknown" });
    };
    const contact = createTossRefundContactExecutor({
      lookup: eligibleLookup(leased.fixture, () => { contactLookups += 1; }),
      cancellation,
    });
    const staleContact = await contact(
      db,
      authorityInput(leased.lease, leased.fixture),
      CONTACT_ENV,
    );
    expect(contactFailureCode(staleContact)).toBe("LEASE_FENCE_MISMATCH");
    expect(contactLookups).toBe(0);
    expect(cancellationCalls).toBe(0);

    await makeMock(leased.fixture);
    const staleResult = await persistFreshRefundExecutionObservation(db, {
      commandId: leased.fixture.commandId,
      dispatchAttempt: 1,
      leaseGeneration: leased.lease.leaseGeneration,
      leaseToken: leased.lease.leaseToken,
      observation: {
        outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
        observedProviderRefundId: null,
        reportedAmount: null,
        reportedCurrency: null,
        safeCode: null,
        safeMessage: null,
        observedAt: await databaseTime(),
      },
    }, OBSERVATION_ENV);
    expect(staleResult).toMatchObject({ ok: false, code: "FRESH_LEASE_FENCE_MISMATCH" });

    const [command, dispatches, bindings, proofs, contactProofCount, evidenceCount] = await Promise.all([
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: leased.fixture.commandId } }),
      db.refundExecutionDispatchAttempt.findMany({ where: { commandId: leased.fixture.commandId } }),
      db.refundExecutionProviderOperationBinding.count({
        where: { refundAttemptId: leased.fixture.refundAttemptId },
      }),
      db.refundExecutionProviderEligibilityProof.count({
        where: { binding: { refundAttemptId: leased.fixture.refundAttemptId } },
      }),
      db.refundExecutionProviderContactEligibilityProof.count({
        where: { dispatchAttempt: { commandId: leased.fixture.commandId } },
      }),
      db.refundExecutionEvidence.count({ where: { commandId: leased.fixture.commandId } }),
    ]);
    expect(command.leaseGeneration).toBe(reclaimed.lease.leaseGeneration);
    expect(command.dispatchAttempt).toBe(1);
    expect(dispatches.length).toBe(1);
    expect(dispatches[0].ordinal).toBe(1);
    expect(dispatches[0].leaseGeneration).toBe(reclaimed.lease.leaseGeneration);
    expect(dispatches[0].state).toBe(RefundExecutionDispatchAttemptState.AUTHORIZED);
    expect(dispatches[0].contactMarkedAt).toBeNull();
    expect(bindings).toBe(1);
    expect(proofs).toBe(1);
    expect(contactProofCount).toBe(0);
    expect(evidenceCount).toBe(0);
  });
});

async function trackedFixture(fixtures: DispatchFixture[]): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
  fixtures.push(fixture);
  return fixture;
}

async function trackedLeasedTossFixture(
  fixtures: DispatchFixture[],
  expired = true,
): Promise<LeasedFixture> {
  const fixture = await trackedFixture(fixtures);
  const acquired = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e2b2a-initial-worker",
  }, LEASE_ENV);
  if (!acquired.ok) throw new Error(`Expected initial lease success: ${acquired.code}`);
  await makeToss(fixture);
  if (expired) await expire(fixture);
  return { fixture, lease: acquired.lease };
}

function reclaimInput(fixture: DispatchFixture) {
  return { commandId: fixture.commandId, recoveryOwner: RECOVERY_OWNER };
}

function authorityInput(lease: RefundExecutionLeaseHandle, fixture: DispatchFixture) {
  return {
    commandId: fixture.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  };
}

function releaseInput(leased: LeasedFixture) {
  return authorityInput(leased.lease, leased.fixture);
}

async function makeToss(fixture: DispatchFixture): Promise<void> {
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
}

async function makeMock(fixture: DispatchFixture): Promise<void> {
  await Promise.all([
    db.payment.update({
      where: { id: fixture.paymentId },
      data: { provider: PaymentProvider.MOCK, mode: PaymentMode.SANDBOX },
    }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { provider: PaymentProvider.MOCK, mode: PaymentMode.SANDBOX },
    }),
  ]);
}

function expire(fixture: DispatchFixture): Promise<unknown> {
  return db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: EXPIRED_AT },
  });
}

function authorizer(fixture: DispatchFixture, onLookup?: () => void) {
  return createTossRefundExecutionAuthorizer({ lookup: eligibleLookup(fixture, onLookup) });
}

function eligibleLookup(fixture: DispatchFixture, onLookup?: () => void): TossRefundLookupPort {
  return () => {
    onLookup?.();
    return Promise.resolve({
      kind: "response",
      body: JSON.stringify({
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
      }),
    });
  };
}

async function redactedState(fixture: DispatchFixture) {
  const [command, events, dispatches, bindings, eligibilityProofs, contactProofs, evidence] =
    await Promise.all([
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
      db.refundExecutionCommandEvent.findMany({ where: { commandId: fixture.commandId } }),
      db.refundExecutionDispatchAttempt.findMany({ where: { commandId: fixture.commandId } }),
      db.refundExecutionProviderOperationBinding.count({
        where: { refundAttemptId: fixture.refundAttemptId },
      }),
      db.refundExecutionProviderEligibilityProof.count({
        where: { binding: { refundAttemptId: fixture.refundAttemptId } },
      }),
      db.refundExecutionProviderContactEligibilityProof.count({
        where: { dispatchAttempt: { commandId: fixture.commandId } },
      }),
      db.refundExecutionEvidence.count({ where: { commandId: fixture.commandId } }),
    ]);
  return {
    commandStatus: command.status,
    dispatchAttempt: command.dispatchAttempt,
    leaseGeneration: command.leaseGeneration,
    leaseUntilMs: command.leaseUntil?.getTime() ?? null,
    hasLeaseOwner: command.leaseOwner !== null,
    hasTokenHash: command.leaseTokenHash !== null,
    acquisitionCount: events.filter((event) => (
      event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    )).length,
    releaseCount: events.filter((event) => (
      event.eventType === RefundExecutionCommandEventType.PRE_CONTACT_RELEASED
    )).length,
    dispatchCount: dispatches.length,
    dispatchOrdinals: dispatches.map((row) => row.ordinal),
    dispatchGenerations: dispatches.map((row) => row.leaseGeneration),
    dispatchStates: dispatches.map((row) => row.state),
    contactMarked: dispatches.map((row) => row.contactMarkedAt !== null),
    bindings,
    eligibilityProofs,
    contactProofs,
    evidence,
  };
}

async function captureExactRollbackCheck(fixture: DispatchFixture): Promise<() => Promise<boolean>> {
  const [command, eventCount] = await Promise.all([
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    db.refundExecutionCommandEvent.count({ where: { commandId: fixture.commandId } }),
  ]);
  return async () => {
    const [after, afterEventCount] = await Promise.all([
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
      db.refundExecutionCommandEvent.count({ where: { commandId: fixture.commandId } }),
    ]);
    return [
      after.leaseGeneration === command.leaseGeneration,
      after.leaseOwner === command.leaseOwner,
      after.leaseUntil?.getTime() === command.leaseUntil?.getTime(),
      after.leaseTokenHash === command.leaseTokenHash,
      afterEventCount === eventCount,
    ].every(Boolean);
  };
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1) throw new Error("Unable to observe test database time.");
  return rows[0].capturedAt;
}

function failureCode(result: Awaited<ReturnType<typeof reclaimUncontactedRefundExecution>>): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

function releaseFailureCode(result: Awaited<ReturnType<typeof releaseRefundExecutionLease>>): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

function authorizationFailureCode(
  result: Awaited<ReturnType<ReturnType<typeof createTossRefundExecutionAuthorizer>>>,
): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

function contactFailureCode(
  result: Awaited<ReturnType<ReturnType<typeof createTossRefundContactExecutor>>>,
): string {
  return result.ok ? "<unexpected-success>" : result.code;
}

function safeSqlId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Fixture id is not SQL-safe.");
  return value;
}

async function addCheck(table: string, constraint: string, predicate: string): Promise<void> {
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

async function addDeferredFailureTrigger(
  functionName: string,
  triggerName: string,
  commandId: string,
  generation: number,
): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(functionName) || !/^[a-z0-9_]+$/.test(triggerName)) {
    throw new Error("Unsafe test trigger identifier.");
  }
  const safeCommandId = safeSqlId(commandId);
  await db.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."id" = '${safeCommandId}' AND NEW."leaseGeneration" = ${generation} THEN
        RAISE EXCEPTION 'synthetic deferred E2B2A failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.$executeRawUnsafe(`
    CREATE CONSTRAINT TRIGGER "${triggerName}"
    AFTER UPDATE ON "RefundExecutionCommand"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);
}

async function dropDeferredFailureTrigger(functionName: string, triggerName: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(functionName) || !/^[a-z0-9_]+$/.test(triggerName)) {
    throw new Error("Unsafe test trigger identifier.");
  }
  await db.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "RefundExecutionCommand"`);
  await db.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
}
