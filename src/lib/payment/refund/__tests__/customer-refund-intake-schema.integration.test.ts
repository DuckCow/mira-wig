import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
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

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-14T09:00:00.000Z");
const TERMINAL_AT = new Date("2026-07-14T09:05:00.000Z");

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
}

interface TestContext {
  ownerUserId: string;
  otherUserId: string;
  orders: [OrderFixture, OrderFixture];
}

describe("customer refund intake schema", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createFixture();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("accepts every valid intake status matrix", async () => {
    const approvedAttemptId = await createRefundAttempt(ctx.orders[0]);
    const rows = await Promise.all([
      db.customerRefundIntake.create({
        data: intakeData(ctx, { id: intakeId("submitted") }),
      }),
      db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("withdrawn"),
          status: CustomerRefundIntakeStatus.WITHDRAWN,
          withdrawnAt: TERMINAL_AT,
        }),
      }),
      db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("rejected"),
          status: CustomerRefundIntakeStatus.REJECTED,
          reviewedAt: TERMINAL_AT,
          reviewedByUserId: "admin-reviewer",
          adminRejectionReason: "Merchant review rejected the intake",
        }),
      }),
      db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("approved"),
          status: CustomerRefundIntakeStatus.APPROVED,
          reviewedAt: TERMINAL_AT,
          reviewedByUserId: "admin-reviewer",
          approvedRefundAttemptId: approvedAttemptId,
        }),
      }),
    ]);

    expect(rows.map((row) => row.status)).toEqual(expect.arrayContaining([
      CustomerRefundIntakeStatus.SUBMITTED,
      CustomerRefundIntakeStatus.WITHDRAWN,
      CustomerRefundIntakeStatus.REJECTED,
      CustomerRefundIntakeStatus.APPROVED,
    ]));
  });

  it("stores a reviewer actor-ID snapshot longer than 255 characters without a User relation", async () => {
    const longReviewerId = `admin-${"r".repeat(300)}`;
    const intake = await db.customerRefundIntake.create({
      data: intakeData(ctx, {
        id: intakeId("long-reviewer"),
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: longReviewerId,
        adminRejectionReason: "Merchant review rejected the intake",
      }),
    });

    expect(intake).toMatchObject({
      status: CustomerRefundIntakeStatus.REJECTED,
      reviewedByUserId: longReviewerId,
    });
    expect(intake.reviewedByUserId).toHaveLength(longReviewerId.length);
  });

  it.each([
    {
      label: "SUBMITTED with withdrawnAt",
      constraint: "CustomerRefundIntake_withdrawal_coherence_check",
      override: { withdrawnAt: TERMINAL_AT },
    },
    {
      label: "SUBMITTED with reviewedAt and reviewer",
      constraint: "CustomerRefundIntake_review_coherence_check",
      override: { reviewedAt: TERMINAL_AT, reviewedByUserId: "admin-reviewer" },
    },
    {
      label: "SUBMITTED with reviewer only",
      constraint: "CustomerRefundIntake_reviewer_pair_check",
      override: { reviewedByUserId: "admin-reviewer" },
    },
    {
      label: "SUBMITTED with rejection rationale",
      constraint: "CustomerRefundIntake_rejection_coherence_check",
      override: { adminRejectionReason: "Not approved" },
    },
    {
      label: "SUBMITTED with approved link",
      constraint: "CustomerRefundIntake_approval_link_coherence_check",
      override: { approvedRefundAttemptId: "USE_ATTEMPT" },
    },
    {
      label: "WITHDRAWN without withdrawnAt",
      constraint: "CustomerRefundIntake_withdrawal_coherence_check",
      override: { status: CustomerRefundIntakeStatus.WITHDRAWN },
    },
    {
      label: "WITHDRAWN with review fields",
      constraint: "CustomerRefundIntake_review_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: TERMINAL_AT,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
      },
    },
    {
      label: "WITHDRAWN with rejection rationale",
      constraint: "CustomerRefundIntake_rejection_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: TERMINAL_AT,
        adminRejectionReason: "Not approved",
      },
    },
    {
      label: "WITHDRAWN with approved link",
      constraint: "CustomerRefundIntake_approval_link_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: TERMINAL_AT,
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "REJECTED without reviewedAt",
      constraint: "CustomerRefundIntake_review_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        adminRejectionReason: "Not approved",
      },
    },
    {
      label: "REJECTED without reviewer",
      constraint: "CustomerRefundIntake_reviewer_pair_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        adminRejectionReason: "Not approved",
      },
    },
    {
      label: "REJECTED without rationale",
      constraint: "CustomerRefundIntake_rejection_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
      },
    },
    {
      label: "REJECTED with withdrawnAt",
      constraint: "CustomerRefundIntake_withdrawal_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        withdrawnAt: TERMINAL_AT,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
      },
    },
    {
      label: "REJECTED with approved link",
      constraint: "CustomerRefundIntake_approval_link_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "APPROVED without reviewedAt",
      constraint: "CustomerRefundIntake_review_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "APPROVED without reviewer",
      constraint: "CustomerRefundIntake_reviewer_pair_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: TERMINAL_AT,
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "APPROVED without link",
      constraint: "CustomerRefundIntake_approval_link_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
      },
    },
    {
      label: "APPROVED with withdrawnAt",
      constraint: "CustomerRefundIntake_withdrawal_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        withdrawnAt: TERMINAL_AT,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "APPROVED with rejection rationale",
      constraint: "CustomerRefundIntake_rejection_coherence_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "blank reviewer",
      constraint: "CustomerRefundIntake_reviewer_nonblank_check",
      override: {
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "   ",
        approvedRefundAttemptId: "USE_ATTEMPT",
      },
    },
    {
      label: "blank rejection rationale",
      constraint: "CustomerRefundIntake_rejection_reason_nonblank_check",
      override: {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "   ",
      },
    },
    {
      label: "blank optional reason detail",
      constraint: "CustomerRefundIntake_reason_detail_nonblank_check",
      override: { reasonDetail: "   " },
    },
  ])("rejects an invalid status matrix: $label", async ({ override, constraint }) => {
    const approvedAttemptId = await createRefundAttempt(ctx.orders[0]);
    const resolved = {
      ...override,
      approvedRefundAttemptId: override.approvedRefundAttemptId === "USE_ATTEMPT"
        ? approvedAttemptId
        : override.approvedRefundAttemptId,
    };

    await expectConstraint(
      db.customerRefundIntake.create({ data: intakeData(ctx, resolved) }),
      constraint,
    );
  });

  it("enforces one concurrent SUBMITTED intake per Order", async () => {
    const results = await Promise.allSettled([
      db.customerRefundIntake.create({ data: intakeData(ctx, { id: intakeId("concurrent-a") }) }),
      db.customerRefundIntake.create({ data: intakeData(ctx, { id: intakeId("concurrent-b") }) }),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0].status !== "rejected") throw new Error("Expected one rejected concurrent insert.");
    expectPrismaErrorCode(failures[0].reason, "P2002");
  });

  it("allows one open intake on each different Order", async () => {
    const rows = await Promise.all([
      db.customerRefundIntake.create({ data: intakeData(ctx, { id: intakeId("order-a") }) }),
      db.customerRefundIntake.create({
        data: intakeData(ctx, { id: intakeId("order-b"), orderId: ctx.orders[1].orderId }),
      }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("allows a later SUBMITTED intake and unrestricted terminal history", async () => {
    const first = await db.customerRefundIntake.create({
      data: intakeData(ctx, { id: intakeId("first-open") }),
    });
    await db.customerRefundIntake.update({
      where: { id: first.id },
      data: {
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: TERMINAL_AT,
        reviewedByUserId: "admin-reviewer",
        adminRejectionReason: "Not approved",
      },
    });
    await db.customerRefundIntake.create({
      data: intakeData(ctx, {
        id: intakeId("withdrawn-history"),
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: TERMINAL_AT,
      }),
    });
    const later = await db.customerRefundIntake.create({
      data: intakeData(ctx, { id: intakeId("later-open") }),
    });

    await expect(db.customerRefundIntake.count({ where: { orderId: ctx.orders[0].orderId } })).resolves.toBe(3);
    expect(later.status).toBe(CustomerRefundIntakeStatus.SUBMITTED);
  });

  it("deploys only the intended indexes and the manually owned partial predicate", async () => {
    const indexes = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>(Prisma.sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'CustomerRefundIntake'
        AND indexname <> 'CustomerRefundIntake_pkey'
      ORDER BY indexname
    `);
    const partialIndex = indexes.find(
      (index) => index.indexname === "CustomerRefundIntake_orderId_submitted_key",
    );

    expect(indexes.map((index) => index.indexname)).toEqual([
      "CustomerRefundIntake_approvedRefundAttemptId_key",
      "CustomerRefundIntake_orderId_submittedAt_idx",
      "CustomerRefundIntake_orderId_submitted_key",
      "CustomerRefundIntake_status_submittedAt_idx",
    ]);
    expect(partialIndex?.indexdef).toContain(
      'UNIQUE INDEX "CustomerRefundIntake_orderId_submitted_key"',
    );
    expect(partialIndex?.indexdef).toContain(
      'WHERE (status = \'SUBMITTED\'::"CustomerRefundIntakeStatus")',
    );
  });

  it("accepts 500 code points and rejects 501 for reasonDetail", async () => {
    for (const value of ["a".repeat(500), "😀".repeat(500)]) {
      await db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("detail-accepted"),
          status: CustomerRefundIntakeStatus.WITHDRAWN,
          withdrawnAt: TERMINAL_AT,
          reasonDetail: value,
        }),
      });
    }
    for (const value of ["a".repeat(501), "😀".repeat(501)]) {
      await expectBoundFailure(db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("detail-rejected"),
          status: CustomerRefundIntakeStatus.WITHDRAWN,
          withdrawnAt: TERMINAL_AT,
          reasonDetail: value,
        }),
      }));
    }
  });

  it("accepts 500 code points and rejects 501 for adminRejectionReason", async () => {
    for (const value of ["a".repeat(500), "😀".repeat(500)]) {
      await db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("rejection-accepted"),
          status: CustomerRefundIntakeStatus.REJECTED,
          reviewedAt: TERMINAL_AT,
          reviewedByUserId: "admin-reviewer",
          adminRejectionReason: value,
        }),
      });
    }
    for (const value of ["a".repeat(501), "😀".repeat(501)]) {
      await expectBoundFailure(db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("rejection-rejected"),
          status: CustomerRefundIntakeStatus.REJECTED,
          reviewedAt: TERMINAL_AT,
          reviewedByUserId: "admin-reviewer",
          adminRejectionReason: value,
        }),
      }));
    }
  });

  it("enforces all three foreign keys", async () => {
    await expectConstraint(
      db.customerRefundIntake.create({
        data: intakeData(ctx, { id: intakeId("bad-order"), orderId: "missing-order" }),
      }),
      "CustomerRefundIntake_orderId_fkey",
    );
    await expectConstraint(
      db.customerRefundIntake.create({
        data: intakeData(ctx, { id: intakeId("bad-customer"), customerUserId: "missing-user" }),
      }),
      "CustomerRefundIntake_customerUserId_fkey",
    );
    await expectConstraint(
      db.customerRefundIntake.create({
        data: intakeData(ctx, {
          id: intakeId("bad-attempt"),
          status: CustomerRefundIntakeStatus.APPROVED,
          reviewedAt: TERMINAL_AT,
          reviewedByUserId: "admin-reviewer",
          approvedRefundAttemptId: "missing-attempt",
        }),
      }),
      "CustomerRefundIntake_approvedRefundAttemptId_fkey",
    );
  });

  it("restricts deletion of a referenced Order", async () => {
    await db.customerRefundIntake.create({ data: intakeData(ctx) });

    await expectConstraint(
      db.order.delete({ where: { id: ctx.orders[0].orderId } }),
      "CustomerRefundIntake_orderId_fkey",
    );
  });

  it("restricts deletion of the referenced customer User", async () => {
    await db.customerRefundIntake.create({
      data: intakeData(ctx, { customerUserId: ctx.otherUserId }),
    });

    await expectConstraint(
      db.user.delete({ where: { id: ctx.otherUserId } }),
      "CustomerRefundIntake_customerUserId_fkey",
    );
  });

  it("restricts deletion and duplicate linkage of an approved RefundAttempt", async () => {
    const approvedRefundAttemptId = await createRefundAttempt(ctx.orders[0]);
    await db.customerRefundIntake.create({
      data: approvedIntakeData(ctx, approvedRefundAttemptId, intakeId("approved-first")),
    });

    await expectConstraint(
      db.refundAttempt.delete({ where: { id: approvedRefundAttemptId } }),
      "CustomerRefundIntake_approvedRefundAttemptId_fkey",
    );
    await expectPrismaCode(
      db.customerRefundIntake.create({
        data: approvedIntakeData(ctx, approvedRefundAttemptId, intakeId("approved-second")),
      }),
      "P2002",
    );
  });

  it("keeps direct-admin RefundAttempts valid without an intake", async () => {
    const attemptId = await createRefundAttempt(ctx.orders[0]);
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { approvedCustomerRefundIntake: true },
    });

    expect(attempt.approvedCustomerRefundIntake).toBeNull();
  });

  it("loads all three inverse relations", async () => {
    const attemptId = await createRefundAttempt(ctx.orders[0]);
    const intake = await db.customerRefundIntake.create({
      data: approvedIntakeData(ctx, attemptId, intakeId("inverse")),
    });
    const [order, customer, attempt] = await Promise.all([
      db.order.findUniqueOrThrow({
        where: { id: ctx.orders[0].orderId },
        include: { customerRefundIntakes: true },
      }),
      db.user.findUniqueOrThrow({
        where: { id: ctx.ownerUserId },
        include: { customerRefundIntakes: true },
      }),
      db.refundAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: { approvedCustomerRefundIntake: true },
      }),
    ]);

    expect(order.customerRefundIntakes.map((row) => row.id)).toContain(intake.id);
    expect(customer.customerRefundIntakes.map((row) => row.id)).toContain(intake.id);
    expect(attempt.approvedCustomerRefundIntake?.id).toBe(intake.id);
  });

  it("documents raw-schema gaps owned by future transaction cores", async () => {
    const otherOrderAttemptId = await createRefundAttempt(ctx.orders[1]);
    const intake = await db.customerRefundIntake.create({
      data: approvedIntakeData(ctx, otherOrderAttemptId, intakeId("core-owned-gaps"), {
        customerUserId: ctx.otherUserId,
        reviewedByUserId: "non-relational-admin-provenance",
      }),
      include: { order: true, customer: true, approvedRefundAttempt: true },
    });

    // Deliberate schema-boundary proof, not approved application behavior: future locked cores
    // own customer/Order equality, approved Attempt/Order equality, and current-admin authorization.
    expect(intake.customer.id).not.toBe(intake.order.userId);
    expect(intake.approvedRefundAttempt?.orderId).not.toBe(intake.orderId);
    expect(intake.reviewedByUserId).toBe("non-relational-admin-provenance");
  });

  it("deploys no prohibited financial or execution columns", async () => {
    const columns = await db.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'CustomerRefundIntake'
    `);
    const deployed = new Set(columns.map((column) => column.column_name));
    const prohibited = [
      "amount",
      "currency",
      "percentage",
      "paymentId",
      "provider",
      "mode",
      "providerPaymentKey",
      "providerRef",
      "providerRefundId",
      "idempotencyKey",
      "operationKey",
      "commandId",
      "evidenceId",
      "leaseOwner",
      "leaseUntil",
      "dispatchAttempt",
    ];

    expect(prohibited.filter((column) => deployed.has(column))).toEqual([]);
  });
});

function intakeData(
  context: TestContext,
  override: Partial<Prisma.CustomerRefundIntakeUncheckedCreateInput> = {},
): Prisma.CustomerRefundIntakeUncheckedCreateInput {
  return {
    id: intakeId("default"),
    orderId: context.orders[0].orderId,
    customerUserId: context.ownerUserId,
    status: CustomerRefundIntakeStatus.SUBMITTED,
    reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
    submittedAt: NOW,
    ...override,
  };
}

function approvedIntakeData(
  context: TestContext,
  approvedRefundAttemptId: string,
  id: string,
  override: Partial<Prisma.CustomerRefundIntakeUncheckedCreateInput> = {},
): Prisma.CustomerRefundIntakeUncheckedCreateInput {
  return intakeData(context, {
    id,
    status: CustomerRefundIntakeStatus.APPROVED,
    reviewedAt: TERMINAL_AT,
    reviewedByUserId: "admin-reviewer",
    approvedRefundAttemptId,
    ...override,
  });
}

function intakeId(label: string): string {
  return `refund_intake_${label}_${randomUUID()}`;
}

async function expectConstraint(promise: Promise<unknown>, constraint: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(errorDetails(error)).toContain(constraint);
    return;
  }
  throw new Error(`Expected database constraint ${constraint} to reject the write.`);
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expectPrismaErrorCode(error, code);
    return;
  }
  throw new Error(`Expected Prisma error ${code}.`);
}

function expectPrismaErrorCode(error: unknown, code: string): void {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
  expect(error.code).toBe(code);
}

async function expectBoundFailure(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(errorDetails(error)).toMatch(/P2000|too long|value too long/i);
    return;
  }
  throw new Error("Expected the database text bound to reject the write.");
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.code}\n${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}

