import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
} from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  authorizeRefundDispatch,
  type AuthorizeRefundDispatchInput,
  type AuthorizeRefundDispatchResult,
} from "../authorize-dispatch";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";
import {
  DISPATCH_NOW,
  LEASE_UNTIL,
  addOpenAttempt,
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

describe("authorizeRefundDispatch", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("leases a named READY command and returns the exact immutable provider request", async () => {
    const fixture = await trackedFixture(fixtures);
    const before = await dispatchState(fixture);
    const result = requireSuccess(await authorizeRefundDispatch(db, input(fixture.commandId, {
      commandId: `  ${fixture.commandId}  `,
      leaseOwner: "  worker-alpha  ",
    })));
    const after = await dispatchState(fixture);

    expect(result.dispatch).toMatchObject({
      commandId: fixture.commandId,
      refundAttemptId: fixture.refundAttemptId,
      dispatchAttempt: 1,
      providerRequest: {
        providerPaymentReference: fixture.providerPaymentKey,
        amount: fixture.targetAmount,
        currency: "KRW",
        operationKey: fixture.operationKey,
      },
    });
    expect(result.dispatch).not.toHaveProperty("orderId");
    expect(result.dispatch).not.toHaveProperty("leaseOwner");
    expect(result.dispatch.providerRequest.providerPaymentReference).not.toBe(fixture.providerRef);
    expect(Object.isFrozen(result.dispatch)).toBe(true);
    expect(Object.isFrozen(result.dispatch.providerRequest)).toBe(true);
    expect(result.dispatch.leaseUntil).not.toBe(LEASE_UNTIL);
    expect(after.command).toMatchObject({
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: "worker-alpha",
      leaseUntil: LEASE_UNTIL,
      dispatchAttempt: 1,
      availableAt: before.command.availableAt,
    });
    expect(after.order).toEqual(before.order);
    expect(after.payment).toEqual(before.payment);
    expect(after.attempt).toEqual(before.attempt);
    expect(after.evidence).toEqual([]);
    expect(after.transitions).toEqual(before.transitions);
  });

  it("accepts the owner bound and exact availability boundary", async () => {
    const fixture = await trackedFixture(fixtures);
    const result = await authorizeRefundDispatch(db, input(fixture.commandId, {
      leaseOwner: "😀".repeat(255),
    }));
    expect(result).toMatchObject({ ok: true, dispatch: { dispatchAttempt: 1 } });
  });

  it.each([
    ["blank command", { commandId: "  " }, "INVALID_COMMAND_ID"],
    ["blank owner", { leaseOwner: "  " }, "INVALID_LEASE_OWNER"],
    ["long owner", { leaseOwner: "😀".repeat(256) }, "INVALID_LEASE_OWNER"],
    ["invalid now", { now: new Date(Number.NaN) }, "INVALID_LEASE_DEADLINE"],
    ["unsafe date", { leaseUntil: new Date(-8.64e15) }, "INVALID_LEASE_DEADLINE"],
    ["equal deadline", { leaseUntil: DISPATCH_NOW }, "INVALID_LEASE_DEADLINE"],
    ["past deadline", { leaseUntil: new Date(DISPATCH_NOW.getTime() - 1) }, "INVALID_LEASE_DEADLINE"],
  ] as const)("rejects %s", async (_label, override, code) => {
    await expect(authorizeRefundDispatch(db, input("command", override)))
      .resolves.toMatchObject({ ok: false, code });
  });

  it("rejects extra runtime input fields", async () => {
    const candidate = input("command");
    Reflect.set(candidate, "orderId", "order_internal");
    await expect(authorizeRefundDispatch(db, candidate))
      .resolves.toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
  });

  it("returns COMMAND_NOT_FOUND only for an absent command", async () => {
    await expect(authorizeRefundDispatch(db, input("missing-command")))
      .resolves.toMatchObject({ ok: false, code: "COMMAND_NOT_FOUND" });
  });

  it("rejects future availability and non-READY state without writes", async () => {
    const future = await trackedFixture(fixtures, { availableAt: new Date(DISPATCH_NOW.getTime() + 1) });
    await expectFailureWithoutWrites(future, "COMMAND_NOT_YET_AVAILABLE");
    const leased = await trackedFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: leased.commandId },
      data: { status: RefundExecutionCommandStatus.LEASED, leaseOwner: "existing", leaseUntil: LEASE_UNTIL, dispatchAttempt: 1 },
    });
    await expectFailureWithoutWrites(leased, "COMMAND_NOT_READY");
  });

  it.each([
    ["attempt", async (fixture: DispatchFixture) => db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { status: RefundAttemptStatus.MANUAL_REVIEW },
    })],
    ["order", async (fixture: DispatchFixture) => db.order.update({
      where: { id: fixture.orderId }, data: { status: OrderStatus.PAID },
    })],
  ] as const)("rejects conflicting %s state", async (_label, corrupt) => {
    const fixture = await trackedFixture(fixtures);
    await corrupt(fixture);
    await expectFailureWithoutWrites(fixture, "COMMAND_STATE_CONFLICT");
  });

  it.each([
    ["blank provider key", async (fixture: DispatchFixture) => db.payment.update({
      where: { id: fixture.paymentId }, data: { providerPaymentKey: "   " },
    })],
    ["payment status", async (fixture: DispatchFixture) => db.payment.update({
      where: { id: fixture.paymentId }, data: { status: PaymentAttemptStatus.FAILED },
    })],
    ["payment amount", async (fixture: DispatchFixture) => db.payment.update({
      where: { id: fixture.paymentId }, data: { amount: fixture.totalAmount + 1 },
    })],
    ["attempt currency", async (fixture: DispatchFixture) => db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { currency: "USD" },
    })],
    ["attempt provider", async (fixture: DispatchFixture) => db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { provider: PaymentProvider.PAYPAL },
    })],
    ["attempt mode", async (fixture: DispatchFixture) => db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { mode: PaymentMode.LIVE },
    })],
    ["provider refund identity", async (fixture: DispatchFixture) => db.refundAttempt.update({
      where: { id: fixture.refundAttemptId }, data: { providerRefundId: `provider_refund_${fixture.refundAttemptId}` },
    })],
    ["claim artifact", async (fixture: DispatchFixture) => db.refundAttemptTransition.updateMany({
      where: { refundAttemptId: fixture.refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
      data: { reason: "Corrupt claim reason" },
    })],
    ["multiple open targets", async (fixture: DispatchFixture) => addOpenAttempt(fixture)],
  ] as const)("fails closed for %s corruption", async (_label, corrupt) => {
    const fixture = await trackedFixture(fixtures);
    await corrupt(fixture);
    await expectFailureWithoutWrites(fixture, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects exhausted PostgreSQL ordinal before increment", async () => {
    const fixture = await trackedFixture(fixtures);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId }, data: { dispatchAttempt: 2_147_483_647 },
    });
    await expectFailureWithoutWrites(fixture, "DISPATCH_ATTEMPT_EXHAUSTED");
  });

  it("serializes concurrent contenders into one lease and one COMMAND_NOT_READY", async () => {
    const fixture = await trackedFixture(fixtures);
    const firstSession = createNamedDbSession("dispatch_first");
    const secondSession = createNamedDbSession("dispatch_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => authorizeRefundDispatch(firstSession.client, input(fixture.commandId, { leaseOwner: "worker-first" })),
        secondSession,
        () => authorizeRefundDispatch(secondSession.client, input(fixture.commandId, { leaseOwner: "worker-second" })),
      );
      const [first, second] = await Promise.all([queued.first, queued.second]);
      expect(first).toMatchObject({ ok: true, dispatch: { dispatchAttempt: 1 } });
      expect(second).toMatchObject({ ok: false, code: "COMMAND_NOT_READY" });
      expect(queued.firstWait.blockingPids).toContain(queued.holderPid);
      expect(queued.secondWait.blockingPids).toContain(queued.firstWait.pid);
      const state = await dispatchState(fixture);
      expect(state.command).toMatchObject({ leaseOwner: "worker-first", dispatchAttempt: 1 });
      expect(state.evidence).toEqual([]);
      expect(state.transitions).toHaveLength(2);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });
});

function input(
  commandId: string,
  override: Partial<AuthorizeRefundDispatchInput> = {},
): AuthorizeRefundDispatchInput {
  return { commandId, leaseOwner: "worker-1", leaseUntil: LEASE_UNTIL, now: DISPATCH_NOW, ...override };
}

function requireSuccess(
  result: AuthorizeRefundDispatchResult,
): Extract<AuthorizeRefundDispatchResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected dispatch authorization, received ${result.code}.`);
  return result;
}

async function trackedFixture(
  fixtures: DispatchFixture[],
  options: Parameters<typeof createDispatchFixture>[0] = {},
): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function expectFailureWithoutWrites(fixture: DispatchFixture, code: string): Promise<void> {
  const before = await dispatchState(fixture);
  const result = await authorizeRefundDispatch(db, input(fixture.commandId));
  expect(result).toMatchObject({ ok: false, code });
  await expect(dispatchState(fixture)).resolves.toEqual(before);
}
