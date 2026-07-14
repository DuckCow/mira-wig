import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  ADMIN_CUSTOMER_REFUND_INTAKE_DEFAULT_PAGE_SIZE,
  loadAdminCustomerRefundIntakeQueue,
} from "../customer-intake-read";

const MARKET_CODE = "KR";
const BASE_TIME = new Date("2026-07-15T09:00:00.000Z");

interface TestContext {
  identity: string;
  ownerUserId: string;
  otherUserId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

describe("administrator CustomerRefundIntake queue", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const identity = randomUUID();
    ctx = {
      identity,
      ownerUserId: `intake_queue_owner_${identity}`,
      otherUserId: `intake_queue_other_${identity}`,
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

  it.each([
    [{ pageSize: 0 }, "INVALID_PAGE_SIZE"],
    [{ pageSize: 51 }, "INVALID_PAGE_SIZE"],
    [{ pageSize: "1.5" }, "INVALID_PAGE_SIZE"],
    [{ pageSize: Number.NaN }, "INVALID_PAGE_SIZE"],
    [{ cursor: "not+base64url" }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor("not an object") }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 2, submittedAt: BASE_TIME.toISOString(), id: "intake_1" }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, submittedAt: "2026-07-15T09:00:00Z", id: "intake_1" }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, submittedAt: BASE_TIME.toISOString() }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, submittedAt: BASE_TIME.toISOString(), id: "intake_1", extra: true }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, submittedAt: BASE_TIME.toISOString(), id: "   " }) }, "INVALID_CURSOR"],
    [{ cursor: encodedCursor({ v: 1, submittedAt: BASE_TIME.toISOString(), id: "x".repeat(129) }) }, "INVALID_CURSOR"],
  ])("rejects malformed input without exposing or querying it: %#", async (input, code) => {
    const query = vi.spyOn(db.customerRefundIntake, "findMany");

    await expect(loadAdminCustomerRefundIntakeQueue(db, input)).rejects.toMatchObject({ code });

    expect(query).not.toHaveBeenCalled();
  });

  it("returns only SUBMITTED rows and the exact safe triage projection", async () => {
    const [owned, orphan] = await seedSubmittedRows(ctx, 2, { sameTime: true });
    await db.customerRefundIntake.update({
      where: { id: orphan.intakeId },
      data: { customerUserId: ctx.otherUserId, reasonDetail: "foreign private queue detail" },
    });
    const terminal = await seedOrderRows(ctx, 1);
    await db.customerRefundIntake.create({
      data: {
        id: `queue_terminal_${ctx.identity}`,
        orderId: terminal[0].orderId,
        customerUserId: ctx.ownerUserId,
        status: CustomerRefundIntakeStatus.REJECTED,
        reasonCode: CustomerRefundIntakeReasonCode.OTHER,
        reasonDetail: "terminal detail",
        submittedAt: BASE_TIME,
        reviewedAt: BASE_TIME,
        reviewedByUserId: "private_admin_actor",
        adminRejectionReason: "private admin rationale",
      },
    });

    const result = await loadAdminCustomerRefundIntakeQueue(db, { pageSize: 10 });
    const ownedItem = result.items.find((item) => item.intakeId === owned.intakeId);
    const orphanItem = result.items.find((item) => item.intakeId === orphan.intakeId);

    expect(result.items).toHaveLength(2);
    expect(ownedItem).toMatchObject({
      orderId: owned.orderId,
      orderStatus: OrderStatus.PAID,
      totalAmount: 10_000,
      currency: "KRW",
      ownershipConsistent: true,
    });
    expect(orphanItem).toMatchObject({ ownershipConsistent: false });
    expect(Object.keys(ownedItem ?? {}).sort()).toEqual([
      "currency", "intakeId", "orderId", "orderStatus", "ownershipConsistent",
      "reasonCode", "submittedAt", "totalAmount",
    ]);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "reasonDetail", "customerUserId", "reviewedByUserId", "adminRejectionReason",
      "approvedRefundAttemptId", "paymentId", "provider", "idempotencyKey", "operationKey",
      "foreign private queue detail", "private admin rationale",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("orders oldest-first with stable id ordering for timestamp ties", async () => {
    const rows = await seedSubmittedRows(ctx, 3, { sameTime: true });

    const result = await loadAdminCustomerRefundIntakeQueue(db, { pageSize: 10 });

    expect(result.items.map((item) => item.intakeId)).toEqual(rows.map((row) => row.intakeId).sort());
  });

  it("uses default, custom, and maximum page sizes with one stable cursor chain", async () => {
    const rows = await seedSubmittedRows(ctx, 51);

    const defaultPage = await loadAdminCustomerRefundIntakeQueue(db);
    const customPage = await loadAdminCustomerRefundIntakeQueue(db, { pageSize: "7" });
    const maximumPage = await loadAdminCustomerRefundIntakeQueue(db, { pageSize: 50 });
    const pagedIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await loadAdminCustomerRefundIntakeQueue(db, { pageSize: 13, cursor });
      pagedIds.push(...page.items.map((item) => item.intakeId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(defaultPage.items).toHaveLength(ADMIN_CUSTOMER_REFUND_INTAKE_DEFAULT_PAGE_SIZE);
    expect(customPage.items).toHaveLength(7);
    expect(maximumPage.items).toHaveLength(50);
    expect(defaultPage.nextCursor).not.toBeNull();
    expect(maximumPage.nextCursor).not.toBeNull();
    expect(pagedIds).toEqual(rows.map((row) => row.intakeId));
    expect(new Set(pagedIds).size).toBe(51);
  });

  it("performs one bounded relation query and mutates no rows", async () => {
    await seedSubmittedRows(ctx, 2);
    const before = await db.customerRefundIntake.findMany({
      where: { orderId: { in: ctx.orderIds } },
      orderBy: { id: "asc" },
    });
    const query = vi.spyOn(db.customerRefundIntake, "findMany");

    await loadAdminCustomerRefundIntakeQueue(db, { pageSize: 10 });

    expect(query).toHaveBeenCalledOnce();
    await expect(db.customerRefundIntake.findMany({
      where: { orderId: { in: ctx.orderIds } },
      orderBy: { id: "asc" },
    })).resolves.toEqual(before);
  });
});

async function seedSubmittedRows(
  ctx: TestContext,
  count: number,
  options: { sameTime?: boolean } = {},
) {
  const orders = await seedOrderRows(ctx, count);
  const rows = orders.map((order, index) => ({
    intakeId: `queue_intake_${String(index).padStart(3, "0")}_${ctx.identity}`,
    orderId: order.orderId,
    submittedAt: options.sameTime ? BASE_TIME : new Date(BASE_TIME.getTime() + index * 1_000),
  }));
  await db.customerRefundIntake.createMany({
    data: rows.map((row) => ({
      id: row.intakeId,
      orderId: row.orderId,
      customerUserId: ctx.ownerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE,
      reasonDetail: "private queue detail",
      submittedAt: row.submittedAt,
    })),
  });
  return rows;
}

async function seedOrderRows(ctx: TestContext, count: number) {
  const rows = Array.from({ length: count }, (_, index) => {
    const suffix = `${String(ctx.orderIds.length + index).padStart(3, "0")}_${ctx.identity}`;
    return {
      sessionId: `queue_session_${suffix}`,
      paymentId: `queue_payment_${suffix}`,
      orderId: `queue_order_${suffix}`,
    };
  });
  await db.checkoutSession.createMany({
    data: rows.map((row) => ({
      id: row.sessionId,
      userId: ctx.ownerUserId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      expiresAt: new Date(BASE_TIME.getTime() + 60_000),
      completedAt: BASE_TIME,
    })),
  });
  await db.payment.createMany({
    data: rows.map((row) => ({
      id: row.paymentId,
      checkoutSessionId: row.sessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 10_000,
      currency: "KRW",
      idempotencyKey: `queue_payment_idem_${row.paymentId}`,
    })),
  });
  await db.order.createMany({
    data: rows.map((row) => ({
      id: row.orderId,
      checkoutSessionId: row.sessionId,
      paymentId: row.paymentId,
      userId: ctx.ownerUserId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      status: OrderStatus.PAID,
      paidAt: BASE_TIME,
    })),
  });
  ctx.sessionIds.push(...rows.map((row) => row.sessionId));
  ctx.paymentIds.push(...rows.map((row) => row.paymentId));
  ctx.orderIds.push(...rows.map((row) => row.orderId));
  return rows;
}

function encodedCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: {},
    create: { code: MARKET_CODE, currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
}

async function cleanup(ctx: TestContext): Promise<void> {
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: ctx.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: ctx.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: ctx.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: ctx.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: [ctx.ownerUserId, ctx.otherUserId] } } });
}
