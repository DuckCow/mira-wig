import type { Metadata } from "next";
import { HomeStorefront } from "@/components/storefront/HomeStorefront";
import { publicPageMetadata } from "@/lib/market/seo";
import { requirePublicSiteVariant, type PublicVariantParams } from "@/lib/market/route";
import { ENABLED_SITE_VARIANTS } from "@/lib/market/site-variant";

type Props = { params: Promise<PublicVariantParams> };

export function generateStaticParams() {
  return ENABLED_SITE_VARIANTS.map((variant) => ({
    market: variant.marketCode.toLowerCase(),
    locale: variant.locale,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return publicPageMetadata(await requirePublicSiteVariant(params), "HOME");
}

export default async function PublicHomePage({ params }: Props) {
  return <HomeStorefront variant={await requirePublicSiteVariant(params)} />;
}
