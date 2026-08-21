import type { Metadata } from "next";
import { getWigStyles, isWigCategory, WIG_CATEGORIES, type WigStyleSummary } from "@/lib/catalog";
import { catalogStorage } from "@/lib/storage";
import { StyleCard } from "@/components/features/StyleCard";
import { MarketConfirmation } from "@/components/features/MarketConfirmation";
import { getStorefrontContext } from "@/lib/market";
import { getActiveMarketCommercialFacts } from "@/lib/market/active-market";
import type { CurrencyMeta } from "@/lib/market/types";
import { localizedCategoryLabel } from "@/lib/market/catalog-presentation";
import { messagesFor } from "@/lib/market/messages";
import { publicPageMetadata } from "@/lib/market/seo";
import { requirePublicSiteVariant, type PublicVariantParams } from "@/lib/market/route";
import { siteVariantPath, type SiteVariant } from "@/lib/market/site-variant";

type PageSearchParams = Promise<{ category?: string; q?: string }>;
type Props = { params: Promise<PublicVariantParams>; searchParams: PageSearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return publicPageMetadata(await requirePublicSiteVariant(params, "/styles"), "STYLES");
}

export default async function PublicStylesPage({ params, searchParams }: Props) {
  const [variant, raw, context] = await Promise.all([
    requirePublicSiteVariant(params, "/styles"),
    searchParams,
    getStorefrontContext(),
  ]);
  const category = typeof raw.category === "string" && isWigCategory(raw.category)
    ? raw.category
    : undefined;
  const query = typeof raw.q === "string" && raw.q.trim() ? raw.q.trim() : undefined;
  const [styles, market] = await Promise.all([
    getWigStyles({ category, query }, variant.marketCode),
    getActiveMarketCommercialFacts(variant.marketCode),
  ]);
  const withImages = await Promise.all(styles.map(async (style) => ({
    ...style,
    imageUrl: style.coverImageKey
      ? await catalogStorage.getViewUrl(style.coverImageKey).catch(() => null)
      : null,
  })));
  return <StylesView variant={variant} styles={withImages} currency={market.currency} category={category} query={query} currentMarketCode={context.confirmedMarketCode} />;
}

function StylesView({
  variant,
  styles,
  currency,
  category,
  query,
  currentMarketCode,
}: {
  variant: SiteVariant;
  styles: (WigStyleSummary & { imageUrl: string | null })[];
  currency: CurrencyMeta;
  category?: string;
  query?: string;
  currentMarketCode: Parameters<typeof MarketConfirmation>[0]["currentMarketCode"];
}) {
  const messages = messagesFor(variant.locale);
  const basePath = siteVariantPath(variant, "/styles");
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{messages.styles.title}</h1>
      <p className="mb-6 text-xs text-gray-500">{messages.styles.productLanguageNotice}</p>
      <div className="mb-6">
        <MarketConfirmation currentMarketCode={currentMarketCode} targetMarketCode={variant.marketCode} locale={variant.locale} />
      </div>
      <form method="GET" action={basePath} className="mb-6" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="search-input" className="sr-only">{messages.styles.searchLabel}</label>
        <div className="flex gap-2">
          <input id="search-input" name="q" type="search" defaultValue={query ?? ""} placeholder={messages.styles.searchPlaceholder} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">{messages.styles.search}</button>
        </div>
      </form>
      <nav aria-label={messages.styles.title} className="mb-8 flex flex-wrap gap-2">
        <a href={query ? `${basePath}?q=${encodeURIComponent(query)}` : basePath} className={pillClass(!category)}>{messages.styles.all}</a>
        {WIG_CATEGORIES.map((item) => (
          <a key={item} href={categoryHref(basePath, item, query)} className={pillClass(category === item)}>
            {localizedCategoryLabel(item, variant.locale)}
          </a>
        ))}
      </nav>
      {styles.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <p className="text-lg font-medium">{messages.styles.empty}</p>
          <p className="mt-1 text-sm">{messages.styles.emptyHint}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {styles.map((style) => (
            <li key={style.id}>
              <StyleCard {...style} marketCode={variant.marketCode} currency={currency} locale={variant.locale} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function categoryHref(basePath: string, category: string, query?: string): string {
  const parameters = new URLSearchParams({ category });
  if (query) parameters.set("q", query);
  return `${basePath}?${parameters.toString()}`;
}

function pillClass(active: boolean): string {
  return `rounded-full border px-4 py-1.5 text-sm ${active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-600"}`;
}
