import { notFound } from "next/navigation";
import Link from "next/link";
import { getStyleDetail, getStyleMarketData } from "@/lib/admin-catalog-data";
import { catalogStorage } from "@/lib/storage";
import { StyleEditForm } from "./StyleEditForm";
import { VariantSection } from "./VariantSection";
import { MarketAvailabilitySection } from "./MarketAvailabilitySection";
import { MarketPriceSection } from "./MarketPriceSection";
import {
  getAdminManualStyleRelations,
  getManualRelationTargetChoices,
} from "@/lib/manual-item-relations/admin";
import { getManualRelationCustomerGateStates } from "@/lib/manual-item-relations/activation";
import { ManualItemRelationsSection } from "./ManualItemRelationsSection";

type Params = Promise<{ id: string }>;

export default async function StyleDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const customerGateStates = getManualRelationCustomerGateStates("KR");
  const [style, marketData, relations, targetChoices] = await Promise.all([
    getStyleDetail(id),
    getStyleMarketData(id),
    getAdminManualStyleRelations(id, "KR"),
    getManualRelationTargetChoices(id, "KR"),
  ]);
  if (!style) notFound();
  const initialCoverUrl = style.coverImageKey
    ? await catalogStorage.getViewUrl(style.coverImageKey).catch(() => null)
    : null;
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/styles" className="text-sm text-gray-500 hover:text-gray-700">← 목록</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{style.name}</span>
      </div>
      <StyleEditForm style={style} initialCoverUrl={initialCoverUrl} />
      <VariantSection variants={style.variants} wigStyleId={style.id} />
      <MarketAvailabilitySection wigStyleId={style.id} markets={marketData.markets} />
      <MarketPriceSection
        variantPrices={marketData.variantPrices}
        marketPriceContexts={marketData.marketPriceContexts}
      />
      <ManualItemRelationsSection
        sourceStyleId={style.id}
        relations={relations}
        targetChoices={targetChoices}
        customerGateStates={customerGateStates}
      />
    </div>
  );
}
