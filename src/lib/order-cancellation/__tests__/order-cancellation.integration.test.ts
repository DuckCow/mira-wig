import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { claimRefundAttemptForExecution } from "@/lib/payment/refund/claim";
import { closeRefundRequest } from "@/lib/payment/refund/close";
import { submitCustomerRefundIntake } from "@/lib/payment/refund/customer-intake";
import { approveCustomerRefundIntake } from "@/lib/payment/refund/customer-intake-review";
import { requestRefundAttempt } from "@/lib/payment/refund/request";
import { cancelEligibleMtoOrder } from "../cancel";
import { startMtoProduction } from "../production-start";
import { replaceOutstandingCancellationRefund } from "../replacement";

const MARKET = "KR";
const NOW = new Date("2026-08-28T12:00:00.000Z");

type Fixture = Awaited<ReturnType<typeof createOrder>>;

describe("pre-production MTO whole-Order cancellation", () => {
  const ownedUserIds: string[] = [];

  beforeEach(async () => {
    await db.market.upsert({
      where: { code: MARKET },
      update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko" },
      create: { code: MARKET, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko" },
    });
  });

  afterEach(async () => cleanupUsers(ownedUserIds.splice(0)));

  it("accepts an untouched all-MTO Order as one full captured obligation with full lines", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO, FulfillmentType.MTO], [2, 3]);

    const result = await cancel(fixture);
    expect(result).toMatchObject({ ok: true, replayed: false, expectedRefundAmount: 10_000 });
    const aggregate = await db.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      include: {
        cancellation: true,
        items: { include: { mr: true }, orderBy: { id: "asc" } },
        refundAttempts: { include: { lines: true, transitions: true } },
      },
    });
    expect(aggregate.status).toBe(OrderStatus.REFUND_PENDING);
    expect(aggregate.cancellation).toMatchObject({ requestedByUserId: fixture.userId });
    expect(aggregate.refundAttempts).toHaveLength(1);
    expect(aggregate.refundAttempts[0]).toMatchObject({
      amount: 10_000,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      status: RefundAttemptStatus.REQUESTED,
    });
    expect(aggregate.refundAttempts[0]?.lines
      .map(({ orderItemId, quantity }) => ({ orderItemId, quantity }))
      .sort((left, right) => left.orderItemId.localeCompare(right.orderItemId)))
      .toEqual(aggregate.items
        .map((item) => ({ orderItemId: item.id, quantity: item.quantity }))
        .sort((left, right) => left.orderItemId.localeCompare(right.orderItemId)));
    expect(aggregate.items.every((item) => item.mr?.status === MrStatus.CANCELLED)).toBe(true);
  });

  it("enforces cancellation request and manufacturing audit coherence at the database boundary", async () => {
    const acceptedFixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const accepted = await cancel(acceptedFixture);
    if (!accepted.ok) throw new Error("EXPECTED_CANCELLATION");
    await expect(db.orderCancellation.update({
      where: { orderId: acceptedFixture.orderId },
      data: { requestKey: " " },
    })).rejects.toThrow();
    await expect(db.orderCancellation.findUniqueOrThrow({
      where: { orderId: acceptedFixture.orderId },
      select: { requestKey: true },
    })).resolves.not.toEqual({ requestKey: " " });

    const preProduction = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const mr = preProduction.items[0]?.mr;
    if (!mr) throw new Error("EXPECTED_MR");
    await expect(db.manufacturingRequest.update({
      where: { id: mr.id },
      data: { productionStartRequestKey: randomUUID() },
    })).rejects.toThrow();
    await expect(db.manufacturingRequest.findUniqueOrThrow({
      where: { id: mr.id },
      select: { status: true, startedAt: true, productionStartRequestKey: true, startedByUserId: true },
    })).resolves.toEqual({
      status: MrStatus.RECEIVED,
      startedAt: null,
      productionStartRequestKey: null,
      startedByUserId: null,
    });
  });

  it.each([
    ["STOCKED", [FulfillmentType.STOCKED], "UNSUPPORTED_FULFILLMENT"],
    ["mixed", [FulfillmentType.MTO, FulfillmentType.STOCKED], "UNSUPPORTED_FULFILLMENT"],
    ["no items", [], "NOT_ELIGIBLE"],
  ] as const)("rejects %s", async (_label, fulfillment, code) => {
    const fixture = await createOrder(ownedUserIds, [...fulfillment]);
    await expect(cancel(fixture)).resolves.toMatchObject({ ok: false, code });
    await expect(persistedCounts(fixture.orderId)).resolves.toEqual({ cancellations: 0, attempts: 0 });
  });

  it("rejects missing, started, completed, cancelled, and incoherent manufacturing state", async () => {
    for (const state of ["missing", "started", "completed", "cancelled", "incoherent"] as const) {
      const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
      const mr = fixture.items[0]?.mr;
      if (!mr) throw new Error("EXPECTED_MR");
      if (state === "missing") await db.manufacturingRequest.delete({ where: { id: mr.id } });
      if (state === "started" || state === "completed") {
        await db.manufacturingRequest.update({
          where: { id: mr.id },
          data: {
            status: state === "started" ? MrStatus.IN_PRODUCTION : MrStatus.COMPLETED,
            startedAt: NOW,
            productionStartRequestKey: randomUUID(),
            startedByUserId: fixture.adminUserId,
          },
        });
      }
      if (state === "cancelled") {
        await db.manufacturingRequest.update({ where: { id: mr.id }, data: { status: MrStatus.CANCELLED } });
      }
      if (state === "incoherent") {
        await db.$executeRawUnsafe(
          'ALTER TABLE "ManufacturingRequest" DROP CONSTRAINT "ManufacturingRequest_productionStartAudit_coherent"',
        );
        await db.$executeRaw(Prisma.sql`
          UPDATE "ManufacturingRequest" SET "startedAt" = ${NOW} WHERE "id" = ${mr.id}
        `);
        await db.$executeRawUnsafe(`
          ALTER TABLE "ManufacturingRequest"
          ADD CONSTRAINT "ManufacturingRequest_productionStartAudit_coherent"
          CHECK (
            (
              "status" IN ('IN_PRODUCTION'::"MrStatus", 'COMPLETED'::"MrStatus")
              AND "startedAt" IS NOT NULL
              AND "productionStartRequestKey" IS NOT NULL
              AND "startedByUserId" IS NOT NULL
            ) OR (
              "status" IN ('RECEIVED'::"MrStatus", 'CANCELLED'::"MrStatus")
              AND "startedAt" IS NULL
              AND "productionStartRequestKey" IS NULL
              AND "startedByUserId" IS NULL
            )
          ) NOT VALID
        `);
      }
      await expect(cancel(fixture)).resolves.toMatchObject({ ok: false, code: "MANUFACTURING_STATE_CONFLICT" });
    }
  });

  it("does not distinguish a missing Order from a wrong owner", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const other = await createUser(ownedUserIds, "other");
    const wrongOwner = await cancelEligibleMtoOrder(db, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByUserId: other.id,
    });
    const missing = await cancelEligibleMtoOrder(db, {
      orderId: `missing_${randomUUID()}`,
      requestKey: randomUUID(),
      requestedByUserId: other.id,
    });
    expect(wrongOwner).toEqual(missing);
  });

  it("fails closed for disputes, submitted intake, and guarded or succeeded refund history", async () => {
    const disputed = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    await db.order.update({ where: { id: disputed.orderId }, data: { disputeStatus: "OPEN" } });
    await expect(cancel(disputed)).resolves.toMatchObject({ ok: false, code: "DISPUTE_REVIEW_REQUIRED" });

    const submitted = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    await seedIntake(submitted, CustomerRefundIntakeStatus.SUBMITTED);
    await expect(cancel(submitted)).resolves.toMatchObject({ ok: false, code: "INTAKE_CONFLICT" });

    for (const status of [
      RefundAttemptStatus.REQUESTED,
      RefundAttemptStatus.PROCESSING,
      RefundAttemptStatus.FAILED_RETRYABLE,
      RefundAttemptStatus.MANUAL_REVIEW,
      RefundAttemptStatus.SUCCEEDED,
    ]) {
      const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
      await seedHistoricalAttempt(fixture, status);
      await expect(cancel(fixture)).resolves.toMatchObject({ ok: false, code: "REFUND_HISTORY_CONFLICT" });
    }
  });

  it("admits coherent terminal line-less history and withdrawn, rejected, or linked-approved intake history", async () => {
    const terminal = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const failedId = await seedHistoricalAttempt(terminal, RefundAttemptStatus.REQUESTED);
    await establishTerminalNonExecution(failedId);
    await expect(cancel(terminal)).resolves.toMatchObject({ ok: true });

    const cancelled = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    await seedCancelledHistoricalAttempt(cancelled);
    await expect(cancel(cancelled)).resolves.toMatchObject({ ok: true });

    for (const status of [CustomerRefundIntakeStatus.WITHDRAWN, CustomerRefundIntakeStatus.REJECTED]) {
      const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
      await seedIntake(fixture, status);
      await expect(cancel(fixture)).resolves.toMatchObject({ ok: true });
    }

    const approved = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const approvedAttemptId = await seedHistoricalAttempt(approved, RefundAttemptStatus.REQUESTED);
    await establishTerminalNonExecution(approvedAttemptId);
    await seedIntake(approved, CustomerRefundIntakeStatus.APPROVED, approvedAttemptId);
    await expect(cancel(approved)).resolves.toMatchObject({ ok: true });
  });

  it("serializes two same-key and two different-key cancellations into one obligation", async () => {
    for (const sameKey of [true, false]) {
      const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
      const firstKey = randomUUID();
      const [left, right] = await Promise.all([
        cancelEligibleMtoOrder(db, { orderId: fixture.orderId, requestKey: firstKey, requestedByUserId: fixture.userId }),
        cancelEligibleMtoOrder(db, {
          orderId: fixture.orderId,
          requestKey: sameKey ? firstKey : randomUUID(),
          requestedByUserId: fixture.userId,
        }),
      ]);
      expect([left, right].every((result) => result.ok)).toBe(true);
      expect([left, right].filter((result) => result.ok && result.replayed)).toHaveLength(1);
      await expect(persistedCounts(fixture.orderId)).resolves.toEqual({ cancellations: 1, attempts: 1 });
    }
  });

  it("rejects cross-Order cancellation request-key reuse without affecting the second Order", async () => {
    const first = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const second = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const requestKey = randomUUID();
    await expect(cancelEligibleMtoOrder(db, {
      orderId: first.orderId,
      requestKey,
      requestedByUserId: first.userId,
    })).resolves.toMatchObject({ ok: true });
    await expect(cancelEligibleMtoOrder(db, {
      orderId: second.orderId,
      requestKey,
      requestedByUserId: second.userId,
    })).resolves.toMatchObject({ ok: false, code: "REQUEST_KEY_CONFLICT" });
    await expect(persistedCounts(second.orderId)).resolves.toEqual({ cancellations: 0, attempts: 0 });
  });

  it("serializes cancellation versus production start and forbids the losing decision", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const item = fixture.items[0];
    if (!item) throw new Error("EXPECTED_ITEM");
    const [cancellation, start] = await Promise.all([
      cancel(fixture),
      startMtoProduction(db, {
        orderId: fixture.orderId,
        orderItemId: item.id,
        requestKey: randomUUID(),
        startedByUserId: fixture.adminUserId,
      }),
    ]);
    expect(Number(cancellation.ok) + Number(start.ok)).toBe(1);
    const state = await db.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      include: { cancellation: true, items: { include: { mr: true } } },
    });
    expect(Boolean(state.cancellation)).not.toBe(state.items[0]?.mr?.status === MrStatus.IN_PRODUCTION);
    if (state.cancellation) {
      await expect(startMtoProduction(db, {
        orderId: fixture.orderId,
        orderItemId: item.id,
        requestKey: randomUUID(),
        startedByUserId: fixture.adminUserId,
      })).resolves.toMatchObject({ ok: false, code: "ORDER_CANCELLED" });
    }
  });

  it("one line starting closes whole-Order cancellation while another remains RECEIVED", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO, FulfillmentType.MTO]);
    const item = fixture.items[0];
    if (!item) throw new Error("EXPECTED_ITEM");
    const started = await startMtoProduction(db, {
      orderId: fixture.orderId,
      orderItemId: item.id,
      requestKey: randomUUID(),
      startedByUserId: fixture.adminUserId,
    });
    expect(started.ok).toBe(true);
    await expect(cancel(fixture)).resolves.toMatchObject({ ok: false, code: "MANUFACTURING_STATE_CONFLICT" });
  });

  it("replays production start without changing its audit and bounds other keys, actors, and Orders", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const other = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const item = fixture.items[0];
    const otherItem = other.items[0];
    if (!item || !otherItem) throw new Error("EXPECTED_ITEMS");
    const requestKey = randomUUID();
    const input = {
      orderId: fixture.orderId,
      orderItemId: item.id,
      requestKey,
      startedByUserId: fixture.adminUserId,
    };
    const started = await startMtoProduction(db, input);
    expect(started).toMatchObject({ ok: true, replayed: false });
    const replay = await startMtoProduction(db, input);
    expect(replay).toMatchObject({ ok: true, replayed: true });
    if (!started.ok || !replay.ok) throw new Error("EXPECTED_START_REPLAY");
    expect(replay.startedAt).toEqual(started.startedAt);
    await expect(startMtoProduction(db, { ...input, requestKey: randomUUID() }))
      .resolves.toMatchObject({ ok: false, code: "ALREADY_STARTED" });
    await expect(startMtoProduction(db, { ...input, startedByUserId: other.adminUserId }))
      .resolves.toMatchObject({ ok: false, code: "ALREADY_STARTED" });
    await expect(startMtoProduction(db, { ...input, orderItemId: otherItem.id }))
      .resolves.toMatchObject({ ok: false, code: "ITEM_NOT_FOUND" });
  });

  it("serializes cancellation versus a normal refund admission without two obligations", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const item = fixture.items[0];
    if (!item) throw new Error("EXPECTED_ITEM");
    const [cancellation, normal] = await Promise.all([
      cancel(fixture),
      requestRefundAttempt(db, {
        refundAttemptId: randomUUID(),
        orderId: fixture.orderId,
        amount: 1_000,
        reason: "Ordinary admin refund",
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: fixture.adminUserId,
        now: NOW,
        lines: [{ orderItemId: item.id, quantity: item.quantity }],
      }),
    ]);
    expect(Number(cancellation.ok) + Number(normal.ok)).toBe(1);
    await expect(db.refundAttempt.count({ where: { orderId: fixture.orderId } })).resolves.toBe(1);
  });

  it("re-enters only after confirmed terminal non-execution and requests the exact outstanding amount", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const accepted = await cancel(fixture);
    if (!accepted.ok) throw new Error("EXPECTED_CANCELLATION");
    await establishTerminalNonExecution(accepted.initialRefundAttemptId);

    const replacement = await replaceOutstandingCancellationRefund(db, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByAdminUserId: fixture.adminUserId,
    });
    expect(replacement).toMatchObject({ ok: true, replayed: false, amount: 10_000 });
    if (!replacement.ok) throw new Error("EXPECTED_REPLACEMENT");
    await expect(replaceOutstandingCancellationRefund(db, {
      orderId: fixture.orderId,
      requestKey: replacement.refundAttemptId,
      requestedByAdminUserId: fixture.adminUserId,
    })).resolves.toMatchObject({ ok: true, replayed: true, amount: 10_000 });
    await expect(replaceOutstandingCancellationRefund(db, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByAdminUserId: fixture.adminUserId,
    })).resolves.toMatchObject({ ok: false, code: "REFUND_IN_PROGRESS" });
    await expect(db.orderCancellation.count({ where: { orderId: fixture.orderId } })).resolves.toBe(1);
    await expect(db.manufacturingRequest.findMany({
      where: { orderItem: { orderId: fixture.orderId } },
      select: { status: true },
    })).resolves.toEqual([{ status: MrStatus.CANCELLED }]);
  });

  it("rejects disputed or unusable captured-payment replacement admission without mutation", async () => {
    for (const scenario of ["dispute", "missing-reference", "blank-reference"] as const) {
      const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
      const accepted = await cancel(fixture);
      if (!accepted.ok) throw new Error("EXPECTED_CANCELLATION");
      await establishTerminalNonExecution(accepted.initialRefundAttemptId);
      if (scenario === "dispute") {
        await db.order.update({ where: { id: fixture.orderId }, data: { disputeStatus: "OPEN" } });
      } else if (scenario === "blank-reference") {
        await db.payment.update({
          where: { id: fixture.paymentId },
          data: { providerPaymentKey: "  \t " },
        });
      }
      const assertRejectedWithoutMutation = async () => {
        const before = await replacementMutationState(fixture.orderId);

        const result = await replaceOutstandingCancellationRefund(db, {
          orderId: fixture.orderId,
          requestKey: randomUUID(),
          requestedByAdminUserId: fixture.adminUserId,
        });

        expect(result).toMatchObject({
          ok: false,
          code: scenario === "dispute" ? "DISPUTE_REVIEW_REQUIRED" : "PAYMENT_NOT_REFUNDABLE",
        });
        await expect(replacementMutationState(fixture.orderId)).resolves.toEqual(before);
        expect(before.items).toEqual([{ mr: { status: MrStatus.CANCELLED } }]);
      };
      if (scenario === "missing-reference") {
        await withMissingSucceededPaymentReference(fixture.paymentId, assertRejectedWithoutMutation);
      } else {
        await assertRejectedWithoutMutation();
      }
    }
  });

  it("rejects an inconsistent over-refund obligation without creating another Attempt", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const accepted = await cancel(fixture);
    if (!accepted.ok) throw new Error("EXPECTED_CANCELLATION");
    await establishTerminalNonExecution(accepted.initialRefundAttemptId);
    const historicalRequestedAt = new Date(accepted.acceptedAt.getTime() - 1);
    await seedHistoricalAttempt(fixture, RefundAttemptStatus.SUCCEEDED, {
      amount: 6_000,
      requestedAt: historicalRequestedAt,
    });
    await seedHistoricalAttempt(fixture, RefundAttemptStatus.SUCCEEDED, {
      amount: 5_000,
      requestedAt: historicalRequestedAt,
    });
    const before = await replacementMutationState(fixture.orderId);

    await expect(replaceOutstandingCancellationRefund(db, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByAdminUserId: fixture.adminUserId,
    })).resolves.toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });

    await expect(replacementMutationState(fixture.orderId)).resolves.toEqual(before);
  });

  it("blocks generic close/intake/approval/refund competition and admits the existing executor", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    const accepted = await cancel(fixture);
    if (!accepted.ok) throw new Error("EXPECTED_CANCELLATION");
    await expect(closeRefundRequest(db, {
      orderId: fixture.orderId,
      refundAttemptId: accepted.initialRefundAttemptId,
      closeOperationId: randomUUID(),
      reason: "Generic close must not erase cancellation.",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: fixture.adminUserId,
      now: NOW,
    })).resolves.toMatchObject({ ok: false, code: "CANCELLATION_OBLIGATION_REQUIRED" });
    await expect(submitCustomerRefundIntake(db, {
      orderId: fixture.orderId,
      customerUserId: fixture.userId,
      reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
      reasonDetail: null,
      now: NOW,
    })).resolves.toMatchObject({ ok: false, code: "ORDER_NOT_ELIGIBLE" });
    const intake = await seedIntake(fixture, CustomerRefundIntakeStatus.SUBMITTED);
    await expect(approveCustomerRefundIntake(db, {
      orderId: fixture.orderId,
      intakeId: intake.id,
      reviewedByUserId: fixture.adminUserId,
      amount: 10_000,
      merchantRationale: "Competing approval",
      lines: fixture.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity })),
      now: NOW,
    })).resolves.toMatchObject({ ok: false, code: "NOT_APPROVABLE" });
    await expect(requestRefundAttempt(db, {
      refundAttemptId: randomUUID(),
      orderId: fixture.orderId,
      amount: 10_000,
      reason: "Competing generic refund",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: fixture.adminUserId,
      now: NOW,
      lines: fixture.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity })),
    })).resolves.toMatchObject({ ok: false, code: "ORDER_CANCELLED" });
    await expect(claimRefundAttemptForExecution(db, {
      orderId: fixture.orderId,
      refundAttemptId: accepted.initialRefundAttemptId,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      now: NOW,
    })).resolves.toMatchObject({ ok: true, replayed: false });
  });

  it("rolls every cancellation write back when the guarded MR transition fails", async () => {
    const fixture = await createOrder(ownedUserIds, [FulfillmentType.MTO]);
    await db.$executeRawUnsafe(`
      CREATE FUNCTION order_cancel_c0_force_rollback() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced cancellation rollback'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER order_cancel_c0_force_rollback_trigger
      BEFORE UPDATE ON "ManufacturingRequest"
      FOR EACH ROW EXECUTE FUNCTION order_cancel_c0_force_rollback();
    `);
    try {
      await expect(cancel(fixture)).rejects.toThrow("forced cancellation rollback");
      await expect(persistedCounts(fixture.orderId)).resolves.toEqual({ cancellations: 0, attempts: 0 });
      await expect(db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }))
        .resolves.toEqual({ status: OrderStatus.PAID });
    } finally {
      await db.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS order_cancel_c0_force_rollback_trigger ON "ManufacturingRequest";
        DROP FUNCTION IF EXISTS order_cancel_c0_force_rollback();
      `);
    }
  });
});

async function createOrder(
  ownedUserIds: string[],
  fulfillmentTypes: FulfillmentType[],
  quantities: number[] = [],
) {
  const customer = await createUser(ownedUserIds, "customer");
  const admin = await createUser(ownedUserIds, "admin", "ADMIN");
  const session = await db.checkoutSession.create({ data: {
    userId: customer.id,
    marketCode: MARKET,
    currency: "KRW",
    status: CheckoutSessionStatus.COMPLETED,
    subtotalAmount: 10_000,
    shippingAmount: 0,
    totalAmount: 10_000,
    expiresAt: new Date(NOW.getTime() + 60_000),
    completedAt: NOW,
  } });
  const payment = await db.payment.create({ data: {
    checkoutSessionId: session.id,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    status: PaymentAttemptStatus.SUCCEEDED,
    attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    amount: 10_000,
    currency: "KRW",
    providerPaymentKey: `provider_${randomUUID()}`,
    idempotencyKey: `payment_${randomUUID()}`,
    financialSucceededAt: NOW,
    blockingEndedAt: NOW,
  } });
  const order = await db.order.create({ data: {
    checkoutSessionId: session.id,
    paymentId: payment.id,
    userId: customer.id,
    marketCode: MARKET,
    currency: "KRW",
    subtotalAmount: 10_000,
    shippingAmount: 0,
    totalAmount: 10_000,
    status: OrderStatus.PAID,
    paidAt: NOW,
  } });
  const items: Array<{ id: string; quantity: number; mr: { id: string } | null }> = [];
  for (const [index, fulfillmentType] of fulfillmentTypes.entries()) {
    const style = await db.wigStyle.create({ data: {
      name: `C0 style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    } });
    const variant = await db.wigVariant.create({ data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 5_000,
      sku: `c0-${randomUUID()}`,
      fulfillmentType,
    } });
    const item = await db.orderItem.create({ data: {
      orderId: order.id,
      variantId: variant.id,
      wigStyleId: style.id,
      quantity: quantities[index] ?? 1,
      unitAmount: 5_000,
      fulfillmentType,
      snapshotData: { styleName: style.name },
      mr: fulfillmentType === FulfillmentType.MTO ? { create: {} } : undefined,
    }, include: { mr: true } });
    items.push({
      id: item.id,
      quantity: item.quantity,
      mr: item.mr ? { id: item.mr.id } : null,
    });
  }
  return { orderId: order.id, paymentId: payment.id, userId: customer.id, adminUserId: admin.id, items };
}

