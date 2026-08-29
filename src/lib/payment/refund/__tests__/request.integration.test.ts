import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { REFUND_REQUEST_REASON_MAX_CODE_POINTS } from "../invariants";
import {
  requestRefundAttempt,
  requestRefundAttemptInTransaction,
  type RequestRefundAttemptInput,
  type RequestRefundAttemptResult,
} from "../request";

const NOW = new Date("2026-07-10T04:00:00.000Z");
const MARKET_CODE = "KR";
const EXIMBAY_CUSTOMER_APPROVAL = Object.freeze({
  allowEximbaySandboxCustomerApproval: true,
});

class CallerOwnedTransactionRollbackProbe extends Error {}

interface TestContext {
  userId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
  styleIds: string[];
  variantIds: string[];
}

interface OrderFixtureOptions {
  orderStatus?: OrderStatus;
  orderAmount?: number;
  orderCurrency?: string;
  paymentStatus?: PaymentAttemptStatus;
  paymentAmount?: number;
  paymentCurrency?: string;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  providerPaymentKey?: string | null;
  disputeStatus?: string | null;
  itemQuantity?: number;
}

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
  paymentAmount: number;
  paymentCurrency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  orderItemId: string;
}

interface AttemptSeedOptions {
  id?: string;
  paymentId?: string;
  currency?: string;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  reason?: string;
  lineQuantity?: number | null;
}

