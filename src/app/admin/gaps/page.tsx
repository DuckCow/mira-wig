import Link from "next/link";
import { findMarketPriceGaps } from "@/lib/catalog-admin/market-price";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import type { Column } from "@/components/ui/Table";
import type { PriceGapItem } from "@/lib/catalog-admin/types";

export default async function GapsPage() {
  const gaps = await findMarketPriceGaps();

  const columns: Column<PriceGapItem>[] = [
    {
      key: "style",
      header: "스타일",
      render: (r) => (
        <Link href={`/admin/styles/${r.wigStyleId}`} className="text-blue-600 hover:underline text-sm">
          {r.styleName}
        </Link>
      ),
    },
    {
      key: "market",
      header: "마켓",
      render: (r) => <span className="text-sm font-medium">{r.marketCode}</span>,
    },
    {
      key: "sku",
      header: "SKU (가격 미설정)",
      render: (r) => <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.sku}</code>,
    },
    {
      key: "action",
      header: "",
      render: (r) => (
        <Link href={`/admin/styles/${r.wigStyleId}`} className="text-sm text-blue-600 hover:underline">
          가격 입력 →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">마켓 가격 갭 진단</h1>
        <Link href="/admin/styles" className="text-sm text-gray-500 hover:text-gray-700">
          스타일 목록 →
        </Link>
      </div>
      <Card>
        {gaps.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            노출 중인 모든 variant에 가격이 설정되어 있습니다.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              노출 마켓에 가격이 없는 variant {gaps.length}건. 클릭해서 가격을 입력하세요.
            </p>
            <Table
              columns={columns}
              rows={gaps}
              getRowKey={(r) => `${r.variantId}-${r.marketCode}`}
              emptyMessage="갭이 없습니다."
            />
          </>
        )}
      </Card>
    </div>
  );
}
