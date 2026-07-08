// ============================================================
// app/admin/layout.tsx — 어드민 공통 레이아웃
// ToastProvider 배선 + 심플 내비.
// 미들웨어(middleware.ts)가 이미 /admin/* 접근을 보호한다.
// ============================================================

import Link from "next/link";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata = { title: "어드민" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-gray-900 text-sm">Mira 어드민</span>
          <Link
            href="/admin/styles"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            스타일 관리
          </Link>
          <Link
            href="/admin/orders"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            주문 관리
          </Link>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
