import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  submitCustomerRefundIntake,
  withdrawCustomerRefundIntake,
  type SubmitCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeResult,
  type WithdrawCustomerRefundIntakeResult,
} from "../customer-intake";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-14T11:00:00.000Z");
const WITHDRAWN_AT = new Date("2026-07-14T11:05:00.000Z");
const REVIEWED_AT = new Date("2026-07-14T11:10:00.000Z");

interface TestContext {
  ownerUserId: string;
  otherUserId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
}

interface CreateOrderOptions {
  userId?: string;
  status?: OrderStatus;
}

type CustomerIntakeClient = Parameters<typeof submitCustomerRefundIntake>[0];

describe("CustomerRefundIntake customer core", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const identity = randomUUID();
    ctx = {
      ownerUserId: `customer_intake_owner_${identity}`,
      otherUserId: `customer_intake_other_${identity}`,
      orderIds: [],
      paymentIds: [],
      sessionIds: [],
    };
    await ensureMarket();
    await Promise.all([
      db.user.create({ data: { id: ctx.ownerUserId, email: `${ctx.ownerUserId}@example.test` } }),
      db.user.create({ data: { id: ctx.otherUserId, email: `${ctx.otherUserId}@example.test` } }),
    ]);
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  describe("submit", () => {
    it("creates SUBMITTED for both eligible states and every reason code", async () => {
      const cases = [
        [OrderStatus.PAID, CustomerRefundIntakeReasonCode.CHANGE_OF_MIND],
        [OrderStatus.PARTIALLY_REFUNDED, CustomerRefundIntakeReasonCode.PRODUCT_DEFECT],
        [OrderStatus.PAID, CustomerRefundIntakeReasonCode.DELIVERY_ISSUE],
        [OrderStatus.PARTIALLY_REFUNDED, CustomerRefundIntakeReasonCode.OTHER],
      ] as const;

      for (const [status, reasonCode] of cases) {
        const fixture = await createOrder(ctx, { status });
        const operationTime = new Date(NOW);
        const result = submitSuccess(await submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
          reasonCode,
          reasonDetail: "  first\r\nsecond 👩\u200D🔬  ",
          now: operationTime,
        })));
        operationTime.setUTCFullYear(2030);

        const stored = await db.customerRefundIntake.findFirstOrThrow({ where: { orderId: fixture.orderId } });
        expect(result).toEqual({
          ok: true,
          replayed: false,
          intake: {
            orderId: fixture.orderId,
            status: CustomerRefundIntakeStatus.SUBMITTED,
            reasonCode,
            reasonDetail: "first\nsecond 👩\u200D🔬",
            submittedAt: NOW,
          },
        });
        expect(Object.keys(result.intake).sort()).toEqual([
          "orderId",
          "reasonCode",
          "reasonDetail",
          "status",
          "submittedAt",
        ]);
        expect(stored).toMatchObject({
          orderId: fixture.orderId,
          customerUserId: ctx.ownerUserId,
          status: CustomerRefundIntakeStatus.SUBMITTED,
          reasonCode,
          reasonDetail: "first\nsecond 👩\u200D🔬",
          submittedAt: NOW,
          withdrawnAt: null,
          reviewedAt: null,
          reviewedByUserId: null,
          adminRejectionReason: null,
          approvedRefundAttemptId: null,
        });
        await expect(orderStatus(fixture.orderId)).resolves.toBe(status);
      }
    });

    it("collapses missing and non-owned Orders and creates no intake", async () => {
      const otherOrder = await createOrder(ctx, { userId: ctx.otherUserId });

      for (const orderId of ["missing-order", otherOrder.orderId]) {
        await expect(submitCustomerRefundIntake(db, submitInput(ctx, { ...otherOrder, orderId })))
          .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND_OR_NOT_OWNED" });
      }
      await expect(db.customerRefundIntake.count({ where: { orderId: otherOrder.orderId } })).resolves.toBe(0);
    });

    it.each([OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED, OrderStatus.CANCELLED])(
      "rejects ineligible Order status %s without writing",
      async (status) => {
        const fixture = await createOrder(ctx, { status });
        const before = await financialSnapshot(fixture);

        await expect(submitCustomerRefundIntake(db, submitInput(ctx, fixture)))
          .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_ELIGIBLE" });

        await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(0);
        await expect(financialSnapshot(fixture)).resolves.toEqual(before);
      },
    );

    it("rejects invalid normalized input before any database write", async () => {
      const fixture = await createOrder(ctx);

      await expect(submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
        reasonDetail: "internal\ttab",
      }))).resolves.toMatchObject({ ok: false, code: "REASON_DETAIL_CONTROL_CHARACTER" });
      await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(0);
    });

    it("replays the stored payload before current eligibility and never overwrites it", async () => {
      const fixture = await createOrder(ctx);
      const first = submitSuccess(await submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
        reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
        reasonDetail: "stored detail",
      })));
      await db.order.update({ where: { id: fixture.orderId }, data: { status: OrderStatus.REFUND_PENDING } });

      const identical = submitSuccess(await submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
        reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
        reasonDetail: "stored detail",
      })));
      const changed = submitSuccess(await submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
        reasonCode: CustomerRefundIntakeReasonCode.OTHER,
        reasonDetail: "replacement must not be stored",
      })));

      expect(identical).toEqual({ ...first, replayed: true });
      expect(changed).toEqual({ ...first, replayed: true });
      await expect(db.customerRefundIntake.findMany({ where: { orderId: fixture.orderId } }))
        .resolves.toMatchObject([{ reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT, reasonDetail: "stored detail" }]);
    });

    it("allows resubmission after WITHDRAWN, REJECTED, and eligible APPROVED history", async () => {
      const withdrawnOrder = await createOrder(ctx);
      await seedIntake(ctx, withdrawnOrder, {
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: WITHDRAWN_AT,
      });
      const rejectedOrder = await createOrder(ctx);
      await seedIntake(ctx, rejectedOrder, {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: REVIEWED_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
      });
      const approvedOrder = await createOrder(ctx);
      const approvedAttemptId = await seedRefundAttempt(approvedOrder);
      await seedIntake(ctx, approvedOrder, {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: REVIEWED_AT,
        reviewedByUserId: "admin-reviewer",
        approvedRefundAttemptId: approvedAttemptId,
      });

      for (const fixture of [withdrawnOrder, rejectedOrder, approvedOrder]) {
        const result = submitSuccess(await submitCustomerRefundIntake(db, submitInput(ctx, fixture)));
        expect(result.replayed).toBe(false);
        await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(2);
      }
    });

    it("rejects new submission after APPROVED history when current Order is ineligible", async () => {
      const fixture = await createOrder(ctx, { status: OrderStatus.REFUNDED });
      const attemptId = await seedRefundAttempt(fixture);
      await seedIntake(ctx, fixture, {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: REVIEWED_AT,
        reviewedByUserId: "admin-reviewer",
        approvedRefundAttemptId: attemptId,
      });

      await expect(submitCustomerRefundIntake(db, submitInput(ctx, fixture)))
        .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_ELIGIBLE" });
      await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(1);
    });

    it("fails closed for an open intake owned by a historical customer", async () => {
      const fixture = await createOrder(ctx);
      await seedIntake(ctx, fixture, {
        customerUserId: ctx.otherUserId,
        reasonDetail: "foreign private detail",
      });

      const result = await submitCustomerRefundIntake(db, submitInput(ctx, fixture));

      expect(result).toEqual({
        ok: false,
        code: "INTAKE_INCONSISTENT",
        message: "Customer refund intake ownership is inconsistent.",
      });
      expect(JSON.stringify(result)).not.toContain("foreign private detail");
    });
  });

  describe("submit concurrency and P2002 classification", () => {
    it("serializes two cooperating submits and returns one creation plus one replay", async () => {
      const fixture = await createOrder(ctx);
      const firstSession = createNamedDbSession("customer_intake_submit_first");
      const secondSession = createNamedDbSession("customer_intake_submit_second");
      try {
        const race = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          submitCustomerRefundIntake.bind(null, firstSession.client, submitInput(ctx, fixture)),
          secondSession,
          submitCustomerRefundIntake.bind(null, secondSession.client, submitInput(ctx, fixture, {
            reasonCode: CustomerRefundIntakeReasonCode.OTHER,
            reasonDetail: "changed concurrent payload",
          })),
        );
        const [first, second] = await Promise.all([race.first, race.second]);
        const firstSuccess = submitSuccess(first);
        const secondSuccess = submitSuccess(second);

        expect(firstSuccess.replayed).toBe(false);
        expect(secondSuccess).toEqual({ ...firstSuccess, replayed: true });
        expect(race.firstWait.query).toContain('FROM "Order"');
        expect(race.secondWait.query).toContain('FROM "Order"');
        await expect(db.customerRefundIntake.count({
          where: { orderId: fixture.orderId, status: CustomerRefundIntakeStatus.SUBMITTED },
        })).resolves.toBe(1);
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("classifies a real partial-index P2002 as replay in a fresh Order-locking transaction", async () => {
      const fixture = await createOrder(ctx);
      const collision = await seedOpenAndCaptureP2002(ctx, fixture, ctx.ownerUserId);
      const firstSession = createNamedDbSession("customer_intake_p2002_classifier");
      const secondSession = createNamedDbSession("customer_intake_p2002_follower");
      const injected = failFirstTransaction(firstSession.client, collision.error);
      try {
        const race = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          submitCustomerRefundIntake.bind(null, injected.client, submitInput(ctx, fixture)),
          secondSession,
          submitCustomerRefundIntake.bind(null, secondSession.client, submitInput(ctx, fixture)),
        );
        const [classified, follower] = await Promise.all([race.first, race.second]);

        expect(submitSuccess(classified)).toMatchObject({ replayed: true, intake: { orderId: fixture.orderId } });
        expect(submitSuccess(follower)).toEqual(submitSuccess(classified));
        expect(injected.calls()).toBe(2);
        expect(race.firstWait.query).toContain('"userId"');
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("classifies ownership change and foreign provenance after P2002 without disclosure", async () => {
      const ownershipFixture = await createOrder(ctx);
      const ownershipCollision = await seedOpenAndCaptureP2002(ctx, ownershipFixture, ctx.ownerUserId);
      const ownershipClient = failFirstTransaction(
        db,
        ownershipCollision.error,
        changeOrderOwner.bind(null, ownershipFixture.orderId, ctx.otherUserId),
      );
      await expect(submitCustomerRefundIntake(ownershipClient.client, submitInput(ctx, ownershipFixture)))
        .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND_OR_NOT_OWNED" });

      const foreignFixture = await createOrder(ctx);
      const foreignCollision = await seedOpenAndCaptureP2002(ctx, foreignFixture, ctx.otherUserId, "private foreign reason");
      const foreignClient = failFirstTransaction(db, foreignCollision.error);
      const foreignResult = await submitCustomerRefundIntake(foreignClient.client, submitInput(ctx, foreignFixture));

      expect(foreignResult).toMatchObject({ ok: false, code: "INTAKE_INCONSISTENT" });
      expect(JSON.stringify(foreignResult)).not.toContain("private foreign reason");
    });

    it("rethrows the exact unexplained P2002 object when no coherent open row exists", async () => {
      const fixture = await createOrder(ctx);
      const collision = await seedOpenAndCaptureP2002(ctx, fixture, ctx.ownerUserId);
      await db.customerRefundIntake.delete({ where: { id: collision.openId } });
      const injected = failFirstTransaction(db, collision.error);

      try {
        await submitCustomerRefundIntake(injected.client, submitInput(ctx, fixture));
      } catch (error) {
        expect(error).toBe(collision.error);
        return;
      }
      throw new Error("Expected the original unexplained P2002 object to be rethrown.");
    });
  });

  describe("withdraw", () => {
    it("transitions the current open intake and replays the latest WITHDRAWN row", async () => {
      const fixture = await createOrder(ctx);
      await submitCustomerRefundIntake(db, submitInput(ctx, fixture));
      const operationTime = new Date(WITHDRAWN_AT);

      const first = withdrawSuccess(await withdrawCustomerRefundIntake(db, {
        orderId: fixture.orderId,
        customerUserId: ctx.ownerUserId,
        now: operationTime,
      }));
      operationTime.setUTCFullYear(2030);
      const replay = withdrawSuccess(await withdrawCustomerRefundIntake(db, {
        orderId: fixture.orderId,
        customerUserId: ctx.ownerUserId,
        now: new Date("2026-07-14T12:00:00.000Z"),
      }));

      expect(first).toEqual({
        ok: true,
        replayed: false,
        intake: {
          orderId: fixture.orderId,
          status: CustomerRefundIntakeStatus.WITHDRAWN,
          withdrawnAt: WITHDRAWN_AT,
        },
      });
      expect(replay).toEqual({ ...first, replayed: true });
      expect(Object.keys(first.intake).sort()).toEqual(["orderId", "status", "withdrawnAt"]);
      await expect(db.customerRefundIntake.findFirstOrThrow({ where: { orderId: fixture.orderId } }))
        .resolves.toMatchObject({ status: CustomerRefundIntakeStatus.WITHDRAWN, withdrawnAt: WITHDRAWN_AT });
    });

    it("returns NOT_WITHDRAWABLE for the latest APPROVED or REJECTED intake without mutation", async () => {
      const approved = await createOrder(ctx);
      const attemptId = await seedRefundAttempt(approved);
      await seedIntake(ctx, approved, {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: REVIEWED_AT,
        reviewedByUserId: "admin-reviewer",
        approvedRefundAttemptId: attemptId,
      });
      const rejected = await createOrder(ctx);
      await seedIntake(ctx, rejected, {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: REVIEWED_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
      });

      for (const fixture of [approved, rejected]) {
        const before = await db.customerRefundIntake.findFirstOrThrow({ where: { orderId: fixture.orderId } });
        await expect(withdrawCustomerRefundIntake(db, withdrawInput(ctx, fixture)))
          .resolves.toMatchObject({ ok: false, code: "NOT_WITHDRAWABLE" });
        await expect(db.customerRefundIntake.findFirstOrThrow({ where: { orderId: fixture.orderId } }))
          .resolves.toEqual(before);
      }
    });

    it("collapses absent, wrong-owner, and foreign-open intake cases", async () => {
      const empty = await createOrder(ctx);
      await expect(withdrawCustomerRefundIntake(db, withdrawInput(ctx, empty)))
        .resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND_OR_NOT_OWNED" });
      await expect(withdrawCustomerRefundIntake(db, {
        ...withdrawInput(ctx, empty),
        customerUserId: ctx.otherUserId,
      })).resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND_OR_NOT_OWNED" });

      const foreign = await createOrder(ctx);
      const row = await seedIntake(ctx, foreign, { customerUserId: ctx.otherUserId });
      await expect(withdrawCustomerRefundIntake(db, withdrawInput(ctx, foreign)))
        .resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND_OR_NOT_OWNED" });
      await expect(db.customerRefundIntake.findUniqueOrThrow({ where: { id: row.id } }))
        .resolves.toMatchObject({ status: CustomerRefundIntakeStatus.SUBMITTED });
    });

    it("serializes double withdrawal into one mutation and one replay", async () => {
      const fixture = await createOrder(ctx);
      await submitCustomerRefundIntake(db, submitInput(ctx, fixture));
      const firstSession = createNamedDbSession("customer_intake_withdraw_first");
      const secondSession = createNamedDbSession("customer_intake_withdraw_second");
      try {
        const race = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          withdrawCustomerRefundIntake.bind(null, firstSession.client, withdrawInput(ctx, fixture)),
          secondSession,
          withdrawCustomerRefundIntake.bind(null, secondSession.client, withdrawInput(ctx, fixture)),
        );
        const [first, second] = await Promise.all([race.first, race.second]);

        expect(withdrawSuccess(first).replayed).toBe(false);
        expect(withdrawSuccess(second)).toEqual({ ...withdrawSuccess(first), replayed: true });
        await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(1);
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("serializes withdrawal before resubmission through the Order lock", async () => {
      const fixture = await createOrder(ctx);
      await submitCustomerRefundIntake(db, submitInput(ctx, fixture));
      const withdrawSession = createNamedDbSession("customer_intake_withdraw_submit_withdraw");
      const submitSession = createNamedDbSession("customer_intake_withdraw_submit_submit");
      try {
        const race = await queueBehindObservedOrderLock(
          fixture.orderId,
          withdrawSession,
          withdrawCustomerRefundIntake.bind(null, withdrawSession.client, withdrawInput(ctx, fixture)),
          submitSession,
          submitCustomerRefundIntake.bind(null, submitSession.client, submitInput(ctx, fixture, {
            reasonCode: CustomerRefundIntakeReasonCode.OTHER,
            reasonDetail: "replacement generation",
          })),
        );
        const [withdrawn, submitted] = await Promise.all([race.first, race.second]);

        expect(withdrawSuccess(withdrawn).replayed).toBe(false);
        expect(submitSuccess(submitted)).toMatchObject({
          replayed: false,
          intake: { reasonCode: CustomerRefundIntakeReasonCode.OTHER, reasonDetail: "replacement generation" },
        });
        await expect(db.customerRefundIntake.count({ where: { orderId: fixture.orderId } })).resolves.toBe(2);
        await expect(db.customerRefundIntake.count({
          where: { orderId: fixture.orderId, status: CustomerRefundIntakeStatus.SUBMITTED },
        })).resolves.toBe(1);
      } finally {
        await disconnectSessions(withdrawSession, submitSession);
      }
    });

    it("documents that an old order-scoped retry can withdraw the current replacement generation", async () => {
      const fixture = await createOrder(ctx);
      await submitCustomerRefundIntake(db, submitInput(ctx, fixture, { reasonDetail: "generation A" }));
      await withdrawCustomerRefundIntake(db, withdrawInput(ctx, fixture));
      await submitCustomerRefundIntake(db, submitInput(ctx, fixture, {
        reasonDetail: "generation B",
        now: new Date(NOW.getTime() + 60_000),
      }));

      // V1 deliberately has no intake id or transport token. This old retry therefore targets
      // the current SUBMITTED row, not the historical generation that produced the request.
      const staleRetry = withdrawSuccess(await withdrawCustomerRefundIntake(db, withdrawInput(ctx, fixture)));

      expect(staleRetry.replayed).toBe(false);
      await expect(db.customerRefundIntake.findMany({
        where: { orderId: fixture.orderId },
        orderBy: { submittedAt: "asc" },
        select: { status: true, reasonDetail: true },
      })).resolves.toEqual([
        { status: CustomerRefundIntakeStatus.WITHDRAWN, reasonDetail: "generation A" },
        { status: CustomerRefundIntakeStatus.WITHDRAWN, reasonDetail: "generation B" },
      ]);
    });
  });

  it("preserves all financial and execution state across submit and withdraw", async () => {
    const fixture = await createOrder(ctx);
    const before = await financialSnapshot(fixture);

    await submitCustomerRefundIntake(db, submitInput(ctx, fixture));
    await expect(financialSnapshot(fixture)).resolves.toEqual(before);
    await withdrawCustomerRefundIntake(db, withdrawInput(ctx, fixture));
    await expect(financialSnapshot(fixture)).resolves.toEqual(before);
  });
});

function submitInput(
  context: TestContext,
  fixture: OrderFixture,
  override: Partial<SubmitCustomerRefundIntakeInput> = {},
): SubmitCustomerRefundIntakeInput {
  return {
    orderId: fixture.orderId,
    customerUserId: context.ownerUserId,
    reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
    reasonDetail: null,
    now: new Date(NOW),
    ...override,
  };
}

function withdrawInput(context: TestContext, fixture: OrderFixture) {
  return {
    orderId: fixture.orderId,
    customerUserId: context.ownerUserId,
    now: new Date(WITHDRAWN_AT),
  };
}

function submitSuccess(
  result: SubmitCustomerRefundIntakeResult,
): Extract<SubmitCustomerRefundIntakeResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected submit success, received ${result.code}.`);
  return result;
}

function withdrawSuccess(
  result: WithdrawCustomerRefundIntakeResult,
): Extract<WithdrawCustomerRefundIntakeResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected withdrawal success, received ${result.code}.`);
  return result;
}

async function createOrder(
  context: TestContext,
  options: CreateOrderOptions = {},
): Promise<OrderFixture> {
  const identity = randomUUID();
  const userId = options.userId ?? context.ownerUserId;
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  context.sessionIds.push(session.id);
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `customer_intake_provider_${identity}`,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
      idempotencyKey: `customer_intake_payment_${identity}`,
    },
  });
  context.paymentIds.push(payment.id);
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      status: options.status ?? OrderStatus.PAID,
      paidAt: NOW,
    },
  });
  context.orderIds.push(order.id);
  return { orderId: order.id, paymentId: payment.id, sessionId: session.id };
}

