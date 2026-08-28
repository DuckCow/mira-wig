import {
  FulfillmentType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  ShippingCountry,
} from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticationLocale } from "@/lib/market";
import {
  localizedCurlLabel,
  localizedLengthLabel,
} from "@/lib/market/catalog-presentation";
import { LOCALE_INTL, type Locale } from "@/lib/market/locale";
import {
  messagesFor,
  selectOrderCancellationMessages,
  type OrderMessages,
} from "@/lib/market/messages";
import { CURRENCY_META, formatPrice, isCurrencyCode } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type { SnapshotData } from "@/lib/order/types";
import { getSession } from "@/lib/session";
import {
  CustomerRefundIntakeActivationConfigError,
  isCustomerRefundIntakeSubmitEnabled,
} from "@/lib/payment/refund/customer-intake-activation";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import { randomUUID } from "node:crypto";
import {
  isCustomerMtoOrderCancellationEnabled,
  OrderCancellationActivationConfigError,
} from "@/lib/order-cancellation/activation";
import { CustomerRefundIntakeSection } from "./CustomerRefundIntakeSection";
import { OrderCancellationControl } from "./OrderCancellationControl";
import {
  loadCustomerOrderDetail,
  type CustomerOrderDetailRecord,
} from "./customer-order-detail-data";

type PageParams = Promise<{ id: string }>;
type OrderDetail = CustomerOrderDetailRecord;
type OrderLine = OrderDetail["items"][number];
type OrderShipping = NonNullable<OrderDetail["shipping"]>;
type PaymentSummary = OrderDetail["payment"];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAuthenticationLocale();
  return { title: messagesFor(locale).order.metadataTitle };
}

export default async function OrderPage({ params }: { params: PageParams }) {
  const session = await getSession();
  if (!session?.user.id) {
    const { id } = await params;
    redirect(loginPath(id));
  }

  const customerUserId = session.user.id.trim();
  if (!customerUserId) throw customerOrderDetailInvariant();

  const { id } = await params;
  const locale = await getAuthenticationLocale();
  const submitEnabled = resolveCustomerRefundIntakeSubmitEnabled();
  const cancellationEnabled = resolveCustomerOrderCancellationEnabled();
  const detail = await loadCustomerOrderDetail(id, customerUserId, submitEnabled, cancellationEnabled);
  if (!detail) notFound();

  return <CustomerOrderDetailView order={detail.order} intake={detail.intake} locale={locale} />;
}

