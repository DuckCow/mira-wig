import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getStorefrontContext } from "@/lib/market";
import { getActiveMarketCommercialFacts } from "@/lib/market/active-market";
import { formatPrice, type CurrencyMeta } from "@/lib/market/types";
import { catalogStorage } from "@/lib/storage";
import { localizedVariantOptionLabel } from "@/lib/market/catalog-presentation";
import { RemoveButton, QuantityControl } from "./CartItemActions";
import type { CartItemView } from "@/lib/cart";
import type { MarketCode } from "@/lib/market/types";
import type { Locale } from "@/lib/market/locale";
import { MarketConfirmation } from "@/components/features/MarketConfirmation";
import { loginHref, withStorefrontHandoff } from "@/lib/market/request-context";
import { siteVariantPath } from "@/lib/market/site-variant";
import { messagesFor, type StorefrontMessages } from "@/lib/market/messages";

// ── 서브컴포넌트 ─────────────────────────────────────────────

function EmptyCart({ marketCode, locale }: { marketCode: MarketCode; locale: Locale }) {
  const messages = messagesFor(locale).cart;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
      <p className="text-lg font-medium">{messages.empty}</p>
      <Link href={siteVariantPath({ marketCode, locale }, "/styles")} className="text-sm text-gray-900 underline hover:text-gray-600">
        {messages.browse}
      </Link>
    </div>
  );
}

function CartThumbnail({ imageUrl, styleName, messages }: { imageUrl: string | null; styleName: string; messages: StorefrontMessages["cart"] }) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={styleName}
        width={80}
        height={80}
        className="w-20 h-20 object-cover rounded-lg shrink-0"
      />
    );
  }
  return (
    <div className="w-20 h-20 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center">
      <span className="text-xs text-gray-400">{messages.image}</span>
    </div>
  );
}

