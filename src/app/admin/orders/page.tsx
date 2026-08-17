import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  AdminOrderListValidationError,
  loadAdminOrderList,
  type AdminOrderListReadCapability,
} from "./admin-order-list-data";
import {
  buildAdminOrderListViewModel,
  type AdminOrderListRowViewModel,
  type AdminOrderListViewModel,
} from "./admin-order-list-view-model";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "주문 관리" };

const adminOrderListReader = {
  order: {
    findMany: (query) => db.order.findMany({
      where: query.where,
      select: query.select,
      orderBy: query.orderBy,
      take: query.take,
    }),
  },
} satisfies AdminOrderListReadCapability;

export default async function AdminOrdersPage(
  { searchParams }: { searchParams: SearchParams },
) {
  const guard = await requireAdmin();
  if (!guard.success) redirect("/");

  const raw = await searchParams;
  const cursor = raw.cursor;
  try {
    const result = await loadAdminOrderList(adminOrderListReader, { cursor });
    return (
      <AdminOrderListPageView
        view={buildAdminOrderListViewModel(result, cursor !== undefined)}
      />
    );
  } catch (error) {
    if (error instanceof AdminOrderListValidationError) return <InvalidOrderListQueryPage />;
    throw error;
  }
}

export function AdminOrderListPageView({ view }: { view: AdminOrderListViewModel }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">주문 관리</h1>
        <p className="mt-1 text-sm text-gray-500">최근 주문부터 확인합니다.</p>
      </header>

      <Card>
        {view.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            아직 생성된 주문이 없습니다.
          </p>
        ) : (
          <ol aria-label="관리자 주문 목록" className="divide-y divide-gray-100">
            {view.rows.map((row) => (
              <li key={row.renderKey} className="py-5 first:pt-0 last:pb-0">
                <OrderListArticle row={row} />
              </li>
            ))}
          </ol>
        )}
      </Card>

      <nav aria-label="관리자 주문 목록 페이지 이동" className="flex justify-between gap-4">
        <div>
          {view.firstPageHref ? (
            <Link href={view.firstPageHref} className="text-sm font-medium text-blue-600 hover:underline">
              처음으로
            </Link>
          ) : null}
        </div>
        <div>
          {view.nextHref ? (
            <Link href={view.nextHref} className="text-sm font-medium text-blue-600 hover:underline">
              다음 페이지 →
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}

function OrderListArticle({ row }: { row: AdminOrderListRowViewModel }) {
  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="break-all font-mono text-xs text-gray-500">주문번호: {row.orderId}</p>
          <h2 className="font-semibold text-gray-900">{row.itemSummary}</h2>
          <p className="text-sm text-gray-600">
            상품 {row.itemLineCount}종 · 총 {row.totalQuantity}개
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-gray-900">{row.totalAmountLabel}</p>
          <p className="mt-1 text-xs text-gray-500">{row.marketContextLabel}</p>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <OrderListFact label="결제일" value={row.paidAtLabel} />
        <OrderListFact label="고객" value={`${row.customerName} · ${row.customerEmail}`} />
        <OrderListFact label="주문 상태" value={row.orderStatusLabel} />
        <OrderListFact
          label="결제 상태"
          value={`${row.paymentStatusLabel} · ${row.paymentContextLabel}`}
        />
      </dl>

      <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <span className="font-medium text-gray-900">제작</span> · {row.manufacturingSummaryLabel}
      </div>

      {row.snapshotWarning ? <OrderListWarning>{row.snapshotWarning}</OrderListWarning> : null}
      {row.paymentAttention ? <OrderListWarning>{row.paymentAttention}</OrderListWarning> : null}
      {row.manufacturingWarning ? <OrderListWarning>{row.manufacturingWarning}</OrderListWarning> : null}

      <div className="flex justify-end">
        <Link href={row.orderHref} className="text-sm font-medium text-blue-600 hover:underline">
          상세 보기
        </Link>
      </div>
    </article>
  );
}

function OrderListFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
}

function OrderListWarning({ children }: { children: string }) {
  return (
    <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}
    </p>
  );
}

export function InvalidOrderListQueryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">주문 관리</h1>
      <p className="text-sm text-red-700">조회 조건이 올바르지 않습니다.</p>
      <Link href="/admin/orders" className="text-sm text-blue-600 hover:underline">
        기본 주문 목록으로 돌아가기
      </Link>
    </div>
  );
}