async function createUser(ownedUserIds: string[], label: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  const id = `c0_${label}_${randomUUID()}`;
  ownedUserIds.push(id);
  return db.user.create({ data: { id, email: `${id}@example.test`, role } });
}

function cancel(fixture: Fixture) {
  return cancelEligibleMtoOrder(db, {
    orderId: fixture.orderId,
    requestKey: randomUUID(),
    requestedByUserId: fixture.userId,
  });
}

async function seedHistoricalAttempt(
  fixture: Fixture,
  status: RefundAttemptStatus,
  options: { amount?: number; requestedAt?: Date } = {},
): Promise<string> {
  const id = randomUUID();
  await db.refundAttempt.create({ data: {
    id,
    orderId: fixture.orderId,
    paymentId: fixture.paymentId,
    amount: options.amount ?? 1_000,
    currency: "KRW",
    status,
    reason: "Historical refund decision",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: fixture.adminUserId,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    idempotencyKey: `refund:${fixture.paymentId}:${id}`,
    requestedAt: options.requestedAt ?? NOW,
    processedAt: status === RefundAttemptStatus.SUCCEEDED ? NOW : null,
    failedAt: status === RefundAttemptStatus.FAILED_RETRYABLE || status === RefundAttemptStatus.MANUAL_REVIEW
      ? NOW
      : null,
  } });
  return id;
}

