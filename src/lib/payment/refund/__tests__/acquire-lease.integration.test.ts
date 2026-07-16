import { createHash, randomUUID } from "crypto";
import { isDeepStrictEqual } from "util";
import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
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
  REFUND_EXECUTION_LEASE_DURATION_MS,
  type AcquireRefundExecutionLeaseResult,
} from "../acquire-lease";
import {
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
} from "../execution-activation";
import { persistFreshRefundExecutionObservation } from "../resolve-execution";
import {
  addOpenAttempt,
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

const ENABLED_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const LEASE_OWNER = "e2a-worker";
const POSTGRES_INT_MAX = 2_147_483_647;

describe("acquireRefundExecutionLease", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns FEATURE_DISABLED with zero writes when the gate is unset", async () => {
    const fixture = await trackedFixture(fixtures);
    const before = await dispatchState(fixture);

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), {});

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe("FEATURE_DISABLED");
    await expectDispatchStateUnchanged(fixture, before);
  });

  it("returns CONFIG_INVALID with zero writes for malformed gate configuration", async () => {
    const fixture = await trackedFixture(fixtures);
    const before = await dispatchState(fixture);

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), {
      [REFUND_EXECUTION_LEASE_ENABLED]: "enabled",
    });

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe("CONFIG_INVALID");
    await expectDispatchStateUnchanged(fixture, before);
  });

  it("leases one due exact command with a generated fence and no other business writes", async () => {
    const fixture = await trackedFixture(fixtures);
    const before = await dispatchState(fixture);
    const beforeDbTime = await databaseTime();

    const result = leaseSuccess(await acquireRefundExecutionLease(db, {
      commandId: `  ${fixture.commandId}  `,
      leaseOwner: `  ${LEASE_OWNER}  `,
    }, ENABLED_ENV));

    const afterDbTime = await databaseTime();
    const state = await dispatchState(fixture);
    const capturedTime = result.lease.leaseUntil.getTime() - 300_000;
    const tokenHasExpectedFormat = /^[0-9a-f]{64}$/.test(result.lease.leaseToken);
    const digestHasExpectedFormat = typeof state.command.leaseTokenHash === "string"
      && /^[0-9a-f]{64}$/.test(state.command.leaseTokenHash);
    const digestMatchesToken = state.command.leaseTokenHash === createHash("sha256")
      .update(result.lease.leaseToken, "utf8")
      .digest("hex");
    const digestDiffersFromToken = state.command.leaseTokenHash !== result.lease.leaseToken;
    const rawTokenAbsentFromPersistedState = !containsText(
      { command: state.command, transitions: state.transitions, evidence: state.evidence },
      result.lease.leaseToken,
    );

    expect(REFUND_EXECUTION_LEASE_DURATION_MS).toBe(300_000);
    expect(Object.keys(result.lease).sort()).toEqual([
      "commandId",
      "leaseGeneration",
      "leaseToken",
      "leaseUntil",
      "orderId",
      "refundAttemptId",
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lease)).toBe(true);
    expect(result.lease.commandId).toBe(fixture.commandId);
    expect(result.lease.refundAttemptId).toBe(fixture.refundAttemptId);
    expect(result.lease.orderId).toBe(fixture.orderId);
    expect(result.lease.leaseGeneration).toBe(1);
    expect(tokenHasExpectedFormat).toBe(true);
    expect(capturedTime).toBeGreaterThanOrEqual(beforeDbTime.getTime());
    expect(capturedTime).toBeLessThanOrEqual(afterDbTime.getTime());
    expect(capturedTime % 1_000).toBeGreaterThanOrEqual(0);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.LEASED);
    expect(state.command.leaseOwner).toBe(LEASE_OWNER);
    expect(state.command.leaseUntil?.getTime()).toBe(result.lease.leaseUntil.getTime());
    expect(state.command.leaseGeneration).toBe(1);
    expect(state.command.dispatchAttempt).toBe(0);
    expect(state.commandEvents.length).toBe(1);
    expect(state.commandEvents[0].eventType).toBe(RefundExecutionCommandEventType.LEASE_ACQUIRED);
    expect(state.commandEvents[0].leaseGeneration).toBe(1);
    expect(state.commandEvents[0].dispatchAttempt).toBe(0);
    expect(state.commandEvents[0].occurredAt.getTime()).toBe(capturedTime);
    expect(digestHasExpectedFormat).toBe(true);
    expect(digestMatchesToken).toBe(true);
    expect(digestDiffersFromToken).toBe(true);
    expect(state.order).toEqual(before.order);
    expect(state.payment).toEqual(before.payment);
    expect(state.attempt).toEqual(before.attempt);
    expect(isDeepStrictEqual(state.transitions, before.transitions)).toBe(true);
    expect(state.evidence.length).toBe(0);
    expect(rawTokenAbsentFromPersistedState).toBe(true);
  });

  it("accepts a command whose availability is exactly due", async () => {
    const fixture = await trackedFixture(fixtures);
    const due = await databaseTime();
    await db.refundExecutionCommand.update({ where: { id: fixture.commandId }, data: { availableAt: due } });

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV);

    expect(result.ok).toBe(true);
  });

  it("rolls back the lease CAS when the acquisition event cannot be inserted", async () => {
    const fixture = await trackedFixture(fixtures);
    const occurredAt = await databaseTime();
    await db.refundExecutionCommandEvent.create({
      data: {
        commandId: fixture.commandId,
        eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED,
        leaseGeneration: 1,
        dispatchAttempt: 0,
        occurredAt,
      },
    });
    const before = await dispatchState(fixture);

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV);

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe("LEDGER_INCONSISTENT");
    const after = await dispatchState(fixture);
    expect(isDeepStrictEqual(after, before)).toBe(true);
    expect(after.command.status).toBe(RefundExecutionCommandStatus.READY);
    expect(after.command.leaseGeneration).toBe(0);
    expect(after.command.leaseTokenHash).toBeNull();
    expect(after.commandEvents.length).toBe(1);
  });

  it("fails closed at the existing ordinal-positive result boundary for an E2A lease", async () => {
    const fixture = await trackedFixture(fixtures);
    const lease = leaseSuccess(await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV));
    const before = await dispatchState(fixture);
    const observedAt = new Date(lease.lease.leaseUntil.getTime() - 1);

    const result = await persistFreshRefundExecutionObservation(db, {
      commandId: fixture.commandId,
      dispatchAttempt: 1,
      leaseGeneration: lease.lease.leaseGeneration,
      leaseToken: lease.lease.leaseToken,
      observation: {
        outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
        observedProviderRefundId: null,
        reportedAmount: null,
        reportedCurrency: null,
        safeCode: null,
        safeMessage: null,
        observedAt,
      },
    }, { [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED" });

    expect(result).toMatchObject({ ok: false, code: "DISPATCH_ATTEMPT_MISMATCH" });
    await expectDispatchStateUnchanged(fixture, before);
  });

  it("returns COMMAND_NOT_FOUND_OR_INELIGIBLE for an absent command", async () => {
    const result = await acquireRefundExecutionLease(db, {
      commandId: `missing_${randomUUID()}`,
      leaseOwner: LEASE_OWNER,
    }, ENABLED_ENV);

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe("COMMAND_NOT_FOUND_OR_INELIGIBLE");
  });

  it("returns LEASE_CONFLICT without replay even for the same textual owner", async () => {
    const fixture = await trackedFixture(fixtures);
    await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV);
    const before = await dispatchState(fixture);

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV);

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe("LEASE_CONFLICT");
    await expectDispatchStateUnchanged(fixture, before);
  });

  it.each([
    {
      label: "wrong command status",
      expected: "COMMAND_NOT_READY",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundExecutionCommand.update({
          where: { id: fixture.commandId },
          data: { status: RefundExecutionCommandStatus.PARKED },
        });
      },
    },
    {
      label: "future availability",
      expected: "NOT_YET_AVAILABLE",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundExecutionCommand.update({
          where: { id: fixture.commandId },
          data: { availableAt: new Date("2099-01-01T00:00:00.000Z") },
        });
      },
    },
    {
      label: "Attempt not PROCESSING",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttempt.update({
          where: { id: fixture.refundAttemptId },
          data: { status: RefundAttemptStatus.MANUAL_REVIEW },
        });
      },
    },
    {
      label: "Order not REFUND_PENDING",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.order.update({ where: { id: fixture.orderId }, data: { status: OrderStatus.PAID } });
      },
    },
    {
      label: "Payment not SUCCEEDED",
      expected: "PAYMENT_NOT_EXECUTABLE",
      mutate: async (fixture: DispatchFixture) => {
        await db.payment.update({
          where: { id: fixture.paymentId },
          data: { status: PaymentAttemptStatus.FAILED },
        });
      },
    },
    {
      label: "missing provider payment key",
      expected: "PAYMENT_NOT_EXECUTABLE",
      mutate: async (fixture: DispatchFixture) => {
        await db.payment.update({ where: { id: fixture.paymentId }, data: { providerPaymentKey: null } });
      },
    },
    {
      label: "blank provider payment key",
      expected: "PAYMENT_NOT_EXECUTABLE",
      mutate: async (fixture: DispatchFixture) => {
        await db.payment.update({ where: { id: fixture.paymentId }, data: { providerPaymentKey: "   " } });
      },
    },
    {
      label: "provider refund identity already present",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttempt.update({
          where: { id: fixture.refundAttemptId },
          data: { providerRefundId: `provider_refund_${randomUUID()}` },
        });
      },
    },
    {
      label: "existing execution evidence",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundExecutionEvidence.create({
          data: {
            commandId: fixture.commandId,
            source: RefundExecutionEvidenceSource.OPERATOR,
            sourceDedupKey: `e2a-existing-${randomUUID()}`,
            outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
            application: RefundExecutionEvidenceApplication.PARKED,
            observedAt: new Date("2026-07-16T00:00:00.000Z"),
          },
        });
      },
    },
    {
      label: "amount mismatch",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.payment.update({ where: { id: fixture.paymentId }, data: { amount: 999 } });
      },
    },
    {
      label: "currency mismatch",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttempt.update({ where: { id: fixture.refundAttemptId }, data: { currency: "USD" } });
      },
    },
    {
      label: "provider mismatch",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttempt.update({
          where: { id: fixture.refundAttemptId },
          data: { provider: PaymentProvider.TOSS },
        });
      },
    },
    {
      label: "mode mismatch",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttempt.update({
          where: { id: fixture.refundAttemptId },
          data: { mode: PaymentMode.LIVE },
        });
      },
    },
    {
      label: "missing creation transition",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttemptTransition.deleteMany({
          where: { refundAttemptId: fixture.refundAttemptId, fromStatus: null },
        });
      },
    },
    {
      label: "missing claim transition",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttemptTransition.deleteMany({
          where: { refundAttemptId: fixture.refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
        });
      },
    },
    {
      label: "malformed claim transition",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttemptTransition.updateMany({
          where: { refundAttemptId: fixture.refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
          data: { reason: "Malformed claim transition" },
        });
      },
    },
    {
      label: "extra contradictory transition",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundAttemptTransition.create({
          data: {
            refundAttemptId: fixture.refundAttemptId,
            fromStatus: RefundAttemptStatus.PROCESSING,
            toStatus: RefundAttemptStatus.MANUAL_REVIEW,
            orderStatusBefore: OrderStatus.REFUND_PENDING,
            orderStatusAfter: OrderStatus.REFUND_PENDING,
            actorType: RefundAttemptActorType.SYSTEM,
            actorUserId: null,
            reason: "Contradictory transition",
            operationKey: `e2a-contradiction-${randomUUID()}`,
          },
        });
      },
    },
    {
      label: "multiple open refund targets",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await addOpenAttempt(fixture);
      },
    },
    {
      label: "lease generation exhaustion",
      expected: "LEDGER_INCONSISTENT",
      mutate: async (fixture: DispatchFixture) => {
        await db.refundExecutionCommand.update({
          where: { id: fixture.commandId },
          data: { leaseGeneration: POSTGRES_INT_MAX },
        });
      },
    },
  ])("returns $expected with zero writes for $label", async ({ expected, mutate }) => {
    const fixture = await trackedFixture(fixtures);
    await mutate(fixture);
    const before = await dispatchState(fixture);

    const result = await acquireRefundExecutionLease(db, leaseInput(fixture), ENABLED_ENV);

    expect(result.ok).toBe(false);
    expect(safeLeaseFailureCode(result)).toBe(expected);
    await expectDispatchStateUnchanged(fixture, before);
  });

  it("serializes two exact acquirers into one winner and one conflict", async () => {
    const fixture = await trackedFixture(fixtures);
    const firstSession = createNamedDbSession("e2a_lease_first");
    const secondSession = createNamedDbSession("e2a_lease_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => acquireRefundExecutionLease(firstSession.client, leaseInput(fixture), ENABLED_ENV),
        secondSession,
        () => acquireRefundExecutionLease(secondSession.client, leaseInput(fixture), ENABLED_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      const successCount = results.filter((result) => result.ok).length;
      const conflictCount = results.filter(
        (result) => !result.ok && result.code === "LEASE_CONFLICT",
      ).length;
      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);
      const state = await dispatchState(fixture);
      const digestHasExpectedFormat = typeof state.command.leaseTokenHash === "string"
        && /^[0-9a-f]{64}$/.test(state.command.leaseTokenHash);
      expect(state.command.status).toBe(RefundExecutionCommandStatus.LEASED);
      expect(state.command.leaseGeneration).toBe(1);
      expect(state.command.dispatchAttempt).toBe(0);
      expect(digestHasExpectedFormat).toBe(true);
      expect(state.evidence.length).toBe(0);
      expect(state.commandEvents.length).toBe(1);
      expect(state.commandEvents[0].eventType).toBe(RefundExecutionCommandEventType.LEASE_ACQUIRED);
      expect(state.transitions.length).toBe(2);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });
});

