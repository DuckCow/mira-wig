import {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
} from "@prisma/client";
import { CURRENCY_META, formatPrice, type CurrencyMeta } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type { SnapshotData } from "@/lib/order/types";
import {
  isGuardedRefundAttemptStatus,
  isTerminalRefundAttemptStatus,
  remainingRefundableAmount,
  remainingRequestableRefundAmount,
  sumGuardedRefundAmount,
  sumSucceededRefundAmount,
} from "@/lib/payment/refund/invariants";
import { refundAttemptStatusLabel } from "@/app/admin/refunds/intake-labels";
import { getCurlLabel, getLengthLabel } from "@/lib/wig-option-labels";
import type { AdminOrderDetailSource, AdminOrderDetailViewModel } from "./admin-order-detail-types";
import { buildRefundCloseAdvisory } from "./refund-close-presentation";

export { refundAttemptStatusLabel } from "@/app/admin/refunds/intake-labels";

export function buildAdminOrderDetailViewModel(order: AdminOrderDetailSource): AdminOrderDetailViewModel {
  const refundAmounts = buildRefundAmounts(order);
  return {
    id: order.id,
    statusLabel: orderStatusLabel(order.status),
    paidAt: formatDateTime(order.paidAt),
    createdAt: formatDateTime(order.createdAt),
    updatedAt: formatDateTime(order.updatedAt),
    marketCode: order.marketCode,
    currency: order.currency,
    customer: {
      id: order.user.id,
      name: displayText(order.user.name, "이름 미등록"),
      email: order.user.email,
    },
    amounts: {
      subtotal: formatMoney(order.subtotalAmount, order.currency),
      shipping: formatMoney(order.shippingAmount, order.currency),
      total: formatMoney(order.totalAmount, order.currency),
    },
    shipping: buildShipping(order.shipping),
    items: order.items.map((item) => buildItem(item, order.currency)),
    payment: buildPayment(order.payment),
    refundReview: buildRefundReview(order, refundAmounts),
    refundAttempts: order.refundAttempts.map((attempt) => buildRefundAttempt(attempt, order.status)),
  };
}

function buildShipping(shipping: AdminOrderDetailSource["shipping"]): AdminOrderDetailViewModel["shipping"] {
  if (!shipping) return null;
  return {
    ...shipping,
    country: countryLabel(shipping.country),
    updatedAt: formatDateTime(shipping.updatedAt),
  };
}

function buildItem(
  item: AdminOrderDetailSource["items"][number],
  currency: string,
): AdminOrderDetailViewModel["items"][number] {
  const snapshot = safeParseSnapshotData(item.snapshotData);
  return {
    id: item.id,
    name: itemName(snapshot),
    options: itemOptions(snapshot),
    fulfillment: fulfillmentLabel(item.fulfillmentType),
    quantity: item.quantity,
    unitAmount: formatMoney(item.unitAmount, currency),
    lineTotal: formatMoney(item.unitAmount * item.quantity, currency),
    mrStatus: item.mr ? mrStatusLabel(item.mr.status) : "제작 요청 없음",
    mrCreatedAt: item.mr ? formatDateTime(item.mr.createdAt) : "-",
    mrStartedAt: item.mr?.startedAt ? formatDateTime(item.mr.startedAt) : "-",
    mrUpdatedAt: item.mr ? formatDateTime(item.mr.updatedAt) : "-",
  };
}

function buildPayment(payment: AdminOrderDetailSource["payment"]): AdminOrderDetailViewModel["payment"] {
  return {
    id: payment.id,
    status: paymentStatusLabel(payment.status),
    amount: formatMoney(payment.amount, payment.currency),
    providerContext: `${payment.provider} / ${payment.mode}`,
    createdAt: formatDateTime(payment.createdAt),
    updatedAt: formatDateTime(payment.updatedAt),
  };
}

