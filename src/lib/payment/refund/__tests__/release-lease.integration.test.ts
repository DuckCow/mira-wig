import { randomUUID } from "crypto";
import { isDeepStrictEqual } from "util";
import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acquireRefundExecutionLease,
  type AcquireRefundExecutionLeaseResult,
  type RefundExecutionLeaseHandle,
} from "../acquire-lease";
import {
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_LEASE_RELEASE_ENABLED,
} from "../execution-activation";
import {
  releaseRefundExecutionLease,
  type ReleaseRefundExecutionLeaseResult,
} from "../release-lease";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const RELEASE_ENV = { [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "ENABLED" };
const LEASE_OWNER = "e2b1-worker";
const WRONG_TOKEN = "f".repeat(64);

describe("releaseRefundExecutionLease", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns FEATURE_DISABLED before any release query or write", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), {});

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("FEATURE_DISABLED");
    await expectStateUnchanged(leased.fixture, before);
  });

  it("returns CONFIG_INVALID without retaining the malformed gate value or writing", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), {
      [REFUND_EXECUTION_LEASE_RELEASE_ENABLED]: "unexpected-secret-value",
    });

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("CONFIG_INVALID");
    if (result.ok) throw new Error("Expected invalid release configuration to fail.");
    expect(result.message).not.toContain("unexpected-secret-value");
    await expectStateUnchanged(leased.fixture, before);
  });

  it("releases an unexpired exact-current pre-contact lease without business-state changes", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await dispatchState(leased.fixture);

    const result = releaseSuccess(await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV));

    const after = await dispatchState(leased.fixture);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.release)).toBe(true);
    expect(Object.keys(result.release).sort()).toEqual([
      "commandId",
      "leaseGeneration",
      "orderId",
      "refundAttemptId",
    ]);
    expect(result.release.commandId).toBe(leased.fixture.commandId);
    expect(result.release.refundAttemptId).toBe(leased.fixture.refundAttemptId);
    expect(result.release.orderId).toBe(leased.fixture.orderId);
    expect(result.release.leaseGeneration).toBe(leased.lease.leaseGeneration);
    expect(after.command.status).toBe(RefundExecutionCommandStatus.READY);
    expect(after.command.leaseGeneration).toBe(before.command.leaseGeneration);
    expect(after.command.dispatchAttempt).toBe(0);
    expect(after.command.availableAt.getTime()).toBe(before.command.availableAt.getTime());
    expect(after.command.leaseOwner).toBeNull();
    expect(after.command.leaseUntil).toBeNull();
    expect(after.command.leaseTokenHash).toBeNull();
    expect(eventCount(after, RefundExecutionCommandEventType.LEASE_ACQUIRED)).toBe(1);
    expect(eventCount(after, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
    expect(isDeepStrictEqual(after.order, before.order)).toBe(true);
    expect(isDeepStrictEqual(after.payment, before.payment)).toBe(true);
    expect(isDeepStrictEqual(after.attempt, before.attempt)).toBe(true);
    expect(isDeepStrictEqual(after.transitions, before.transitions)).toBe(true);
    expect(isDeepStrictEqual(after.evidence, before.evidence)).toBe(true);
    expect(after.attempt.status).toBe(RefundAttemptStatus.PROCESSING);
    expect(after.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(after.payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(after.attempt.providerRefundId).toBeNull();
  });

  it("releases an expired lease with the exact current generation and token", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    });

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(result.ok).toBe(true);
    const after = await dispatchState(leased.fixture);
    expect(after.command.status).toBe(RefundExecutionCommandStatus.READY);
    expect(eventCount(after, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
  });

  it("rejects the same textual owner without token authority", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, {
      commandId: leased.fixture.commandId,
      leaseGeneration: leased.lease.leaseGeneration,
      leaseToken: WRONG_TOKEN,
    }, RELEASE_ENV);

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("LEASE_FENCE_MISMATCH");
    await expectStateUnchanged(leased.fixture, before);
  });

  it("rejects a wrong generation without writes", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, {
      commandId: leased.fixture.commandId,
      leaseGeneration: leased.lease.leaseGeneration + 1,
      leaseToken: leased.lease.leaseToken,
    }, RELEASE_ENV);

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("LEASE_FENCE_MISMATCH");
    await expectStateUnchanged(leased.fixture, before);
  });

  it("ignores changed textual lease ownership when the generation and token are current", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.fixture.commandId },
      data: { leaseOwner: "foreign-textual-owner" },
    });

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(result.ok).toBe(true);
    const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: leased.fixture.commandId } });
    expect(command.status).toBe(RefundExecutionCommandStatus.READY);
    expect(command.leaseOwner).toBeNull();
  });

  it.each([
    {
      label: "positive dispatch ordinal",
      mutate: (fixture: DispatchFixture) => db.refundExecutionCommand.update({
        where: { id: fixture.commandId },
        data: { dispatchAttempt: 1 },
      }),
    },
    {
      label: "execution evidence",
      mutate: (fixture: DispatchFixture) => db.refundExecutionEvidence.create({
        data: {
          commandId: fixture.commandId,
          source: RefundExecutionEvidenceSource.OPERATOR,
          sourceDedupKey: `e2b1-contact-${randomUUID()}`,
          outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
          application: RefundExecutionEvidenceApplication.PARKED,
          observedAt: new Date("2026-07-16T00:00:00.000Z"),
        },
      }),
    },
    {
      label: "provider refund identity",
      mutate: (fixture: DispatchFixture) => db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { providerRefundId: `provider_refund_${randomUUID()}` },
      }),
    },
  ])("rejects non-pre-contact state with $label", async ({ mutate }) => {
    const leased = await trackedLeasedFixture(fixtures);
    await mutate(leased.fixture);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("NOT_PRE_CONTACT");
    await expectStateUnchanged(leased.fixture, before);
    expect(eventCount(before, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(0);
  });

  it.each([
    {
      label: "Attempt not PROCESSING",
      mutate: (fixture: DispatchFixture) => db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { status: RefundAttemptStatus.MANUAL_REVIEW },
      }),
    },
    {
      label: "Order not REFUND_PENDING",
      mutate: (fixture: DispatchFixture) => db.order.update({
        where: { id: fixture.orderId },
        data: { status: OrderStatus.PAID },
      }),
    },
    {
      label: "Payment not SUCCEEDED",
      mutate: (fixture: DispatchFixture) => db.payment.update({
        where: { id: fixture.paymentId },
        data: { status: PaymentAttemptStatus.FAILED },
      }),
    },
    {
      label: "amount mismatch",
      mutate: (fixture: DispatchFixture) => db.payment.update({
        where: { id: fixture.paymentId },
        data: { amount: fixture.totalAmount + 1 },
      }),
    },
    {
      label: "currency mismatch",
      mutate: (fixture: DispatchFixture) => db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { currency: "USD" },
      }),
    },
    {
      label: "provider mismatch",
      mutate: (fixture: DispatchFixture) => db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { provider: PaymentProvider.TOSS },
      }),
    },
    {
      label: "mode mismatch",
      mutate: (fixture: DispatchFixture) => db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { mode: PaymentMode.LIVE },
      }),
    },
    {
      label: "malformed claim lineage",
      mutate: (fixture: DispatchFixture) => db.refundAttemptTransition.updateMany({
        where: { refundAttemptId: fixture.refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
        data: { reason: "Malformed claim lineage" },
      }),
    },
  ])("fails closed for aggregate corruption: $label", async ({ mutate }) => {
    const leased = await trackedLeasedFixture(fixtures);
    await mutate(leased.fixture);
    const before = await dispatchState(leased.fixture);

    const result = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(result.ok).toBe(false);
    expect(releaseFailureCode(result)).toBe("LEDGER_INCONSISTENT");
    await expectStateUnchanged(leased.fixture, before);
    expect(eventCount(before, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(0);
  });

  it("classifies same-generation replay from the durable release event without writing", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);
    const before = await dispatchState(leased.fixture);

    const replay = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(replay.ok).toBe(false);
    expect(releaseFailureCode(replay)).toBe("ALREADY_RELEASED");
    await expectStateUnchanged(leased.fixture, before);
    expect(eventCount(before, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
  });

  it("classifies an old-generation replay after real reacquisition without touching the new lease", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);
    const reacquired = leaseSuccess(await acquireRefundExecutionLease(db, {
      commandId: leased.fixture.commandId,
      leaseOwner: LEASE_OWNER,
    }, LEASE_ENV));
    const before = await dispatchState(leased.fixture);

    const replay = await releaseRefundExecutionLease(db, releaseInput(leased), RELEASE_ENV);

    expect(replay.ok).toBe(false);
    expect(releaseFailureCode(replay)).toBe("ALREADY_RELEASED");
    expect(reacquired.lease.leaseGeneration).toBe(2);
    await expectStateUnchanged(leased.fixture, before);
    expect(before.command.status).toBe(RefundExecutionCommandStatus.LEASED);
    expect(before.command.leaseGeneration).toBe(2);
    expect(eventCount(before, RefundExecutionCommandEventType.LEASE_ACQUIRED)).toBe(2);
    expect(eventCount(before, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
  });

  it("serializes concurrent releases into one success and one durable replay", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const firstSession = createNamedDbSession("e2b1_release_first");
    const secondSession = createNamedDbSession("e2b1_release_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        firstSession,
        () => releaseRefundExecutionLease(firstSession.client, releaseInput(leased), RELEASE_ENV),
        secondSession,
        () => releaseRefundExecutionLease(secondSession.client, releaseInput(leased), RELEASE_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok).length).toBe(1);
      expect(results.filter((result) => !result.ok && result.code === "ALREADY_RELEASED").length).toBe(1);
      const after = await dispatchState(leased.fixture);
      expect(after.command.status).toBe(RefundExecutionCommandStatus.READY);
      expect(eventCount(after, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes release before reacquisition and retains both generations of history", async () => {
    const leased = await trackedLeasedFixture(fixtures);
    const releaseSession = createNamedDbSession("e2b1_release_then_acquire_release");
    const acquireSession = createNamedDbSession("e2b1_release_then_acquire_acquire");

    try {
      const queued = await queueBehindObservedOrderLock(
        leased.fixture.orderId,
        releaseSession,
        () => releaseRefundExecutionLease(releaseSession.client, releaseInput(leased), RELEASE_ENV),
        acquireSession,
        () => acquireRefundExecutionLease(acquireSession.client, {
          commandId: leased.fixture.commandId,
          leaseOwner: "next-generation-worker",
        }, LEASE_ENV),
      );
      const [releaseResult, acquireResult] = await Promise.all([queued.first, queued.second]);
      expect(releaseResult.ok).toBe(true);
      expect(acquireResult.ok).toBe(true);
      if (!acquireResult.ok) throw new Error(`Expected serialized reacquisition, received ${acquireResult.code}.`);
      expect(acquireResult.lease.leaseGeneration).toBe(2);
      const after = await dispatchState(leased.fixture);
      expect(after.command.status).toBe(RefundExecutionCommandStatus.LEASED);
      expect(after.command.leaseGeneration).toBe(2);
      expect(eventCount(after, RefundExecutionCommandEventType.LEASE_ACQUIRED)).toBe(2);
      expect(eventCount(after, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED)).toBe(1);
    } finally {
      await disconnectSessions(releaseSession, acquireSession);
    }
  });
});

interface LeasedFixture {
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
}

async function trackedLeasedFixture(fixtures: DispatchFixture[]): Promise<LeasedFixture> {
  const fixture = await createDispatchFixture();
  fixtures.push(fixture);
  const acquired = leaseSuccess(await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: LEASE_OWNER,
  }, LEASE_ENV));
  return { fixture, lease: acquired.lease };
}

function releaseInput(leased: LeasedFixture) {
  return {
    commandId: leased.fixture.commandId,
    leaseGeneration: leased.lease.leaseGeneration,
    leaseToken: leased.lease.leaseToken,
  };
}

function leaseSuccess(
  result: AcquireRefundExecutionLeaseResult,
): Extract<AcquireRefundExecutionLeaseResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected lease success, received ${result.code}.`);
  return result;
}

function releaseSuccess(
  result: ReleaseRefundExecutionLeaseResult,
): Extract<ReleaseRefundExecutionLeaseResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected release success, received ${result.code}.`);
  return result;
}

function releaseFailureCode(result: ReleaseRefundExecutionLeaseResult): string {
  return result.ok ? "<unexpected-release-success>" : result.code;
}

function eventCount(
  state: Awaited<ReturnType<typeof dispatchState>>,
  eventType: RefundExecutionCommandEventType,
): number {
  return state.commandEvents.filter((event) => event.eventType === eventType).length;
}

async function expectStateUnchanged(
  fixture: DispatchFixture,
  before: Awaited<ReturnType<typeof dispatchState>>,
): Promise<void> {
  const after = await dispatchState(fixture);
  expect(isDeepStrictEqual(after, before)).toBe(true);
}
