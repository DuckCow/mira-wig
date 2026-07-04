import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserOrders } from "@/lib/order";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import type { UserOrderListItem } from "@/lib/order/types";

export const metadata = { title: "내 주문 — Mira" };

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "결제 대기",
  PAID: "결제 완료",
  PAYMENT_FAILED: "결제 실패",
  PENDING: "처리 대기",
  CONFIRMED: "제작 확정",
  MANUFACTURING: "제작 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  CANCELLED: "취소",
  REFUNDED: "환불",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  PAYMENT_FAILED: "bg-red-100 text-red-700",
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  MANUFACTURING: "bg-gray-100 text-gray-700",
  SHIPPED: "bg-gray-100 text-gray-700",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-green-100 text-green-800",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(amount: number, currencyCode: string): string {
  const currency = CURRENCY_META[currencyCode];
  return currency ? formatPrice(amount, currency) : `${amount} ${currencyCode}`;
}

function itemTitle(order: UserOrderListItem): string {
  const name = order.representativeItem?.styleName ?? "주문 상품";
  const remaining = order.itemCount - 1;
  return remaining > 0 ? `${name} 외 ${remaining}건` : name;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function OrderThumbnail({ order }: { order: UserOrderListItem }) {
  const item = order.representativeItem;
  if (item?.imageUrl) {
    return (
      <Image
        src={item.imageUrl}
        alt={item.styleName}
        width={80}
        height={80}
        className="h-20 w-20 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100">
      <span className="text-xs text-gray-400">이미지</span>
    </div>
  );
}

function EmptyOrders() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
      <p className="text-lg font-medium">주문 내역이 없습니다</p>
      <Link href="/styles" className="text-sm text-gray-900 underline hover:text-gray-600">
        스타일 둘러보기
      </Link>
    </div>
  );
}

function OrderCard({ order }: { order: UserOrderListItem }) {
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
      >
        <OrderThumbnail order={order} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{itemTitle(order)}</p>
            <StatusBadge status={order.status} />
          </div>
          <div className="space-y-1 text-xs text-gray-500">
            <p className="font-mono">주문번호: {order.id}</p>
            <p>{formatDate(order.createdAt)}</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{money(order.totalAmount, order.currency)}</p>
        </div>
      </Link>
    </li>
  );
}

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/orders");

  const orders = await getUserOrders(session.user.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">내 주문</h1>
      {orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <ul className="space-y-3" aria-label="내 주문 목록">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </main>
  );
}