async function seedIntake(
  context: TestContext,
  fixture: OrderFixture,
  override: Partial<Prisma.CustomerRefundIntakeUncheckedCreateInput> = {},
) {
  return db.customerRefundIntake.create({
    data: {
      id: `customer_intake_${randomUUID()}`,
      orderId: fixture.orderId,
      customerUserId: context.ownerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
      reasonDetail: null,
      submittedAt: NOW,
      ...override,
    },
  });
}

async function seedRefundAttempt(fixture: OrderFixture): Promise<string> {
  const id = `customer_intake_attempt_${randomUUID()}`;
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 500,
      currency: "KRW",
      status: RefundAttemptStatus.FAILED_TERMINAL,
      reason: "Historical admin refund decision",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin-reviewer",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${fixture.paymentId}:${id}`,
      requestedAt: NOW,
      failedAt: REVIEWED_AT,
    },
  });
  return id;
}

async function seedOpenAndCaptureP2002(
  context: TestContext,
  fixture: OrderFixture,
  customerUserId: string,
  reasonDetail: string | null = null,
): Promise<{ openId: string; error: Prisma.PrismaClientKnownRequestError }> {
  const open = await seedIntake(context, fixture, { customerUserId, reasonDetail });
  try {
    await seedIntake(context, fixture, { customerUserId });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return { openId: open.id, error };
  }
  throw new Error("Expected the partial unique index to reject a second open intake.");
}

