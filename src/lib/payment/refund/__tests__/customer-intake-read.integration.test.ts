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
  RefundAttemptActorType,
  RefundAttemptStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  CustomerRefundIntakeReadInvariantError,
  loadCustomerRefundIntakeReadModel,
} from "../customer-intake-read";

const MARKET_CODE = "KR";
const BASE_TIME = new Date("2026-07-15T08:00:00.000Z");

interface TestContext {
  ownerUserId: string;
  otherUserId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

describe("customer refund intake read model", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const identity = randomUUID();
    ctx = {
      ownerUserId: `intake_read_owner_${identity}`,
      otherUserId: `intake_read_other_${identity}`,
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
    vi.restoreAllMocks();
    await cleanup(ctx);
  });

  it("hides missing, non-owned, and invalid Order targets", async () => {
    const otherOrder = await createOrder(ctx, { userId: ctx.otherUserId });
    const query = vi.spyOn(db.order, "findFirst");

    await expect(load("missing-order")).resolves.toBeNull();
    await expect(load(otherOrder.orderId)).resolves.toBeNull();
    await expect(load("   ")).resolves.toBeNull();

    expect(query).toHaveBeenCalledTimes(2);
    const secondCall = query.mock.calls.at(1);
    if (!secondCall) throw new Error("Expected the non-owned Order query.");
    const [args] = secondCall;
    if (!args) throw new Error("Expected the non-owned Order query arguments.");
    expect(args.where).toEqual({ id: otherOrder.orderId, userId: ctx.ownerUserId });
  });

  it("throws a static invariant for a blank server-derived customer identity", async () => {
    const fixture = await createOrder(ctx);

    await expect(loadCustomerRefundIntakeReadModel(db, {
      orderId: fixture.orderId,
      customerUserId: "   ",
      submitEnabled: true,
    })).rejects.toEqual(new CustomerRefundIntakeReadInvariantError());
  });

  it("returns the exact empty customer-safe projection and advisory availability", async () => {
    const fixture = await createOrder(ctx);

    const result = await load(fixture.orderId);

    expect(result).toEqual({
      orderId: fixture.orderId,
      orderStatus: OrderStatus.PAID,
      latestIntake: null,
      canSubmit: true,
      canWithdraw: false,
      submissionUnavailableReason: null,
    });
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "canSubmit",
      "canWithdraw",
      "latestIntake",
      "orderId",
      "orderStatus",
      "submissionUnavailableReason",
    ]);
  });

  it.each([
    CustomerRefundIntakeStatus.SUBMITTED,
    CustomerRefundIntakeStatus.WITHDRAWN,
    CustomerRefundIntakeStatus.REJECTED,
    CustomerRefundIntakeStatus.APPROVED,
  ])("returns only broad own intake content for %s", async (status) => {
    const fixture = await createOrder(ctx);
    const attemptId = status === CustomerRefundIntakeStatus.APPROVED
      ? await createAttempt(ctx, fixture)
      : null;
    await createIntake(ctx, fixture, status, {
      reasonDetail: `customer own ${status} detail`,
      approvedRefundAttemptId: attemptId,
    });

    const result = await load(fixture.orderId);
    const serialized = JSON.stringify(result);

    expect(result?.latestIntake).toMatchObject({
      status,
      reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
      reasonDetail: `customer own ${status} detail`,
    });
    expect(Object.keys(result?.latestIntake ?? {}).sort()).toEqual([
      "reasonCode", "reasonDetail", "status", "submittedAt", "withdrawnAt",
    ]);
    for (const forbidden of [
      "intakeId", "customerUserId", "reviewedAt", "reviewedByUserId",
      "adminRejectionReason", "approvedRefundAttemptId", "RefundAttemptStatus",
      "provider", "payment", "execution",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("selects the latest own generation with deterministic timestamp ties", async () => {
    const fixture = await createOrder(ctx);
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.WITHDRAWN, {
      id: `intake_tie_a_${randomUUID()}`,
      reasonDetail: "older generation",
      submittedAt: BASE_TIME,
      createdAt: BASE_TIME,
    });
    const laterId = `intake_tie_z_${randomUUID()}`;
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.REJECTED, {
      id: laterId,
      reasonDetail: "latest deterministic generation",
      submittedAt: BASE_TIME,
      createdAt: BASE_TIME,
    });

    const result = await load(fixture.orderId);

    expect(result?.latestIntake).toMatchObject({
      status: CustomerRefundIntakeStatus.REJECTED,
      reasonDetail: "latest deterministic generation",
    });
    expect(JSON.stringify(result)).not.toContain(laterId);
  });

  it("derives enabled, disabled, Order-state, and PARTIALLY_REFUNDED availability", async () => {
    const paid = await createOrder(ctx);
    const partial = await createOrder(ctx, { status: OrderStatus.PARTIALLY_REFUNDED });
    const cancelled = await createOrder(ctx, { status: OrderStatus.CANCELLED });

    await expect(load(paid.orderId, false)).resolves.toMatchObject({
      canSubmit: false,
      submissionUnavailableReason: "FEATURE_DISABLED",
    });
    await expect(load(partial.orderId)).resolves.toMatchObject({
      canSubmit: true,
      submissionUnavailableReason: null,
    });
    await expect(load(cancelled.orderId)).resolves.toMatchObject({
      canSubmit: false,
      submissionUnavailableReason: "ORDER_STATE_UNAVAILABLE",
    });
  });

  it("identifies an owned open intake and preserves withdrawal independently of the submit gate", async () => {
    const fixture = await createOrder(ctx);
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.SUBMITTED);

    await expect(load(fixture.orderId, false)).resolves.toMatchObject({
      canSubmit: false,
      canWithdraw: true,
      submissionUnavailableReason: "FEATURE_DISABLED",
    });
    await expect(load(fixture.orderId, true)).resolves.toMatchObject({
      canSubmit: false,
      canWithdraw: true,
      submissionUnavailableReason: "OPEN_INTAKE",
    });
  });

  it("reduces a foreign-provenance open intake to generic unavailability", async () => {
    const fixture = await createOrder(ctx);
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.WITHDRAWN, {
      reasonDetail: "own historical detail",
      submittedAt: new Date(BASE_TIME.getTime() - 60_000),
    });
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.SUBMITTED, {
      customerUserId: ctx.otherUserId,
      reasonDetail: "foreign private detail sentinel",
    });

    const result = await load(fixture.orderId);

    expect(result).toMatchObject({
      canSubmit: false,
      canWithdraw: false,
      submissionUnavailableReason: "UNAVAILABLE",
      latestIntake: { reasonDetail: "own historical detail" },
    });
    expect(JSON.stringify(result)).not.toContain("foreign private detail sentinel");
  });

  it("performs one read query and mutates no Order or intake state", async () => {
    const fixture = await createOrder(ctx);
    await createIntake(ctx, fixture, CustomerRefundIntakeStatus.REJECTED);
    const before = await snapshot(fixture.orderId);
    const query = vi.spyOn(db.order, "findFirst");

    await load(fixture.orderId);

    expect(query).toHaveBeenCalledOnce();
    await expect(snapshot(fixture.orderId)).resolves.toEqual(before);
  });

  function load(orderId: string, submitEnabled = true) {
    return loadCustomerRefundIntakeReadModel(db, {
      orderId,
      customerUserId: ctx.ownerUserId,
      submitEnabled,
    });
  }
});

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: {},
    create: {
      code: MARKET_CODE,
      currency: "KRW",
      shippableCountries: ["KR"],
      defaultLocale: "ko",
    },
  });
}

