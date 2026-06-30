import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getAdminOrderDetail, type AdminOrderDetail } from "@/lib/admin-orders-data";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import { getNextOrderStatus } from "@/lib/order/status-transition";
import { OrderStatusTransitionButton } from "./OrderStatusTransitionButton";

type Params = Promise<{ id: string }>;

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

const TRANSITION_ACTION_LABELS: Record<string, string> = {
  PAID: "제작 확정",
  CONFIRMED: "제작 시작",
  MANUFACTURING: "배송 처리",
  SHIPPED: "배송 완료 처리",
};

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: "대기",
  PAID: "결제 완료",
  FAILED: "실패",
  SUCCEEDED: "성공",
  CANCELLED: "취소",
  REFUNDED: "환불",
  PARTIALLY_REFUNDED: "부분 환불",
};

function badgeVariant(status: string): BadgeVariant {
  if (status === "PAID" || status === "SUCCEEDED" || status === "REFUNDED" || status === "DELIVERED") return "active";
  if (status === "FAILED" || status === "PAYMENT_FAILED" || status === "CANCELLED") return "error";
  if (status === "PENDING" || status === "PENDING_PAYMENT") return "warning";
  return "inactive";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(amount: number, currencyCode: string): string {
  const currency = CURRENCY_META[currencyCode];
  return currency ? formatPrice(amount, currency) : `${amount} ${currencyCode}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Summary({ order }: { order: AdminOrderDetail }) {
  return (
    <Card title="주문 요약">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="주문번호"><code className="text-xs">{order.id}</code></Field>
        <Field label="고객">{order.user.name ?? "-"} · {order.user.email}</Field>
        <Field label="생성일">{formatDate(order.createdAt)}</Field>
        <Field label="마켓/통화">{order.marketCode} / {order.currency}</Field>
        <Field label="주문 상태"><Badge variant={badgeVariant(order.status)}>{STATUS_LABELS[order.status] ?? order.status}</Badge></Field>
        <Field label="결제 상태"><Badge variant={badgeVariant(order.paymentStatus)}>{PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}</Badge></Field>
        <Field label="총액">{money(order.totalAmount, order.currency)}</Field>
        <Field label="상품 수">{order.itemCount}개</Field>
        <Field label="결제 시도">{order.paymentCount}건</Field>
      </dl>
    </Card>
  );
}

function Address({ order }: { order: AdminOrderDetail }) {
  return (
    <Card title="배송지">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="수령인">{order.recipientName}</Field>
        <Field label="연락처">{order.phone}</Field>
        <Field label="국가/우편번호">{order.country} / {order.postalCode}</Field>
        <Field label="지역">{order.administrativeArea ?? "-"} {order.city}</Field>
        <Field label="주소">{order.addressLine1} {order.addressLine2 ?? ""}</Field>
        <Field label="메모">{order.memo ?? "-"}</Field>
      </dl>
    </Card>
  );
}

function StatusTransition({ order }: { order: AdminOrderDetail }) {
  const nextStatus = getNextOrderStatus(order.status);
  if (!nextStatus) return null;
  const actionLabel = TRANSITION_ACTION_LABELS[order.status] ?? "다음 상태로 전이";
  return (
    <Card title="주문 상태 전이">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          현재 {STATUS_LABELS[order.status] ?? order.status} → {STATUS_LABELS[nextStatus] ?? nextStatus}
        </p>
        <OrderStatusTransitionButton
          orderId={order.id}
          currentStatus={order.status}
          targetStatus={nextStatus}
          label={`${actionLabel} (${STATUS_LABELS[nextStatus] ?? nextStatus})`}
        />
      </div>
    </Card>
  );
}

function Items({ order }: { order: AdminOrderDetail }) {
  return (
    <Card title="주문 상품 / 제조 요청">
      <div className="divide-y divide-gray-100">
        {order.items.map((item) => (
          <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.snapshotData.styleName}</p>
                <p className="text-xs text-gray-500">
                  {item.snapshotData.color} / {item.snapshotData.length} / {item.snapshotData.curl}
                </p>
                <p className="text-xs text-gray-400 font-mono mt-1">{item.variantId}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-gray-900">{money(item.unitPrice * item.quantity, order.currency)}</p>
                <p className="text-xs text-gray-500">수량 {item.quantity}</p>
              </div>
            </div>
            <Manufacturing request={item.manufacturingRequest} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function Manufacturing({ request }: { request: AdminOrderDetail["items"][number]["manufacturingRequest"] }) {
  if (!request) return <p className="text-xs text-gray-400">제조 요청 없음</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded bg-gray-50 p-3">
      <Field label="제조 요청"><code className="text-xs">{request.id}</code></Field>
      <Field label="상태"><Badge variant={badgeVariant(request.status)}>{request.status}</Badge></Field>
      <Field label="Hair CAD">{request.hairCadKey ?? "-"}</Field>
      <Field label="메모">{request.notes ?? "-"}</Field>
    </dl>
  );
}

function Payments({ order }: { order: AdminOrderDetail }) {
  return (
    <Card title="결제 / 환불 기록">
      {order.payments.length === 0 ? (
        <p className="py-6 text-sm text-center text-gray-400">결제 시도 기록이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {order.payments.map((payment) => (
            <div key={payment.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Provider">{payment.provider}</Field>
                <Field label="상태"><Badge variant={badgeVariant(payment.status)}>{PAYMENT_LABELS[payment.status] ?? payment.status}</Badge></Field>
                <Field label="금액">{money(payment.amount, payment.currency)}</Field>
                <Field label="생성일">{formatDate(payment.createdAt)}</Field>
                <Field label="거래 ID">{payment.providerTransactionId ?? "-"}</Field>
                <Field label="멱등키"><code className="text-xs">{payment.idempotencyKey}</code></Field>
                <Field label="에러">{payment.errorMessage ?? "-"}</Field>
              </div>
              <Adjustments adjustments={payment.adjustments} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Adjustments({ adjustments }: { adjustments: AdminOrderDetail["payments"][number]["adjustments"] }) {
  if (adjustments.length === 0) return <p className="text-xs text-gray-400">환불/취소 기록 없음</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr className="border-b border-gray-100">
            <th className="py-2 text-left font-medium">상태</th>
            <th className="py-2 text-left font-medium">금액</th>
            <th className="py-2 text-left font-medium">PG 환불 ID</th>
            <th className="py-2 text-left font-medium">사유</th>
            <th className="py-2 text-left font-medium">생성일</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((adj) => (
            <tr key={adj.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2"><Badge variant={badgeVariant(adj.status)}>{adj.status}</Badge></td>
              <td className="py-2">{money(adj.amount, adj.currency)}</td>
              <td className="py-2">{adj.providerRefundId ?? "-"}</td>
              <td className="py-2">{adj.reason}</td>
              <td className="py-2">{formatDate(adj.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminOrderDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const result = await getAdminOrderDetail(id);
  if (!result.success && result.errorCode === "UNAUTHENTICATED") redirect(`/login?callbackUrl=/admin/orders/${id}`);
  if (!result.success) redirect("/");
  if (!result.data) notFound();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-700">← 주문 목록</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{result.data.id}</span>
      </div>
      <Summary order={result.data} />
      <StatusTransition order={result.data} />
      <Items order={result.data} />
      <Address order={result.data} />
      <Payments order={result.data} />
    </div>
  );
}
