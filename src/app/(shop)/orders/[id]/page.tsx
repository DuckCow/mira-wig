import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getOrderById } from "@/lib/order";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import type { OrderItemView } from "@/lib/order/types";

type PageParams = Promise<{ id: string }>;

const ORDER_HEADER_COPY: Record<string, { title: string; badge: string; helper?: string }> = {
  PENDING_PAYMENT: { title: "주문이 접수됐습니다", badge: "결제 대기", helper: "결제를 완료해야 제작이 시작됩니다." },
  PAID: { title: "결제가 완료됐습니다", badge: "결제 완료" },
  PAYMENT_FAILED: { title: "결제에 실패했습니다", badge: "결제 실패" },
  CONFIRMED: { title: "주문이 확인됐습니다", badge: "제작 확정" },
  MANUFACTURING: { title: "가발을 제작 중입니다", badge: "제작 중" },
  SHIPPED: { title: "배송 중입니다", badge: "배송 중" },
  DELIVERED: { title: "배송이 완료됐습니다", badge: "배송 완료" },
  CANCELLED: { title: "주문이 취소됐습니다", badge: "취소" },
  REFUNDED: { title: "환불이 완료됐습니다", badge: "환불" },
};

const COMPLETED_ORDER_STATUSES = new Set(["PAID", "CONFIRMED", "MANUFACTURING", "SHIPPED", "DELIVERED"]);

function OrderItemRow({ item }: { item: OrderItemView }) {
  const { snapshotData, quantity, unitPrice } = item;
  const currency = CURRENCY_META[snapshotData.currencyCode];
  const label = `${snapshotData.color} / ${getLengthLabel(snapshotData.length)} / ${getCurlLabel(snapshotData.curl)}`;
  return (
    <li className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-14 h-14 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center">
        <span className="text-xs text-gray-400">이미지</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{snapshotData.styleName}</p>
        <p className="text-xs text-gray-500">{label} · 수량 {quantity}</p>
      </div>
      <p className="text-sm font-semibold text-gray-900 shrink-0">
        {currency ? formatPrice(unitPrice * quantity, currency) : `${unitPrice * quantity}`}
      </p>
    </li>
  );
}

// ── status별 헤더 ─────────────────────────────────────────────

function OrderHeader({ status, orderId }: { status: string; orderId: string }) {
  const copy = ORDER_HEADER_COPY[status] ?? { title: "주문 상태를 확인 중입니다", badge: status };
  return (
    <div className="text-center space-y-2">
      {COMPLETED_ORDER_STATUSES.has(status) && <p className="text-4xl">✓</p>}
      <h1 className="text-2xl font-bold text-gray-900">{copy.title}</h1>
      <p className="text-xs text-gray-400 font-mono">주문번호: {orderId}</p>
      <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        {copy.badge}
      </span>
      {copy.helper && <p className="text-xs text-gray-400">{copy.helper}</p>}
    </div>
  );
}

// ── status별 하단 액션 ────────────────────────────────────────

function OrderActions({ status, orderId }: { status: string; orderId: string }) {
  if (COMPLETED_ORDER_STATUSES.has(status) || status === "CANCELLED" || status === "REFUNDED") {
    return (
      <div className="flex gap-3">
        <Link
          href="/styles"
          className="flex-1 text-center py-3 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
        >
          쇼핑 계속하기
        </Link>
        <Link
          href="/cart"
          className="flex-1 text-center py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-700"
        >
          장바구니
        </Link>
      </div>
    );
  }
  const label = status === "PAYMENT_FAILED" ? "다시 결제하기" : "결제 진행하기";
  return (
    <Link
      href={`/orders/${orderId}/payment`}
      className="block w-full text-center py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors"
    >
      {label}
    </Link>
  );
}

// ── 페이지 ────────────────────────────────────────────────────

export default async function OrderPage({ params }: { params: PageParams }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const order = await getOrderById(id, session.user.id);
  if (!order) notFound();

  const currency = CURRENCY_META[order.currency];

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <OrderHeader status={order.status} orderId={order.id} />

      <section className="border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 상품</h2>
        <ul>
          {order.items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </ul>
        <div className="flex justify-between text-sm font-semibold text-gray-900 pt-3 mt-1 border-t border-gray-200">
          <span>합계</span>
          <span>{currency ? formatPrice(order.totalAmount, currency) : order.totalAmount}</span>
        </div>
      </section>

      <section className="border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-1">
        <h2 className="font-semibold text-gray-700 mb-2">배송지</h2>
        <p>{order.recipientName} · {order.phone}</p>
        <p>{order.postalCode} {order.administrativeArea} {order.city}</p>
        <p>{order.addressLine1} {order.addressLine2}</p>
      </section>

      <OrderActions status={order.status} orderId={order.id} />
    </main>
  );
}
