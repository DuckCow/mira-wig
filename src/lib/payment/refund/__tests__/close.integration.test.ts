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
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  claimRefundAttemptForExecution,
  type ClaimRefundAttemptForExecutionInput,
} from "../claim";
import {
  closeRefundRequest,
  type CloseRefundRequestInput,
  type CloseRefundRequestResult,
} from "../close";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const NOW = new Date("2026-07-10T08:00:00.000Z");
const MARKET_CODE = "KR";

interface TestContext {
  userId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

interface OrderOptions {
  orderStatus?: OrderStatus;
  orderAmount?: number;
  orderCurrency?: string;
  paymentStatus?: PaymentAttemptStatus;
  paymentAmount?: number;
  paymentCurrency?: string;
}

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
  amount: number;
  currency: string;
}

interface AttemptOptions {
  id?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  status?: RefundAttemptStatus;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  providerRefundId?: string | null;
}

describe("closeRefundRequest", () => {
  let ctx: TestContext;
  const contexts: TestContext[] = [];

  beforeEach(async () => {
    ctx = { userId: `refund_close_${randomUUID()}`, orderIds: [], paymentIds: [], sessionIds: [] };
    contexts.push(ctx);
    await ensureMarket();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterAll(async () => {
    await cleanup(contexts);
  });

  it("closes REQUESTED, restores PAID, and writes normalized transition evidence", async () => {
    const fixture = await createOrder(ctx);
    const refundAttemptId = await seedAttempt(fixture);
    const request = input(fixture.orderId, refundAttemptId, {
      orderId: `  ${fixture.orderId}  `,
      refundAttemptId: `  ${refundAttemptId}  `,
      closeOperationId: "  close_001  ",
      reason: "  Merchant withdrew unexecuted request  ",
      actorUserId: "  admin_123  ",
    });
    const beforeEventCount = await eventCount(fixture.sessionId);
    const beforeOutboxCount = await outboxCount(refundAttemptId);

    const result = success(await closeRefundRequest(db, request));
    const [attempt, order, payment, transitions] = await Promise.all([
      db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId } }),
      db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
      closeTransitions(refundAttemptId),
    ]);

    expect(result).toMatchObject({
      refundAttemptId,
      refundAttemptStatus: RefundAttemptStatus.CANCELLED,
      restoredOrderStatus: OrderStatus.PAID,
      createdAt: NOW,
      replayed: false,
    });
    expect(attempt.status).toBe(RefundAttemptStatus.CANCELLED);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(payment.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(transitions).toEqual([
      expect.objectContaining({
        id: result.transitionId,
        refundAttemptId,
        fromStatus: RefundAttemptStatus.REQUESTED,
        toStatus: RefundAttemptStatus.CANCELLED,
        orderStatusBefore: OrderStatus.REFUND_PENDING,
        orderStatusAfter: OrderStatus.PAID,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "admin_123",
        reason: "Merchant withdrew unexecuted request",
        operationKey: `refund-close:${refundAttemptId}:close_001`,
        createdAt: NOW,
      }),
    ]);
    await expect(eventCount(fixture.sessionId)).resolves.toBe(beforeEventCount);
    await expect(outboxCount(refundAttemptId)).resolves.toBe(beforeOutboxCount);
  });

  it("restores PARTIALLY_REFUNDED from succeeded ledger evidence", async () => {
    const fixture = await createOrder(ctx);
    await seedAttempt(fixture, { status: RefundAttemptStatus.SUCCEEDED, amount: 200 });
    const targetId = await seedAttempt(fixture, { amount: 300 });

    const result = success(await closeRefundRequest(db, input(fixture.orderId, targetId)));

    expect(result.restoredOrderStatus).toBe(OrderStatus.PARTIALLY_REFUNDED);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PARTIALLY_REFUNDED);
    await expect(closeTransitions(targetId)).resolves.toEqual([
      expect.objectContaining({ orderStatusAfter: OrderStatus.PARTIALLY_REFUNDED }),
    ]);
  });

  it("allows SYSTEM closure with a null actor user id", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);

    const result = success(await closeRefundRequest(db, input(fixture.orderId, targetId, {
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    })));
    const transition = await db.refundAttemptTransition.findUniqueOrThrow({
      where: { id: result.transitionId },
    });

    expect(transition).toMatchObject({
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    });
  });

  it("returns exact historical replay without a second transition or current-state mutation", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = input(fixture.orderId, targetId);
    const first = success(await closeRefundRequest(db, request));
    await db.order.update({ where: { id: fixture.orderId }, data: { status: OrderStatus.CANCELLED } });

    const replay = success(await closeRefundRequest(db, { ...request, now: new Date(NOW.getTime() + 60_000) }));

    expect(replay).toEqual({ ...first, replayed: true });
    await expect(transitionCount(targetId)).resolves.toBe(1);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.CANCELLED);
  });

  it.each([
    { reason: "Different reason" },
    { actorUserId: "different_admin" },
  ])("rejects conflicting replay fields: %o", async (override) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = input(fixture.orderId, targetId);
    await closeRefundRequest(db, request);

    const result = await closeRefundRequest(db, { ...request, ...override });

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(transitionCount(targetId)).resolves.toBe(1);
  });

  it("rejects an operation key whose transition belongs to another attempt", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const evidenceAttemptId = await seedAttempt(fixture, { status: RefundAttemptStatus.FAILED_TERMINAL });
    const request = input(fixture.orderId, targetId);
    await seedCloseTransition(evidenceAttemptId, {
      operationKey: `refund-close:${targetId}:${request.closeOperationId}`,
    });

    const result = await closeRefundRequest(db, request);

    expect(result).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  });

  it.each([
    ["orderId", " ", "INVALID_ORDER_ID"],
    ["refundAttemptId", " ", "INVALID_REFUND_ATTEMPT_ID"],
    ["closeOperationId", " ", "INVALID_CLOSE_OPERATION_ID"],
    ["reason", " ", "INVALID_REASON"],
    ["actorUserId", " ", "INVALID_ACTOR_USER_ID"],
  ] as const)("validates %s", async (field, value, code) => {
    const result = await closeRefundRequest(db, {
      ...input("order", "attempt"),
      [field]: value,
    });
    expect(result).toMatchObject({ ok: false, code });
  });

  it("requires actor identity for ADMIN and validates now", async () => {
    await expect(closeRefundRequest(db, {
      ...input("order", "attempt"),
      actorUserId: null,
    })).resolves.toMatchObject({ ok: false, code: "INVALID_ACTOR_USER_ID" });
    await expect(closeRefundRequest(db, {
      ...input("order", "attempt"),
      now: new Date(Number.NaN),
    })).resolves.toMatchObject({ ok: false, code: "INVALID_CLOSE_TIMESTAMP" });
  });

  it("returns ORDER_NOT_FOUND", async () => {
    await expect(closeRefundRequest(db, input(`missing_${randomUUID()}`, `attempt_${randomUUID()}`)))
      .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND" });
  });

  it("returns REFUND_ATTEMPT_NOT_FOUND for missing and wrong-order targets", async () => {
    const first = await createOrder(ctx);
    const second = await createOrder(ctx);
    const secondAttempt = await seedAttempt(second);

    await expect(closeRefundRequest(db, input(first.orderId, `missing_${randomUUID()}`)))
      .resolves.toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_FOUND" });
    await expect(closeRefundRequest(db, input(first.orderId, secondAttempt)))
      .resolves.toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_FOUND" });
  });

  it("rejects an Order outside REFUND_PENDING without changing the target", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.PAID });
    const targetId = await seedAttempt(fixture);

    const result = await closeRefundRequest(db, input(fixture.orderId, targetId));

    expect(result).toMatchObject({ ok: false, code: "ORDER_STATUS_CONFLICT" });
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
  });

  it.each([
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.FAILED_RETRYABLE,
    RefundAttemptStatus.MANUAL_REVIEW,
  ])("classifies %s as provider contact started", async (status) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status });

    await expect(closeRefundRequest(db, input(fixture.orderId, targetId)))
      .resolves.toMatchObject({ ok: false, code: "PROVIDER_CONTACT_ALREADY_STARTED" });
  });

  it.each([
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.FAILED_TERMINAL,
    RefundAttemptStatus.CANCELLED,
  ])("classifies %s as not cancellable", async (status) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status });

    await expect(closeRefundRequest(db, input(fixture.orderId, targetId)))
      .resolves.toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_CANCELLABLE" });
  });

  it("rejects REQUESTED with provider identity as contacted", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { providerRefundId: `provider_refund_${randomUUID()}` });

    await expect(closeRefundRequest(db, input(fixture.orderId, targetId)))
      .resolves.toMatchObject({ ok: false, code: "PROVIDER_CONTACT_ALREADY_STARTED" });
  });

  it("rejects multiple open attempts", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });

    const result = await closeRefundRequest(db, input(fixture.orderId, targetId));

    expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  });

  it("rejects a non-SUCCEEDED payment", async () => {
    const fixture = await createOrder(ctx, { paymentStatus: PaymentAttemptStatus.FAILED });
    const targetId = await seedAttempt(fixture);
    await expectLedgerFailure(fixture, targetId);
  });

  it.each([
    { orderAmount: 900, paymentAmount: 1_000 },
    { orderCurrency: "KRW", paymentCurrency: "USD" },
  ])("rejects Order/Payment identity mismatch: %o", async (options) => {
    const fixture = await createOrder(ctx, options);
    const targetId = await seedAttempt(fixture);
    await expectLedgerFailure(fixture, targetId);
  });

  it("rejects target payment identity mismatch", async () => {
    const fixture = await createOrder(ctx);
    const other = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { paymentId: other.paymentId });
    await expectLedgerFailure(fixture, targetId);
  });

  it.each([
    ["provider", { provider: PaymentProvider.PAYPAL }],
    ["mode", { mode: PaymentMode.LIVE }],
  ] as const)("rejects historical %s mismatch through the shared identity predicate", async (_field, options) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, options);

    await expectLedgerFailure(fixture, targetId);
  });

  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 200, currency: "USD" },
  ])("rejects invalid target ledger data: %o", async (attemptOptions) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, attemptOptions);
    await expectLedgerFailure(fixture, targetId);
  });

  it.each([
    { first: 600, second: 400 },
    { first: 700, second: 400 },
  ])("rejects equal or over-total succeeded ledger: %o", async ({ first, second }) => {
    const fixture = await createOrder(ctx);
    await seedAttempt(fixture, { status: RefundAttemptStatus.SUCCEEDED, amount: first });
    await seedAttempt(fixture, { status: RefundAttemptStatus.SUCCEEDED, amount: second });
    const targetId = await seedAttempt(fixture, { amount: 100 });
    await expectLedgerFailure(fixture, targetId);
  });

  it("rolls back target and Order when transition insertion throws", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const outOfRangePostgresDate = new Date(-8_640_000_000_000_000);

    await expect(closeRefundRequest(db, input(fixture.orderId, targetId, {
      now: outOfRangePostgresDate,
    }))).rejects.toBeDefined();

    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    await expect(transitionCount(targetId)).resolves.toBe(0);
  });

  it("serializes same-operation closes into one success and one exact replay", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = input(fixture.orderId, targetId);
    const contenders: Promise<CloseRefundRequestResult>[] = [];

    await db.$transaction(async (tx) => {
      await lockOrder(tx, fixture.orderId);
      contenders.push(closeRefundRequest(db, request), closeRefundRequest(db, request));
      expect(await settlesWithin(contenders[0], 40)).toBe(false);
      expect(await settlesWithin(contenders[1], 40)).toBe(false);
    });

    const results = await Promise.all(contenders);
    expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
    await expect(transitionCount(targetId)).resolves.toBe(1);
  });

  it("serializes distinct-operation closes into one success and one not-cancellable result", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const contenders: Promise<CloseRefundRequestResult>[] = [];

    await db.$transaction(async (tx) => {
      await lockOrder(tx, fixture.orderId);
      contenders.push(
        closeRefundRequest(db, input(fixture.orderId, targetId, { closeOperationId: "close_a" })),
        closeRefundRequest(db, input(fixture.orderId, targetId, { closeOperationId: "close_b" })),
      );
      expect(await settlesWithin(contenders[0], 40)).toBe(false);
      expect(await settlesWithin(contenders[1], 40)).toBe(false);
    });

    const results = await Promise.all(contenders);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: "REFUND_ATTEMPT_NOT_CANCELLABLE" }),
    ]);
    await expect(transitionCount(targetId)).resolves.toBe(1);
  });

  it("loses safely when the production claim is first in the observed Order-lock queue", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    await seedRequestCreationTransition(targetId);
    const claimSession = createNamedDbSession("claim_first");
    const closeSession = createNamedDbSession("close_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        claimSession,
        () => claimRefundAttemptForExecution(
          claimSession.client,
          claimInput(fixture.orderId, targetId),
        ),
        closeSession,
        () => closeRefundRequest(closeSession.client, input(fixture.orderId, targetId)),
      );
      const [claim, close] = await Promise.all([queued.first, queued.second]);

      expect(claim).toMatchObject({ ok: true, replayed: false });
      expect(close).toMatchObject({ ok: false, code: "PROVIDER_CONTACT_ALREADY_STARTED" });
      expect(queued.firstWait.blockingPids).toContain(queued.holderPid);
      expect(queued.secondWait.blockingPids).toContain(queued.firstWait.pid);
      await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.PROCESSING);
      await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
      await expect(paymentStatus(fixture.paymentId)).resolves.toBe(PaymentAttemptStatus.SUCCEEDED);
      await expect(commandCount(targetId)).resolves.toBe(1);
      await expect(claimTransitionCount(targetId)).resolves.toBe(1);
      await expect(closeTransitionCount(targetId)).resolves.toBe(0);
    } finally {
      await disconnectSessions(claimSession, closeSession);
    }
  });

  it("prevents production claim when close is first in the observed Order-lock queue", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    await seedRequestCreationTransition(targetId);
    const closeSession = createNamedDbSession("close_first");
    const claimSession = createNamedDbSession("claim_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        closeSession,
        () => closeRefundRequest(closeSession.client, input(fixture.orderId, targetId)),
        claimSession,
        () => claimRefundAttemptForExecution(
          claimSession.client,
          claimInput(fixture.orderId, targetId),
        ),
      );
      const [close, claim] = await Promise.all([queued.first, queued.second]);

      expect(close).toMatchObject({ ok: true, replayed: false });
      expect(claim).toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_CLAIMABLE" });
      expect(queued.firstWait.blockingPids).toContain(queued.holderPid);
      expect(queued.secondWait.blockingPids).toContain(queued.firstWait.pid);
      await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.CANCELLED);
      await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
      await expect(paymentStatus(fixture.paymentId)).resolves.toBe(PaymentAttemptStatus.SUCCEEDED);
      await expect(commandCount(targetId)).resolves.toBe(0);
      await expect(claimTransitionCount(targetId)).resolves.toBe(0);
      await expect(closeTransitionCount(targetId)).resolves.toBe(1);
    } finally {
      await disconnectSessions(closeSession, claimSession);
    }
  });
});

