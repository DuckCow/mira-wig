import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { isAdminPaymentReviewFilter, type AdminPaymentReviewState } from "@/lib/admin-payment-review";
import {
  ADMIN_ORDER_STATUSES,
  ADMIN_PAYMENT_STATUSES,
  isAdminMarketCode,
  isAdminOrderStatus,
  isAdminPaymentStatus,
  listAdminOrders,
  type AdminOrderFilters,
  type AdminOrderListItem,
} from "@/lib/admin-orders-data";
import { CURRENCY_META, MARKET_CODES, formatPrice } from "@/lib/market/types";

export const metadata = { title: "주문 관리 — Mira 어드민" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type FilterValues = {
  status: string;
  paymentStatus: string;
  marketCode: string;
  paymentReview: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "결제 대기",
  PAID: "결제 완료",
  PAYMENT_FAILED: "결제 실패",
  PENDING: "처리 대기",
  CONFIRMED: "확인 완료",
  MANUFACTURING: "제작 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  CANCELLED: "취소",
  REFUNDED: "환불",
};

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: "대기",
  PAID: "결제 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  REFUNDED: "환불",
  PARTIALLY_REFUNDED: "부분 환불",
};

const PAYMENT_REVIEW_FILTER = "unreconciled";
const PAYMENT_REVIEW_LABELS: Record<AdminPaymentReviewState, string> = {
  UNCONFIRMED: "미확정",
  AUTO_REFUND_PENDING: "환불 확인 필요",
  AUTO_REFUND_FAILED: "환불 실패",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseDateStart(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDateEnd(value: string): Date | undefined {
  const start = parseDateStart(value);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFilterValues(raw: Awaited<SearchParams>): FilterValues {
  return {
    status: first(raw.status),
    paymentStatus: first(raw.paymentStatus),
    marketCode: first(raw.marketCode),
    paymentReview: first(raw.paymentReview),
    dateFrom: first(raw.dateFrom),
    dateTo: first(raw.dateTo),
    page: parsePositiveInt(first(raw.page), 1),
  };
}

function toFilters(values: FilterValues): AdminOrderFilters {
  return {
    ...(isAdminOrderStatus(values.status) && { status: values.status }),
    ...(isAdminPaymentStatus(values.paymentStatus) && { paymentStatus: values.paymentStatus }),
    ...(isAdminMarketCode(values.marketCode) && { marketCode: values.marketCode }),
    ...(isAdminPaymentReviewFilter(values.paymentReview) && { paymentReview: values.paymentReview }),
    dateFrom: parseDateStart(values.dateFrom),
    dateTo: parseDateEnd(values.dateTo),
    page: values.page,
  };
}

function badgeVariant(status: string): BadgeVariant {
  if (status === "PAID" || status === "DELIVERED" || status === "REFUNDED") return "active";
  if (status === "PAYMENT_FAILED" || status === "CANCELLED" || status === "FAILED") return "error";
  if (status === "PENDING_PAYMENT" || status === "PENDING") return "warning";
  return "inactive";
}

function paymentReviewVariant(state: AdminPaymentReviewState): BadgeVariant {
  return state === "AUTO_REFUND_FAILED" ? "error" : "warning";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function money(amount: number, currencyCode: string): string {
  const currency = CURRENCY_META[currencyCode];
  return currency ? formatPrice(amount, currency) : `${amount} ${currencyCode}`;
}

function buildPageHref(values: FilterValues, page: number): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  if (values.marketCode) params.set("marketCode", values.marketCode);
  if (values.paymentReview) params.set("paymentReview", values.paymentReview);
  if (values.dateFrom) params.set("dateFrom", values.dateFrom);
  if (values.dateTo) params.set("dateTo", values.dateTo);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function buildFilterHref(values: FilterValues, overrides: Partial<FilterValues>): string {
  return buildPageHref({ ...values, ...overrides, page: 1 }, 1);
}

function PaymentReviewChip({ values }: { values: FilterValues }) {
  const active = values.paymentReview === PAYMENT_REVIEW_FILTER;
  return (
    <Link
      href={buildFilterHref(values, { paymentReview: active ? "" : PAYMENT_REVIEW_FILTER })}
      className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-yellow-300 bg-yellow-100 text-yellow-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
    >
      미확정·환불실패만
    </Link>
  );
}

function FilterForm({ values }: { values: FilterValues }) {
  return (
    <form method="GET" className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
      <SelectField name="status" label="주문 상태" value={values.status} options={ADMIN_ORDER_STATUSES} labels={STATUS_LABELS} />
      <SelectField name="paymentStatus" label="결제 상태" value={values.paymentStatus} options={ADMIN_PAYMENT_STATUSES} labels={PAYMENT_LABELS} />
      <SelectField name="marketCode" label="마켓" value={values.marketCode} options={MARKET_CODES} labels={{ KR: "KR", US: "US", JP: "JP" }} />
      <DateField name="dateFrom" label="시작일" value={values.dateFrom} />
      <DateField name="dateTo" label="종료일" value={values.dateTo} />
      <div className="flex gap-2">
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700">필터</button>
        <Link href="/admin/orders" className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">초기화</Link>
      </div>
    </form>
  );
}

function PaymentBadges({ row }: { row: AdminOrderListItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={badgeVariant(row.paymentStatus)}>{PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus}</Badge>
      {row.paymentReview && (
        <Badge variant={paymentReviewVariant(row.paymentReview)}>
          {PAYMENT_REVIEW_LABELS[row.paymentReview]}
        </Badge>
      )}
    </div>
  );
}

function SelectField({
  name, label, value, options, labels,
}: {
  name: string; label: string; value: string;
  options: readonly string[]; labels: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <select name={name} defaultValue={value} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        <option value="">전체</option>
        {options.map((option) => <option key={option} value={option}>{labels[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function DateField({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <input name={name} type="date" defaultValue={value} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
    </label>
  );
}

function columns(): Column<AdminOrderListItem>[] {
  return [
    {
      key: "id",
      header: "주문",
      render: (row) => (
        <Link href={`/admin/orders/${row.id}`} className="text-blue-600 hover:underline font-mono text-xs">
          {row.id}
        </Link>
      ),
    },
    { key: "customer", header: "고객", render: (row) => <span>{row.user.name ?? row.user.email}</span> },
    { key: "market", header: "마켓", render: (row) => row.marketCode },
    {
      key: "status",
      header: "상태",
      render: (row) => <Badge variant={badgeVariant(row.status)}>{STATUS_LABELS[row.status] ?? row.status}</Badge>,
    },
    {
      key: "payment",
      header: "결제",
      render: (row) => <PaymentBadges row={row} />,
    },
    { key: "amount", header: "금액", render: (row) => money(row.totalAmount, row.currency) },
    { key: "items", header: "상품", render: (row) => `${row.itemCount}개` },
    { key: "created", header: "생성일", render: (row) => formatDate(row.createdAt) },
  ];
}

function Pagination({ values, page, totalPages }: { values: FilterValues; page: number; totalPages: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-600">
      <span>{page} / {totalPages}</span>
      <div className="flex gap-2">
        <Link
          href={buildPageHref(values, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`px-3 py-1.5 border rounded ${page <= 1 ? "pointer-events-none text-gray-300 border-gray-200" : "border-gray-300 hover:bg-gray-50"}`}
        >
          이전
        </Link>
        <Link
          href={buildPageHref(values, Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={`px-3 py-1.5 border rounded ${page >= totalPages ? "pointer-events-none text-gray-300 border-gray-200" : "border-gray-300 hover:bg-gray-50"}`}
        >
          다음
        </Link>
      </div>
    </div>
  );
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const values = parseFilterValues(await searchParams);
  const result = await listAdminOrders(toFilters(values));
  if (!result.success && result.errorCode === "UNAUTHENTICATED") redirect("/login?callbackUrl=/admin/orders");
  if (!result.success) redirect("/");
  const { orders, total, paymentReviewCount, page, totalPages } = result.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">주문 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          총 {total}건 · <Link href={buildFilterHref(values, { paymentReview: PAYMENT_REVIEW_FILTER })} className="text-yellow-700 hover:underline">확인 필요 {paymentReviewCount}건</Link>
        </p>
      </div>
      <Card>
        <div className="space-y-3">
          <FilterForm values={values} />
          <PaymentReviewChip values={values} />
        </div>
      </Card>
      <Card>
        <Table columns={columns()} rows={orders} getRowKey={(row) => row.id} emptyMessage="조건에 맞는 주문이 없습니다." />
      </Card>
      <Pagination values={values} page={page} totalPages={totalPages} />
    </div>
  );
}