function failFirstTransaction(
  delegate: PrismaClient,
  error: Prisma.PrismaClientKnownRequestError,
  beforeFailure?: () => Promise<void>,
): { client: CustomerIntakeClient; calls: () => number } {
  let callCount = 0;
  return {
    client: {
      async $transaction<Result>(callback: (tx: Prisma.TransactionClient) => Promise<Result>): Promise<Result> {
        callCount += 1;
        if (callCount === 1) {
          await beforeFailure?.();
          throw error;
        }
        return delegate.$transaction(callback);
      },
    },
    calls: () => callCount,
  };
}

async function financialSnapshot(fixture: OrderFixture) {
  const [order, payment, attempts, transitions, commands, evidence] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    db.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
      select: { status: true, amount: true, currency: true },
    }),
    db.refundAttempt.count({ where: { orderId: fixture.orderId } }),
    db.refundAttemptTransition.count({ where: { refundAttempt: { orderId: fixture.orderId } } }),
    db.refundExecutionCommand.count({ where: { refundAttempt: { orderId: fixture.orderId } } }),
    db.refundExecutionEvidence.count({ where: { command: { refundAttempt: { orderId: fixture.orderId } } } }),
  ]);
  return { order, payment, attempts, transitions, commands, evidence };
}

async function orderStatus(orderId: string): Promise<OrderStatus> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return order.status;
}

async function changeOrderOwner(orderId: string, userId: string): Promise<void> {
  await db.order.update({ where: { id: orderId }, data: { userId } });
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MARKET_CODE, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  const attempts = await db.refundAttempt.findMany({
    where: { orderId: { in: context.orderIds } },
    select: { id: true },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: { in: attemptIds } },
    select: { id: true },
  });
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commands.map((command) => command.id) } } });
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: [context.ownerUserId, context.otherUserId] } } });
}