function CartRow({
  item,
  imageUrl,
  displayedMarketCode,
  presentationMarketCode,
  currency,
  priceAuthority,
  locale,
}: {
  item: CartItemView;
  imageUrl: string | null;
  displayedMarketCode: MarketCode;
  presentationMarketCode: MarketCode;
  currency: CurrencyMeta;
  priceAuthority: "CURRENT" | "TARGET_PROJECTION";
  locale: Locale;
}) {
  const messages = messagesFor(locale).cart;
  const optionLabel = localizedVariantOptionLabel(item.color, item.length, item.curl, locale);
  const lineTotal = item.price === null ? null : item.price * item.quantity;
  const unitPrice = item.price === null ? null : formatPrice(item.price, currency, locale);
  return (
    <li className="flex items-start gap-4 py-4 border-b border-gray-100">
      <CartThumbnail imageUrl={imageUrl} styleName={item.styleName} messages={messages} />
      <div className="flex-1 min-w-0 space-y-1">
        <Link
          href={siteVariantPath({ marketCode: presentationMarketCode, locale }, `/styles/${encodeURIComponent(item.styleId)}`)}
          className="text-sm font-medium text-gray-900 hover:underline truncate block"
        >
          {item.styleName}
        </Link>
        <p className="text-xs text-gray-500">{optionLabel}</p>
        <p className="text-sm font-semibold text-gray-900">
          {priceAuthority === "TARGET_PROJECTION" ? `${messages.targetProjectionUnitPrice}: ` : null}
          {unitPrice ?? messages.unavailablePrice}
        </p>
        {item.unavailableMessage ? (
          <p className="text-xs font-medium text-red-600" role="status">
            {item.unavailableCode ? messages.integrityErrors[item.unavailableCode] : null}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <QuantityControl
          cartItemId={item.id}
          current={item.quantity}
          max={item.stock}
          marketCode={displayedMarketCode}
          locale={locale}
          disabled={item.unavailableCode !== null}
        />
        {lineTotal === null ? (
          <p className="text-sm font-semibold text-gray-900">{messages.priceReview}</p>
        ) : (
          <p className="text-sm text-gray-600">
            {priceAuthority === "TARGET_PROJECTION" ? `${messages.targetProjectionLineSubtotal}: ` : null}
            {unitPrice} × {item.quantity} ={" "}
            <span className="font-semibold text-gray-900">{formatPrice(lineTotal, currency, locale)}</span>
          </p>
        )}
        <RemoveButton cartItemId={item.id} locale={locale} />
      </div>
    </li>
  );
}

function CartSummary({
  subtotal,
  hasUnavailableItem,
  currency,
  priceAuthority,
  locale,
}: {
  subtotal: number;
  hasUnavailableItem: boolean;
  currency: CurrencyMeta;
  priceAuthority: "CURRENT" | "TARGET_PROJECTION";
  locale: Locale;
}) {
  const messages = messagesFor(locale).cart;
  return (
    <div className="space-y-2 pt-4 border-t border-gray-200">
      <div className="flex justify-between text-base font-semibold text-gray-900">
        <span>{priceAuthority === "TARGET_PROJECTION" ? messages.targetProjectionSubtotal : messages.subtotal}</span>
        <span>{hasUnavailableItem ? messages.itemReview : formatPrice(subtotal, currency, locale)}</span>
      </div>
      <p className="text-xs text-gray-500">
        {priceAuthority === "TARGET_PROJECTION" ? messages.targetProjectionNotice : messages.shippingPending}
      </p>
    </div>
  );
}

async function resolveImageUrls(items: CartItemView[]): Promise<(string | null)[]> {
  return Promise.all(
    items.map((item) =>
      item.coverImageKey
        ? catalogStorage.getViewUrl(item.coverImageKey).catch(() => null)
        : Promise.resolve(null),
    ),
  );
}

// ── 페이지 ────────────────────────────────────────────────────

export default async function CartPage() {
  const [session, context] = await Promise.all([getSession(), getStorefrontContext()]);
  const presentationVariant = { marketCode: context.marketCode, locale: context.locale };
  if (!session) redirect(loginHref(context.requestTarget, presentationVariant));
  const currentMarketCode = context.confirmedMarketCode;
  const targetMarketCode = context.marketCode;
  const displayedMarketCode = currentMarketCode ?? targetMarketCode;
  const priceAuthority = currentMarketCode === null ? "TARGET_PROJECTION" : "CURRENT";
  const commerceVariant = { marketCode: displayedMarketCode, locale: context.locale };
  const messages = messagesFor(context.locale).cart;
  const [items, displayedMarket] = await Promise.all([
    getCart(session.user.id, displayedMarketCode),
    getActiveMarketCommercialFacts(displayedMarketCode),
  ]);
  const imageUrls = await resolveImageUrls(items);
  const hasUnavailableItem = items.some((item) => item.unavailableCode !== null);
  const productSubtotal = items.reduce((sum, item) => {
    if (item.price === null) return sum;
    return sum + item.price * item.quantity;
  }, 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{messages.title}</h1>
      <div className="mb-6">
        <MarketConfirmation
          currentMarketCode={currentMarketCode}
          targetMarketCode={targetMarketCode}
          locale={context.locale}
        />
      </div>

      {items.length === 0 ? (
        <EmptyCart marketCode={targetMarketCode} locale={context.locale} />
      ) : (
        <>
          <ul aria-label={messages.itemsLabel}>
            {items.map((item, i) => (
              <CartRow
                key={item.id}
                item={item}
                imageUrl={imageUrls[i] ?? null}
                displayedMarketCode={displayedMarketCode}
                presentationMarketCode={targetMarketCode}
                currency={displayedMarket.currency}
                priceAuthority={priceAuthority}
                locale={context.locale}
              />
            ))}
          </ul>

          <div className="mt-6 space-y-4">
            <CartSummary
              subtotal={productSubtotal}
              hasUnavailableItem={hasUnavailableItem}
              currency={displayedMarket.currency}
              priceAuthority={priceAuthority}
              locale={context.locale}
            />
            {hasUnavailableItem ? (
              <>
                <div className="text-sm text-red-600">
                  {messages.unavailableNotice}
                </div>
                <button
                  type="button"
                  disabled
                  className="block w-full py-3 bg-gray-200 text-gray-500 font-medium rounded-xl text-center cursor-not-allowed"
                >
                  {messages.unavailableCheckout}
                </button>
              </>
            ) : context.confirmedMarketCode ? (
              <Link
                href={withStorefrontHandoff("/checkout", commerceVariant)}
                className="block w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors text-center"
              >
                {messages.checkout}
              </Link>
            ) : (
              <button type="button" disabled className="block w-full cursor-not-allowed rounded-xl bg-gray-200 py-3 text-center font-medium text-gray-500">
                {messages.checkoutConfirmationRequired}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
