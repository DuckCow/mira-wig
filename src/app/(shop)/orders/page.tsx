import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata = { title: "내 주문 — Mira" };

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/orders");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">내 주문</h1>
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-lg font-semibold text-gray-900">주문 내역 준비 중</p>
        <p className="mt-2 text-sm text-gray-500">
          결제 코어 컷오버 이후 새 주문 내역 화면이 연결됩니다.
        </p>
        <Link href="/styles" className="mt-5 inline-flex text-sm font-medium text-gray-900 underline">
          스타일 둘러보기
        </Link>
      </section>
    </main>
  );
}
