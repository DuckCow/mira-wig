import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getCurrentMarketCode } from "@/lib/market";
import { MARKET_CONFIGS, formatPrice } from "@/lib/market/types";
import { catalogStorage } from "@/lib/storage";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { RemoveButton, QuantityControl } from "./CartItemActions";
import type { CartItemView } from "@/lib/cart";
import type { MarketCode } from "@/lib/market/types";

// ── 서브컴포넌트 ─────────────────────────────────────────────

function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
      <p className="text-lg font-medium">장바구니가 비어있습니다</p>
      <Link href="/styles" className="text-sm text-gray-900 underline hover:text-gray-600">
        스타일 둘러보기
      </Link>
    </div>
  );
}

function CartThumbnail({ imageUrl, styleName }: { imageUrl: string | null; styleName: string }) {
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
      <span className="text-xs text-gray-400">이미지</span>
    </div>
  );
}

function CartRow({
  item,
  imageUrl,
  marketCode,
}: {
  item: CartItemView;
  imageUrl: string | null;
  marketCode: MarketCode;
}) {
  const { currency } = MARKET_CONFIGS[marketCode];
  const optionLabel = `${item.color} / ${getLengthLabel(item.length)} / ${getCurlLabel(item.curl)}`;
  const lineTotal = item.price === null ? null : item.price * item.quantity;
  const unitPrice = item.price === null ? null : formatPrice(item.price, currency);
  return (
    <li className="flex items-start gap-4 py-4 border-b border-gray-100">
      <CartThumbnail imageUrl={imageUrl} styleName={item.styleName} />
      <div className="flex-1 min-w-0 space-y-1">
        <Link
          href={`/styles/${item.styleId}`}
          className="text-sm font-medium text-gray-900 hover:underline truncate block"
        >
          {item.styleName}
        </Link>
        <p className="text-xs text-gray-500">{optionLabel}</p>
        <p className="text-sm font-semibold text-gray-900">
          {unitPrice ?? "이 마켓에서 가격 미제공"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <QuantityControl cartItemId={item.id} current={item.quantity} max={item.stock} />
        {lineTotal === null ? (
          <p className="text-sm font-semibold text-gray-900">가격 확인 필요</p>
        ) : (
          <p className="text-sm text-gray-600">
            {unitPrice} × {item.quantity} ={" "}
            <span className="font-semibold text-gray-900">{formatPrice(lineTotal, currency)}</span>
          </p>
        )}
        <RemoveButton cartItemId={item.id} />
      </div>
    </li>
  );
}

function CartSummary({
  subtotal,
  hasUnavailablePrice,
  marketCode,
}: {
  subtotal: number;
  hasUnavailablePrice: boolean;
  marketCode: MarketCode;
}) {
  const { currency } = MARKET_CONFIGS[marketCode];
  return (
    <div className="space-y-2 pt-4 border-t border-gray-200">
      <div className="flex justify-between text-base font-semibold text-gray-900">
        <span>상품 합계</span>
        <span>{hasUnavailablePrice ? "가격 확인 필요" : formatPrice(subtotal, currency)}</span>
      </div>
      <p className="text-xs text-gray-500">
        배송비·세금 제외 — 배송지에 따라 결제 단계에서 확정됩니다.
      </p>
      <p className="text-xs text-gray-500">배송비는 체크아웃에서 확인됩니다.</p>
      <p className="text-xs text-gray-500">
        배송지와 선택한 국가/통화에 따라 결제 단계에서 가격과 배송비가 변경될 수 있습니다.
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
  const session = await getSession();
  if (!session) redirect("/login");

  const marketCode = await getCurrentMarketCode();
  const items = await getCart(session.user.id, marketCode);
  const imageUrls = await resolveImageUrls(items);
  const hasUnavailablePrice = items.some((item) => item.price === null);
  const productSubtotal = items.reduce((sum, item) => {
    if (item.price === null) return sum;
    return sum + item.price * item.quantity;
  }, 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">장바구니</h1>

      {items.length === 0 ? (
        <EmptyCart />
      ) : (
        <>
          <ul aria-label="장바구니 상품 목록">
            {items.map((item, i) => (
              <CartRow key={item.id} item={item} imageUrl={imageUrls[i] ?? null} marketCode={marketCode} />
            ))}
          </ul>

          <div className="mt-6 space-y-4">
            <CartSummary
              subtotal={productSubtotal}
              hasUnavailablePrice={hasUnavailablePrice}
              marketCode={marketCode}
            />
            {hasUnavailablePrice ? (
              <>
                <div className="text-sm text-red-600">
                  현재 마켓 가격이 없는 상품이 있어 주문할 수 없습니다.
                </div>
                <button
                  type="button"
                  disabled
                  className="block w-full py-3 bg-gray-200 text-gray-500 font-medium rounded-xl text-center cursor-not-allowed"
                >
                  주문 불가
                </button>
              </>
            ) : (
              <Link
                href="/checkout"
                className="block w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors text-center"
              >
                주문하기
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  );
}