function input(
  orderId: string,
  refundAttemptId: string,
  overrides: Partial<CloseRefundRequestInput> = {},
): CloseRefundRequestInput {
  return {
    orderId,
    refundAttemptId,
    closeOperationId: `close_${randomUUID()}`,
    reason: "Withdraw unexecuted refund request",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    now: NOW,
    ...overrides,
  };
}

function claimInput(orderId: string, refundAttemptId: string): ClaimRefundAttemptForExecutionInput {
  return {
    orderId,
    refundAttemptId,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    now: NOW,
  };
}

async function createOrder(context: TestContext, options: OrderOptions = {}): Promise<OrderFixture> {
  const amount = options.orderAmount ?? 1_000;
  const currency = options.orderCurrency ?? "KRW";
  const sessionId = await createSession(context, options.paymentAmount ?? 1_000, options.paymentCurrency ?? "KRW");
  const paymentId = await createPayment(context, sessionId, options);
  const order = await db.order.create({
    data: {
      checkoutSessionId: sessionId,
      paymentId,
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      status: options.orderStatus ?? OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
    select: { id: true },
  });
  context.orderIds.push(order.id);
  return { orderId: order.id, paymentId, sessionId, amount, currency };
}

async function createSession(context: TestContext, amount: number, currency: string): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency,
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
    select: { id: true },
  });
  context.sessionIds.push(session.id);
  return session.id;
}

