import {
  FulfillmentType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
} from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CURRENCY_META, formatPrice, type CurrencyMeta } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type { SnapshotData } from "@/lib/order/types";
import { getSession } from "@/lib/session";
import { getCurlLabel, getLengthLabel } from "@/lib/wig-option-labels";
import {
  CustomerRefundIntakeActivationConfigError,
  isCustomerRefundIntakeSubmitEnabled,
} from "@/lib/payment/refund/customer-intake-activation";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import { orderStatusLabel } from "../order-status";
import { CustomerRefundIntakeSection } from "./CustomerRefundIntakeSection";
import {
  loadCustomerOrderDetail,
  type CustomerOrderDetailRecord,
} from "./customer-order-detail-data";

type PageParams = Promise<{ id: string }>;
type OrderDetail = CustomerOrderDetailRecord;
type OrderLine = OrderDetail["items"][number];
type OrderShipping = NonNullable<OrderDetail["shipping"]>;
type PaymentSummary = OrderDetail["payment"];

export const metadata = { title: "주문 상세" };

export default async function OrderPage({ params }: { params: PageParams }) {
  const session = await getSession();
  if (!session?.user.id) {
    const { id } = await params;
    redirect(loginPath(id));
  }

  const customerUserId = session.user.id.trim();
  if (!customerUserId) throw customerOrderDetailInvariant();

  const { id } = await params;
  const submitEnabled = resolveCustomerRefundIntakeSubmitEnabled();
  const detail = await loadCustomerOrderDetail(id, customerUserId, submitEnabled);
  if (!detail) notFound();

  return <CustomerOrderDetailView order={detail.order} intake={detail.intake} />;
}

export function CustomerOrderDetailView({
  order,
  intake,
}: {
  order: OrderDetail;
  intake: CustomerRefundIntakeReadModel;
}) {
  const currency = currencyMeta(order.currency);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-900">
        ← 내 주문
      </Link>

      <OrderHeader order={order} />
      <CustomerRefundIntakeSection model={intake} />
      <OrderItems items={order.items} currency={currency} />
      <ShippingSection shipping={order.shipping} />
      <PaymentDetails order={order} />
      <FooterLinks />
    </main>
  );
}

export function resolveCustomerRefundIntakeSubmitEnabled(): boolean {
  try {
    return isCustomerRefundIntakeSubmitEnabled();
  } catch (error) {
    if (error instanceof CustomerRefundIntakeActivationConfigError) return false;
    throw error;
  }
}

