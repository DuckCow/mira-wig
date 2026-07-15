import {
  CustomerRefundIntakeReasonCode,
  OrderStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { AdminCustomerRefundIntakeQueuePage } from "@/lib/payment/refund/admin/customer-intake-read";
import { buildAdminCustomerRefundIntakeQueueViewModel } from "./view-model";

const NOW = new Date("2026-07-15T08:30:00.000Z");

describe("customer refund intake queue view model", () => {
  it("formats only the committed queue fields and links to the exact Order anchor", () => {
    const view = buildAdminCustomerRefundIntakeQueueViewModel(page(), false);
    const expectedDate = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(NOW);

    expect(view.rows[0]).toEqual({
      renderKey: "intake_private_key",
      reasonLabel: "배송 문제·지연",
      submittedAt: expectedDate,
      orderStatusLabel: "결제 완료",
      orderTotal: "₩10,000",
      ownershipWarning: null,
      orderHref: "/admin/orders/order_123#customer-refund-intakes",
    });
  });

  it("uses safe fallback formatting and a non-identity ownership warning", () => {
    const result = page();
    const item = result.items[0];
    const view = buildAdminCustomerRefundIntakeQueueViewModel({
      ...result,
      items: [{ ...item, currency: "ABC", ownershipConsistent: false }],
    }, false);

    expect(view.rows[0].orderTotal).toBe("10,000 ABC");
    expect(view.rows[0].ownershipWarning).toContain("소유자 확인 필요");
    expect(view.rows[0].ownershipWarning).toContain("거절로 종결");
    expect(view.rows[0].ownershipWarning).not.toContain("customer");
  });

  it("builds next-only cursor navigation and an optional first-page link", () => {
    const view = buildAdminCustomerRefundIntakeQueueViewModel(page("opaque/cursor"), true);

    expect(view.nextHref).toBe("/admin/refunds/intakes?cursor=opaque%2Fcursor");
    expect(view.firstPageHref).toBe("/admin/refunds/intakes");
    expect(buildAdminCustomerRefundIntakeQueueViewModel(page(null), false).firstPageHref).toBeNull();
  });

  it("keeps queue-private and disallowed detail fields out of the presentation shape", () => {
    const serialized = JSON.stringify(buildAdminCustomerRefundIntakeQueueViewModel(page(), false));

    for (const forbidden of [
      "reasonDetail",
      "customerUserId",
      "reviewedByUserId",
      "adminRejectionReason",
      "approvedRefundAttempt",
      "paymentId",
      "providerPaymentKey",
      "operationKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function page(nextCursor: string | null = null): AdminCustomerRefundIntakeQueuePage {
  return {
    items: [{
      intakeId: "intake_private_key",
      orderId: "order_123",
      reasonCode: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE,
      submittedAt: NOW,
      orderStatus: OrderStatus.PAID,
      totalAmount: 10_000,
      currency: "KRW",
      ownershipConsistent: true,
    }],
    nextCursor,
  };
}
