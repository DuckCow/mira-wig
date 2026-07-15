import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import type { AdminCustomerRefundIntakeQueuePage } from "@/lib/payment/refund/admin/customer-intake-read";
import {
  adminOrderStatusLabel,
  customerRefundIntakeReasonLabel,
} from "../intake-labels";

export interface AdminCustomerRefundIntakeQueueViewModel {
  rows: readonly AdminCustomerRefundIntakeQueueRowViewModel[];
  nextHref: string | null;
  firstPageHref: string | null;
}

interface AdminCustomerRefundIntakeQueueRowViewModel {
  renderKey: string;
  reasonLabel: string;
  submittedAt: string;
  orderStatusLabel: string;
  orderTotal: string;
  ownershipWarning: string | null;
  orderHref: string;
}

export function buildAdminCustomerRefundIntakeQueueViewModel(
  page: AdminCustomerRefundIntakeQueuePage,
  hasCursor: boolean,
): AdminCustomerRefundIntakeQueueViewModel {
  return {
    rows: page.items.map((item) => ({
      renderKey: item.intakeId,
      reasonLabel: customerRefundIntakeReasonLabel(item.reasonCode),
      submittedAt: formatDateTime(item.submittedAt),
      orderStatusLabel: adminOrderStatusLabel(item.orderStatus),
      orderTotal: formatMoney(item.totalAmount, item.currency),
      ownershipWarning: item.ownershipConsistent
        ? null
        : "소유자 확인 필요 — 소유권 변경 이력이 있어 승인이 차단됩니다. 상세 화면에서 검토 후 거절로 종결하세요.",
      orderHref: `/admin/orders/${encodeURIComponent(item.orderId)}#customer-refund-intakes`,
    })),
    nextHref: page.nextCursor
      ? `/admin/refunds/intakes?cursor=${encodeURIComponent(page.nextCursor)}`
      : null,
    firstPageHref: hasCursor ? "/admin/refunds/intakes" : null,
  };
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(amount: number, currency: string): string {
  const meta = CURRENCY_META[currency];
  return meta ? formatPrice(amount, meta) : `${amount.toLocaleString("ko-KR")} ${currency}`;
}
