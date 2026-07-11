import { randomUUID } from "crypto";
import {
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  loadRefundExecutionWorklist,
  type RefundExecutionWorklistInput,
} from "../admin/execution-worklist";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  DISPATCH_NOW,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const READ_TIME = new Date("2026-07-11T08:00:00.000Z");
const FUTURE_CREATED_AT = new Date("2099-01-01T00:00:00.000Z");

describe("admin refund execution worklist", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it.each([
    [{ status: "INVALID" }, "INVALID_STATUS"],
    [{ leaseState: "expired" }, "INVALID_LEASE_STATE"],
    [{ status: "READY", leaseState: "active" }, "INCOMPATIBLE_FILTERS"],
    [{ orderId: "   " }, "INVALID_ORDER_ID"],
    [{ orderId: "x".repeat(129) }, "INVALID_ORDER_ID"],
    [{ pageSize: 0 }, "INVALID_PAGE_SIZE"],
    [{ pageSize: 51 }, "INVALID_PAGE_SIZE"],
    [{ pageSize: "1.5" }, "INVALID_PAGE_SIZE"],
    [{ cursor: "not+base64url" }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 2, createdAt: READ_TIME.toISOString(), id: "command_1" }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, createdAt: READ_TIME.toISOString(), id: "command_1", extra: true }) }, "INVALID_CURSOR"],
    [{ readTime: new Date(Number.NaN) }, "INVALID_READ_TIME"],
  ])("rejects invalid input before querying: %#", async (override, code) => {
    const query = vi.spyOn(db.refundExecutionCommand, "findMany");

    await expect(loadRefundExecutionWorklist(input(override))).rejects.toMatchObject({ code });

    expect(query).not.toHaveBeenCalled();
  });

  it("defaults to every non-DONE status and supports all six exact status filters", async () => {
    const statuses = Object.values(RefundExecutionCommandStatus);
    const created = await Promise.all(statuses.map((status, index) => createFixture(status, {
      createdAt: new Date(FUTURE_CREATED_AT.getTime() + index * 1_000),
    })));

    const defaults = await loadRefundExecutionWorklist(input({ pageSize: 50 }));
    const defaultOrderIds = new Set(defaults.rows.map((row) => row.orderId));

    for (const fixture of created) {
      const status = await commandStatus(fixture.commandId);
      expect(defaultOrderIds.has(fixture.orderId)).toBe(status !== RefundExecutionCommandStatus.DONE);
      const filtered = await loadRefundExecutionWorklist(input({ status, pageSize: 50 }));
      expect(filtered.rows.some((row) => row.orderId === fixture.orderId && row.commandStatus === status)).toBe(true);
    }
  });

  it("widens an exact Order lookup to all statuses and combines it with an explicit status", async () => {
    const fixture = await createFixture(RefundExecutionCommandStatus.READY);
    const done = await createSiblingCommand(fixture, RefundExecutionCommandStatus.DONE);

    const allForOrder = await loadRefundExecutionWorklist(input({ orderId: `  ${fixture.orderId}  ` }));
    const doneForOrder = await loadRefundExecutionWorklist(input({
      orderId: fixture.orderId,
      status: RefundExecutionCommandStatus.DONE,
    }));
    const missing = await loadRefundExecutionWorklist(input({ orderId: `missing_${randomUUID()}` }));

    expect(allForOrder.rows.map((row) => row.rowKey).sort()).toEqual([fixture.commandId, done.commandId].sort());
    expect(doneForOrder.rows.map((row) => row.rowKey)).toEqual([done.commandId]);
    expect(missing.rows).toEqual([]);
  });

  it("derives active and passed lease filters from one read time, including equality", async () => {
    const fixture = await createFixture(RefundExecutionCommandStatus.LEASED, {
      leaseUntil: new Date(READ_TIME.getTime() + 1),
    });
    const before = await createSiblingCommand(fixture, RefundExecutionCommandStatus.LEASED, {
      leaseUntil: new Date(READ_TIME.getTime() - 1),
    });
    const equal = await createSiblingCommand(fixture, RefundExecutionCommandStatus.LEASED, {
      leaseUntil: READ_TIME,
    });
    await createSiblingCommand(fixture, RefundExecutionCommandStatus.READY);

    const active = await loadRefundExecutionWorklist(input({ orderId: fixture.orderId, leaseState: "active" }));
    const passed = await loadRefundExecutionWorklist(input({ orderId: fixture.orderId, leaseState: "deadline-passed" }));

    expect(active.rows.map((row) => row.rowKey)).toEqual([fixture.commandId]);
    expect(active.rows[0].leaseDeadlinePassed).toBe(false);
    expect(new Set(passed.rows.map((row) => row.rowKey))).toEqual(new Set([before.commandId, equal.commandId]));
    expect(passed.rows.every((row) => row.commandStatus === RefundExecutionCommandStatus.LEASED)).toBe(true);
    expect(passed.rows.every((row) => row.leaseDeadlinePassed)).toBe(true);
  });

  it("orders by immutable values and paginates without duplicates using filter-preserving cursors", async () => {
    const fixture = await createFixture(RefundExecutionCommandStatus.LEASED, {
      createdAt: FUTURE_CREATED_AT,
      leaseUntil: new Date(READ_TIME.getTime() + 60_000),
    });
    await createSiblingCommand(fixture, RefundExecutionCommandStatus.LEASED, {
      createdAt: FUTURE_CREATED_AT,
      leaseUntil: new Date(READ_TIME.getTime() + 60_000),
    });
    await createSiblingCommand(fixture, RefundExecutionCommandStatus.LEASED, {
      createdAt: new Date(FUTURE_CREATED_AT.getTime() - 1_000),
      leaseUntil: new Date(READ_TIME.getTime() + 60_000),
    });
    const filter = {
      orderId: fixture.orderId,
      status: RefundExecutionCommandStatus.LEASED,
      leaseState: "active",
      pageSize: 1,
    } as const;

    const first = await loadRefundExecutionWorklist(input(filter));
    const second = await loadRefundExecutionWorklist(input({ ...filter, cursor: first.nextCursor }));
    const third = await loadRefundExecutionWorklist(input({ ...filter, cursor: second.nextCursor }));
    const ids = [...first.rows, ...second.rows, ...third.rows].map((row) => row.rowKey);

    expect(new Set(ids).size).toBe(3);
    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
    const records = await db.refundExecutionCommand.findMany({
      where: { id: { in: ids } },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(ids).toEqual(records.map((record) => record.id));
  });

  it("returns only the approved safe row projection despite private sentinel data", async () => {
    const fixture = await createFixture(RefundExecutionCommandStatus.LEASED);
    const providerRefundId = `private_provider_refund_${randomUUID()}`;
    const leaseOwner = `private_lease_owner_${randomUUID()}`;
    const sourceDedupKey = `private_source_dedup_${randomUUID()}`;
    const transitionOperationKey = `private_transition_operation_${randomUUID()}`;
    await Promise.all([
      db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { providerRefundId },
      }),
      db.refundExecutionCommand.update({
        where: { id: fixture.commandId },
        data: { leaseOwner },
      }),
      db.refundAttemptTransition.updateMany({
        where: { refundAttemptId: fixture.refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
        data: { operationKey: transitionOperationKey },
      }),
      db.refundExecutionEvidence.create({
        data: {
          commandId: fixture.commandId,
          source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
          sourceDedupKey,
          outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
          application: RefundExecutionEvidenceApplication.PARKED,
          observedAt: READ_TIME,
        },
      }),
    ]);

    const result = await loadRefundExecutionWorklist(input({ orderId: fixture.orderId }));
    const serialized = JSON.stringify(result);

    expect(result.rows).toHaveLength(1);
    for (const secret of [
      fixture.providerPaymentKey,
      fixture.providerRef,
      fixture.paymentId,
      fixture.operationKey,
      providerRefundId,
      leaseOwner,
      sourceDedupKey,
      transitionOperationKey,
    ]) {
      expect(serialized).not.toContain(secret);
    }
    for (const forbiddenKey of [
      "providerPaymentKey",
      "providerRef",
      "providerRefundId",
      "idempotencyKey",
      "leaseOwner",
      "sourceDedupKey",
      "operationKey",
      "paymentId",
      "reason",
    ]) {
      expect(serialized).not.toContain(forbiddenKey);
    }
  });

  it("does not mutate the refund aggregate or execution evidence", async () => {
    const fixture = await createFixture(RefundExecutionCommandStatus.PARKED);
    const before = await aggregateSnapshot(fixture);

    await loadRefundExecutionWorklist(input({ orderId: fixture.orderId }));

    expect(await aggregateSnapshot(fixture)).toEqual(before);
  });

  async function createFixture(
    status: RefundExecutionCommandStatus,
    options: { createdAt?: Date; leaseUntil?: Date } = {},
  ): Promise<DispatchFixture> {
    const fixture = await createDispatchFixture();
    fixtures.push(fixture);
    await setCommandState(fixture.commandId, fixture.refundAttemptId, status, options);
    return fixture;
  }
});