describe("requestRefundAttempt", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = {
      userId: `refund_request_${randomUUID()}`,
      orderIds: [],
      paymentIds: [],
      sessionIds: [],
      styleIds: [],
      variantIds: [],
    };
    await ensureMarket();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("creates REQUESTED and atomically moves a PAID order to REFUND_PENDING", async () => {
    const fixture = await createOrder(ctx);
    const refundAttemptId = `refund_${randomUUID()}`;
    const request = input(fixture.orderId, {
      refundAttemptId: `  ${refundAttemptId}  `,
      reason: "  Admin-approved refund request  ",
      actorUserId: "  admin_123  ",
    });

    const result = success(await requestRefundAttempt(db, request));
    const persisted = await db.refundAttempt.findUniqueOrThrow({
      where: { id: result.refundAttempt.id },
      include: { lines: true },
    });
    const transitions = await creationTransitions(result.refundAttempt.id);

    expect(result).toMatchObject({ orderStatus: OrderStatus.REFUND_PENDING, replayed: false });
    expect(persisted).toMatchObject({
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 400,
      currency: "KRW",
      status: RefundAttemptStatus.REQUESTED,
      reason: "Admin-approved refund request",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      providerRefundId: null,
      processedAt: null,
      failedAt: null,
      lines: [{
        refundAttemptId: refundAttemptId,
        orderItemId: fixture.orderItemId,
        orderId: fixture.orderId,
        quantity: 1,
      }],
    });
    expect(transitions).toEqual([
      expect.objectContaining({
        refundAttemptId: result.refundAttempt.id,
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "admin_123",
        reason: result.refundAttempt.reason,
        operationKey: `refund-request:${refundAttemptId}`,
        createdAt: NOW,
      }),
    ]);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it("participates atomically in a caller-owned transaction that rolls back", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId);
    const before = await requestPersistenceState(fixture);

    await expect(db.$transaction(async (tx) => {
      await lockOrder(tx, fixture.orderId);
      const result = success(await requestRefundAttemptInTransaction(tx, request));

      expect(result).toMatchObject({
        orderStatus: OrderStatus.REFUND_PENDING,
        replayed: false,
        refundAttempt: { id: request.refundAttemptId },
      });
      throw new CallerOwnedTransactionRollbackProbe();
    })).rejects.toBeInstanceOf(CallerOwnedTransactionRollbackProbe);

    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
    await expect(db.refundAttempt.findUnique({
      where: { id: request.refundAttemptId },
    })).resolves.toBeNull();
    await expect(db.refundAttemptTransition.findUnique({
      where: { operationKey: `refund-request:${request.refundAttemptId}` },
    })).resolves.toBeNull();
  });

  it("trims before accepting exactly 500 ASCII code points and writes one reason value", async () => {
    const fixture = await createOrder(ctx);
    const normalizedReason = "a".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS);

    const result = success(await requestRefundAttempt(db, input(fixture.orderId, {
      reason: `  ${normalizedReason}\n`,
    })));
    const transitions = await creationTransitions(result.refundAttempt.id);

    expect(result.refundAttempt.reason).toBe(normalizedReason);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].reason).toBe(result.refundAttempt.reason);
  });

  it("accepts exactly 500 supplementary-plane code points", async () => {
    const fixture = await createOrder(ctx);
    const reason = "😀".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS);

    const result = success(await requestRefundAttempt(db, input(fixture.orderId, { reason })));

    expect(reason.length).toBe(REFUND_REQUEST_REASON_MAX_CODE_POINTS * 2);
    expect(result.refundAttempt.reason).toBe(reason);
  });

  it("rejects a 501-code-point new request without changing the aggregate", async () => {
    const fixture = await createOrder(ctx);
    const before = await requestPersistenceState(fixture);
    const reason = "😀".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS + 1);

    const result = await requestRefundAttempt(db, input(fixture.orderId, { reason }));

    expect(result).toEqual({
      ok: false,
      code: "REASON_TOO_LONG",
      message: "Refund reason exceeds the 500-code-point limit.",
    });
    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
  });

  it("opens another sequential request from PARTIALLY_REFUNDED", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.PARTIALLY_REFUNDED });
    await seedAttempt(fixture, RefundAttemptStatus.SUCCEEDED, 200);

    const result = success(await requestRefundAttempt(db, input(fixture.orderId, { amount: 300 })));
    const transitions = await creationTransitions(result.refundAttempt.id);

    expect(result.orderStatus).toBe(OrderStatus.REFUND_PENDING);
    expect(transitions).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PARTIALLY_REFUNDED,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
      }),
    ]);
    await expect(refundCount(fixture.orderId)).resolves.toBe(2);
  });

  it("copies payment identity instead of accepting provider context from the caller", async () => {
    const fixture = await createOrder(ctx, {
      orderAmount: 5_000,
      orderCurrency: "USD",
      paymentAmount: 5_000,
      paymentCurrency: "USD",
      provider: PaymentProvider.PAYPAL,
      mode: PaymentMode.LIVE,
    });

    const result = success(await requestRefundAttempt(db, input(fixture.orderId, { amount: 1_200 })));

    expect(result.refundAttempt).toMatchObject({
      paymentId: fixture.paymentId,
      currency: "USD",
      provider: PaymentProvider.PAYPAL,
      mode: PaymentMode.LIVE,
      idempotencyKey: `refund:${fixture.paymentId}:${result.refundAttempt.id}`,
    });
  });

  it("requires a SUCCEEDED payment", async () => {
    const fixture = await createOrder(ctx, { paymentStatus: PaymentAttemptStatus.FAILED });
    await expectFailure(fixture, "PAYMENT_NOT_REFUNDABLE");
  });

  it.each([null, randomWhitespace()])("requires a usable providerPaymentKey: %j", async (providerPaymentKey) => {
    const fixture = await createOrder(ctx, {
      paymentStatus: PaymentAttemptStatus.INITIATED,
      providerPaymentKey,
    });
    await expectFailure(fixture, "PAYMENT_NOT_REFUNDABLE");
  });

  it("keeps default/global refund request admission blocked for Eximbay", async () => {
    const fixture = await createOrder(ctx, { provider: PaymentProvider.EXIMBAY });

    await expectFailure(fixture, "PAYMENT_NOT_REFUNDABLE");
    await expect(refundCount(fixture.orderId)).resolves.toBe(0);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
  });

  it.each(["USD", "JPY"])(
    "admits Eximbay SANDBOX %s only with explicit customer-approval capability",
    async (currency) => {
      const fixture = await createOrder(ctx, {
        orderCurrency: currency,
        paymentCurrency: currency,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
      });

      const result = success(await requestWithEximbayCustomerApproval(fixture));
      const transitions = await creationTransitions(result.refundAttempt.id);

      expect(result.refundAttempt).toMatchObject({
        paymentId: fixture.paymentId,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        currency,
        status: RefundAttemptStatus.REQUESTED,
        providerRefundId: null,
      });
      expect(transitions).toHaveLength(1);
      await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    },
  );

  it("keeps Eximbay LIVE blocked with explicit customer-approval capability", async () => {
    const fixture = await createOrder(ctx, {
      orderCurrency: "USD",
      paymentCurrency: "USD",
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.LIVE,
    });

    await expect(requestWithEximbayCustomerApproval(fixture))
      .resolves.toMatchObject({ ok: false, code: "PAYMENT_NOT_REFUNDABLE" });
    await expect(requestPersistenceState(fixture)).resolves.toMatchObject({
      orderStatus: OrderStatus.PAID,
      refundAttemptCount: 0,
      transitionCount: 0,
    });
  });

  it("keeps unsupported Eximbay currency blocked with explicit customer-approval capability", async () => {
    const fixture = await createOrder(ctx, {
      orderCurrency: "KRW",
      paymentCurrency: "KRW",
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
    });

    await expect(requestWithEximbayCustomerApproval(fixture))
      .resolves.toMatchObject({ ok: false, code: "PAYMENT_NOT_REFUNDABLE" });
    await expect(requestPersistenceState(fixture)).resolves.toMatchObject({
      orderStatus: OrderStatus.PAID,
      refundAttemptCount: 0,
      transitionCount: 0,
    });
  });

  it("rejects an order/payment amount mismatch", async () => {
    const fixture = await createOrder(ctx, { orderAmount: 900, paymentAmount: 1_000 });
    await expectFailure(fixture, "PAYMENT_IDENTITY_MISMATCH");
  });

  it("rejects an order/payment currency mismatch", async () => {
    const fixture = await createOrder(ctx, { orderCurrency: "KRW", paymentCurrency: "USD" });
    await expectFailure(fixture, "PAYMENT_IDENTITY_MISMATCH");
  });

  it.each([OrderStatus.CANCELLED, OrderStatus.REFUNDED])("rejects terminal order status %s", async (status) => {
    const fixture = await createOrder(ctx, { orderStatus: status });
    await expectFailure(fixture, "ORDER_STATUS_NOT_REFUNDABLE");
  });

  it("rejects a distinct request while the order is REFUND_PENDING", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });

    const result = await requestRefundAttempt(db, input(fixture.orderId));

    expect(result).toMatchObject({ ok: false, code: "REFUND_IN_PROGRESS" });
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    await expect(refundCount(fixture.orderId)).resolves.toBe(0);
  });

  it("rejects a disputed order for manual review", async () => {
    const fixture = await createOrder(ctx, { disputeStatus: "OPEN" });
    await expectFailure(fixture, "DISPUTE_REVIEW_REQUIRED");
  });

  it("rejects a terminal historical attempt with a mismatched paymentId without writes", async () => {
    const fixture = await createOrder(ctx);
    const other = await createOrder(ctx);
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      paymentId: other.paymentId,
    });

    await expectLedgerIdentityFailure(fixture);
  });

  it("returns ledger inconsistency for a historical currency mismatch without writes", async () => {
    const fixture = await createOrder(ctx);
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.CANCELLED, 100, { currency: "USD" });

    await expectLedgerIdentityFailure(fixture);
  });

  it("rejects a succeeded historical attempt with a mismatched provider without writes", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.PARTIALLY_REFUNDED });
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.SUCCEEDED, 200, {
      provider: PaymentProvider.PAYPAL,
    });

    await expectLedgerIdentityFailure(fixture);
  });

  it("returns ledger inconsistency before in-progress for a guarded mode mismatch", async () => {
    const fixture = await createOrder(ctx);
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.PROCESSING, 100, {
      mode: PaymentMode.LIVE,
    });

    await expectLedgerIdentityFailure(fixture);
  });

  it("returns an exact replay before normal REFUND_PENDING eligibility", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` });
    const first = success(await requestRefundAttempt(db, request));
    await db.order.update({
      where: { id: fixture.orderId },
      data: { status: OrderStatus.REFUNDED },
    });

    const replay = success(await requestRefundAttempt(db, {
      ...request,
      now: new Date(NOW.getTime() + 60_000),
    }));

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, orderStatus: OrderStatus.REFUND_PENDING });
    expect(replay.refundAttempt.id).toBe(first.refundAttempt.id);
    await expect(refundCount(fixture.orderId)).resolves.toBe(1);
    await expect(transitionCount(first.refundAttempt.id)).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUNDED);
  });

  it("canonicalizes multi-item line order and treats it as immutable replay identity", async () => {
    const fixture = await createOrder(ctx);
    const secondItemId = await createOrderItem(ctx, fixture.orderId, 250, `item_second_${randomUUID()}`, 2);
    const request = input(fixture.orderId, {
      refundAttemptId: `refund_${randomUUID()}`,
      lines: [
        { orderItemId: secondItemId, quantity: 2 },
        { orderItemId: ` ${fixture.orderItemId} `, quantity: 1 },
      ],
    });

    const first = success(await requestRefundAttempt(db, request));
    const replay = success(await requestRefundAttempt(db, {
      ...request,
      lines: [...request.lines].reverse(),
    }));
    const conflict = await requestRefundAttempt(db, {
      ...request,
      lines: [{ orderItemId: fixture.orderItemId, quantity: 2 }],
    });

    expect(first.refundAttempt.lines.map(({ orderItemId, quantity }) => ({ orderItemId, quantity })))
      .toEqual([
        { orderItemId: fixture.orderItemId, quantity: 1 },
        { orderItemId: secondItemId, quantity: 2 },
      ].sort((left, right) => left.orderItemId < right.orderItemId ? -1 : 1));
    expect(replay.replayed).toBe(true);
    expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(db.refundAttemptLine.count({ where: { refundAttemptId: first.refundAttempt.id } }))
      .resolves.toBe(2);
  });

  it("requires, persists, and replays exact coupon economic allocation as immutable identity", async () => {
    const fixture = await createOrder(ctx);
    await expect(db.$transaction(async (tx) => {
      await installCouponEconomics(tx, fixture, ctx.userId);
      const refundAttemptId = `refund_coupon_${randomUUID()}`;
      const base = input(fixture.orderId, {
        refundAttemptId,
        amount: 400,
        lines: [{
          orderItemId: fixture.orderItemId,
          quantity: 1,
          merchandiseRefundAmount: 334,
        }],
      });

      await expect(requestRefundAttemptInTransaction(tx, {
        ...base,
        refundAttemptId: `refund_coupon_missing_${randomUUID()}`,
        lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
      })).resolves.toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_REQUIRED" });
      await expect(requestRefundAttemptInTransaction(tx, {
        ...base,
        refundAttemptId: `refund_coupon_wrong_${randomUUID()}`,
        lines: [{
          orderItemId: fixture.orderItemId,
          quantity: 1,
          merchandiseRefundAmount: 335,
        }],
      })).resolves.toMatchObject({ ok: false, code: "REFUND_ECONOMIC_ALLOCATION_MISMATCH" });

      const first = success(await requestRefundAttemptInTransaction(tx, base));
      const replay = success(await requestRefundAttemptInTransaction(tx, {
        ...base,
        now: new Date(NOW.getTime() + 1_000),
      }));
      const conflict = await requestRefundAttemptInTransaction(tx, {
        ...base,
        lines: [{
          orderItemId: fixture.orderItemId,
          quantity: 1,
          merchandiseRefundAmount: 333,
        }],
      });
      const allocation = await tx.refundAttemptLineEconomicAllocation.findUniqueOrThrow({
        where: {
          refundAttemptId_orderItemId: {
            refundAttemptId,
            orderItemId: fixture.orderItemId,
          },
        },
      });

      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
      expect(allocation.merchandiseRefundAmount).toBe(334);
      throw new CallerOwnedTransactionRollbackProbe();
    })).rejects.toBeInstanceOf(CallerOwnedTransactionRollbackProbe);
  });

  it("enforces per-item remaining quantity while terminal non-success lines remain historical", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.PARTIALLY_REFUNDED });
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.SUCCEEDED, 100, { lineQuantity: 2 });
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.CANCELLED, 100, { lineQuantity: 3 });

    await expect(requestRefundAttempt(db, input(fixture.orderId, {
      lines: [{ orderItemId: fixture.orderItemId, quantity: 2 }],
    }))).resolves.toMatchObject({ ok: false, code: "OVER_REFUND_LINE_QUANTITY" });

    const accepted = success(await requestRefundAttempt(db, input(fixture.orderId, {
      lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
    })));
    expect(accepted.refundAttempt.lines).toMatchObject([{ orderItemId: fixture.orderItemId, quantity: 1 }]);
  });

  it("supports qty 1 then qty 2 after success and rejects a third unit", async () => {
    const fixture = await createOrder(ctx, {
      orderStatus: OrderStatus.PAID,
      itemQuantity: 3,
    });
    const first = success(await requestRefundAttempt(db, input(fixture.orderId, {
      amount: 100,
      lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
    })));
    await db.refundAttempt.update({
      where: { id: first.refundAttempt.id },
      data: { status: RefundAttemptStatus.SUCCEEDED, processedAt: NOW },
    });
    await db.order.update({
      where: { id: fixture.orderId },
      data: { status: OrderStatus.PARTIALLY_REFUNDED },
    });

    const second = success(await requestRefundAttempt(db, input(fixture.orderId, {
      amount: 100,
      lines: [{ orderItemId: fixture.orderItemId, quantity: 2 }],
    })));
    await db.refundAttempt.update({
      where: { id: second.refundAttempt.id },
      data: { status: RefundAttemptStatus.SUCCEEDED, processedAt: NOW },
    });
    await db.order.update({
      where: { id: fixture.orderId },
      data: { status: OrderStatus.PARTIALLY_REFUNDED },
    });

    await expect(requestRefundAttempt(db, input(fixture.orderId, {
      amount: 100,
      lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
    }))).resolves.toMatchObject({ ok: false, code: "OVER_REFUND_LINE_QUANTITY" });
  });

  it("fails closed for guarded historical line-less attempts but ignores terminal line-less attempts", async () => {
    const guardedFixture = await createOrder(ctx, { orderStatus: OrderStatus.PARTIALLY_REFUNDED });
    await seedAttemptWithIdentity(guardedFixture, RefundAttemptStatus.SUCCEEDED, 100, { lineQuantity: null });
    await expect(requestRefundAttempt(db, input(guardedFixture.orderId)))
      .resolves.toMatchObject({ ok: false, code: "REFUND_LINE_HISTORY_UNATTRIBUTED" });

    const terminalFixture = await createOrder(ctx);
    await seedAttemptWithIdentity(terminalFixture, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      lineQuantity: null,
    });
    await expect(requestRefundAttempt(db, input(terminalFixture.orderId)))
      .resolves.toMatchObject({ ok: true, replayed: false });
  });

  it("rejects cross-order item attribution at the database constraint", async () => {
    const first = await createOrder(ctx);
    const second = await createOrder(ctx);
    const attemptId = await seedAttemptWithIdentity(first, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      lineQuantity: null,
    });

    await expect(db.refundAttemptLine.create({ data: {
      refundAttemptId: attemptId,
      orderItemId: second.orderItemId,
      orderId: first.orderId,
      quantity: 1,
    } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("enforces positive quantity and unique item-per-attempt in PostgreSQL", async () => {
    const fixture = await createOrder(ctx);
    const attemptId = await seedAttemptWithIdentity(fixture, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      lineQuantity: 1,
    });

    await expect(db.refundAttemptLine.create({ data: {
      refundAttemptId: attemptId,
      orderItemId: fixture.orderItemId,
      orderId: fixture.orderId,
      quantity: 1,
    } })).rejects.toMatchObject({ code: "P2002" });
    const secondItemId = await createOrderItem(ctx, fixture.orderId, 100, `item_constraint_${randomUUID()}`);
    await expect(db.refundAttemptLine.create({ data: {
      refundAttemptId: attemptId,
      orderItemId: secondItemId,
      orderId: fixture.orderId,
      quantity: 0,
    } })).rejects.toThrow("RefundAttemptLine_quantity_positive_check");
  });

  it("replays historical overlength reason evidence without rewriting it", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const reason = "😀".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS + 1);
    const refundAttemptId = await seedAttemptWithIdentity(
      fixture,
      RefundAttemptStatus.REQUESTED,
      400,
      { reason, lineQuantity: null },
    );
    await seedCreationTransition(refundAttemptId, { reason });
    const before = await requestPersistenceState(fixture);

    const replay = success(await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: ` ${reason} `,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      lines: [],
    })));
    const persisted = await db.refundAttempt.findUniqueOrThrow({
      where: { id: refundAttemptId },
      select: { reason: true },
    });

    expect(replay).toMatchObject({ replayed: true, orderStatus: OrderStatus.REFUND_PENDING });
    expect(persisted.reason).toBe(reason);
    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
  });

  it("returns idempotency conflict before overlength failure for reused identity", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const historicalReason = "😀".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS + 1);
    const refundAttemptId = await seedAttemptWithIdentity(
      fixture,
      RefundAttemptStatus.REQUESTED,
      400,
      { reason: historicalReason, lineQuantity: null },
    );
    await seedCreationTransition(refundAttemptId, { reason: historicalReason });
    const before = await requestPersistenceState(fixture);

    const result = await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "🧠".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS + 1),
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      lines: [],
    }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
  });

  it("returns exact replay despite an unrelated inconsistent sibling", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` });
    await requestRefundAttempt(db, request);
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      provider: PaymentProvider.PAYPAL,
    });
    const before = await requestPersistenceState(fixture);

    const replay = success(await requestRefundAttempt(db, request));

    expect(replay).toMatchObject({ replayed: true, orderStatus: OrderStatus.REFUND_PENDING });
    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
  });

  it("returns idempotency conflict before unrelated sibling inconsistency", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` });
    await requestRefundAttempt(db, request);
    await seedAttemptWithIdentity(fixture, RefundAttemptStatus.FAILED_TERMINAL, 100, {
      provider: PaymentProvider.PAYPAL,
    });
    const before = await requestPersistenceState(fixture);

    const result = await requestRefundAttempt(db, { ...request, reason: "Different reason" });

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
  });

  it("replays an exact legacy attempt without fabricating creation evidence", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttemptWithIdentity(
      fixture,
      RefundAttemptStatus.REQUESTED,
      400,
      { lineQuantity: null },
    );

    const replay = success(await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      lines: [],
    })));

    expect(replay).toMatchObject({ replayed: true, orderStatus: OrderStatus.REFUND_PENDING });
    await expect(transitionCount(refundAttemptId)).resolves.toBe(0);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it("rejects contradictory creation evidence for an otherwise exact replay", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttemptWithIdentity(
      fixture,
      RefundAttemptStatus.REQUESTED,
      400,
      { lineQuantity: null },
    );
    await seedCreationTransition(refundAttemptId, {
      reason: "Contradictory audit reason",
      operationKey: `refund-request:${refundAttemptId}`,
    });

    const result = await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      lines: [],
    }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(transitionCount(refundAttemptId)).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it("rejects multiple creation transitions for an otherwise exact replay", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttemptWithIdentity(
      fixture,
      RefundAttemptStatus.REQUESTED,
      400,
      { lineQuantity: null },
    );
    await seedCreationTransition(refundAttemptId);
    await seedCreationTransition(refundAttemptId, {
      operationKey: `refund-request-duplicate:${refundAttemptId}`,
    });

    const result = await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      lines: [],
    }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(transitionCount(refundAttemptId)).resolves.toBe(2);
  });

  it("rejects conflicting immutable data for the same attempt identity", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` });
    await requestRefundAttempt(db, request);

    const conflict = await requestRefundAttempt(db, { ...request, reason: "Different reason" });

    expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(refundCount(fixture.orderId)).resolves.toBe(1);
  });

  it("rejects over-refund from succeeded money", async () => {
    const fixture = await createOrder(ctx);
    await seedAttempt(fixture, RefundAttemptStatus.SUCCEEDED, 900);

    const result = await requestRefundAttempt(db, input(fixture.orderId, { amount: 101 }));

    expect(result).toMatchObject({ ok: false, code: "OVER_REFUND" });
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
  });

  it.each([
    RefundAttemptStatus.REQUESTED,
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.FAILED_RETRYABLE,
    RefundAttemptStatus.MANUAL_REVIEW,
  ])("keeps open guarded status %s single-in-flight", async (status) => {
    const fixture = await createOrder(ctx);
    await seedAttempt(fixture, status, 950);

    const result = await requestRefundAttempt(db, input(fixture.orderId, { amount: 100 }));

    expect(result).toMatchObject({ ok: false, code: "REFUND_IN_PROGRESS" });
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
  });

  it("does not reserve FAILED_TERMINAL amount", async () => {
    const fixture = await createOrder(ctx);
    await seedAttempt(fixture, RefundAttemptStatus.FAILED_TERMINAL, 1_000);

    const result = success(await requestRefundAttempt(db, input(fixture.orderId, { amount: 1_000 })));

    expect(result.refundAttempt.status).toBe(RefundAttemptStatus.REQUESTED);
    await expect(refundCount(fixture.orderId)).resolves.toBe(2);
  });

  it("requires actorUserId for ADMIN without changing the order", async () => {
    const fixture = await createOrder(ctx);

    const result = await requestRefundAttempt(db, input(fixture.orderId, { actorUserId: null }));

    expect(result).toMatchObject({ ok: false, code: "INVALID_ACTOR_USER_ID" });
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
    await expect(refundCount(fixture.orderId)).resolves.toBe(0);
  });

  it("does not enqueue outbox/events work or change Payment.status", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId);

    await requestRefundAttempt(db, request);

    const payment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId }, select: { status: true } });
    const outboxCount = await db.paymentOutbox.count({ where: { dedupKey: { contains: request.refundAttemptId } } });
    const eventCount = await db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } });
    expect(payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(outboxCount).toBe(0);
    expect(eventCount).toBe(0);
  });

  it("rolls back REFUND_PENDING when RefundAttempt insert hits an identity conflict", async () => {
    const existingOrder = await createOrder(ctx);
    const targetOrder = await createOrder(ctx);
    const collisionId = `refund_collision_${randomUUID()}`;
    await seedAttempt(existingOrder, RefundAttemptStatus.FAILED_TERMINAL, 100, collisionId);

    const result = await requestRefundAttempt(db, input(targetOrder.orderId, { refundAttemptId: collisionId }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(orderStatus(targetOrder.orderId)).resolves.toBe(OrderStatus.PAID);
    await expect(refundCount(targetOrder.orderId)).resolves.toBe(0);
    await expect(refundCount(existingOrder.orderId)).resolves.toBe(1);
  });

  it("returns cross-order identity conflict before overlength failure without writes", async () => {
    const existingOrder = await createOrder(ctx);
    const targetOrder = await createOrder(ctx);
    const collisionId = `refund_collision_${randomUUID()}`;
    await seedAttempt(existingOrder, RefundAttemptStatus.FAILED_TERMINAL, 100, collisionId);
    const before = await requestPersistenceState(targetOrder);

    const result = await requestRefundAttempt(db, input(targetOrder.orderId, {
      refundAttemptId: collisionId,
      reason: "😀".repeat(REFUND_REQUEST_REASON_MAX_CODE_POINTS + 1),
    }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(requestPersistenceState(targetOrder)).resolves.toEqual(before);
    await expect(refundCount(existingOrder.orderId)).resolves.toBe(1);
  });

  it("rolls back Order and RefundAttempt when creation operationKey conflicts", async () => {
    const evidenceOrder = await createOrder(ctx);
    const targetOrder = await createOrder(ctx);
    const refundAttemptId = `refund_transition_collision_${randomUUID()}`;
    const evidenceAttemptId = await seedAttempt(
      evidenceOrder,
      RefundAttemptStatus.FAILED_TERMINAL,
      100,
    );
    await seedCreationTransition(evidenceAttemptId, {
      operationKey: `refund-request:${refundAttemptId}`,
    });

    const result = await requestRefundAttempt(db, input(targetOrder.orderId, { refundAttemptId }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(orderStatus(targetOrder.orderId)).resolves.toBe(OrderStatus.PAID);
    await expect(refundCount(targetOrder.orderId)).resolves.toBe(0);
    await expect(db.refundAttemptTransition.count({
      where: { operationKey: `refund-request:${refundAttemptId}` },
    })).resolves.toBe(1);
  });

  it("serializes concurrent exact requests into one attempt and one replay", async () => {
    const fixture = await createOrder(ctx);
    const request = input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` });
    const contenders: Promise<RequestRefundAttemptResult>[] = [];

    await db.$transaction(async (tx) => {
      await lockOrder(tx, fixture.orderId);
      contenders.push(requestRefundAttempt(db, request), requestRefundAttempt(db, request));
      expect(await settlesWithin(contenders[0], 40)).toBe(false);
      expect(await settlesWithin(contenders[1], 40)).toBe(false);
    });

    const results = await Promise.all(contenders);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
    await expect(refundCount(fixture.orderId)).resolves.toBe(1);
    await expect(db.refundAttemptTransition.count({
      where: { refundAttempt: { orderId: fixture.orderId } },
    })).resolves.toBe(1);
  });

  it("serializes concurrent contenders and creates exactly one open attempt", async () => {
    const fixture = await createOrder(ctx, { itemQuantity: 1 });
    const contenders: Promise<RequestRefundAttemptResult>[] = [];

    await db.$transaction(async (tx) => {
      await lockOrder(tx, fixture.orderId);
      contenders.push(
        requestRefundAttempt(db, input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` })),
        requestRefundAttempt(db, input(fixture.orderId, { refundAttemptId: `refund_${randomUUID()}` })),
      );
      expect(await settlesWithin(contenders[0], 40)).toBe(false);
      expect(await settlesWithin(contenders[1], 40)).toBe(false);
      await expect(refundCount(fixture.orderId)).resolves.toBe(0);
    });

    const results = await Promise.all(contenders);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: "OVER_REFUND_LINE_QUANTITY" }),
    ]);
    await expect(refundCount(fixture.orderId)).resolves.toBe(1);
    await expect(db.refundAttemptTransition.count({
      where: { refundAttempt: { orderId: fixture.orderId } },
    })).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    await expect(db.refundAttemptLine.aggregate({
      where: { orderId: fixture.orderId },
      _sum: { quantity: true },
    })).resolves.toMatchObject({ _sum: { quantity: 1 } });
  });
});

