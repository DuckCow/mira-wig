import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CURRENCY_META, formatPrice, type CurrencyMeta } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type { SnapshotData } from "@/lib/order/types";
import { getSession } from "@/lib/session";
import { orderStatusLabel } from "./order-status";

const ORDER_LIST_LIMIT = 20;

type OrderListItem = Awaited<ReturnType<typeof loadOrders>>[number];

export const metadata = { title: "내 주문" };

export default async function OrdersPage() {
  const session = await getSession();
  if (!session?.user.id) redirect("/login?callbackUrl=/orders");

  const orders = await loadOrders(session.user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">주문 내역</h1>
        <p className="text-sm text-gray-500">최근 주문부터 최대 {ORDER_LIST_LIMIT}건까지 확인할 수 있습니다.</p>
      </header>

      {orders.length === 0 ? <EmptyOrders /> : <OrderList orders={orders} />}

      <Link href="/styles" className="inline-flex text-sm font-medium text-gray-900 underline underline-offset-4">
        스타일 둘러보기
      </Link>
    </main>
  );
}

async function loadOrders(userId: string) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: ORDER_LIST_LIMIT,
    select: {
      id: true,
      status: true,
      paidAt: true,
      createdAt: true,
      currency: true,
      totalAmount: true,
      items: {
        take: 1,
        select: { snapshotData: true },
      },
      _count: { select: { items: true } },
    },
  });
}

function EmptyOrders() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-900">아직 주문 내역이 없습니다.</p>
      <Link href="/styles" className="mt-4 inline-flex text-sm font-medium text-gray-900 underline underline-offset-4">
        스타일 둘러보기
      </Link>
    </section>
  );
}

function OrderList({ orders }: { orders: OrderListItem[] }) {
  return (
    <ul className="space-y-4" aria-label="주문 목록">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ order }: { order: OrderListItem }) {
  const itemCount = order._count.items;
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-mono text-gray-400">주문번호: {order.id}</p>
          <h2 className="text-base font-semibold text-gray-900">{orderItemSummary(order)}</h2>
          <p className="text-sm text-gray-500">결제일 {formatDateTime(order.paidAt ?? order.createdAt)}</p>
          <p className="text-xs text-gray-500">상품 {itemCount}개</p>
        </div>
        <div className="shrink-0 space-y-2 text-right">
          <span className="inline-flex rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
            {orderStatusLabel(order.status)}
          </span>
          <p className="text-base font-semibold text-gray-900">{formatMoney(order.totalAmount, order.currency)}</p>
        </div>
      </div>
      <Link
        href={`/orders/${order.id}`}
        className="mt-4 inline-flex text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        상세 보기
      </Link>
    </article>
  );
}

function orderItemSummary(order: OrderListItem): string {
  const snapshot = firstSnapshot(order);
  const itemName = snapshot ? displayText(snapshot.styleName, "상품 정보 확인 중") : "상품 정보 확인 중";
  const remaining = order._count.items - 1;
  return remaining > 0 ? `${itemName} 외 ${remaining}개` : itemName;
}

function firstSnapshot(order: OrderListItem): SnapshotData | null {
  const [firstItem] = order.items;
  if (!firstItem) return null;
  return safeParseSnapshotData(firstItem.snapshotData);
}

function safeParseSnapshotData(raw: unknown): SnapshotData | null {
  try {
    return parseSnapshotData(raw);
  } catch {
    return null;
  }
}

function currencyMeta(currencyCode: string): CurrencyMeta {
  return CURRENCY_META[currencyCode] ?? CURRENCY_META.KRW;
}

function formatMoney(amount: number, currencyCode: string): string {
  return formatPrice(amount, currencyMeta(currencyCode));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
