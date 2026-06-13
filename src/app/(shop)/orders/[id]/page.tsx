import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getOrderById } from "@/lib/order";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import type { OrderItemView } from "@/lib/order/types";

type PageParams = Promise<{ id: string }>;

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
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xs text-gray-500">수량 {quantity}</p>
      </div>
      <p className="text-sm font-semibold text-gray-900 shrink-0">
        {currency ? formatPrice(unitPrice * quantity, currency) : `${unitPrice * quantity}`}
      </p>
    </li>
  );
}

export default async function OrderConfirmPage({ params }: { params: PageParams }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const order = await getOrderById(id, session.user.id);
  if (!order) notFound();

  const currency = CURRENCY_META[order.currency];

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8 space-y-2">
        <p className="text-4xl">✓</p>
        <h1 className="text-2xl font-bold text-gray-900">주문이 접수됐습니다</h1>
        <p className="text-sm text-gray-500">주문번호: <span className="font-mono">{order.id}</span></p>
        <p className="text-xs text-gray-400">결제 완료 후 제작이 시작됩니다.</p>
      </div>

      <section className="border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 상품</h2>
        <ul>
          {order.items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </ul>
        <div className="flex justify-between text-sm font-semibold text-gray-900 pt-3 mt-1 border-t border-gray-200">
          <span>합계</span>
          <span>
            {currency ? formatPrice(order.totalAmount, currency) : order.totalAmount}
          </span>
        </div>
      </section>

      <section className="border border-gray-200 rounded-xl p-5 mb-6 text-sm text-gray-700 space-y-1">
        <h2 className="font-semibold text-gray-700 mb-2">배송지</h2>
        <p>{order.recipientName} · {order.phone}</p>
        <p>{order.postalCode} {order.administrativeArea} {order.city}</p>
        <p>{order.addressLine1} {order.addressLine2}</p>
      </section>

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
    </main>
  );
}
