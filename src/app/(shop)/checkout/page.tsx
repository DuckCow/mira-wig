import { ShippingCountry } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckoutForm } from "./CheckoutForm";
import { CheckoutSessionResume, CheckoutSessionUnavailable } from "./CheckoutSessionResume";
import type { CheckoutCartItem } from "./checkout-summary";
import { checkoutPageMode, checkoutSessionResumeHref } from "./checkout-url";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getStorefrontContext } from "@/lib/market";
import { getActiveMarketCommercialFacts } from "@/lib/market/active-market";
import { MARKET_CONFIGS, formatPrice } from "@/lib/market/types";
import { configuredPaymentMode } from "@/lib/payment/mode";
import { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";
import { isEximbayCheckoutSandboxAvailable } from "@/lib/payment/eximbay/checkout-activation";
import { localizedVariantOptionLabel } from "@/lib/market/catalog-presentation";
import type { CartItemView } from "@/lib/cart";
import type { MarketCode } from "@/lib/market/types";
import { loginHref, withStorefrontHandoff } from "@/lib/market/request-context";
import { messagesFor } from "@/lib/market/messages";
import { readCheckoutSessionResume } from "@/lib/payment/session";

interface CheckoutPageProps {
  searchParams?: Promise<{ checkoutSessionId?: string | string[] }>;
}

type StorefrontContext = Awaited<ReturnType<typeof getStorefrontContext>>;

function pricedItems(items: CartItemView[]): CartItemView[] {
  return items.filter((item) => item.price !== null && item.unavailableCode === null);
}

function productSubtotal(items: CartItemView[]): number {
  return items.reduce((sum, item) => {
    if (item.price === null) return sum;
    return sum + item.price * item.quantity;
  }, 0);
}

function checkoutItems(items: CartItemView[], locale: Parameters<typeof localizedVariantOptionLabel>[3]): CheckoutCartItem[] {
  return items.map((item) => {
    if (item.price === null) throw new Error("Checkout received an unpriced cart line.");
    return {
      id: item.id,
      styleName: item.styleName,
      optionLabel: localizedVariantOptionLabel(item.color, item.length, item.curl, locale),
      quantity: item.quantity,
      unitAmount: item.price,
      lineSubtotal: item.price * item.quantity,
    };
  });
}

export function checkoutCountry(
  marketCode: MarketCode,
  shippableCountries: readonly string[],
): ShippingCountry {
  if (shippableCountries.length !== 1) {
    throw new Error(`Checkout requires exactly one shipping country for ${marketCode}.`);
  }
  const [country] = shippableCountries;
  if (country === ShippingCountry.KR) return ShippingCountry.KR;
  if (country === ShippingCountry.US) return ShippingCountry.US;
  if (country === ShippingCountry.JP) return ShippingCountry.JP;
  throw new Error(`Unsupported checkout shipping country for ${marketCode}.`);
}

function mockPaymentEnabled(): boolean {
  try {
    return configuredPaymentMode() === PaymentMode.SANDBOX && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

function eximbayCardEnabled(marketCode: MarketCode, currency: string): boolean {
  try {
    return isEximbayCheckoutSandboxAvailable({
      mode: configuredPaymentMode(),
      market: marketCode,
      method: PaymentMethod.CARD,
      currency,
    });
  } catch {
    return false;
  }
}

export default async function CheckoutPage(props: CheckoutPageProps = {}) {
  const queryPromise: Promise<{ checkoutSessionId?: string | string[] }> = props.searchParams ?? Promise.resolve({});
  const [session, context, query] = await Promise.all([
    getSession(),
    getStorefrontContext(),
    queryPromise,
  ]);
  const mode = checkoutPageMode(query.checkoutSessionId);
  const presentationVariant = { marketCode: context.marketCode, locale: context.locale };
  const loginTarget = mode.kind === "RESUME"
    ? checkoutSessionResumeHref(mode.checkoutSessionId, presentationVariant)
    : context.requestTarget;
  if (!session) redirect(loginHref(loginTarget, presentationVariant));

  if (mode.kind === "INVALID_RESUME") return unavailableResume(context);
  if (mode.kind === "RESUME") {
    return resumeCheckout(context, session.user.id, mode.checkoutSessionId);
  }
  return createCheckout(context, session.user.id);
}

async function resumeCheckout(context: StorefrontContext, userId: string, checkoutSessionId: string) {
  const resumed = await readCheckoutSessionResume(db, {
    checkoutSessionId,
    authenticatedUserId: userId,
  });
  if (!resumed) return unavailableResume(context);
  const variant = { marketCode: resumed.marketCode, locale: context.locale };
  const messages = messagesFor(context.locale).checkout;
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <nav aria-label={messages.back} className="mb-6">
        <Link href={withStorefrontHandoff("/cart", variant)} className="text-sm text-gray-500 hover:text-gray-900">
          ← {messages.back}
        </Link>
      </nav>
      <CheckoutSessionResume
        session={resumed}
        locale={context.locale}
        mockPaymentEnabled={mockPaymentEnabled()}
        eximbayCardEnabled={resumed.disposition === "PAYMENT_ELIGIBLE"
          && eximbayCardEnabled(resumed.marketCode, resumed.currency)}
      />
    </main>
  );
}

function unavailableResume(context: StorefrontContext) {
  const variant = { marketCode: context.marketCode, locale: context.locale };
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <CheckoutSessionUnavailable
        locale={context.locale}
        freshCheckoutHref={withStorefrontHandoff("/checkout", variant)}
      />
    </main>
  );
}

async function createCheckout(context: StorefrontContext, userId: string) {
  const presentationVariant = { marketCode: context.marketCode, locale: context.locale };
  if (!context.confirmedMarketCode) redirect(withStorefrontHandoff("/cart", presentationVariant));
  const marketCode = context.confirmedMarketCode;
  const variant = { marketCode, locale: context.locale };
  const [items, market] = await Promise.all([
    getCart(userId, marketCode),
    getActiveMarketCommercialFacts(marketCode),
  ]);
  if (items.length === 0) redirect(withStorefrontHandoff("/cart", variant));
  if (pricedItems(items).length !== items.length) redirect(withStorefrontHandoff("/cart", variant));

  const presentation = MARKET_CONFIGS[marketCode];
  const messages = messagesFor(context.locale).checkout;
  const subtotal = productSubtotal(items);
  const cartLines = checkoutItems(items, context.locale);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <nav aria-label={messages.back} className="mb-6">
        <Link href={withStorefrontHandoff("/cart", variant)} className="text-sm text-gray-500 hover:text-gray-900">
          ← {messages.back}
        </Link>
      </nav>

      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">{messages.title}</h1>
        <p className="text-sm text-gray-500">
          {messages.introBeforeAmount} {formatPrice(subtotal, market.currency, context.locale)} {messages.introAfterAmount}
        </p>
      </header>

      <CheckoutForm
        key={marketCode}
        marketCode={marketCode}
        marketLabel={presentation.label}
        currency={market.currency}
        shippingCountry={checkoutCountry(marketCode, market.shippableCountries)}
        cartItems={cartLines}
        productSubtotal={subtotal}
        locale={context.locale}
      />
    </main>
  );
}
