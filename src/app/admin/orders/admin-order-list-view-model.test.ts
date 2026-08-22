import {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { AdminOrderListSourceItem } from "./admin-order-list-data";
import { buildAdminOrderListViewModel } from "./admin-order-list-view-model";

describe("admin order list view model", () => {
  it("uses historical snapshot identity and separates line count from quantity", () => {
    const row = rowFor(source({
      items: [
        item({ styleName: "주문 당시 보브" }, 2),
        item({ styleName: "주문 당시 웨이브" }, 1),
      ],
    }));

    expect(row.itemSummary).toBe("주문 당시 보브 외 1종");
    expect(row.itemLineCount).toBe(2);
    expect(row.totalQuantity).toBe(3);
    expect(row.snapshotWarning).toBeNull();
  });

  it("falls back safely for malformed and empty historical items", () => {
    const malformed = rowFor(source({
      items: [item(null, 1), item({ styleName: "" }, 1)],
    }));
    const empty = rowFor(source({ items: [] }));

    expect(malformed.itemSummary).toBe("상품 정보 확인 필요 외 1종");
    expect(malformed.snapshotWarning).toBe("상품 스냅샷 확인 필요");
    expect(empty.itemSummary).toBe("주문 상품 없음");
    expect(empty.itemLineCount).toBe(0);
    expect(empty.totalQuantity).toBe(0);
    expect(empty.snapshotWarning).toBe("주문 상품 정보 확인 필요");
  });

  it("uses the customer-name fallback and exact detail href", () => {
    const row = rowFor(source({
      id: "order_123",
      customer: { name: "  ", email: "customer@example.test" },
    }));

    expect(row.customerName).toBe("이름 미등록");
    expect(row.customerEmail).toBe("customer@example.test");
    expect(row.orderHref).toBe("/admin/orders/order_123");
  });

  it.each([
    [OrderStatus.PAID, "결제 완료"],
    [OrderStatus.CANCELLED, "주문 취소"],
    [OrderStatus.REFUND_PENDING, "환불 처리 중"],
    [OrderStatus.PARTIALLY_REFUNDED, "부분 환불"],
    [OrderStatus.REFUNDED, "환불 완료"],
  ])("labels Order status %s without conflating another axis", (status, expected) => {
    expect(rowFor(source({ status })).orderStatusLabel).toBe(expected);
  });

  it.each([
    [PaymentAttemptStatus.INITIATED, "결제 확인 중", true],
    [PaymentAttemptStatus.AWAITING, "결제 확인 중", true],
    [PaymentAttemptStatus.SUCCEEDED, "결제 완료", false],
    [PaymentAttemptStatus.FAILED, "결제 실패", true],
    [PaymentAttemptStatus.VOIDED, "결제 취소", true],
  ])("labels Payment status %s on its own axis", (status, expected, attention) => {
    const row = rowFor(source({
      payment: { status, provider: PaymentProvider.EXIMBAY, mode: PaymentMode.LIVE },
    }));

    expect(row.paymentStatusLabel).toBe(expected);
    expect(row.paymentContextLabel).toBe("EXIMBAY · LIVE");
    expect(Boolean(row.paymentAttention)).toBe(attention);
  });

  it("formats known currency and preserves unknown currency identity", () => {
    expect(rowFor(source({ currency: "USD", totalAmount: 2_999 })).totalAmountLabel).toBe("$29.99");
    expect(rowFor(source({ currency: "XYZ", totalAmount: 12_345 })).totalAmountLabel).toBe(
      "XYZ · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가",
    );
  });

  it("summarizes STOCKED-only lines by order line", () => {
    const row = rowFor(source({
      items: [
        item({ styleName: "A" }, 3, FulfillmentType.STOCKED, null),
        item({ styleName: "B" }, 4, FulfillmentType.STOCKED, null),
      ],
    }));

    expect(row.manufacturingSummaryLabel).toBe("재고 상품 2종");
    expect(row.manufacturingWarning).toBeNull();
  });

  it.each([
    [MrStatus.RECEIVED, "접수 1"],
    [MrStatus.IN_PRODUCTION, "제작 중 1"],
    [MrStatus.COMPLETED, "제작 완료 1"],
    [MrStatus.CANCELLED, "제작 취소 1"],
  ])("summarizes MTO status %s", (status, expected) => {
    const row = rowFor(source({
      items: [item({ styleName: "A" }, 1, FulfillmentType.MTO, status)],
    }));

    expect(row.manufacturingSummaryLabel).toContain("주문 제작 1종");
    expect(row.manufacturingSummaryLabel).toContain(expected);
    expect(row.manufacturingWarning).toBeNull();
  });

  it("summarizes mixed STOCKED and MTO statuses without converting quantities to lines", () => {
    const row = rowFor(source({
      items: [
        item({ styleName: "A" }, 5, FulfillmentType.STOCKED, null),
        item({ styleName: "B" }, 2, FulfillmentType.MTO, MrStatus.RECEIVED),
        item({ styleName: "C" }, 3, FulfillmentType.MTO, MrStatus.COMPLETED),
      ],
    }));

    expect(row.manufacturingSummaryLabel)
      .toBe("재고 1종 · 주문 제작 2종 · 접수 1 · 제작 완료 1");
    expect(row.totalQuantity).toBe(10);
  });

  it("warns for an MTO line with no ManufacturingRequest", () => {
    const row = rowFor(source({
      items: [item({ styleName: "A" }, 1, FulfillmentType.MTO, null)],
    }));

    expect(row.manufacturingSummaryLabel).toBe("주문 제작 1종 · 요청 없음 1");
    expect(row.manufacturingWarning).toBe("제작 요청 확인 필요");
  });

  it("warns for a STOCKED line with an unexpected ManufacturingRequest", () => {
    const row = rowFor(source({
      items: [item({ styleName: "A" }, 1, FulfillmentType.STOCKED, MrStatus.RECEIVED)],
    }));

    expect(row.manufacturingSummaryLabel).toBe("재고 상품 1종");
    expect(row.manufacturingWarning).toBe("제작 요청 확인 필요");
  });

  it("builds bounded cursor navigation links", () => {
    const view = buildAdminOrderListViewModel({
      items: [source()],
      nextCursor: "cursor_value",
    }, true);

    expect(view.nextHref).toBe("/admin/orders?cursor=cursor_value");
    expect(view.firstPageHref).toBe("/admin/orders");
  });
});

function rowFor(order: AdminOrderListSourceItem) {
  const row = buildAdminOrderListViewModel({ items: [order], nextCursor: null }, false).rows[0];
  if (!row) throw new Error("Expected one admin order row.");
  return row;
}

function source(overrides: Partial<AdminOrderListSourceItem> = {}): AdminOrderListSourceItem {
  return {
    id: "order_1",
    status: OrderStatus.PAID,
    paidAt: new Date("2026-08-18T03:00:00.000Z"),
    createdAt: new Date("2026-08-18T03:00:00.000Z"),
    marketCode: "KR",
    currency: "KRW",
    totalAmount: 85_000,
    customer: { name: "고객", email: "customer@example.test" },
    payment: {
      status: PaymentAttemptStatus.SUCCEEDED,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    },
    items: [item({ styleName: "과거 상품" }, 1)],
    ...overrides,
  };
}

function item(
  snapshotData: unknown,
  quantity: number,
  fulfillmentType: FulfillmentType = FulfillmentType.MTO,
  mrStatus: MrStatus | null = MrStatus.RECEIVED,
): AdminOrderListSourceItem["items"][number] {
  return {
    quantity,
    fulfillmentType,
    snapshotData,
    mr: mrStatus ? { status: mrStatus } : null,
  };
}
