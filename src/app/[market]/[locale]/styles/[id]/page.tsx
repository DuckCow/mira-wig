import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getWigStyleById } from "@/lib/catalog";
import { catalogStorage } from "@/lib/storage";
import { getStorefrontContext } from "@/lib/market";
import { localizedCategoryLabel } from "@/lib/market/catalog-presentation";
import { messagesFor } from "@/lib/market/messages";
import { requirePublicSiteVariant } from "@/lib/market/route";
import { storefrontMetadata } from "@/lib/market/seo";
import { getActiveMarketCommercialFacts, getPublishedSiteVariants } from "@/lib/market/active-market";
import { siteVariantPath, type SiteVariant } from "@/lib/market/site-variant";
import { VariantSelector } from "@/app/(shop)/styles/[id]/VariantSelector";
import { RelatedStylesSection } from "@/app/(shop)/styles/[id]/RelatedStylesSection";
import type { WigStyleDetail } from "@/lib/catalog.types";
import type { CurrencyMeta } from "@/lib/market/types";

type PageParams = Promise<{ market: string; locale: string; id: string }>;
const getStyleForRoute = cache(getWigStyleById);

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const raw = await params;
  const variant = await requirePublicSiteVariant(
    Promise.resolve({ market: raw.market, locale: raw.locale }),
    `/styles/${encodeURIComponent(raw.id)}`,
  );
  const [style, publishedVariants] = await Promise.all([
    getStyleForRoute(raw.id, variant.marketCode),
    getPublishedSiteVariants(raw.id),
  ]);
  const messages = messagesFor(variant.locale);
  if (!style) return storefrontMetadata(variant, `/styles/${encodeURIComponent(raw.id)}`, messages.styles.title, messages.home.description, []);
  return storefrontMetadata(
    variant,
    `/styles/${encodeURIComponent(raw.id)}`,
    style.name,
    style.description?.trim() || messages.home.description,
    publishedVariants,
  );
}

export default async function PublicStyleDetailPage({ params }: { params: PageParams }) {
  const raw = await params;
  const variant = await requirePublicSiteVariant(
    Promise.resolve({ market: raw.market, locale: raw.locale }),
    `/styles/${encodeURIComponent(raw.id)}`,
  );
  const [style, context, market] = await Promise.all([
    getStyleForRoute(raw.id, variant.marketCode),
    getStorefrontContext(),
    getActiveMarketCommercialFacts(variant.marketCode),
  ]);
  if (!style) notFound();
  const coverUrl = style.coverImageKey
    ? await catalogStorage.getViewUrl(style.coverImageKey).catch(() => null)
    : null;
  return <StyleDetailView variant={variant} style={style} coverUrl={coverUrl} currency={market.currency} currentMarketCode={context.confirmedMarketCode} />;
}

function StyleDetailView({ variant, style, coverUrl, currency, currentMarketCode }: { variant: SiteVariant; style: WigStyleDetail; coverUrl: string | null; currency: CurrencyMeta; currentMarketCode: Parameters<typeof VariantSelector>[0]["currentMarketCode"] }) {
  const messages = messagesFor(variant.locale);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label={messages.detail.back} className="mb-6">
        <Link href={siteVariantPath(variant, "/styles")} className="text-sm text-gray-500 hover:text-gray-900">← {messages.detail.back}</Link>
      </nav>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <CoverImage url={coverUrl} name={style.name} unavailable={messages.detail.imageUnavailable} />
        <div className="space-y-4">
          <div>
            <span className="mb-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{localizedCategoryLabel(style.category, variant.locale)}</span>
            <h1 className="text-2xl font-bold text-gray-900">{style.name}</h1>
          </div>
          <p className="text-xs text-gray-500">{messages.detail.productLanguageNotice}</p>
          {style.description ? <p className="text-sm leading-relaxed text-gray-600">{style.description}</p> : null}
          <VariantSelector variants={style.variants} wigStyleId={style.id} marketCode={variant.marketCode} currency={currency} locale={variant.locale} currentMarketCode={currentMarketCode} />
        </div>
      </div>
      <RelatedStylesSection sourceStyleId={style.id} marketCode={variant.marketCode} currency={currency} locale={variant.locale} />
    </main>
  );
}

function CoverImage({ url, name, unavailable }: { url: string | null; name: string; unavailable: string }) {
  if (!url) return <div className="flex aspect-square items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">{unavailable}</div>;
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
      <Image src={url} alt={name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" priority />
    </div>
  );
}