async function createFixture(): Promise<TestContext> {
  const identity = randomUUID();
  const ownerUserId = `refund_intake_owner_${identity}`;
  const otherUserId = `refund_intake_other_${identity}`;
  await ensureMarket();
  await Promise.all([
    db.user.create({ data: { id: ownerUserId, email: `${ownerUserId}@example.test` } }),
    db.user.create({ data: { id: otherUserId, email: `${otherUserId}@example.test` } }),
  ]);
  const first = await createOrder(ownerUserId, `${identity}_first`);
  const second = await createOrder(ownerUserId, `${identity}_second`);
  return { ownerUserId, otherUserId, orders: [first, second] };
}

async function createOrder(userId: string, identity: string): Promise<OrderFixture> {
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
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `provider_payment_${identity}`,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
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
      status: OrderStatus.PAID,
      paidAt: NOW,
    },
  });
  return { orderId: order.id, paymentId: payment.id, sessionId: session.id };
}

async function createRefundAttempt(order: OrderFixture): Promise<string> {
  const identity = randomUUID();
  const attempt = await db.refundAttempt.create({
    data: {
      orderId: order.orderId,
      paymentId: order.paymentId,
      amount: 1_000,
      currency: "KRW",
      status: RefundAttemptStatus.REQUESTED,
      reason: "Direct admin schema fixture",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin-reviewer",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${order.paymentId}:${identity}`,
      requestedAt: NOW,
    },
  });
  return attempt.id;
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: {
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
    create: {
      code: MARKET_CODE,
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  const orderIds = context.orders.map((order) => order.orderId);
  const attempts = await db.refundAttempt.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.orders.map((order) => order.paymentId) } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.orders.map((order) => order.sessionId) } } });
  await db.user.deleteMany({ where: { id: { in: [context.ownerUserId, context.otherUserId] } } });
}