function input(
  orderId: string,
  overrides: Partial<RequestRefundAttemptInput> = {},
): RequestRefundAttemptInput {
  return {
    refundAttemptId: `refund_${randomUUID()}`,
    orderId,
    amount: 400,
    reason: "Admin-approved refund request",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    now: NOW,
    lines: [{ orderItemId: `item_for_${orderId}`, quantity: 1 }],
    ...overrides,
  };
}

function randomWhitespace(): string {
  const whitespace = [" ", "\t", "\n", "\r"];
  return Array.from(randomUUID(), (character) => whitespace[character.charCodeAt(0) % whitespace.length]).join("");
}

async function createOrder(
  context: TestContext,
  options: OrderFixtureOptions = {},
): Promise<OrderFixture> {
  const orderAmount = options.orderAmount ?? 1_000;
  const orderCurrency = options.orderCurrency ?? "KRW";
  const sessionId = await createCheckoutSession(context, orderAmount, orderCurrency);
  const payment = await createPayment(context, sessionId, options);
  const orderId = await createOrderRow(context, sessionId, payment.id, orderAmount, orderCurrency, options);
  const orderItemId = await createOrderItem(
    context,
    orderId,
    orderAmount,
    `item_for_${orderId}`,
    options.itemQuantity ?? 3,
  );
  return { orderId, paymentId: payment.id, sessionId, orderItemId, ...payment.context };
}

