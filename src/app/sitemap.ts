import type { MetadataRoute } from "next";
import { siteVariantPath, type SiteVariant } from "@/lib/market/site-variant";
import { siteBaseUrl } from "@/lib/market/seo";
import { getActiveSiteVariants } from "@/lib/market/active-market";
import {
  isPublicSearchIndexingEnabled,
  type PublicDiscoveryEnv,
} from "@/lib/public-discovery/policy";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicSearchIndexingEnabled()) return [];
  const activeVariants = await getActiveSiteVariants();
  return buildPublicSitemap(activeVariants);
}

export function buildPublicSitemap(
  activeVariants: readonly SiteVariant[],
  env: PublicDiscoveryEnv = process.env,
): MetadataRoute.Sitemap {
  if (!isPublicSearchIndexingEnabled(env) || activeVariants.length === 0) return [];
  const base = siteBaseUrl(env);
  const entries: MetadataRoute.Sitemap = [{ url: new URL("/global", base).toString() }];
  for (const variant of activeVariants) {
    entries.push({ url: new URL(siteVariantPath(variant), base).toString() });
  }
  return entries;
}