async function createPayment(context: TestContext, sessionId: string, options: OrderOptions): Promise<string> {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: options.paymentStatus ?? PaymentAttemptStatus.SUCCEEDED,
      amount: options.paymentAmount ?? 1_000,
      currency: options.paymentCurrency ?? "KRW",
      providerPaymentKey: `provider_payment_${randomUUID()}`,
      idempotencyKey: `payment_idem_${randomUUID()}`,
    },
    select: { id: true },
  });
  context.paymentIds.push(payment.id);
  return payment.id;
}

async function seedAttempt(fixture: OrderFixture, options: AttemptOptions = {}): Promise<string> {
  const id = options.id ?? `refund_${randomUUID()}`;
  const identity = attemptIdentity(fixture, options);
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: identity.paymentId,
      amount: options.amount ?? 400,
      currency: identity.currency,
      status: options.status ?? RefundAttemptStatus.REQUESTED,
      reason: "Seed refund request",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      provider: identity.provider,
      mode: identity.mode,
      providerRefundId: options.providerRefundId ?? null,
      idempotencyKey: `refund:${identity.paymentId}:${id}`,
      requestedAt: NOW,
    },
  });
  return id;
}

function attemptIdentity(fixture: OrderFixture, options: AttemptOptions) {
  return {
    paymentId: options.paymentId ?? fixture.paymentId,
    currency: options.currency ?? fixture.currency,
    provider: options.provider ?? PaymentProvider.MOCK,
    mode: options.mode ?? PaymentMode.SANDBOX,
  };
}

