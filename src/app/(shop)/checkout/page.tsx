import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getCurrentMarketCode } from "@/lib/market";
import { getCartForCheckout } from "@/lib/order";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?callbackUrl=/checkout");
  }

  const [marketCode, items] = await Promise.all([
    getCurrentMarketCode(),
    getCartForCheckout(session.user.id, await getCurrentMarketCode()),
  ]);

  if (items.length === 0) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center gap-4">
        <p className="text-gray-500">장바구니가 비어있습니다.</p>
        <Link href="/styles" className="text-sm text-gray-900 underline">
          스타일 둘러보기
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <nav aria-label="뒤로가기" className="mb-6">
        <Link href="/cart" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1">
          ← 장바구니
        </Link>
      </nav>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">주문하기</h1>
      <CheckoutForm items={items} marketCode={marketCode} />
    </main>
  );
}
