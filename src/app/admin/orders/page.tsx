import { Card } from "@/components/ui/Card";

export const metadata = { title: "주문 관리" };

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">주문 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          컷오버 — 신 코어 대기
        </p>
      </div>
      <Card title="주문 화면">
        <p className="text-sm text-gray-600">
          레거시 주문 read model을 제거했습니다. 새 결제 코어 연결 후 목록·상세·환불 화면을 다시 연결합니다.
        </p>
      </Card>
    </div>
  );
}
