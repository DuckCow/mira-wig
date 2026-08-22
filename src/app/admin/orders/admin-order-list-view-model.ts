import {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
} from "@prisma/client";
import { formatPersistedMoney } from "@/lib/market/persisted-money";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type {
  AdminOrderListPage,
  AdminOrderListSourceItem,
} from "./admin-order-list-data";

export interface AdminOrderListViewModel {
  rows: readonly AdminOrderListRowViewModel[];
  nextHref: string | null;
  firstPageHref: string | null;
}

export interface AdminOrderListRowViewModel {
  renderKey: string;
  orderId: string;
  orderHref: string;
  paidAtLabel: string;
  customerName: string;
  customerEmail: string;
  itemSummary: string;
  itemLineCount: number;
  totalQuantity: number;
  snapshotWarning: string | null;
  orderStatusLabel: string;
  paymentStatusLabel: string;
  paymentContextLabel: string;
  paymentAttention: string | null;
  manufacturingSummaryLabel: string;
  manufacturingWarning: string | null;
  totalAmountLabel: string;
  marketContextLabel: string;
}

export function buildAdminOrderListViewModel(
  page: AdminOrderListPage,
  hasCursor: boolean,
): AdminOrderListViewModel {
  return {
    rows: page.items.map(buildOrderRow),
    nextHref: page.nextCursor
      ? `/admin/orders?cursor=${encodeURIComponent(page.nextCursor)}`
      : null,
    firstPageHref: hasCursor ? "/admin/orders" : null,
  };
}

function buildOrderRow(order: AdminOrderListSourceItem): AdminOrderListRowViewModel {
  const snapshotNames = order.items.map((item) => historicalStyleName(item.snapshotData));
  const manufacturing = buildManufacturingSummary(order.items);
  return {
    renderKey: order.id,
    orderId: order.id,
    orderHref: `/admin/orders/${encodeURIComponent(order.id)}`,
    paidAtLabel: formatDateTime(order.paidAt),
    customerName: displayName(order.customer.name),
    customerEmail: order.customer.email,
    itemSummary: buildItemSummary(snapshotNames),
    itemLineCount: order.items.length,
    totalQuantity: order.items.reduce((total, item) => total + item.quantity, 0),
    snapshotWarning: snapshotWarning(order.items.length, snapshotNames),
    orderStatusLabel: orderStatusLabel(order.status),
    paymentStatusLabel: paymentStatusLabel(order.payment.status),
    paymentContextLabel: `${order.payment.provider} · ${order.payment.mode}`,
    paymentAttention: order.payment.status === PaymentAttemptStatus.SUCCEEDED
      ? null
      : "결제 상태 확인 필요",
    manufacturingSummaryLabel: manufacturing.summary,
    manufacturingWarning: manufacturing.warning,
    totalAmountLabel: formatPersistedMoney(order.totalAmount, order.currency),
    marketContextLabel: `${order.marketCode} · ${order.currency}`,
  };
}

function historicalStyleName(raw: unknown): string | null {
  try {
    const name = parseSnapshotData(raw).styleName.trim();
    return name || null;
  } catch {
    return null;
  }
}

function buildItemSummary(names: readonly (string | null)[]): string {
  if (names.length === 0) return "주문 상품 없음";
  const firstName = names[0] ?? "상품 정보 확인 필요";
  const remaining = names.length - 1;
  return remaining > 0 ? `${firstName} 외 ${remaining}종` : firstName;
}

function snapshotWarning(
  itemLineCount: number,
  names: readonly (string | null)[],
): string | null {
  if (itemLineCount === 0) return "주문 상품 정보 확인 필요";
  return names.some((name) => name === null) ? "상품 스냅샷 확인 필요" : null;
}

function orderStatusLabel(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "결제 완료";
  if (status === OrderStatus.CANCELLED) return "주문 취소";
  if (status === OrderStatus.REFUND_PENDING) return "환불 처리 중";
  if (status === OrderStatus.PARTIALLY_REFUNDED) return "부분 환불";
  if (status === OrderStatus.REFUNDED) return "환불 완료";
  return "주문 상태 확인 필요";
}

function paymentStatusLabel(status: PaymentAttemptStatus): string {
  if (status === PaymentAttemptStatus.SUCCEEDED) return "결제 완료";
  if (status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING) {
    return "결제 확인 중";
  }
  if (status === PaymentAttemptStatus.FAILED) return "결제 실패";
  if (status === PaymentAttemptStatus.VOIDED) return "결제 취소";
  return "결제 상태 확인 필요";
}

function buildManufacturingSummary(
  items: AdminOrderListSourceItem["items"],
): { summary: string; warning: string | null } {
  let stocked = 0;
  let mto = 0;
  let missing = 0;
  let unexpected = 0;
  const statusCounts: Record<MrStatus, number> = {
    [MrStatus.RECEIVED]: 0,
    [MrStatus.IN_PRODUCTION]: 0,
    [MrStatus.COMPLETED]: 0,
    [MrStatus.CANCELLED]: 0,
  };

  for (const item of items) {
    if (item.fulfillmentType === FulfillmentType.STOCKED) {
      stocked += 1;
      if (item.mr) unexpected += 1;
      continue;
    }
    if (item.fulfillmentType !== FulfillmentType.MTO) {
      unexpected += 1;
      continue;
    }
    mto += 1;
    if (!item.mr) {
      missing += 1;
      continue;
    }
    const currentCount = statusCounts[item.mr.status];
    if (currentCount === undefined) {
      unexpected += 1;
      continue;
    }
    statusCounts[item.mr.status] = currentCount + 1;
  }

  return {
    summary: manufacturingSummary({
      stocked,
      mto,
      received: statusCounts[MrStatus.RECEIVED],
      inProduction: statusCounts[MrStatus.IN_PRODUCTION],
      completed: statusCounts[MrStatus.COMPLETED],
      cancelled: statusCounts[MrStatus.CANCELLED],
      missing,
    }),
    warning: missing > 0 || unexpected > 0 ? "제작 요청 확인 필요" : null,
  };
}

interface ManufacturingCounts {
  stocked: number;
  mto: number;
  received: number;
  inProduction: number;
  completed: number;
  cancelled: number;
  missing: number;
}

function manufacturingSummary(counts: ManufacturingCounts): string {
  if (counts.stocked === 0 && counts.mto === 0) return "제작 대상 상품 없음";
  const parts: string[] = [];
  if (counts.stocked > 0) {
    parts.push(counts.mto > 0 ? `재고 ${counts.stocked}종` : `재고 상품 ${counts.stocked}종`);
  }
  if (counts.mto > 0) parts.push(`주문 제작 ${counts.mto}종`);
  appendCount(parts, "접수", counts.received);
  appendCount(parts, "제작 중", counts.inProduction);
  appendCount(parts, "제작 완료", counts.completed);
  appendCount(parts, "제작 취소", counts.cancelled);
  appendCount(parts, "요청 없음", counts.missing);
  return parts.join(" · ");
}

function appendCount(parts: string[], label: string, count: number): void {
  if (count > 0) parts.push(`${label} ${count}`);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayName(name: string | null): string {
  const normalized = name?.trim() ?? "";
  return normalized || "이름 미등록";
}
