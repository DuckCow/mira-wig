import Link from "next/link";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";
import { MARKET_CONFIGS } from "@/lib/market/types";
import { withStorefrontHandoff } from "@/lib/market/request-context";
import type { CheckoutSessionResumeResult } from "@/lib/payment/session/types";
import { FrozenSessionSnapshot } from "./checkout-summary";
import { PaymentMethodSection } from "./PaymentMethodSection";

interface CheckoutSessionResumeProps {
  session: CheckoutSessionResumeResult;
  locale: Locale;
  mockPaymentEnabled: boolean;
  eximbayCardEnabled: boolean;
}

export function CheckoutSessionResume({
  session,
  locale,
  mockPaymentEnabled,
  eximbayCardEnabled,
}: CheckoutSessionResumeProps) {
  const messages = messagesFor(locale).checkout;
  const variant = { marketCode: session.marketCode, locale };
  const freshCheckoutHref = withStorefrontHandoff("/checkout", variant);

  return (
    <>
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">{messages.resumeTitle}</h1>
        <p className="text-sm text-gray-500">
          {messages.frozenMarket}: {MARKET_CONFIGS[session.marketCode].label} / {session.marketCode} / {session.currency}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <FrozenShipping session={session} locale={locale} />
          <Link
            replace
            href={freshCheckoutHref}
            className="inline-flex rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {messages.changeShipping}
          </Link>
        </div>

        <aside className="space-y-4">
          <FrozenSessionSnapshot session={session} locale={locale} />
          {session.disposition === "PAYMENT_ELIGIBLE" ? (
            <PaymentMethodSection
              checkoutSessionId={session.sessionId}
              mockPaymentEnabled={mockPaymentEnabled}
              eximbayCardEnabled={eximbayCardEnabled}
              locale={locale}
              marketCode={session.marketCode}
            />
          ) : (
            <ResumeStatus session={session} locale={locale} />
          )}
        </aside>
      </div>
    </>
  );
}

export function CheckoutSessionUnavailable({ locale, freshCheckoutHref }: { locale: Locale; freshCheckoutHref: string }) {
  const messages = messagesFor(locale).checkout;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-xl font-semibold text-gray-900">{messages.resumeUnavailableTitle}</h1>
      <p className="mt-2 text-sm text-gray-600">{messages.resumeUnavailableDescription}</p>
      <Link replace href={freshCheckoutHref} className="mt-4 inline-flex text-sm font-medium underline underline-offset-2">
        {messages.changeShipping}
      </Link>
    </section>
  );
}

function FrozenShipping({ session, locale }: { session: CheckoutSessionResumeResult; locale: Locale }) {
  const messages = messagesFor(locale).checkout;
  const shipping = session.shipping;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{messages.frozenShipping}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <ShippingFact label={messages.recipientName} value={shipping.recipientName} />
        <ShippingFact label={messages.phone} value={shipping.phone} />
        <ShippingFact label={messages.shippingCountry} value={shipping.country} />
        <ShippingFact label={messages.postalCode} value={shipping.postalCode} />
        <ShippingFact label={messages.administrativeArea} value={shipping.administrativeArea} />
        <ShippingFact label={messages.city} value={shipping.city} />
        <ShippingFact label={messages.addressLine1} value={shipping.addressLine1} />
        {shipping.addressLine2 && <ShippingFact label={messages.addressLine2} value={shipping.addressLine2} />}
        {shipping.memo && <ShippingFact label={messages.memo} value={shipping.memo} />}
      </dl>
    </section>
  );
}

function ShippingFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function ResumeStatus({ session, locale }: { session: CheckoutSessionResumeResult; locale: Locale }) {
  const messages = messagesFor(locale).checkout;
  const variant = { marketCode: session.marketCode, locale };
  const returnHref = withStorefrontHandoff(
    `/checkout/return/${encodeURIComponent(session.sessionId)}`,
    variant,
  );
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5" data-resume-disposition={session.disposition}>
      <p className="text-sm text-amber-900">{resumeStatusMessage(session, locale)}</p>
      {(session.disposition === "PAYMENT_EXISTS" || session.disposition === "COMPLETED") && (
        <Link href={returnHref} className="mt-3 inline-flex text-sm font-medium underline underline-offset-2">
          {messages.viewPaymentStatus}
        </Link>
      )}
      {session.orderId && (
        <Link
          href={withStorefrontHandoff(`/orders/${encodeURIComponent(session.orderId)}`, variant)}
          className="mt-3 block text-sm font-medium underline underline-offset-2"
        >
          {messages.viewOrder}
        </Link>
      )}
    </section>
  );
}

function resumeStatusMessage(session: CheckoutSessionResumeResult, locale: Locale): string {
  const messages = messagesFor(locale).checkout;
  if (session.disposition === "EXPIRED") return messages.resumeExpired;
  if (session.disposition === "COMPLETED") return messages.resumeCompleted;
  if (session.disposition === "PAYMENT_EXISTS") return messages.resumePaymentExists;
  return messages.resumeTerminal;
}
