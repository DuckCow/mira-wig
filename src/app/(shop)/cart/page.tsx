import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { storage } from "@/lib/storage";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { RemoveButton, QuantityControl } from "./CartItemActions";
import type { CartItemView } from "@/lib/cart";

// ── 서브컴포넌트 ─────────────────────────────────────────────

function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
      <p className="text-lg font-medium">장바구니가 비어있습니다</p>
      <Link
        href="/styles"
        className="text-sm text-gray-900 underline hover:text-gray-600"
      >
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

function CartRow({ item, imageUrl }: { item: CartItemView; imageUrl: string | null }) {
  const optionLabel = `${item.color} / ${getLengthLabel(item.length)} / ${getCurlLabel(item.curl)}`;
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
          {item.price.toLocaleString("ko-KR")}원
        </p>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <QuantityControl cartItemId={item.id} current={item.quantity} max={item.stock} />
        <p className="text-sm font-semibold text-gray-900">
          {(item.price * item.quantity).toLocaleString("ko-KR")}원
        </p>
        <RemoveButton cartItemId={item.id} />
      </div>
    </li>
  );
}

// ── presigned URL 일괄 해결 ───────────────────────────────────

async function resolveImageUrls(items: CartItemView[]): Promise<(string | null)[]> {
  return Promise.all(
    items.map((item) =>
      item.coverImageKey
        ? storage.getViewUrl(item.coverImageKey).catch(() => null)
        : Promise.resolve(null),
    ),
  );
}

// ── 페이지 ────────────────────────────────────────────────────

export default async function CartPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = await getCart(session.user.id);
  const imageUrls = await resolveImageUrls(items);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">장바구니</h1>

      {items.length === 0 ? (
        <EmptyCart />
      ) : (
        <>
          <ul aria-label="장바구니 상품 목록">
            {items.map((item, i) => (
              <CartRow key={item.id} item={item} imageUrl={imageUrls[i] ?? null} />
            ))}
          </ul>

          <div className="mt-6 space-y-4">
            <div className="flex justify-between text-base font-semibold text-gray-900 pt-4 border-t border-gray-200">
              <span>합계</span>
              <span>{totalPrice.toLocaleString("ko-KR")}원</span>
            </div>
            <button
              type="button"
              disabled
              className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl opacity-40 cursor-not-allowed"
              title="다음 단계에서 구현 예정"
            >
              주문하기 (준비 중)
            </button>
          </div>
        </>
      )}
    </main>
  );
}