async function seedCloseTransition(
  refundAttemptId: string,
  overrides: { operationKey: string; reason?: string },
): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.CANCELLED,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.PAID,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      reason: overrides.reason ?? "Withdraw unexecuted refund request",
      operationKey: overrides.operationKey,
      createdAt: NOW,
    },
  });
}

async function seedRequestCreationTransition(refundAttemptId: string): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: OrderStatus.PAID,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: "Seed refund request",
      operationKey: `refund-request:${refundAttemptId}`,
      createdAt: NOW,
    },
  });
}

async function expectLedgerFailure(fixture: OrderFixture, targetId: string): Promise<void> {
  const beforePayment = await db.payment.findUniqueOrThrow({
    where: { id: fixture.paymentId },
    select: { id: true, status: true, amount: true, currency: true, provider: true, mode: true },
  });
  const beforeTransitionCount = await transitionCount(targetId);

  const result = await closeRefundRequest(db, input(fixture.orderId, targetId));

  expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
  await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
  await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
  await expect(transitionCount(targetId)).resolves.toBe(beforeTransitionCount);
  await expect(db.payment.findUniqueOrThrow({
    where: { id: fixture.paymentId },
    select: { id: true, status: true, amount: true, currency: true, provider: true, mode: true },
  })).resolves.toEqual(beforePayment);
}

