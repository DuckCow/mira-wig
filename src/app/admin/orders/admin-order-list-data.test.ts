import {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_ORDER_LIST_PAGE_SIZE,
  AdminOrderListValidationError,
  loadAdminOrderList,
  type AdminOrderListReadCapability,
} from "./admin-order-list-data";

const CREATED_AT = new Date("2026-08-18T03:00:00.000Z");

describe("admin order list data", () => {
  it("uses the fixed 20+1 descending query and exact safe select", async () => {
    const fake = fakeClient([record("order_1")]);

    const result = await loadAdminOrderList(fake.client);

    expect(fake.findMany).toHaveBeenCalledOnce();
    expect(fake.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ADMIN_ORDER_LIST_PAGE_SIZE + 1,
      select: {
        id: true,
        status: true,
        paidAt: true,
        createdAt: true,
        marketCode: true,
        currency: true,
        totalAmount: true,
        cancellation: { select: { id: true } },
        user: { select: { name: true, email: true } },
        payment: { select: { status: true, provider: true, mode: true } },
        items: {
          orderBy: { id: "asc" },
          select: {
            quantity: true,
            fulfillmentType: true,
            snapshotData: true,
            mr: { select: { status: true } },
          },
        },
      },
    });
    expect(result.items).toEqual([{
      id: "order_1",
      status: OrderStatus.PAID,
      paidAt: CREATED_AT,
      createdAt: CREATED_AT,
      marketCode: "KR",
      currency: "KRW",
      totalAmount: 85_000,
      cancellationAccepted: false,
      customer: { name: "고객", email: "customer@example.test" },
      payment: {
        status: PaymentAttemptStatus.SUCCEEDED,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
      },
      items: [{
        quantity: 1,
        fulfillmentType: FulfillmentType.MTO,
        snapshotData: { styleName: "과거 상품" },
        mr: { status: MrStatus.RECEIVED },
      }],
    }]);
  });

  it("returns twenty rows and derives the next cursor from the final displayed row", async () => {
    const records = Array.from(
      { length: ADMIN_ORDER_LIST_PAGE_SIZE + 1 },
      (_, index) => record(`order_${String(index).padStart(2, "0")}`),
    );
    const first = fakeClient(records);

    const page = await loadAdminOrderList(first.client);

    expect(page.items).toHaveLength(ADMIN_ORDER_LIST_PAGE_SIZE);
    expect(page.nextCursor).not.toBeNull();

    const second = fakeClient([]);
    await loadAdminOrderList(second.client, { cursor: page.nextCursor });
    expect(second.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { lt: CREATED_AT } },
          { createdAt: CREATED_AT, id: { lt: "order_19" } },
        ],
      },
    }));
  });

  it("uses descending keyset semantics for a valid cursor", async () => {
    const fake = fakeClient([]);
    const cursor = encodeCursor({
      v: 1,
      createdAt: "2026-08-17T03:00:00.000Z",
      id: "order_cursor",
    });

    await loadAdminOrderList(fake.client, { cursor });

    expect(fake.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { lt: new Date("2026-08-17T03:00:00.000Z") } },
          {
            createdAt: new Date("2026-08-17T03:00:00.000Z"),
            id: { lt: "order_cursor" },
          },
        ],
      },
    }));
  });

  it.each([
    ["array", ["cursor"]],
    ["empty", ""],
    ["invalid base64url", "%%%"],
    ["overlong encoding", "A".repeat(513)],
    ["unknown version", encodeCursor({ v: 2, createdAt: CREATED_AT.toISOString(), id: "order_1" })],
    ["extra key", encodeCursor({ v: 1, createdAt: CREATED_AT.toISOString(), id: "order_1", extra: true })],
    ["non-canonical date", encodeCursor({ v: 1, createdAt: "2026-08-18T03:00:00Z", id: "order_1" })],
    ["out-of-range date", encodeCursor({ v: 1, createdAt: "-271820-01-01T00:00:00.000Z", id: "order_1" })],
    ["blank ID", encodeCursor({ v: 1, createdAt: CREATED_AT.toISOString(), id: "   " })],
    ["padded ID", encodeCursor({ v: 1, createdAt: CREATED_AT.toISOString(), id: " order_1 " })],
    ["overlong ID", encodeCursor({ v: 1, createdAt: CREATED_AT.toISOString(), id: "가".repeat(129) })],
  ])("rejects %s before querying", async (_label, cursor) => {
    const fake = fakeClient([]);

    await expect(loadAdminOrderList(fake.client, { cursor })).rejects
      .toBeInstanceOf(AdminOrderListValidationError);
    expect(fake.findMany).not.toHaveBeenCalled();
  });
});

function fakeClient(records: readonly ReturnType<typeof record>[]) {
  const findMany = vi.fn<AdminOrderListReadCapability["order"]["findMany"]>();
  findMany.mockResolvedValue(records);
  return {
    client: { order: { findMany } },
    findMany,
  };
}

function record(id: string) {
  return {
    id,
    status: OrderStatus.PAID,
    paidAt: CREATED_AT,
    createdAt: CREATED_AT,
    marketCode: "KR",
    currency: "KRW",
    totalAmount: 85_000,
    cancellation: null,
    user: { name: "고객", email: "customer@example.test" },
    payment: {
      status: PaymentAttemptStatus.SUCCEEDED,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    },
    items: [{
      quantity: 1,
      fulfillmentType: FulfillmentType.MTO,
      snapshotData: { styleName: "과거 상품" },
      mr: { status: MrStatus.RECEIVED },
    }],
  };
}

function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