async function seedCancelledHistoricalAttempt(fixture: Fixture): Promise<void> {
  const attemptId = await seedHistoricalAttempt(fixture, RefundAttemptStatus.CANCELLED);
  await db.refundAttemptTransition.create({ data: {
    refundAttemptId: attemptId,
    fromStatus: RefundAttemptStatus.REQUESTED,
    toStatus: RefundAttemptStatus.CANCELLED,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: OrderStatus.PAID,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: fixture.adminUserId,
    reason: "Historical pre-contact close.",
    operationKey: `refund-close:${attemptId}:${randomUUID()}`,
    createdAt: NOW,
  } });
}

async function seedIntake(
  fixture: Fixture,
  status: CustomerRefundIntakeStatus,
  approvedRefundAttemptId: string | null = null,
) {
  const reviewed = status === CustomerRefundIntakeStatus.APPROVED
    || status === CustomerRefundIntakeStatus.REJECTED;
  return db.customerRefundIntake.create({ data: {
    orderId: fixture.orderId,
    customerUserId: fixture.userId,
    status,
    reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
    reasonDetail: null,
    submittedAt: NOW,
    withdrawnAt: status === CustomerRefundIntakeStatus.WITHDRAWN ? NOW : null,
    reviewedAt: reviewed ? NOW : null,
    reviewedByUserId: reviewed ? fixture.adminUserId : null,
    adminRejectionReason: status === CustomerRefundIntakeStatus.REJECTED ? "Historical rejection." : null,
    approvedRefundAttemptId: status === CustomerRefundIntakeStatus.APPROVED ? approvedRefundAttemptId : null,
  } });
}

