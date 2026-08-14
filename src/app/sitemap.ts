import type { MetadataRoute } from "next";
import { getWigStyles } from "@/lib/catalog";
import { siteVariantPath } from "@/lib/market/site-variant";
import { siteBaseUrl } from "@/lib/market/seo";
import { getActiveSiteVariants } from "@/lib/market/active-market";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: new URL("/global", base).toString(), changeFrequency: "monthly", priority: 0.5 },
  ];
  const activeVariants = await getActiveSiteVariants();
  const activeMarkets = [...new Set(activeVariants.map((variant) => variant.marketCode))];
  const styleIdsByMarket = new Map<string, string[]>();
  for (const marketCode of activeMarkets) {
    const styles = await getWigStyles({}, marketCode);
    styleIdsByMarket.set(marketCode, styles.map((style) => style.id));
  }
  for (const variant of activeVariants) {
    entries.push(
      { url: new URL(siteVariantPath(variant), base).toString(), changeFrequency: "weekly", priority: 1 },
      { url: new URL(siteVariantPath(variant, "/styles"), base).toString(), changeFrequency: "daily", priority: 0.9 },
    );
    for (const styleId of styleIdsByMarket.get(variant.marketCode) ?? []) {
      entries.push({
        url: new URL(siteVariantPath(variant, `/styles/${encodeURIComponent(styleId)}`), base).toString(),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }
  return entries;
}
