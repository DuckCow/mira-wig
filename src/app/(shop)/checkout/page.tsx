import { ShippingCountry } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckoutForm } from "./CheckoutForm";
import type { CheckoutCartItem } from "./checkout-summary";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getStorefrontContext } from "@/lib/market";
import { MARKET_CONFIGS, formatPrice } from "@/lib/market/types";
import { configuredPaymentMode } from "@/lib/payment/mode";
import { PaymentMode } from "@/lib/payment/providers/routing";
import { localizedVariantOptionLabel } from "@/lib/market/catalog-presentation";
import type { CartItemView } from "@/lib/cart";
import type { MarketCode } from "@/lib/market/types";
import { loginHref, withStorefrontHandoff } from "@/lib/market/request-context";
import { messagesFor } from "@/lib/market/messages";

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

function checkoutCountry(marketCode: MarketCode): ShippingCountry {
  const [country] = MARKET_CONFIGS[marketCode].shippableCountries;
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

export default async function CheckoutPage() {
  const [session, context] = await Promise.all([getSession(), getStorefrontContext()]);
  const presentationVariant = { marketCode: context.marketCode, locale: context.locale };
  if (!session) redirect(loginHref(context.requestTarget, presentationVariant));
  if (!context.confirmedMarketCode) redirect(withStorefrontHandoff("/cart", presentationVariant));
  const marketCode = context.confirmedMarketCode;
  const variant = { marketCode, locale: context.locale };
  const items = await getCart(session.user.id, marketCode);
  if (items.length === 0) redirect(withStorefrontHandoff("/cart", variant));
  if (pricedItems(items).length !== items.length) redirect(withStorefrontHandoff("/cart", variant));

  const market = MARKET_CONFIGS[marketCode];
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
        marketLabel={market.label}
        currency={market.currency}
        shippingCountry={checkoutCountry(marketCode)}
        cartItems={cartLines}
        productSubtotal={subtotal}
        mockPaymentEnabled={mockPaymentEnabled()}
        locale={context.locale}
      />
    </main>
  );
}