async function establishTerminalNonExecution(refundAttemptId: string): Promise<void> {
  const command = await db.refundExecutionCommand.create({ data: {
    refundAttemptId,
    status: RefundExecutionCommandStatus.DONE,
  } });
  const observedAt = new Date();
  const evidence = await db.refundExecutionEvidence.create({ data: {
    commandId: command.id,
    source: RefundExecutionEvidenceSource.OPERATOR,
    sourceDedupKey: `c0-terminal:${refundAttemptId}`,
    outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
    application: RefundExecutionEvidenceApplication.APPLIED,
    observedAt,
  } });
  await db.refundAttempt.update({
    where: { id: refundAttemptId },
    data: { status: RefundAttemptStatus.FAILED_TERMINAL, failedAt: observedAt },
  });
  await db.refundAttemptTransition.create({ data: {
    refundAttemptId,
    fromStatus: RefundAttemptStatus.PROCESSING,
    toStatus: RefundAttemptStatus.FAILED_TERMINAL,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: OrderStatus.PAID,
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: null,
    reason: "Confirmed terminal non-execution.",
    operationKey: `refund-result:${evidence.id}`,
    createdAt: observedAt,
  } });
  const attempt = await db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId }, select: { orderId: true } });
  await db.order.update({ where: { id: attempt.orderId }, data: { status: OrderStatus.PAID } });
}

