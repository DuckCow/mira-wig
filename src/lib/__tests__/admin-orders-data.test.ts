// ============================================================
// lib/admin-orders-data.ts — 관리자 주문 read model 행동 검증
// ADMIN 가드, 목록 필터, 상세 포함 관계를 고정한다.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  orderCount: vi.fn(),
  orderFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({
  db: {
    order: {
      count: mocks.orderCount,
      findMany: mocks.orderFindMany,
      findUnique: mocks.orderFindUnique,
    },
  },
}));

import { getAdminOrderDetail, listAdminOrders } from "../admin-orders-data";

function makeSession(role: string): Session {
  return { user: { id: "user-1", email: "admin@test.com", name: "Admin", role }, expires: "2099-01-01" };
}

const ADMIN_SESSION = makeSession("ADMIN");
const CUSTOMER_SESSION = makeSession("CUSTOMER");

function orderListRow() {
  return {
    id: "order-1",
    status: "PAID",
    paymentStatus: "PAID",
    marketCode: "KR",
    currency: "KRW",
    totalAmount: 85000,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    user: { email: "buyer@test.com", name: "Buyer" },
    payments: [{ provider: "toss", status: "SUCCEEDED", providerTransactionId: "pay_1" }],
    _count: { items: 2, payments: 1 },
  };
}

function orderDetailRow() {
  const now = new Date("2026-06-01T00:00:00.000Z");
  return {
    ...orderListRow(),
    paymentMethod: null,
    recipientName: "홍길동",
    phone: "010-0000-0000",
    country: "KR",
    postalCode: "12345",
    administrativeArea: null,
    city: "서울",
    addressLine1: "테헤란로 1",
    addressLine2: null,
    memo: null,
    items: [{
      id: "item-1",
      variantId: "variant-1",
      quantity: 1,
      unitPrice: 85000,
      snapshotData: {
        styleName: "실크 스트레이트",
        color: "블랙",
        colorHex: null,
        length: "long",
        curl: "straight",
        coverImageKey: null,
        currencyCode: "KRW",
      },
      manufacturingRequest: {
        id: "mfg-1",
        status: "PENDING",
        hairCadKey: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
    }],
    payments: [{
      id: "payment-1",
      provider: "toss",
      providerTransactionId: "pay_1",
      status: "SUCCEEDED",
      amount: 85000,
      currency: "KRW",
      errorMessage: null,
      idempotencyKey: "idem-1",
      createdAt: now,
      adjustments: [{
        id: "adj-1",
        providerRefundId: "refund-1",
        amount: 10000,
        currency: "KRW",
        reason: "admin refund",
        status: "SUCCEEDED",
        idempotencyKey: "refund-idem-1",
        refundableAmount: 75000,
        createdAt: now,
      }],
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAdminOrders — ADMIN 가드", () => {
  it("세션 없으면 UNAUTHENTICATED를 반환하고 DB를 조회하지 않는다", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await listAdminOrders();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });

  it("CUSTOMER이면 FORBIDDEN을 반환하고 DB를 조회하지 않는다", async () => {
    mocks.getSession.mockResolvedValue(CUSTOMER_SESSION);
    const result = await listAdminOrders();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
    expect(mocks.orderCount).not.toHaveBeenCalled();
  });
});

describe("listAdminOrders — 필터", () => {
  it("status/paymentStatus/market/date/page 필터를 Prisma 조회로 전달한다", async () => {
    const from = new Date("2026-06-01T00:00:00.000Z");
    const to = new Date("2026-06-02T00:00:00.000Z");
    const expectedWhere = {
      status: "PAID",
      paymentStatus: "PAID",
      marketCode: "KR",
      createdAt: { gte: from, lt: to },
    };
    mocks.getSession.mockResolvedValue(ADMIN_SESSION);
    mocks.orderCount.mockResolvedValue(1);
    mocks.orderFindMany.mockResolvedValue([orderListRow()]);

    const result = await listAdminOrders({
      status: "PAID",
      paymentStatus: "PAID",
      marketCode: "KR",
      dateFrom: from,
      dateTo: to,
      page: 2,
      pageSize: 10,
    });

    expect(result.success).toBe(true);
    expect(mocks.orderCount).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 10,
      take: 10,
    }));
    if (result.success) {
      expect(result.data.orders[0]?.latestPayment?.providerTransactionId).toBe("pay_1");
    }
  });
});

describe("getAdminOrderDetail", () => {
  it("상세에 제조 요청과 환불 조정 기록을 포함한다", async () => {
    mocks.getSession.mockResolvedValue(ADMIN_SESSION);
    mocks.orderFindUnique.mockResolvedValue(orderDetailRow());

    const result = await getAdminOrderDetail("order-1");

    expect(result.success).toBe(true);
    expect(mocks.orderFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1" },
    }));
    if (result.success && result.data) {
      expect(result.data.items[0]?.manufacturingRequest?.id).toBe("mfg-1");
      expect(result.data.payments[0]?.adjustments[0]?.providerRefundId).toBe("refund-1");
    }
  });
});