function input(overrides: Partial<RefundExecutionWorklistInput> = {}): RefundExecutionWorklistInput {
  return { readTime: READ_TIME, ...overrides };
}

async function setCommandState(
  commandId: string,
  refundAttemptId: string,
  status: RefundExecutionCommandStatus,
  options: { createdAt?: Date; leaseUntil?: Date } = {},
): Promise<void> {
  const attemptStatus = attemptStatusForCommand(status);
  await db.refundAttempt.update({ where: { id: refundAttemptId }, data: { status: attemptStatus } });
  await db.refundExecutionCommand.update({
    where: { id: commandId },
    data: {
      status,
      leaseOwner: status === RefundExecutionCommandStatus.LEASED ? `worklist_worker_${randomUUID()}` : null,
      leaseUntil: status === RefundExecutionCommandStatus.LEASED
        ? options.leaseUntil ?? new Date(READ_TIME.getTime() + 60_000)
        : null,
      dispatchAttempt: status === RefundExecutionCommandStatus.READY ? 0 : 1,
      createdAt: options.createdAt ?? DISPATCH_NOW,
      updatedAt: options.createdAt ?? DISPATCH_NOW,
    },
  });
}

async function createSiblingCommand(
  fixture: DispatchFixture,
  status: RefundExecutionCommandStatus,
  options: { createdAt?: Date; leaseUntil?: Date } = {},
) {
  const identity = randomUUID();
  const refundAttempt = await db.refundAttempt.create({
    data: {
      id: `worklist_refund_${identity}`,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 1,
      currency: "KRW",
      status: attemptStatusForCommand(status),
      reason: "Worklist test sibling",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: "MOCK",
      mode: "SANDBOX",
      idempotencyKey: `worklist_refund_idem_${identity}`,
      requestedAt: DISPATCH_NOW,
    },
  });
  const command = await db.refundExecutionCommand.create({
    data: {
      id: `worklist_command_${identity}`,
      refundAttemptId: refundAttempt.id,
      status,
      availableAt: DISPATCH_NOW,
      leaseOwner: status === RefundExecutionCommandStatus.LEASED ? `worklist_worker_${identity}` : null,
      leaseUntil: status === RefundExecutionCommandStatus.LEASED
        ? options.leaseUntil ?? new Date(READ_TIME.getTime() + 60_000)
        : null,
      dispatchAttempt: status === RefundExecutionCommandStatus.READY ? 0 : 1,
      createdAt: options.createdAt ?? DISPATCH_NOW,
      updatedAt: options.createdAt ?? DISPATCH_NOW,
    },
  });
  return { refundAttemptId: refundAttempt.id, commandId: command.id };
}

