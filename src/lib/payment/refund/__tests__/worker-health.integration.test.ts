import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { healthSnapshot } from "../worker-host-contract";
import {
  readRefundExecutionWorkerHealthBacklog,
  refundExecutionWorkerOldestAgeSeconds,
} from "../worker-health";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

describe("refund worker read-only health backlog", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const configured = process.env.DATABASE_URL;
    if (!configured) throw new Error("DATABASE_URL is required.");
    const url = new URL(configured);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!local || url.pathname !== "/wig_platform_test") {
      throw new Error("Worker health integration is restricted to local wig_platform_test.");
    }
    expect(await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns the exact empty aggregate without selecting or mutating work", async () => {
    expect(await readRefundExecutionWorkerHealthBacklog(db)).toEqual(emptyBacklog());
  });

  it("floors a controlled positive subsecond authoritative age to zero", () => {
    const capturedAt = new Date("2026-07-22T00:00:00.999Z");
    const oldest = new Date("2026-07-22T00:00:00.001Z");

    expect(oldest.getTime()).toBeLessThan(capturedAt.getTime());
    expect(capturedAt.getTime() - oldest.getTime()).toBe(998);
    expect(refundExecutionWorkerOldestAgeSeconds(capturedAt, oldest)).toBe(0);
  });

  it("counts one coherent row in every class and derives ages from database time", async () => {
    const now = await databaseTime();
    const ready = await tossFixture(fixtures, secondsBefore(now, 30));
    const uncontacted = await tossFixture(fixtures, secondsBefore(now, 40));
    const contacted = await tossFixture(fixtures, secondsBefore(now, 50));
    const manual = await tossFixture(fixtures, secondsBefore(now, 60));
    await makeUncontacted(uncontacted, secondsBefore(now, 40));
    await makeContacted(contacted, secondsBefore(now, 50));
    await makeManualReview(manual, secondsBefore(now, 60));
    const before = await businessRows([ready, uncontacted, contacted, manual]);

    const result = await readRefundExecutionWorkerHealthBacklog(db);

    expect(result.READY.count).toBe(1);
    expect(result.UNCONTACTED.count).toBe(1);
    expect(result.CONTACTED.count).toBe(1);
    expect(result.MANUAL_REVIEW.count).toBe(1);
    expectAge(result.READY.oldestAgeSeconds, 30);
    expectAge(result.UNCONTACTED.oldestAgeSeconds, 40);
    expectAge(result.CONTACTED.oldestAgeSeconds, 50);
    expectAge(result.MANUAL_REVIEW.oldestAgeSeconds, 60);
    expect(await businessRows([ready, uncontacted, contacted, manual])).toEqual(before);
  });

  it("counts the complete READY backlog beyond six and excludes incoherent domains", async () => {
    const now = await databaseTime();
    const eligible = await Promise.all(Array.from({ length: 7 }, async (_, index) => (
      tossFixture(fixtures, secondsBefore(now, 100 + index))
    )));
    const live = await tossFixture(fixtures, secondsBefore(now, 200));
    const mock = await tossFixture(fixtures, secondsBefore(now, 200));
    const terminal = await tossFixture(fixtures, secondsBefore(now, 200));
    const nonpending = await tossFixture(fixtures, secondsBefore(now, 200));
    await db.refundAttempt.update({
      where: { id: live.refundAttemptId },
      data: { mode: PaymentMode.LIVE },
    });
    await db.refundAttempt.update({
      where: { id: mock.refundAttemptId },
      data: { provider: PaymentProvider.MOCK },
    });
    await db.refundAttempt.update({
      where: { id: terminal.refundAttemptId },
      data: { status: RefundAttemptStatus.SUCCEEDED },
    });
    await db.order.update({
      where: { id: nonpending.orderId },
      data: { status: OrderStatus.REFUNDED },
    });
    const all = [...eligible, live, mock, terminal, nonpending];
    const before = await businessRows(all);

    const result = await readRefundExecutionWorkerHealthBacklog(db);

    expect(result).toMatchObject({
      READY: { count: 7 },
      UNCONTACTED: { count: 0, oldestAgeSeconds: null },
      CONTACTED: { count: 0, oldestAgeSeconds: null },
      MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
    });
    expectAge(result.READY.oldestAgeSeconds, 106);
    expect(await businessRows(all)).toEqual(before);
  });

  it("clamps a coherent future MANUAL_REVIEW age to zero without side effects", async () => {
    const now = await databaseTime();
    const manual = await tossFixture(fixtures, secondsBefore(now, 30));
    await makeManualReview(manual, secondsAfter(now, 60));
    const before = await businessRows([manual]);
    const fetchPoison = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("HEALTH_FETCH_MUST_NOT_RUN"),
    );

    const backlog = await readRefundExecutionWorkerHealthBacklog(db);
    const result = healthSnapshot(false, "ABSENT", disabledRoutes(), backlog);

    expect(result).toEqual({
      ok: true,
      code: "HEALTH_SNAPSHOT",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
      routes: disabledRoutes(),
      backlog: {
        READY: { count: 0, oldestAgeSeconds: null },
        UNCONTACTED: { count: 0, oldestAgeSeconds: null },
        CONTACTED: { count: 0, oldestAgeSeconds: null },
        MANUAL_REVIEW: { count: 1, oldestAgeSeconds: 0 },
      },
    });
    expect(fetchPoison).not.toHaveBeenCalled();
    expect(await businessRows([manual])).toEqual(before);
  });

  it("excludes a completed command from manual review and executable backlog", async () => {
    const now = await databaseTime();
    const completed = await tossFixture(fixtures, secondsBefore(now, 30));
    await makeManualReview(completed, secondsBefore(now, 20));
    await db.refundExecutionCommand.update({
      where: { id: completed.commandId },
      data: { status: RefundExecutionCommandStatus.DONE },
    });
    const before = await businessRows([completed]);

    expect(await readRefundExecutionWorkerHealthBacklog(db)).toEqual(emptyBacklog());
    expect(await businessRows([completed])).toEqual(before);
  });

  it("independently excludes incoherent nearby MANUAL_REVIEW states", async () => {
    const now = await databaseTime();
    const wrongProvider = await manualFixture(secondsBefore(now, 50));
    const liveMode = await manualFixture(secondsBefore(now, 45));
    const wrongAttempt = await manualFixture(secondsBefore(now, 40));
    const wrongCommand = await manualFixture(secondsBefore(now, 35));
    const wrongOrder = await manualFixture(secondsBefore(now, 30));
    await db.refundAttempt.update({
      where: { id: wrongProvider.refundAttemptId },
      data: { provider: PaymentProvider.MOCK },
    });
    await db.refundAttempt.update({
      where: { id: liveMode.refundAttemptId },
      data: { mode: PaymentMode.LIVE },
    });
    await db.refundAttempt.update({
      where: { id: wrongAttempt.refundAttemptId },
      data: { status: RefundAttemptStatus.PROCESSING },
    });
    await db.refundExecutionCommand.update({
      where: { id: wrongCommand.commandId },
      data: { status: RefundExecutionCommandStatus.READY },
    });
    await db.order.update({
      where: { id: wrongOrder.orderId },
      data: { status: OrderStatus.REFUNDED },
    });
    const all = [wrongProvider, liveMode, wrongAttempt, wrongCommand, wrongOrder];
    const before = await businessRows(all);

    expect(await readRefundExecutionWorkerHealthBacklog(db)).toEqual(emptyBacklog());
    expect(await businessRows(all)).toEqual(before);
  });

  async function manualFixture(updatedAt: Date): Promise<DispatchFixture> {
    const fixture = await tossFixture(fixtures, secondsBefore(updatedAt, 30));
    await makeManualReview(fixture, updatedAt);
    return fixture;
  }
});