async function createOrder(
  ctx: TestContext,
  options: { userId?: string; status?: OrderStatus } = {},
) {
  const identity = randomUUID();
  const userId = options.userId ?? ctx.ownerUserId;
  const session = await db.checkoutSession.create({
    data: {
      id: `intake_read_session_${identity}`,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      expiresAt: new Date(BASE_TIME.getTime() + 60_000),
      completedAt: BASE_TIME,
    },
  });
  const payment = await db.payment.create({
    data: {
      id: `intake_read_payment_${identity}`,
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 10_000,
      currency: "KRW",
      providerPaymentKey: `private_payment_key_${identity}`,
      financialSucceededAt: BASE_TIME,
      blockingEndedAt: BASE_TIME,
      idempotencyKey: `private_payment_idem_${identity}`,
    },
  });
  const order = await db.order.create({
    data: {
      id: `intake_read_order_${identity}`,
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      status: options.status ?? OrderStatus.PAID,
      paidAt: BASE_TIME,
    },
  });
  ctx.sessionIds.push(session.id);
  ctx.paymentIds.push(payment.id);
  ctx.orderIds.push(order.id);
  return { orderId: order.id, paymentId: payment.id };
}

async function createAttempt(ctx: TestContext, fixture: { orderId: string; paymentId: string }): Promise<string> {
  const id = `intake_read_attempt_${randomUUID()}`;
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 1_000,
      currency: "KRW",
      status: RefundAttemptStatus.REQUESTED,
      reason: "Merchant rationale",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "private_admin_actor",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `private_attempt_idem_${randomUUID()}`,
      requestedAt: BASE_TIME,
    },
  });
  return id;
}

async function createIntake(
  ctx: TestContext,
  fixture: { orderId: string },
  status: CustomerRefundIntakeStatus,
  override: Record<string, unknown> = {},
) {
  const terminal = terminalFields(status);
  return db.customerRefundIntake.create({
    data: {
      id: `intake_read_${randomUUID()}`,
      orderId: fixture.orderId,
      customerUserId: ctx.ownerUserId,
      status,
      reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
      reasonDetail: "customer own detail",
      submittedAt: BASE_TIME,
      ...terminal,
      ...override,
    },
  });
}

function terminalFields(status: CustomerRefundIntakeStatus) {
  if (status === CustomerRefundIntakeStatus.WITHDRAWN) return { withdrawnAt: BASE_TIME };
  if (status === CustomerRefundIntakeStatus.REJECTED) {
    return {
      reviewedAt: BASE_TIME,
      reviewedByUserId: "private_admin_actor",
      adminRejectionReason: "private admin rationale",
    };
  }
  if (status === CustomerRefundIntakeStatus.APPROVED) {
    return { reviewedAt: BASE_TIME, reviewedByUserId: "private_admin_actor" };
  }
  return {};
}

async function snapshot(orderId: string) {
  return Promise.all([
    db.order.findUnique({ where: { id: orderId } }),
    db.customerRefundIntake.findMany({ where: { orderId }, orderBy: { id: "asc" } }),
  ]);
}

async function cleanup(ctx: TestContext): Promise<void> {
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: ctx.orderIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttempt: { orderId: { in: ctx.orderIds } } } });
  await db.refundAttempt.deleteMany({ where: { orderId: { in: ctx.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: ctx.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: ctx.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: ctx.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: [ctx.ownerUserId, ctx.otherUserId] } } });
}
