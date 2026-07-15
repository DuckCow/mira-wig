import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  AdminCustomerRefundIntakeQueueValidationError,
  loadAdminCustomerRefundIntakeQueue,
} from "@/lib/payment/refund/admin/customer-intake-read";
import {
  buildAdminCustomerRefundIntakeQueueViewModel,
  type AdminCustomerRefundIntakeQueueViewModel,
} from "./view-model";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "환불 검토 요청" };

export default async function AdminCustomerRefundIntakeQueuePage(
  { searchParams }: { searchParams: SearchParams },
) {
  const guard = await requireAdmin();
  if (!guard.success) redirect("/");

  const raw = await searchParams;
  const cursor = raw.cursor;
  try {
    const result = await loadAdminCustomerRefundIntakeQueue(db, { cursor });
    return (
      <AdminCustomerRefundIntakeQueuePageView
        view={buildAdminCustomerRefundIntakeQueueViewModel(result, cursor !== undefined)}
      />
    );
  } catch (error) {
    if (error instanceof AdminCustomerRefundIntakeQueueValidationError) {
      return <InvalidQueueQueryPage />;
    }
    throw error;
  }
}

export function AdminCustomerRefundIntakeQueuePageView(
  { view }: { view: AdminCustomerRefundIntakeQueueViewModel },
) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">환불 검토 요청</h1>
        <p className="mt-1 text-sm text-gray-500">
          접수 순서대로 고객 환불 검토 요청을 확인합니다.
        </p>
      </header>
      <Card>
        {view.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            검토 대기 중인 환불 요청이 없습니다.
          </p>
        ) : (
          <ol className="divide-y divide-gray-100">
            {view.rows.map((row) => (
              <li key={row.renderKey} className="space-y-4 py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{row.reasonLabel}</p>
                    <p className="mt-1 text-sm text-gray-500">접수 {row.submittedAt}</p>
                  </div>
                  <p className="font-semibold text-gray-900">{row.orderTotal}</p>
                </div>
                <p className="text-sm text-gray-600">주문 상태: {row.orderStatusLabel}</p>
                {row.ownershipWarning ? (
                  <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {row.ownershipWarning}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Link href={row.orderHref} className="text-sm font-medium text-blue-600 hover:underline">
                    주문 상세에서 검토
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <nav aria-label="환불 검토 요청 페이지 이동" className="flex justify-between gap-4">
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

export function InvalidQueueQueryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">환불 검토 요청</h1>
      <p className="text-sm text-red-700">조회 조건이 올바르지 않습니다.</p>
      <Link href="/admin/refunds/intakes" className="text-sm text-blue-600 hover:underline">
        기본 목록으로 돌아가기
      </Link>
    </div>
  );
}