function leaseInput(fixture: DispatchFixture) {
  return { commandId: fixture.commandId, leaseOwner: LEASE_OWNER };
}

function leaseSuccess(
  result: AcquireRefundExecutionLeaseResult,
): Extract<AcquireRefundExecutionLeaseResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected lease success, received ${result.code}.`);
  return result;
}

function safeLeaseFailureCode(result: AcquireRefundExecutionLeaseResult): string {
  return result.ok ? "<unexpected-lease-success>" : result.code;
}

async function expectDispatchStateUnchanged(
  fixture: DispatchFixture,
  before: Awaited<ReturnType<typeof dispatchState>>,
): Promise<void> {
  const after = await dispatchState(fixture);
  expect(isDeepStrictEqual(after, before)).toBe(true);
}

function containsText(value: unknown, text: string): boolean {
  if (typeof value === "string") return value.includes(text);
  if (Array.isArray(value)) return value.some((item) => containsText(item, text));
  if (typeof value !== "object" || value === null || value instanceof Date) return false;
  return Object.values(value).some((item) => containsText(item, text));
}

async function trackedFixture(fixtures: DispatchFixture[]): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture();
  fixtures.push(fixture);
  return fixture;
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  if (rows.length !== 1) throw new Error("Unable to observe test database time.");
  return rows[0].capturedAt;
}