function buildRefundReview(
  order: AdminOrderDetailSource,
  amounts: RefundAmountLabels,
): AdminOrderDetailViewModel["refundReview"] {
  const attempts = order.refundAttempts;
  const paymentIdentityMatches = order.totalAmount === order.payment.amount
    && order.currency === order.payment.currency;
  return {
    orderTotal: formatMoney(order.totalAmount, order.currency),
    paymentAmount: formatMoney(order.payment.amount, order.payment.currency),
    succeededAmount: amounts.succeeded,
    guardedAmount: amounts.guarded,
    remainingRefundableAmount: amounts.remainingRefundable,
    remainingRequestableAmount: amounts.remainingRequestable,
    openAttempt: attempts.some((attempt) => !isTerminalRefundAttemptStatus(attempt.status))
      ? "진행 중인 환불 요청 있음"
      : "진행 중인 환불 요청 없음",
    guardedAttempt: attempts.some((attempt) => isGuardedRefundAttemptStatus(attempt.status))
      ? "보호 중인 환불 금액 있음"
      : "보호 중인 환불 금액 없음",
    paymentStatus: paymentStatusLabel(order.payment.status),
    executionReference: order.payment.providerPaymentKeyPresent
      ? "환불 실행 정보: 확인됨"
      : "환불 실행 정보: 확인 필요",
    paymentIdentityMatch: paymentIdentityMatches ? "금액·통화 일치" : "금액·통화 확인 필요",
    orderStatusRefundable: isRefundableOrderStatus(order.status)
      ? "환불 요청 가능 상태"
      : "환불 요청 불가 상태",
    disputeReview: order.disputeStatus === null ? "분쟁 상태 없음" : "분쟁 상태 확인 필요",
  };
}

interface RefundAmountLabels {
  succeeded: string;
  guarded: string;
  remainingRefundable: string;
  remainingRequestable: string;
}

function buildRefundAmounts(order: AdminOrderDetailSource): RefundAmountLabels {
  const attempts = order.refundAttempts;
  if (attempts.some((attempt) => attempt.currency !== order.currency)) return unavailableAmounts();
  try {
    return {
      succeeded: formatMoney(sumSucceededRefundAmount(attempts), order.currency),
      guarded: formatMoney(sumGuardedRefundAmount(attempts), order.currency),
      remainingRefundable: formatMoney(remainingRefundableAmount(order.totalAmount, attempts), order.currency),
      remainingRequestable: formatMoney(remainingRequestableRefundAmount(order.totalAmount, attempts), order.currency),
    };
  } catch (error) {
    if (error instanceof RangeError) return unavailableAmounts();
    throw error;
  }
}

function unavailableAmounts(): RefundAmountLabels {
  return {
    succeeded: "금액 확인 필요",
    guarded: "금액 확인 필요",
    remainingRefundable: "금액 확인 필요",
    remainingRequestable: "금액 확인 필요",
  };
}

function buildRefundAttempt(
  attempt: AdminOrderDetailSource["refundAttempts"][number],
  orderStatus: OrderStatus,
): AdminOrderDetailViewModel["refundAttempts"][number] {
  const closeAdvisory = buildRefundCloseAdvisory({
    orderStatus,
    attemptStatus: attempt.status,
    hasProviderRefundId: attempt.hasProviderRefundId,
    hasExecutionCommand: attempt.hasExecutionCommand,
  });
  return {
    refundAttemptId: attempt.id,
    shortId: attempt.id.slice(0, 8),
    status: refundAttemptStatusLabel(attempt.status),
    amount: formatMoney(attempt.amount, attempt.currency),
    reason: attempt.reason,
    actor: attempt.actorType === RefundAttemptActorType.ADMIN ? "관리자" : "시스템",
    requestedAt: formatDateTime(attempt.requestedAt),
    processedAt: attempt.processedAt ? formatDateTime(attempt.processedAt) : null,
    failedAt: attempt.failedAt ? formatDateTime(attempt.failedAt) : null,
    providerContext: `${attempt.provider} / ${attempt.mode}`,
    safeFailureMessage: attempt.safeFailureMessage,
    ...closeAdvisory,
    transitionHistory: buildRefundTransitionHistory(attempt.transitions),
  };
}

