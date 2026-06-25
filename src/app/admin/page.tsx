import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">어드민</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="space-y-2">
            <h2 className="text-base font-medium text-gray-900">스타일 관리</h2>
            <p className="text-sm text-gray-500">가발 스타일·바리언트 등록 및 수정</p>
            <Link
              href="/admin/styles"
              className="inline-block mt-2 text-sm text-blue-600 hover:underline"
            >
              스타일 목록 →
            </Link>
          </div>
        </Card>
        <Card>
          <div className="space-y-2">
            <h2 className="text-base font-medium text-gray-900">주문 관리</h2>
            <p className="text-sm text-gray-500">주문·제조 요청·결제 기록 조회</p>
            <Link
              href="/admin/orders"
              className="inline-block mt-2 text-sm text-blue-600 hover:underline"
            >
              주문 목록 →
            </Link>
          </div>
        </Card>
        <Card>
          <div className="space-y-2">
            <h2 className="text-base font-medium text-gray-900">마켓 가격 갭 진단</h2>
            <p className="text-sm text-gray-500">노출 중인 마켓에 가격 미설정 variant 확인</p>
            <Link
              href="/admin/gaps"
              className="inline-block mt-2 text-sm text-blue-600 hover:underline"
            >
              갭 진단 보기 →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
