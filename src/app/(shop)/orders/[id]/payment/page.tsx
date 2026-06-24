import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrderById } from "@/lib/order";
import { orderHasUnreconciledPayment } from "@/lib/payment/reconciliation";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { PaymentPanel } from "./PaymentPanel";
import type { OrderItemView } from "@/lib/order/types";

type PageParams = Promise<{ id: string }>;
type PageSearchParams = Promise<{ error?: string; status?: string }>;

function ItemRow({ item }: { item: OrderItemView }) {
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

function ProcessingNotice() {
  return (
    <section className="border border-amber-200 bg-amber-50 rounded-xl p-5 text-sm text-amber-800 space-y-1">
      <h2 className="font-semibold text-amber-900">결제 처리 중입니다</h2>
      <p>승인된 결제를 주문에 반영하고 있습니다. 다시 결제하지 마세요.</p>
    </section>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <section role="alert" className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-700">
      {message}
    </section>
  );
}

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const order = await getOrderById(id, session.user.id);
  if (!order) notFound();

  // 이미 결제 완료 → 영수증 뷰로 리다이렉트
  if (order.status === "PAID") redirect(`/orders/${id}`);

  // 결제 불가 상태(CANCELLED 등) → 주문 조회로
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") {
    redirect(`/orders/${id}`);
  }

  const isFailed = order.status === "PAYMENT_FAILED";
  const currency = CURRENCY_META[order.currency];
  const isProcessing = query.status === "processing" || await orderHasUnreconciledPayment(id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">결제</h1>
      <p className="text-xs text-gray-400 font-mono">주문번호: {order.id}</p>

      <section className="border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 상품</h2>
        <ul>
          {order.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
        <div className="flex justify-between text-sm font-semibold text-gray-900 pt-3 mt-1 border-t border-gray-200">
          <span>합계</span>
          <span>{currency ? formatPrice(order.totalAmount, currency) : order.totalAmount}</span>
        </div>
      </section>

      {query.error && <ErrorNotice message={query.error} />}
      {isProcessing ? (
        <ProcessingNotice />
      ) : (
        <PaymentPanel
          orderId={order.id}
          totalAmount={order.totalAmount}
          currency={order.currency}
          isFailed={isFailed}
        />
      )}
    </main>
  );
}