async function createCheckoutSession(
  context: TestContext,
  orderAmount: number,
  orderCurrency: string,
): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency: orderCurrency,
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: orderAmount,
      shippingAmount: 0,
      totalAmount: orderAmount,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
    select: { id: true },
  });
  context.sessionIds.push(session.id);
  return session.id;
}

async function createPayment(
  context: TestContext,
  sessionId: string,
  options: OrderFixtureOptions,
) {
  const paymentAmount = options.paymentAmount ?? 1_000;
  const paymentCurrency = options.paymentCurrency ?? "KRW";
  const provider = options.provider ?? PaymentProvider.MOCK;
  const mode = options.mode ?? PaymentMode.SANDBOX;
  const paymentFixture = normalizePaymentFixture(options);
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider,
      mode,
      providerOrderId: provider === PaymentProvider.EXIMBAY
        ? syntheticEximbayProviderOrderId()
        : null,
      ...paymentFixture,
      idempotencyKey: `payment_idem_${randomUUID()}`,
    },
    select: { id: true },
  });
  context.paymentIds.push(payment.id);
  return { id: payment.id, context: { paymentAmount, paymentCurrency, provider, mode } };
}

function normalizePaymentFixture(options: OrderFixtureOptions) {
  const status = options.paymentStatus ?? PaymentAttemptStatus.SUCCEEDED;
  const providerPaymentKey = options.providerPaymentKey === undefined
    ? `provider_payment_${randomUUID()}`
    : options.providerPaymentKey;
  return {
    status,
    amount: options.paymentAmount ?? 1_000,
    currency: options.paymentCurrency ?? "KRW",
    providerPaymentKey,
    ...paymentLifecycleFields(status),
  };
}

