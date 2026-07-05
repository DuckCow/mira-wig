import Link from "next/link";

export default function CheckoutPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <nav aria-label="뒤로가기" className="mb-6">
        <Link href="/cart" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1">
          ← 장바구니
        </Link>
      </nav>
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">결제 준비 중</h1>
        <p className="mt-3 text-sm text-gray-500">
          결제 코어 컷오버가 진행 중입니다. 장바구니는 그대로 유지됩니다.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/cart"
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700"
          >
            장바구니로 돌아가기
          </Link>
          <Link
            href="/styles"
            className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            스타일 둘러보기
          </Link>
        </div>
      </section>
    </main>
  );
}