export function CustomerOrderDetailView({
  order,
  intake,
  locale,
}: {
  order: OrderDetail;
  intake: CustomerRefundIntakeReadModel;
  locale: Locale;
}) {
  const messages = messagesFor(locale).order;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-900">
        {messages.back}
      </Link>

      <OrderHeader order={order} locale={locale} messages={messages} />
      {order.canCancelAutomatically ? (
        <OrderCancellationControl
          orderId={order.id}
          requestKey={randomUUID()}
          messages={selectOrderCancellationMessages(messages)}
        />
      ) : null}
      <CustomerRefundIntakeSection model={intake} locale={locale} />
      <OrderItems items={order.items} currency={order.currency} locale={locale} messages={messages} />
      <ShippingSection shipping={order.shipping} messages={messages} />
      <PaymentDetails order={order} locale={locale} messages={messages} />
      <FooterLinks messages={messages} />
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

export function resolveCustomerOrderCancellationEnabled(): boolean {
  try {
    return isCustomerMtoOrderCancellationEnabled();
  } catch (error) {
    if (error instanceof OrderCancellationActivationConfigError) return false;
    throw error;
  }
}

function OrderHeader({ order, locale, messages }: { order: OrderDetail; locale: Locale; messages: OrderMessages }) {
  return (
    <header className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{messages.title}</h1>
          <p className="mt-1 text-xs font-mono text-gray-400">{messages.orderNumber}: {order.id}</p>
        </div>
        <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
          {order.cancellation ? messages.orderStatusCancelled : orderStatusLabel(order.status, messages)}
        </span>
      </div>
      <p className="text-sm text-gray-500">{messages.paidAt} {formatDateTime(order.paidAt, locale)}</p>
      {order.status === OrderStatus.REFUND_PENDING ? (
        <div className="space-y-1 text-sm text-gray-600">
          <p>{messages.refundPendingReceived}</p>
          <p>{messages.refundPendingUnconfirmed}</p>
        </div>
      ) : null}
      {order.cancellation ? (
        <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{messages.cancellationAccepted}: {formatDateTime(order.cancellation.acceptedAt, locale)}</p>
          {order.cancellation.expectedRefundAmount === null ? null : (
            <p>{messages.cancellationExpectedRefund}: {formatOrderMoney(order.cancellation.expectedRefundAmount, order.currency, locale, messages)}</p>
          )}
          <p>{order.cancellation.obligationState === "INCONSISTENT"
            ? messages.cancellationRefundChecking
            : order.cancellation.obligationState === "SATISFIED"
              ? messages.cancellationRefundComplete
              : messages.cancellationRefundProcessing}</p>
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

function OrderItems({ items, currency, locale, messages }: { items: OrderLine[]; currency: string; locale: Locale; messages: OrderMessages }) {
  return (
    <Section title={messages.items}>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} className="py-4 first:pt-0 last:pb-0">
            <OrderItemRow item={item} currency={currency} locale={locale} messages={messages} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ShippingSection({ shipping, messages }: { shipping: OrderDetail["shipping"]; messages: OrderMessages }) {
  return (
    <Section title={messages.shippingInfo}>
      {shipping ? <ShippingBlock shipping={shipping} messages={messages} /> : <p className="text-sm text-gray-500">{messages.shippingPending}</p>}
    </Section>
  );
}

function PaymentDetails({ order, locale, messages }: { order: OrderDetail; locale: Locale; messages: OrderMessages }) {
  return (
    <Section title={messages.paymentDetails}>
      <div className="space-y-3">
        <SummaryRow label={messages.subtotal} value={formatOrderMoney(order.subtotalAmount, order.currency, locale, messages)} />
        {order.discountAmount > 0 ? (
          <SummaryRow
            label={messages.couponDiscount}
            value={`−${formatOrderMoney(order.discountAmount, order.currency, locale, messages)}`}
          />
        ) : null}
        <SummaryRow label={messages.shipping} value={`${formatOrderMoney(order.shippingAmount, order.currency, locale, messages)} · ${messages.shippingPolicyPending}`} />
        <SummaryRow label={messages.taxDuty} value={messages.taxPending} />
        <SummaryRow label={messages.totalPaid} value={formatOrderMoney(order.totalAmount, order.currency, locale, messages)} strong />
        <SummaryRow label={messages.paymentStatus} value={paymentStatusLabel(order.payment.status, messages)} />
        <SummaryRow label={messages.paymentAmount} value={formatOrderMoney(order.payment.amount, order.payment.currency, locale, messages)} />
        <SummaryRow label={messages.paymentMethod} value={paymentMethodLabel(order.payment, messages)} />
      </div>
      <RefundSummary order={order} locale={locale} messages={messages} />
    </Section>
  );
}

function FooterLinks({ messages }: { messages: OrderMessages }) {
  return (
    <nav aria-label={messages.postOrderNav} className="flex flex-wrap gap-3">
      <Link
        href="/orders"
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {messages.orderList}
      </Link>
      <Link href="/styles" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
        {messages.browseStyles}
      </Link>
    </nav>
  );
}

function OrderItemRow({ item, currency, locale, messages }: { item: OrderLine; currency: string; locale: Locale; messages: OrderMessages }) {
  const snapshot = safeParseSnapshotData(item.snapshotData);
  const lineTotal = item.unitAmount * item.quantity;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{itemName(snapshot, messages)}</p>
          <p className="mt-1 text-xs text-gray-500">{itemOptionLabel(snapshot, locale, messages)}</p>
          <p className="mt-1 text-xs text-gray-500">{fulfillmentLabel(item.fulfillmentType, messages)}</p>
        </div>
        <p className="shrink-0 font-semibold text-gray-900">{formatOrderMoney(lineTotal, currency, locale, messages)}</p>
      </div>
      <p className="text-xs text-gray-500">
        {formatOrderMoney(item.unitAmount, currency, locale, messages)} × {item.quantity}
      </p>
    </div>
  );
}

function ShippingBlock({ shipping, messages }: { shipping: OrderShipping; messages: OrderMessages }) {
  return (
    <div className="space-y-2 text-sm text-gray-600">
      <p className="font-medium text-gray-900">{shipping.recipientName}</p>
      <p>{shipping.phone}</p>
      <p>
        [{shipping.postalCode}] {countryLabel(shipping.country, messages)} {shipping.administrativeArea} {shipping.city}{" "}
        {shipping.addressLine1}
        {shipping.addressLine2 ? ` ${shipping.addressLine2}` : ""}
      </p>
      {shipping.memo ? <p className="text-xs text-gray-500">{messages.shippingMemo}: {shipping.memo}</p> : null}
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

function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_INTL[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function paymentStatusLabel(status: PaymentAttemptStatus, messages: OrderMessages): string {
  if (status === PaymentAttemptStatus.SUCCEEDED) return messages.paymentSucceeded;
  if (status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING) return messages.paymentChecking;
  if (status === PaymentAttemptStatus.FAILED) return messages.paymentFailed;
  if (status === PaymentAttemptStatus.VOIDED) return messages.paymentVoided;
  return messages.paymentUnknown;
}

function paymentMethodLabel(payment: PaymentSummary, messages: OrderMessages): string {
  if (payment.provider === PaymentProvider.TOSS) return messages.tossMethod;
  if (payment.provider === PaymentProvider.EXIMBAY) return messages.eximbayMethod;
  if (payment.provider === PaymentProvider.MOCK) return messages.mockMethod;
  return messages.otherMethod;
}

function orderStatusLabel(status: OrderStatus, messages: OrderMessages): string {
  if (status === OrderStatus.PAID) return messages.orderStatusPaid;
  if (status === OrderStatus.CANCELLED) return messages.orderStatusCancelled;
  if (status === OrderStatus.REFUND_PENDING) return messages.orderStatusRefundPending;
  if (status === OrderStatus.PARTIALLY_REFUNDED) return messages.orderStatusPartiallyRefunded;
  if (status === OrderStatus.REFUNDED) return messages.orderStatusRefunded;
  return messages.orderStatusUnknown;
}

function optionLabel(snapshot: SnapshotData, locale: Locale, messages: OrderMessages): string {
  const parts = [
    displayText(snapshot.color, ""),
    localizedLengthLabel(displayText(snapshot.length, ""), locale),
    localizedCurlLabel(displayText(snapshot.curl, ""), locale),
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" / ") : messages.optionFallback;
}

function safeParseSnapshotData(raw: unknown): SnapshotData | null {
  try {
    return parseSnapshotData(raw);
  } catch {
    return null;
  }
}

function itemName(snapshot: SnapshotData | null, messages: OrderMessages): string {
  return snapshot ? displayText(snapshot.styleName, messages.productFallback) : messages.productFallback;
}

function itemOptionLabel(snapshot: SnapshotData | null, locale: Locale, messages: OrderMessages): string {
  return snapshot ? optionLabel(snapshot, locale, messages) : messages.optionFallback;
}

function fulfillmentLabel(type: FulfillmentType, messages: OrderMessages): string {
  if (type === FulfillmentType.MTO) return messages.mto;
  if (type === FulfillmentType.STOCKED) return messages.stocked;
  return messages.fulfillmentUnknown;
}

function countryLabel(country: ShippingCountry, messages: OrderMessages): string {
  if (country === ShippingCountry.KR) return messages.countryKR;
  if (country === ShippingCountry.US) return messages.countryUS;
  if (country === ShippingCountry.JP) return messages.countryJP;
  return country;
}

function formatOrderMoney(amount: number, currency: string, locale: Locale, messages: OrderMessages): string {
  if (isCurrencyCode(currency)) return formatPrice(amount, CURRENCY_META[currency], locale);
  const currencyLabel = currency.trim() || messages.currencyMissing;
  return `${currencyLabel} · ${messages.storedMinorUnit} ${String(amount)} · ${messages.decimalUnavailable}`;
}

function RefundSummary({ order, locale, messages }: { order: OrderDetail; locale: Locale; messages: OrderMessages }) {
  const summary = order.refundSummary;
  if (!displayRefundSummary(summary)) return null;
  const status = refundStatusLabel(summary.completion, messages);
  return (
    <div className="mt-5 space-y-2 border-t border-gray-200 pt-5 text-sm text-gray-600">
      <h3 className="font-semibold text-gray-900">{messages.refundDetails}</h3>
      <p>{status}</p>
      {summary.totalSucceededRefundAmount && summary.totalSucceededRefundAmount > 0 ? (
        <SummaryRow
          label={messages.completedRefundAmount}
          value={formatOrderMoney(summary.totalSucceededRefundAmount, order.payment.currency, locale, messages)}
        />
      ) : null}
      {summary.latestSucceededRefundAt ? (
        <SummaryRow label={messages.latestRefundDate} value={formatDateTime(summary.latestSucceededRefundAt, locale)} />
      ) : null}
      {summary.hasPendingRefund && summary.completion !== "NONE" ? <p>{messages.refundPending}</p> : null}
    </div>
  );
}

function displayRefundSummary(summary: OrderDetail["refundSummary"]): boolean {
  if (summary.invariantFailure) return false;
  return summary.hasPendingRefund || summary.completion !== "NONE";
}

function refundStatusLabel(
  completion: Exclude<OrderDetail["refundSummary"], { invariantFailure: true }>["completion"],
  messages: OrderMessages,
): string {
  if (completion === "FULL") return messages.fullRefund;
  if (completion === "PARTIAL") return messages.partialRefund;
  return messages.refundPending;
}

function displayText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