function paymentLifecycleFields(status: PaymentAttemptStatus) {
  if (status === PaymentAttemptStatus.SUCCEEDED) {
    return {
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
    };
  }
  if (status === PaymentAttemptStatus.FAILED) {
    return { attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE, blockingEndedAt: NOW };
  }
  return {
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    contactIntentAt: NOW,
    contactStartedAt: NOW,
  };
}

async function createOrderRow(
  context: TestContext,
  sessionId: string,
  paymentId: string,
  orderAmount: number,
  orderCurrency: string,
  options: OrderFixtureOptions,
): Promise<string> {
  const order = await db.order.create({
    data: {
      checkoutSessionId: sessionId,
      paymentId,
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency: orderCurrency,
      subtotalAmount: orderAmount,
      shippingAmount: 0,
      totalAmount: orderAmount,
      status: options.orderStatus ?? OrderStatus.PAID,
      disputeStatus: options.disputeStatus ?? null,
      paidAt: NOW,
    },
    select: { id: true },
  });
  context.orderIds.push(order.id);
  return order.id;
}

async function seedAttempt(
  fixture: OrderFixture,
  status: RefundAttemptStatus,
  amount: number,
  id = `refund_seed_${randomUUID()}`,
): Promise<string> {
  return seedAttemptWithIdentity(fixture, status, amount, { id });
}

