import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { AuthorizationPanel } from "./AuthorizationPanel";
import { requireAdmin } from "@/lib/admin";
import {
  loadRefundExecutionWorklist,
  RefundExecutionWorklistValidationError,
} from "@/lib/payment/refund/admin/execution-worklist";
import {
  buildRefundExecutionWorklistViewModel,
  COMMAND_STATUS_OPTIONS,
  LEASE_STATE_OPTIONS,
  type RefundExecutionWorklistViewModel,
} from "./view-model";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "환불 운영 현황" };

export default async function AdminRefundExecutionPage(
  { searchParams }: { searchParams: SearchParams },
) {
  const guard = await requireAdmin();
  if (!guard.success) redirect("/");

  const raw = await searchParams;
  const readTime = new Date();
  try {
    const result = await loadRefundExecutionWorklist({
      status: omitEmptyFormValue(raw.status),
      leaseState: omitEmptyFormValue(raw.leaseState),
      orderId: omitEmptyFormValue(raw.orderId),
      cursor: omitEmptyFormValue(raw.cursor),
      pageSize: omitEmptyFormValue(raw.pageSize),
      readTime,
    });
    return <RefundExecutionWorklistPage view={buildRefundExecutionWorklistViewModel(result)} />;
  } catch (error) {
    if (error instanceof RefundExecutionWorklistValidationError) {
      return <InvalidFilterPage />;
    }
    throw error;
  }
}

export function omitEmptyFormValue(value: unknown): unknown {
  return value === "" ? undefined : value;
}

export function RefundExecutionWorklistPage(
  { view }: { view: RefundExecutionWorklistViewModel },
) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">환불 운영 현황</h1>
        <p className="mt-1 text-sm text-gray-500">환불 실행 상태를 확인하고 허용된 재진입 승인을 관리합니다.</p>
      </header>
      <Card>
        <WorklistFilters filters={view.filters} />
      </Card>
      <Card>
        <WorklistRows rows={view.rows} />
      </Card>
      <AuthorizationPanel />
      {view.nextHref ? (
        <div className="flex justify-end">
          <Link href={view.nextHref} className="text-sm font-medium text-blue-600 hover:underline">
            다음 페이지 →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function WorklistFilters({ filters }: { filters: RefundExecutionWorklistViewModel["filters"] }) {
  return (
    <form method="get" className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <FilterField label="명령 상태">
        <select name="status" defaultValue={filters.status} className="w-full border border-gray-300 px-3 py-2 text-sm">
          <option value="">기본: 완료 제외</option>
          {COMMAND_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </FilterField>
      <FilterField label="리스 상태">
        <select name="leaseState" defaultValue={filters.leaseState} className="w-full border border-gray-300 px-3 py-2 text-sm">
          {LEASE_STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </FilterField>
      <FilterField label="주문 ID">
        <input name="orderId" defaultValue={filters.orderId} className="w-full border border-gray-300 px-3 py-2 text-sm" />
      </FilterField>
      <FilterField label="페이지 크기">
        <input
          type="number"
          name="pageSize"
          min="1"
          max="50"
          defaultValue={filters.pageSize}
          className="w-full border border-gray-300 px-3 py-2 text-sm"
        />
      </FilterField>
      <div className="flex items-end">
        <button type="submit" className="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
          필터 적용
        </button>
      </div>
    </form>
  );
}

function WorklistRows({ rows }: { rows: RefundExecutionWorklistViewModel["rows"] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">조건에 맞는 환불 실행 명령이 없습니다.</p>;
  }
  return (
    <ol className="divide-y divide-gray-100">
      {rows.map((row) => (
        <li key={row.renderKey} className="space-y-4 py-5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-gray-500">주문번호: {row.orderId}</p>
              <p className="mt-1 font-medium text-gray-900">{row.commandStatus}</p>
              {row.leaseState ? <p className="mt-1 text-sm text-amber-700">{row.leaseState}</p> : null}
            </div>
            <p className="font-semibold text-gray-900">{row.refundAmount}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="환불 상태" value={row.attemptStatus} />
            <Info label="주문 상태" value={row.orderStatus} />
            <Info label="제공자 / 모드" value={row.providerContext} />
            <Info label="실행 차수" value={row.dispatchAttempt} />
            <Info label="실행 가능 시각" value={row.availableAt} />
            <Info label="리스 기한" value={row.leaseUntil} />
            <Info label="명령 생성" value={row.createdAt} />
            <Info label="명령 변경" value={row.updatedAt} />
          </dl>
          {row.diagnostic ? (
            <div className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">운영 진단</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <Info label="오류 코드" value={row.diagnostic.code} />
                <Info label="오류 메시지" value={row.diagnostic.message} />
              </dl>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Link href={row.orderHref} className="text-sm font-medium text-blue-600 hover:underline">
              주문 상세 보기
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-xs font-medium text-gray-600"><span>{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 break-words text-gray-900">{value}</dd></div>;
}

function InvalidFilterPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">환불 운영 현황</h1>
      <p className="text-sm text-red-700">조회 조건이 올바르지 않습니다. 필터 값을 확인해 주세요.</p>
      <Link href="/admin/refunds/execution" className="text-sm text-blue-600 hover:underline">기본 목록으로 돌아가기</Link>
    </div>
  );
}
