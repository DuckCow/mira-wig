import Link from "next/link";
import { Card } from "@/components/ui/Card";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-700">← 주문 목록</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{id}</span>
      </div>
      <Card title="주문 상세">
        <p className="text-sm text-gray-600">컷오버 — 신 코어 대기</p>
        <p className="mt-2 text-xs font-mono text-gray-400">주문번호: {id}</p>
      </Card>
      <Card title="환불 폼">
        <p className="text-sm text-gray-600">컷오버 — 신 코어 대기</p>
      </Card>
    </div>
  );
}
