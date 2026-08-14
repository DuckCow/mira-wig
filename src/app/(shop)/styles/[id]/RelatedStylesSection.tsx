import { StyleCard } from "@/components/features/StyleCard";
import type { MarketCode } from "@/lib/market/types";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";
import {
  ManualItemRelationsActivationConfigError,
  type ManualItemRelationsActivationEnv,
} from "@/lib/manual-item-relations/activation";
import {
  getManualRelatedStyles,
  MANUAL_RELATED_STYLE_GROUP_ORDER,
} from "@/lib/manual-item-relations/public";
import type {
  ManualRelatedStyleGroups,
  ManualStyleRelationPurpose,
} from "@/lib/manual-item-relations/types";
import { catalogStorage } from "@/lib/storage";

const GROUP_LABELS: Readonly<Record<Locale, Record<ManualStyleRelationPurpose, string>>> = {
  ko: { SIMILAR_STYLE: "비슷한 스타일", COMPARE_WITH: "함께 비교해 보세요" },
  en: { SIMILAR_STYLE: "Similar styles", COMPARE_WITH: "Compare with" },
  ja: { SIMILAR_STYLE: "似ているスタイル", COMPARE_WITH: "比較する" },
};

interface RelatedStyleViewItem {
  id: string;
  name: string;
  category: ManualRelatedStyleGroups["SIMILAR_STYLE"][number]["category"];
  tags: string[];
  imageUrl: string | null;
  basePrice: number;
}

export interface RelatedStyleViewGroups {
  SIMILAR_STYLE: RelatedStyleViewItem[];
  COMPARE_WITH: RelatedStyleViewItem[];
}

export async function loadRelatedStylesForPdp(
  sourceStyleId: string,
  marketCode: MarketCode,
  env?: ManualItemRelationsActivationEnv,
): Promise<ManualRelatedStyleGroups> {
  try {
    return await getManualRelatedStyles(sourceStyleId, marketCode, env);
  } catch (error) {
    if (error instanceof ManualItemRelationsActivationConfigError) {
      return { SIMILAR_STYLE: [], COMPARE_WITH: [] };
    }
    throw error;
  }
}

async function resolveViewGroups(groups: ManualRelatedStyleGroups): Promise<RelatedStyleViewGroups> {
  const resolveGroup = async (
    styles: ManualRelatedStyleGroups["SIMILAR_STYLE"],
  ): Promise<RelatedStyleViewItem[]> => Promise.all(styles.map(async (style) => ({
    id: style.id,
    name: style.name,
    category: style.category,
    tags: style.tags,
    imageUrl: style.coverImageKey
      ? await catalogStorage.getViewUrl(style.coverImageKey).catch(() => null)
      : null,
    basePrice: style.basePrice,
  })));
  return {
    SIMILAR_STYLE: await resolveGroup(groups.SIMILAR_STYLE),
    COMPARE_WITH: await resolveGroup(groups.COMPARE_WITH),
  };
}

export function RelatedStylesSectionView({
  groups,
  marketCode,
  locale,
}: {
  groups: RelatedStyleViewGroups;
  marketCode: MarketCode;
  locale: Locale;
}) {
  const hasItems = MANUAL_RELATED_STYLE_GROUP_ORDER.some(
    (purpose) => groups[purpose].length > 0,
  );
  if (!hasItems) return null;
  return (
    <section aria-label={messagesFor(locale).detail.relatedStyles} className="mt-12 space-y-8">
      {MANUAL_RELATED_STYLE_GROUP_ORDER.map((purpose) => {
        const styles = groups[purpose];
        if (styles.length === 0) return null;
        return (
          <div key={purpose}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{GROUP_LABELS[locale][purpose]}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {styles.map((style) => (
                <StyleCard
                  key={style.id}
                  id={style.id}
                  name={style.name}
                  category={style.category}
                  tags={style.tags}
                  imageUrl={style.imageUrl}
                  basePrice={style.basePrice}
                  marketCode={marketCode}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export async function RelatedStylesSection({
  sourceStyleId,
  marketCode,
  locale,
}: {
  sourceStyleId: string;
  marketCode: MarketCode;
  locale: Locale;
}) {
  const groups = await loadRelatedStylesForPdp(sourceStyleId, marketCode);
  const viewGroups = await resolveViewGroups(groups);
  return <RelatedStylesSectionView groups={viewGroups} marketCode={marketCode} locale={locale} />;
}
