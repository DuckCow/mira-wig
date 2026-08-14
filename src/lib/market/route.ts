import "server-only";

import { notFound, redirect } from "next/navigation";
import { resolveRouteSiteVariant, siteVariantPath, type SiteVariant } from "./site-variant";
import { isActiveMarket } from "./active-market";

export interface PublicVariantParams {
  market: string;
  locale: string;
}

export async function requirePublicSiteVariant(
  params: Promise<PublicVariantParams>,
  suffix = "",
): Promise<SiteVariant> {
  const { market, locale } = await params;
  const resolution = resolveRouteSiteVariant(market, locale);
  if (resolution.kind === "INVALID") notFound();
  if (resolution.kind === "FALLBACK") redirect(siteVariantPath(resolution.variant, suffix));
  if (!await isActiveMarket(resolution.variant.marketCode)) notFound();
  return resolution.variant;
}