async function tossFixture(
  fixtures: DispatchFixture[],
  availableAt: Date,
): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture({ availableAt });
  fixtures.push(fixture);
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
  return fixture;
}

async function makeUncontacted(fixture: DispatchFixture, leaseUntil: Date): Promise<void> {
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: {
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: 0,
      leaseOwner: "health-uncontacted",
      leaseUntil,
      leaseGeneration: 1,
      leaseTokenHash: "a".repeat(64),
    },
  });
}

async function makeContacted(fixture: DispatchFixture, leaseUntil: Date): Promise<void> {
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: {
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: 1,
      leaseOwner: "health-contacted",
      leaseUntil,
      leaseGeneration: 1,
      leaseTokenHash: "b".repeat(64),
    },
  });
  await db.refundExecutionDispatchAttempt.create({
    data: {
      commandId: fixture.commandId,
      ordinal: 1,
      leaseGeneration: 1,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: `health:${fixture.commandId}`,
      requestFingerprint: "c".repeat(64),
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      authorizedAt: leaseUntil,
      contactMarkedAt: leaseUntil,
    },
  });
}

async function makeManualReview(fixture: DispatchFixture, updatedAt: Date): Promise<void> {
  await db.refundAttempt.update({
    where: { id: fixture.refundAttemptId },
    data: { status: RefundAttemptStatus.MANUAL_REVIEW },
  });
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { status: RefundExecutionCommandStatus.PARKED, updatedAt },
  });
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (rows.length !== 1 || !(rows[0]?.capturedAt instanceof Date)) {
    throw new Error("Unable to capture health fixture database time.");
  }
  return rows[0].capturedAt;
}

function secondsBefore(value: Date, seconds: number): Date {
  return new Date(value.getTime() - seconds * 1_000);
}

function secondsAfter(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1_000);
}

function expectAge(value: number | null, minimum: number): void {
  expect(value).not.toBeNull();
  expect(value).toBeGreaterThanOrEqual(minimum);
  expect(value).toBeLessThan(minimum + 15);
}

function emptyBacklog() {
  return {
    READY: { count: 0, oldestAgeSeconds: null },
    UNCONTACTED: { count: 0, oldestAgeSeconds: null },
    CONTACTED: { count: 0, oldestAgeSeconds: null },
    MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
  };
}

function disabledRoutes() {
  return {
    READY: false,
    UNCONTACTED: false,
    CONTACTED_LOOKUP: false,
    CONTACTED_RECONTACT: false,
  };
}

async function businessRows(fixtures: readonly DispatchFixture[]) {
  const commandIds = fixtures.map((fixture) => fixture.commandId);
  const attemptIds = fixtures.map((fixture) => fixture.refundAttemptId);
  const orderIds = fixtures.map((fixture) => fixture.orderId);
  return Promise.all([
    db.refundExecutionCommand.findMany({ where: { id: { in: commandIds } }, orderBy: { id: "asc" } }),
    db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: { in: commandIds } }, orderBy: [{ commandId: "asc" }, { ordinal: "asc" }],
    }),
    db.refundExecutionCommandEvent.findMany({
      where: { commandId: { in: commandIds } }, orderBy: { id: "asc" },
    }),
    db.refundAttempt.findMany({ where: { id: { in: attemptIds } }, orderBy: { id: "asc" } }),
    db.order.findMany({ where: { id: { in: orderIds } }, orderBy: { id: "asc" } }),
  ]);
}