async function persistedCounts(orderId: string) {
  const [cancellations, attempts] = await Promise.all([
    db.orderCancellation.count({ where: { orderId } }),
    db.refundAttempt.count({ where: { orderId } }),
  ]);
  return { cancellations, attempts };
}

function replacementMutationState(orderId: string) {
  return db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      disputeStatus: true,
      cancellation: {
        select: {
          id: true,
          orderId: true,
          requestKey: true,
          requestedByUserId: true,
          initialRefundAttemptId: true,
          acceptedAt: true,
        },
      },
      items: {
        orderBy: { id: "asc" },
        select: { mr: { select: { status: true } } },
      },
      refundAttempts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          amount: true,
          lines: {
            orderBy: { orderItemId: "asc" },
            select: { refundAttemptId: true, orderItemId: true, quantity: true },
          },
          transitions: { orderBy: { id: "asc" }, select: { id: true } },
        },
      },
    },
  });
}

async function withMissingSucceededPaymentReference(
  paymentId: string,
  assertion: () => Promise<void>,
): Promise<void> {
  const original = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { providerPaymentKey: true },
  });
  await db.$executeRawUnsafe(
    'ALTER TABLE "Payment" DROP CONSTRAINT "Payment_financial_success_evidence_check"',
  );
  try {
    await db.payment.update({ where: { id: paymentId }, data: { providerPaymentKey: null } });
    await addPaymentSuccessEvidenceConstraint(" NOT VALID");
    await assertion();
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_financial_success_evidence_check"',
    );
    await db.payment.update({
      where: { id: paymentId },
      data: { providerPaymentKey: original.providerPaymentKey },
    });
    await addPaymentSuccessEvidenceConstraint("");
  }
}

