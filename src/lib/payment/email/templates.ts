import { OrderStatus } from "@prisma/client";
import { localizedVariantOptionLabel } from "@/lib/market/catalog-presentation";
import { LOCALE_INTL, type Locale } from "@/lib/market/locale";
import { formatPersistedMoney } from "@/lib/market/persisted-money";
import type {
  OrderPaidEmailProjection,
  RefundSucceededEmailProjection,
} from "./projection";

export interface TransactionalEmailContent {
  subject: string;
  text: string;
}

export function buildOrderPaidEmail(
  projection: OrderPaidEmailProjection,
  orderDetailUrl: string,
): TransactionalEmailContent {
  const words = ORDER_WORDS[projection.locale];
  const itemLines = projection.items.map((item) => {
    const name = item.snapshot.styleName.trim() || words.productFallback;
    const options = localizedVariantOptionLabel(
      item.snapshot.color,
      item.snapshot.length,
      item.snapshot.curl,
      projection.locale,
    );
    return `- ${name} (${options}) × ${String(item.quantity)} · ${formatPersistedMoney(item.unitAmount * item.quantity, projection.currency)}`;
  });
  return {
    subject: words.subject,
    text: [
      words.greeting,
      `${words.orderId}: ${projection.orderId}`,
      `${words.paidAt}: ${formatDate(projection.paidAt, projection.locale)}`,
      `${words.status}: ${words.statuses[projection.status]}`,
      words.items,
      ...itemLines,
      `${words.total}: ${formatPersistedMoney(projection.totalPaidAmount, projection.currency)}`,
      `${words.cta}: ${orderDetailUrl}`,
    ].join("\n"),
  };
}

export function buildRefundSucceededEmail(
  projection: RefundSucceededEmailProjection,
  orderDetailUrl: string,
): TransactionalEmailContent {
  const words = REFUND_WORDS[projection.locale];
  const completion = projection.completion === "FULL"
    ? words.full
    : `${words.partial} · ${words.remaining}: ${formatPersistedMoney(projection.remainingPaidAmount, projection.currency)}`;
  return {
    subject: words.subject,
    text: [
      words.greeting,
      `${words.orderId}: ${projection.orderId}`,
      `${words.refundAmount}: ${formatPersistedMoney(projection.refundAmount, projection.currency)}`,
      `${words.succeededAt}: ${formatDate(projection.succeededAt, projection.locale)}`,
      `${words.result}: ${completion}`,
      `${words.cta}: ${orderDetailUrl}`,
    ].join("\n"),
  };
}

function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_INTL[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

const ORDER_WORDS = {
  ko: {
    subject: "주문이 접수되었습니다",
    greeting: "Mira 주문과 결제가 정상적으로 완료되었습니다.",
    orderId: "주문 번호", paidAt: "결제 완료일", status: "현재 주문 상태",
    items: "주문 상품", total: "총 결제 금액", cta: "Mira 주문 상세",
    productFallback: "상품",
    statuses: {
      PAID: "결제 완료", CANCELLED: "취소", REFUND_PENDING: "환불 처리 중",
      PARTIALLY_REFUNDED: "일부 환불 완료", REFUNDED: "전액 환불 완료",
    },
  },
  en: {
    subject: "Your order has been received",
    greeting: "Your Mira order and payment are complete.",
    orderId: "Order ID", paidAt: "Payment completed", status: "Current order status",
    items: "Items", total: "Total paid", cta: "View your Mira order",
    productFallback: "Product",
    statuses: {
      PAID: "Paid", CANCELLED: "Cancelled", REFUND_PENDING: "Refund in progress",
      PARTIALLY_REFUNDED: "Partially refunded", REFUNDED: "Fully refunded",
    },
  },
  ja: {
    subject: "ご注文を承りました",
    greeting: "Miraでのご注文とお支払いが完了しました。",
    orderId: "注文番号", paidAt: "支払完了日時", status: "現在の注文状況",
    items: "ご注文商品", total: "お支払い合計", cta: "Miraの注文詳細を見る",
    productFallback: "商品",
    statuses: {
      PAID: "支払完了", CANCELLED: "キャンセル済み", REFUND_PENDING: "返金処理中",
      PARTIALLY_REFUNDED: "一部返金済み", REFUNDED: "全額返金済み",
    },
  },
} satisfies Record<Locale, {
  subject: string; greeting: string; orderId: string; paidAt: string; status: string;
  items: string; total: string; cta: string; productFallback: string;
  statuses: Record<OrderStatus, string>;
}>;

const REFUND_WORDS = {
  ko: {
    subject: "환불이 완료되었습니다", greeting: "요청하신 환불이 완료되었습니다.",
    orderId: "주문 번호", refundAmount: "이번 환불 금액", succeededAt: "환불 완료일",
    result: "환불 결과", full: "전액 환불 완료", partial: "일부 환불 완료",
    remaining: "남은 결제 금액", cta: "Mira 주문 상세",
  },
  en: {
    subject: "Your refund is complete", greeting: "Your requested refund is complete.",
    orderId: "Order ID", refundAmount: "Refund amount", succeededAt: "Refund completed",
    result: "Refund result", full: "Full refund complete", partial: "Partial refund complete",
    remaining: "Remaining paid amount", cta: "View your Mira order",
  },
  ja: {
    subject: "返金が完了しました", greeting: "ご依頼の返金が完了しました。",
    orderId: "注文番号", refundAmount: "今回の返金額", succeededAt: "返金完了日時",
    result: "返金結果", full: "全額返金完了", partial: "一部返金完了",
    remaining: "残りのお支払い額", cta: "Miraの注文詳細を見る",
  },
} satisfies Record<Locale, Record<string, string>>;