function OrderHeader({ order }: { order: OrderDetail }) {
  return (
    <header className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">주문 상세</h1>
          <p className="mt-1 text-xs font-mono text-gray-400">주문번호: {order.id}</p>
        </div>
        <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
          {orderStatusLabel(order.status)}
        </span>
      </div>
      <p className="text-sm text-gray-500">결제일 {formatDateTime(order.paidAt)}</p>
      {order.status === OrderStatus.REFUND_PENDING ? (
        <div className="space-y-1 text-sm text-gray-600">
          <p>환불 요청이 접수되어 처리 중입니다.</p>
          <p>환불 여부와 완료 시점은 아직 확정되지 않았습니다.</p>
        </div>
      ) : null}
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OrderItems({ items, currency }: { items: OrderLine[]; currency: CurrencyMeta }) {
  return (
    <Section title="주문 상품">
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} className="py-4 first:pt-0 last:pb-0">
            <OrderItemRow item={item} currency={currency} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ShippingSection({ shipping }: { shipping: OrderDetail["shipping"] }) {
  return (
    <Section title="배송 정보">
      {shipping ? <ShippingBlock shipping={shipping} /> : <p className="text-sm text-gray-500">배송지 정보 확인 중</p>}
    </Section>
  );
}

function PaymentDetails({ order }: { order: OrderDetail }) {
  return (
    <Section title="결제 정보">
      <div className="space-y-3">
        <SummaryRow label="상품 합계" value={formatMoney(order.subtotalAmount, order.currency)} />
        <SummaryRow label="배송비" value={`${formatMoney(order.shippingAmount, order.currency)} · 배송비 정책 확정 전`} />
        <SummaryRow label="세금·관세" value="세금·관세는 정책 확정 전이며, 현재 주문 금액으로 별도 계산하지 않았습니다." />
        <SummaryRow label="총 결제 금액" value={formatMoney(order.totalAmount, order.currency)} strong />
        <SummaryRow label="결제 상태" value={paymentStatusLabel(order.payment.status)} />
        <SummaryRow label="결제 금액" value={formatMoney(order.payment.amount, order.payment.currency)} />
        <SummaryRow label="결제 수단" value={paymentMethodLabel(order.payment)} />
      </div>
    </Section>
  );
}

function FooterLinks() {
  return (
    <nav aria-label="주문 후 이동" className="flex flex-wrap gap-3">
      <Link
        href="/orders"
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        주문 목록
      </Link>
      <Link href="/styles" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
        스타일 둘러보기
      </Link>
    </nav>
  );
}

function OrderItemRow({ item, currency }: { item: OrderLine; currency: CurrencyMeta }) {
  const snapshot = safeParseSnapshotData(item.snapshotData);
  const lineTotal = item.unitAmount * item.quantity;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{itemName(snapshot)}</p>
          <p className="mt-1 text-xs text-gray-500">{itemOptionLabel(snapshot)}</p>
          <p className="mt-1 text-xs text-gray-500">{fulfillmentLabel(item.fulfillmentType)}</p>
        </div>
        <p className="shrink-0 font-semibold text-gray-900">{formatPrice(lineTotal, currency)}</p>
      </div>
      <p className="text-xs text-gray-500">
        {formatPrice(item.unitAmount, currency)} × {item.quantity}
      </p>
    </div>
  );
}

function ShippingBlock({ shipping }: { shipping: OrderShipping }) {
  return (
    <div className="space-y-2 text-sm text-gray-600">
      <p className="font-medium text-gray-900">{shipping.recipientName}</p>
      <p>{shipping.phone}</p>
      <p>
        [{shipping.postalCode}] {countryLabel(shipping.country)} {shipping.administrativeArea} {shipping.city}{" "}
        {shipping.addressLine1}
        {shipping.addressLine2 ? ` ${shipping.addressLine2}` : ""}
      </p>
      {shipping.memo ? <p className="text-xs text-gray-500">배송 메모: {shipping.memo}</p> : null}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${strong ? "font-semibold text-gray-900" : "text-gray-600"}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function loginPath(orderId: string): string {
  return `/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}`)}`;
}

function customerOrderDetailInvariant(): Error {
  return new Error("Customer Order-detail boundary invariant failed.");
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

function paymentStatusLabel(status: PaymentAttemptStatus): string {
  if (status === PaymentAttemptStatus.SUCCEEDED) return "결제 완료";
  if (status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING) return "결제 확인 중";
  if (status === PaymentAttemptStatus.FAILED) return "결제 실패";
  if (status === PaymentAttemptStatus.VOIDED) return "결제 취소";
  return "결제 상태 확인 중";
}

function paymentMethodLabel(payment: PaymentSummary): string {
  if (process.env.NODE_ENV !== "production" && isMockSandbox(payment)) return "온라인 결제 · 테스트 결제";
  return "온라인 결제";
}

function isMockSandbox(payment: PaymentSummary): boolean {
  return payment.provider === PaymentProvider.MOCK || payment.mode === PaymentMode.SANDBOX;
}

function optionLabel(snapshot: SnapshotData): string {
  const parts = [
    displayText(snapshot.color, ""),
    displayText(getLengthLabel(snapshot.length), ""),
    displayText(getCurlLabel(snapshot.curl), ""),
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" / ") : "옵션 정보 확인 중";
}

function safeParseSnapshotData(raw: unknown): SnapshotData | null {
  try {
    return parseSnapshotData(raw);
  } catch {
    return null;
  }
}

function itemName(snapshot: SnapshotData | null): string {
  return snapshot ? displayText(snapshot.styleName, "상품 정보 확인 중") : "상품 정보 확인 중";
}

function itemOptionLabel(snapshot: SnapshotData | null): string {
  return snapshot ? optionLabel(snapshot) : "옵션 정보 확인 중";
}

function fulfillmentLabel(type: FulfillmentType): string {
  if (type === FulfillmentType.MTO) return "주문 제작";
  if (type === FulfillmentType.STOCKED) return "재고 상품";
  return "상품 유형 확인 중";
}

function countryLabel(country: ShippingCountry): string {
  if (country === ShippingCountry.KR) return "대한민국";
  if (country === ShippingCountry.US) return "미국";
  if (country === ShippingCountry.JP) return "일본";
  return country;
}

function displayText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
