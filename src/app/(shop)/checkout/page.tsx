import { ShippingCountry } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckoutForm } from "./CheckoutForm";
import type { CheckoutCartItem } from "./checkout-summary";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getCurrentMarketCode } from "@/lib/market";
import { MARKET_CONFIGS, formatPrice } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import type { CartItemView } from "@/lib/cart";
import type { MarketCode } from "@/lib/market/types";

function pricedItems(items: CartItemView[]): CartItemView[] {
  return items.filter((item) => item.price !== null);
}

function productSubtotal(items: CartItemView[]): number {
  return items.reduce((sum, item) => {
    if (item.price === null) return sum;
    return sum + item.price * item.quantity;
  }, 0);
}

function checkoutItems(items: CartItemView[]): CheckoutCartItem[] {
  return items.map((item) => {
    if (item.price === null) throw new Error("Checkout received an unpriced cart line.");
    return {
      id: item.id,
      styleName: item.styleName,
      optionLabel: `${item.color} / ${getLengthLabel(item.length)} / ${getCurlLabel(item.curl)}`,
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

export default async function CheckoutPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const marketCode = await getCurrentMarketCode();
  const items = await getCart(session.user.id, marketCode);
  if (items.length === 0) redirect("/cart");
  if (pricedItems(items).length !== items.length) redirect("/cart");

  const market = MARKET_CONFIGS[marketCode];
  const subtotal = productSubtotal(items);
  const cartLines = checkoutItems(items);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <nav aria-label="뒤로가기" className="mb-6">
        <Link href="/cart" className="text-sm text-gray-500 hover:text-gray-900">
          ← 장바구니
        </Link>
      </nav>

      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">주문서 작성</h1>
        <p className="text-sm text-gray-500">
          상품 합계 {formatPrice(subtotal, market.currency)} 기준으로 배송지를 입력합니다.
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
      />
    </main>
  );
}