async function seedAttemptWithIdentity(
  fixture: OrderFixture,
  status: RefundAttemptStatus,
  amount: number,
  options: AttemptSeedOptions = {},
): Promise<string> {
  const id = options.id ?? `refund_seed_${randomUUID()}`;
  const paymentId = options.paymentId ?? fixture.paymentId;
  const timestamps = seededAttemptTimestamps(status);
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId,
      amount,
      ...seededAttemptIdentity(fixture, options),
      status,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      idempotencyKey: `refund:${paymentId}:${id}`,
      requestedAt: NOW,
      ...timestamps,
    },
  });
  await seedOptionalAttemptLine(fixture, id, options.lineQuantity);
  return id;
}

function seededAttemptIdentity(fixture: OrderFixture, options: AttemptSeedOptions) {
  return {
    currency: options.currency ?? fixture.paymentCurrency,
    reason: options.reason ?? "Seed refund attempt",
    provider: options.provider ?? fixture.provider,
    mode: options.mode ?? fixture.mode,
  };
}

function seededAttemptTimestamps(status: RefundAttemptStatus) {
  return {
    processedAt: status === RefundAttemptStatus.SUCCEEDED ? NOW : null,
    failedAt: status === RefundAttemptStatus.FAILED_TERMINAL ? NOW : null,
  };
}