function buildRefundTransitionHistory(
  transitions: AdminOrderDetailSource["refundAttempts"][number]["transitions"],
): AdminOrderDetailViewModel["refundAttempts"][number]["transitionHistory"] {
  if (transitions.length === 0) {
    return {
      entries: [],
      emptyState: "상태 변경 기록이 없습니다. 이전 데이터이거나 기록 확인이 필요합니다.",
    };
  }
  return {
    entries: transitions.map((transition) => ({
      key: transition.id,
      timestamp: formatDateTime(transition.createdAt),
      attemptStatusChange: attemptStatusChangeLabel(transition.fromStatus, transition.toStatus),
      orderStatusChange: `${orderStatusLabel(transition.orderStatusBefore)} → ${orderStatusLabel(transition.orderStatusAfter)}`,
      actor: transition.actorType === RefundAttemptActorType.ADMIN ? "관리자 작업" : "시스템 작업",
      auditReason: displayText(transition.reason, "기록 사유 확인 필요"),
    })),
    emptyState: null,
  };
}

function attemptStatusChangeLabel(
  fromStatus: RefundAttemptStatus | null,
  toStatus: RefundAttemptStatus,
): string {
  const fromLabel = fromStatus === null ? "생성" : refundAttemptStatusLabel(fromStatus);
  return `${fromLabel} → ${refundAttemptStatusLabel(toStatus)}`;
}

function orderStatusLabel(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "결제 완료";
  if (status === OrderStatus.CANCELLED) return "주문 취소";
  if (status === OrderStatus.REFUND_PENDING) return "환불 처리 중";
  if (status === OrderStatus.PARTIALLY_REFUNDED) return "부분 환불";
  if (status === OrderStatus.REFUNDED) return "환불 완료";
  return "상태 확인 중";
}

function paymentStatusLabel(status: PaymentAttemptStatus): string {
  if (status === PaymentAttemptStatus.SUCCEEDED) return "결제 완료";
  if (status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING) return "결제 확인 중";
  if (status === PaymentAttemptStatus.FAILED) return "결제 실패";
  if (status === PaymentAttemptStatus.VOIDED) return "결제 취소";
  return "결제 상태 확인 중";
}

function isRefundableOrderStatus(status: OrderStatus): boolean {
  return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
}

function mrStatusLabel(status: MrStatus): string {
  if (status === MrStatus.RECEIVED) return "제작 요청 접수";
  if (status === MrStatus.IN_PRODUCTION) return "제작 중";
  if (status === MrStatus.COMPLETED) return "제작 완료";
  if (status === MrStatus.CANCELLED) return "제작 취소";
  return "제작 상태 확인 중";
}

function fulfillmentLabel(type: FulfillmentType): string {
  return type === FulfillmentType.MTO ? "주문 제작" : "재고 상품";
}

function countryLabel(country: ShippingCountry): string {
  if (country === ShippingCountry.KR) return "대한민국";
  if (country === ShippingCountry.US) return "미국";
  if (country === ShippingCountry.JP) return "일본";
  return country;
}

function itemName(snapshot: SnapshotData | null): string {
  return snapshot ? displayText(snapshot.styleName, "상품 정보 확인 중") : "상품 정보 확인 중";
}

function itemOptions(snapshot: SnapshotData | null): string {
  if (!snapshot) return "옵션 정보 확인 중";
  const options = [snapshot.color, getLengthLabel(snapshot.length), getCurlLabel(snapshot.curl)]
    .map((value) => value.trim())
    .filter(Boolean);
  return options.length > 0 ? options.join(" / ") : "옵션 정보 확인 중";
}

function safeParseSnapshotData(raw: unknown): SnapshotData | null {
  try {
    return parseSnapshotData(raw);
  } catch {
    return null;
  }
}

function currencyMeta(currency: string): CurrencyMeta {
  return CURRENCY_META[currency] ?? CURRENCY_META.KRW;
}

function formatMoney(amount: number, currency: string): string {
  return formatPrice(amount, currencyMeta(currency));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayText(value: string | null, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}
