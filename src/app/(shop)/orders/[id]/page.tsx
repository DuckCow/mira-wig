import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";

type PageParams = Promise<{ id: string }>;

export default async function OrderPage({ params }: { params: PageParams }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-900">
        ← 내 주문
      </Link>
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">주문 내역 준비 중</h1>
        <p className="mt-2 text-xs font-mono text-gray-400">주문번호: {id}</p>
        <p className="mt-3 text-sm text-gray-500">
          결제 코어 컷오버 이후 새 주문 상세 화면이 연결됩니다.
        </p>
      </section>
    </main>
  );
}