function addPaymentSuccessEvidenceConstraint(validation: "" | " NOT VALID"): Promise<number> {
  return db.$executeRawUnsafe(`
    ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_financial_success_evidence_check" CHECK (
      (
        "status" IN ('SUCCEEDED', 'VOIDED')
        AND "providerPaymentKey" IS NOT NULL
        AND "financialSucceededAt" IS NOT NULL
      ) OR (
        "status" NOT IN ('SUCCEEDED', 'VOIDED')
        AND "financialSucceededAt" IS NULL
      )
    )${validation}
  `);
}

async function cleanupUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const orders = await db.order.findMany({ where: { userId: { in: userIds } }, select: { id: true, paymentId: true, checkoutSessionId: true } });
  const orderIds = orders.map(({ id }) => id);
  const attempts = await db.refundAttempt.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const attemptIds = attempts.map(({ id }) => id);
  const commands = await db.refundExecutionCommand.findMany({ where: { refundAttemptId: { in: attemptIds } }, select: { id: true } });
  const commandIds = commands.map(({ id }) => id);
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.orderCancellation.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttemptLine.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.manufacturingRequest.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { variantId: true, wigStyleId: true } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: orders.map(({ paymentId }) => paymentId) } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: orders.map(({ checkoutSessionId }) => checkoutSessionId) } } });
  await db.wigVariant.deleteMany({ where: { id: { in: items.map(({ variantId }) => variantId) } } });
  await db.wigStyle.deleteMany({ where: { id: { in: items.map(({ wigStyleId }) => wigStyleId) } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}