function attemptStatusForCommand(status: RefundExecutionCommandStatus): RefundAttemptStatus {
  if (status === RefundExecutionCommandStatus.WAITING_RETRY || status === RefundExecutionCommandStatus.PARKED) {
    return RefundAttemptStatus.FAILED_RETRYABLE;
  }
  if (status === RefundExecutionCommandStatus.DONE) return RefundAttemptStatus.SUCCEEDED;
  return RefundAttemptStatus.PROCESSING;
}

async function commandStatus(commandId: string): Promise<RefundExecutionCommandStatus> {
  const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: commandId }, select: { status: true } });
  return command.status;
}

function encodedCursor(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function aggregateSnapshot(fixture: DispatchFixture) {
  return Promise.all([
    db.order.findUnique({ where: { id: fixture.orderId } }),
    db.payment.findUnique({ where: { id: fixture.paymentId } }),
    db.refundAttempt.findMany({ where: { orderId: fixture.orderId }, orderBy: { id: "asc" } }),
    db.refundExecutionCommand.findMany({
      where: { refundAttempt: { orderId: fixture.orderId } },
      orderBy: { id: "asc" },
    }),
    db.refundExecutionEvidence.findMany({
      where: { command: { refundAttempt: { orderId: fixture.orderId } } },
      orderBy: { id: "asc" },
    }),
    db.refundAttemptTransition.findMany({ where: { refundAttempt: { orderId: fixture.orderId } }, orderBy: { id: "asc" } }),
  ]);
}
