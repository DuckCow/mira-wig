import { currencyMetaForCode, formatPrice, type CurrencyMeta } from "@/lib/market/types";
import type { CheckoutSessionResumeLine, CheckoutSessionResumeResult } from "@/lib/payment/session/types";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";

export interface CheckoutCartItem {
  id: string;
  styleName: string;
  optionLabel: string;
  quantity: number;
  unitAmount: number;
  lineSubtotal: number;
}

export function CartSnapshot({
  cartItems,
  subtotal,
  currency,
  locale,
}: {
  cartItems: CheckoutCartItem[];
  subtotal: number;
  currency: CurrencyMeta;
  locale: Locale;
}) {
  const messages = messagesFor(locale).checkout;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{messages.items}</h2>
      <ul className="mt-4 divide-y divide-gray-100">
        {cartItems.map((item) => (
          <li key={item.id} className="py-3 text-sm">
            <CartItemRow item={item} currency={currency} locale={locale} />
          </li>
        ))}
      </ul>
      <SummaryRow label={messages.subtotal} value={formatPrice(subtotal, currency, locale)} strong />
      <p className="mt-2 text-xs text-gray-500">
        {messages.cartSnapshotNotice}
      </p>
    </section>
  );
}

export function FrozenSessionSnapshot({
  session,
  locale,
}: {
  session: CheckoutSessionResumeResult;
  locale: Locale;
}) {
  const sessionCurrency = currencyMetaForCode(session.currency);
  const messages = messagesFor(locale).checkout;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{messages.sessionSnapshot}</h2>
      <ul className="mt-4 divide-y divide-gray-100">
        {session.lines.map((line) => (
          <li key={line.id} className="py-3 text-sm">
            <FrozenSessionLineRow line={line} currency={sessionCurrency} locale={locale} />
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-3">
        <SummaryRow label={messages.subtotal} value={formatPrice(session.subtotalAmount, sessionCurrency, locale)} />
        <SummaryRow label={messages.shipping} value={shippingLabel(session, sessionCurrency, locale)} />
        <SummaryRow label={messages.taxDuty} value={messages.taxPending} />
        <SummaryRow label={messages.total} value={formatPrice(session.totalAmount, sessionCurrency, locale)} strong />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {messages.sessionNotice}
      </p>
    </section>
  );
}

function FrozenSessionLineRow({
  line,
  currency,
  locale,
}: {
  line: CheckoutSessionResumeLine;
  currency: CurrencyMeta;
  locale: Locale;
}) {
  const lineSubtotal = line.unitAmount * line.quantity;
  return (
    <>
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{line.snapshot.styleName}</p>
          <p className="mt-1 text-xs text-gray-500">
            {[line.snapshot.color, line.snapshot.length, line.snapshot.curl].filter(Boolean).join(" · ")}
          </p>
        </div>
        <p className="shrink-0 font-medium text-gray-900">{formatPrice(lineSubtotal, currency, locale)}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {formatPrice(line.unitAmount, currency, locale)} × {line.quantity}
      </p>
    </>
  );
}

function CartItemRow({ item, currency, locale }: { item: CheckoutCartItem; currency: CurrencyMeta; locale: Locale }) {
  return (
    <>
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{item.styleName}</p>
          <p className="mt-1 text-xs text-gray-500">{item.optionLabel}</p>
        </div>
        <p className="shrink-0 font-medium text-gray-900">{formatPrice(item.lineSubtotal, currency, locale)}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {formatPrice(item.unitAmount, currency, locale)} × {item.quantity}
      </p>
    </>
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

function shippingLabel(session: CheckoutSessionResumeResult, currency: CurrencyMeta, locale: Locale): string {
  return `${formatPrice(session.shippingAmount, currency, locale)} · ${messagesFor(locale).checkout.shippingPolicyPending}`;
}
