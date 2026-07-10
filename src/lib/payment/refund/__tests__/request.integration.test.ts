import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  requestRefundAttempt,
  type RequestRefundAttemptInput,
  type RequestRefundAttemptResult,
} from "../request";

const NOW = new Date("2026-07-10T04:00:00.000Z");
const MARKET_CODE = "KR";

interface TestContext {
  userId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
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
}

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
  paymentAmount: number;
  paymentCurrency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

describe("requestRefundAttempt", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = { userId: `refund_request_${randomUUID()}`, orderIds: [], paymentIds: [], sessionIds: [] };
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
    const persisted = await db.refundAttempt.findUniqueOrThrow({ where: { id: result.refundAttempt.id } });
    const transitions = await creationTransitions(result.refundAttempt.id);

    expect(result).toMatchObject({ orderStatus: OrderStatus.REFUND_PENDING, replayed: false });
    expect(persisted).toMatchObject({
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 400,
      currency: "KRW",
      status: RefundAttemptStatus.REQUESTED,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      providerRefundId: null,
      processedAt: null,
      failedAt: null,
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
    const fixture = await createOrder(ctx, { providerPaymentKey });
    await expectFailure(fixture, "PAYMENT_NOT_REFUNDABLE");
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

  it("replays an exact legacy attempt without fabricating creation evidence", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttempt(fixture, RefundAttemptStatus.REQUESTED, 400);

    const replay = success(await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    })));

    expect(replay).toMatchObject({ replayed: true, orderStatus: OrderStatus.REFUND_PENDING });
    await expect(transitionCount(refundAttemptId)).resolves.toBe(0);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it("rejects contradictory creation evidence for an otherwise exact replay", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttempt(fixture, RefundAttemptStatus.REQUESTED, 400);
    await seedCreationTransition(refundAttemptId, {
      reason: "Contradictory audit reason",
      operationKey: `refund-request:${refundAttemptId}`,
    });

    const result = await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    }));

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(transitionCount(refundAttemptId)).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it("rejects multiple creation transitions for an otherwise exact replay", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
    const refundAttemptId = await seedAttempt(fixture, RefundAttemptStatus.REQUESTED, 400);
    await seedCreationTransition(refundAttemptId);
    await seedCreationTransition(refundAttemptId, {
      operationKey: `refund-request-duplicate:${refundAttemptId}`,
    });

    const result = await requestRefundAttempt(db, input(fixture.orderId, {
      refundAttemptId,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
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
    const fixture = await createOrder(ctx);
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
      expect.objectContaining({ code: "REFUND_IN_PROGRESS" }),
    ]);
    await expect(refundCount(fixture.orderId)).resolves.toBe(1);
    await expect(db.refundAttemptTransition.count({
      where: { refundAttempt: { orderId: fixture.orderId } },
    })).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
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
  return { orderId, paymentId: payment.id, sessionId, ...payment.context };
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
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider,
      mode,
      status: options.paymentStatus ?? PaymentAttemptStatus.SUCCEEDED,
      amount: paymentAmount,
      currency: paymentCurrency,
      providerPaymentKey: options.providerPaymentKey === undefined
        ? `provider_payment_${randomUUID()}`
        : options.providerPaymentKey,
      idempotencyKey: `payment_idem_${randomUUID()}`,
    },
    select: { id: true },
  });
  context.paymentIds.push(payment.id);
  return { id: payment.id, context: { paymentAmount, paymentCurrency, provider, mode } };
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
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount,
      currency: fixture.paymentCurrency,
      status,
      reason: "Seed refund attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      provider: fixture.provider,
      mode: fixture.mode,
      idempotencyKey: `refund:${fixture.paymentId}:${id}`,
      requestedAt: NOW,
      processedAt: status === RefundAttemptStatus.SUCCEEDED ? NOW : null,
      failedAt: status === RefundAttemptStatus.FAILED_TERMINAL ? NOW : null,
    },
  });
  return id;
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
  await db.refundAttempt.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