async function seedOptionalAttemptLine(
  fixture: OrderFixture,
  refundAttemptId: string,
  quantity: number | null | undefined,
): Promise<void> {
  if (quantity === null) return;
  await db.refundAttemptLine.create({
    data: {
      refundAttemptId,
      orderItemId: fixture.orderItemId,
      orderId: fixture.orderId,
      quantity: quantity ?? 1,
    },
  });
}

async function createOrderItem(
  context: TestContext,
  orderId: string,
  unitAmount: number,
  itemId = `item_for_${orderId}`,
  quantity = 3,
): Promise<string> {
  const style = await db.wigStyle.create({
    data: {
      name: `Refund line style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
  context.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: unitAmount,
      stock: 10,
      sku: `refund-line-${randomUUID()}`,
      fulfillmentType: FulfillmentType.STOCKED,
    },
  });
  context.variantIds.push(variant.id);
  await db.orderItem.create({
    data: {
      id: itemId,
      orderId,
      variantId: variant.id,
      wigStyleId: style.id,
      quantity,
      unitAmount,
      discountAmount: 0,
      fulfillmentType: FulfillmentType.STOCKED,
      snapshotData: { styleName: style.name },
    },
  });
  return itemId;
}

async function installCouponEconomics(
  tx: Prisma.TransactionClient,
  fixture: OrderFixture,
  userId: string,
): Promise<void> {
  const policy = await tx.promotionPolicyVersion.create({
    data: {
      programKey: `refund_coupon_${randomUUID()}`,
      version: 1,
      kind: "SIGNUP",
      startsAt: new Date(NOW.getTime() - 1_000),
      firstOrderOnly: true,
      recoveryGraceDays: 30,
    },
  });
  const grant = await tx.promotionGrant.create({
    data: {
      userId,
      policyVersionId: policy.id,
      grantKey: `refund_coupon_grant_${randomUUID()}`,
      originMarketCode: MARKET_CODE,
      issuedAt: new Date(NOW.getTime() - 2_000),
      validFrom: new Date(NOW.getTime() - 2_000),
      redeemedAt: NOW,
    },
  });
  await tx.orderItem.update({
    where: { id: fixture.orderItemId },
    data: { unitAmount: 400, discountAmount: 200 },
  });
  await tx.order.update({
    where: { id: fixture.orderId },
    data: { promotionGrantId: grant.id, subtotalAmount: 1_200, discountAmount: 200 },
  });
}

async function expectLedgerIdentityFailure(fixture: OrderFixture): Promise<void> {
  const before = await requestPersistenceState(fixture);

  const result = await requestRefundAttempt(db, input(fixture.orderId));

  expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  await expect(requestPersistenceState(fixture)).resolves.toEqual(before);
}

async function requestPersistenceState(fixture: OrderFixture) {
  const [order, refundAttemptCount, transitionCount, payment] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    db.refundAttempt.count({ where: { orderId: fixture.orderId } }),
    db.refundAttemptTransition.count({ where: { refundAttempt: { orderId: fixture.orderId } } }),
    db.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
      select: { id: true, status: true, amount: true, currency: true, provider: true, mode: true },
    }),
  ]);
  return { orderStatus: order.status, refundAttemptCount, transitionCount, payment };
}

async function seedCreationTransition(
  refundAttemptId: string,
  overrides: { operationKey?: string; reason?: string } = {},
): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: OrderStatus.PAID,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: overrides.reason ?? "Seed refund attempt",
      operationKey: overrides.operationKey ?? `refund-request:${refundAttemptId}`,
      createdAt: NOW,
    },
  });
}

async function expectFailure(
  fixture: OrderFixture,
  code: string,
): Promise<void> {
  const result = await requestRefundAttempt(db, input(fixture.orderId));
  expect(result).toMatchObject({ ok: false, code });
  await expect(orderStatus(fixture.orderId)).resolves.not.toBe(OrderStatus.REFUND_PENDING);
  await expect(refundCount(fixture.orderId)).resolves.toBe(0);
}

function requestWithEximbayCustomerApproval(
  fixture: OrderFixture,
): Promise<RequestRefundAttemptResult> {
  return db.$transaction((tx) => requestRefundAttemptInTransaction(
    tx,
    input(fixture.orderId),
    EXIMBAY_CUSTOMER_APPROVAL,
  ));
}

function success(result: RequestRefundAttemptResult): Extract<RequestRefundAttemptResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected refund request success, received ${result.code}.`);
  return result;
}

async function orderStatus(orderId: string): Promise<OrderStatus> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return order.status;
}

function refundCount(orderId: string): Promise<number> {
  return db.refundAttempt.count({ where: { orderId } });
}

function creationTransitions(refundAttemptId: string) {
  return db.refundAttemptTransition.findMany({
    where: { refundAttemptId },
    orderBy: { createdAt: "asc" },
  });
}

function transitionCount(refundAttemptId: string): Promise<number> {
  return db.refundAttemptTransition.count({ where: { refundAttemptId } });
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
}

async function settlesWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
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
  await db.refundAttemptTransition.deleteMany({
    where: { refundAttemptId: { in: attempts.map((attempt) => attempt.id) } },
  });
  await db.refundAttemptLine.deleteMany({ where: { refundAttemptId: { in: attempts.map((attempt) => attempt.id) } } });
  await db.refundAttempt.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
  await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
}