function success(result: CloseRefundRequestResult): Extract<CloseRefundRequestResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected close success, received ${result.code}.`);
  return result;
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
}

function attemptStatus(refundAttemptId: string): Promise<RefundAttemptStatus> {
  return db.refundAttempt.findUniqueOrThrow({
    where: { id: refundAttemptId },
    select: { status: true },
  }).then((attempt) => attempt.status);
}

function orderStatus(orderId: string): Promise<OrderStatus> {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    .then((order) => order.status);
}

function paymentStatus(paymentId: string): Promise<PaymentAttemptStatus> {
  return db.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { status: true } })
    .then((payment) => payment.status);
}

function commandCount(refundAttemptId: string): Promise<number> {
  return db.refundExecutionCommand.count({ where: { refundAttemptId } });
}

function claimTransitionCount(refundAttemptId: string): Promise<number> {
  return db.refundAttemptTransition.count({
    where: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.PROCESSING,
    },
  });
}

function closeTransitionCount(refundAttemptId: string): Promise<number> {
  return db.refundAttemptTransition.count({
    where: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.CANCELLED,
    },
  });
}

function closeTransitions(refundAttemptId: string) {
  return db.refundAttemptTransition.findMany({
    where: { refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
    orderBy: { createdAt: "asc" },
  });
}

function transitionCount(refundAttemptId: string): Promise<number> {
  return db.refundAttemptTransition.count({
    where: { refundAttemptId, fromStatus: RefundAttemptStatus.REQUESTED },
  });
}

function eventCount(sessionId: string): Promise<number> {
  return db.paymentEvent.count({ where: { checkoutSessionId: sessionId } });
}

function outboxCount(refundAttemptId: string): Promise<number> {
  return db.paymentOutbox.count({ where: { dedupKey: { contains: refundAttemptId } } });
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

async function cleanup(contexts: readonly TestContext[]): Promise<void> {
  const orderIds = contexts.flatMap((context) => context.orderIds);
  const paymentIds = contexts.flatMap((context) => context.paymentIds);
  const sessionIds = contexts.flatMap((context) => context.sessionIds);
  const attempts = await db.refundAttempt.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: { in: attempts.map((attempt) => attempt.id) } },
    select: { id: true },
  });
  await db.refundExecutionEvidence.deleteMany({
    where: { commandId: { in: commands.map((command) => command.id) } },
  });
  await db.refundExecutionCommand.deleteMany({
    where: { id: { in: commands.map((command) => command.id) } },
  });
  await db.refundAttemptTransition.deleteMany({
    where: { refundAttemptId: { in: attempts.map((attempt) => attempt.id) } },
  });
  await db.refundAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: contexts.map((context) => context.userId) } } });
}
