import { MARKET_CONFIGS, isMarketCode, type MarketCode } from "./types";
import { Locale, isLocale, type Locale as LocaleCode } from "./locale";

export interface SiteVariant {
  marketCode: MarketCode;
  locale: LocaleCode;
}

export const ENABLED_SITE_VARIANTS: readonly SiteVariant[] = [
  { marketCode: "KR", locale: Locale.KO },
  { marketCode: "KR", locale: Locale.EN },
  { marketCode: "US", locale: Locale.EN },
  { marketCode: "US", locale: Locale.KO },
  { marketCode: "JP", locale: Locale.JA },
  { marketCode: "JP", locale: Locale.EN },
];

export type RouteSiteVariantResolution =
  | { kind: "EXACT"; variant: SiteVariant }
  | { kind: "FALLBACK"; variant: SiteVariant }
  | { kind: "INVALID" };

export function enabledLocalesForMarket(marketCode: MarketCode): readonly LocaleCode[] {
  return ENABLED_SITE_VARIANTS
    .filter((variant) => variant.marketCode === marketCode)
    .map((variant) => variant.locale);
}

export function isEnabledSiteVariant(marketCode: MarketCode, locale: LocaleCode): boolean {
  return ENABLED_SITE_VARIANTS.some(
    (variant) => variant.marketCode === marketCode && variant.locale === locale,
  );
}

export function fallbackLocaleForMarket(
  marketCode: MarketCode,
  requestedLocale?: LocaleCode,
): LocaleCode {
  const enabled = enabledLocalesForMarket(marketCode);
  if (requestedLocale && enabled.includes(requestedLocale)) return requestedLocale;
  const marketDefault = MARKET_CONFIGS[marketCode].defaultLocale;
  if (enabled.includes(marketDefault)) return marketDefault;
  if (enabled.includes(Locale.EN)) return Locale.EN;
  throw new Error(`No enabled locale is configured for market ${marketCode}.`);
}

export function resolveRouteSiteVariant(
  publicMarket: string,
  publicLocale: string,
): RouteSiteVariantResolution {
  const upperMarket = publicMarket.toUpperCase();
  const lowerLocale = publicLocale.toLowerCase();
  if (!isMarketCode(upperMarket) || !isLocale(lowerLocale)) return { kind: "INVALID" };
  const variant = { marketCode: upperMarket, locale: lowerLocale };
  if (isEnabledSiteVariant(variant.marketCode, variant.locale)) return { kind: "EXACT", variant };
  return {
    kind: "FALLBACK",
    variant: {
      marketCode: variant.marketCode,
      locale: fallbackLocaleForMarket(variant.marketCode, variant.locale),
    },
  };
}

export function siteVariantPath(variant: SiteVariant, suffix = ""): string {
  const normalizedSuffix = suffix.length === 0 || suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/${variant.marketCode.toLowerCase()}/${variant.locale}${normalizedSuffix}`;
}

export function equivalentSiteVariantPath(pathname: string, target: SiteVariant): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const current = resolveRouteSiteVariant(segments[0] ?? "", segments[1] ?? "");
    if (current.kind !== "INVALID") {
      return siteVariantPath(target, segments.slice(2).join("/"));
    }
  }
  return pathname;
}

export function isCanonicalPublicVariantPrefix(
  publicMarket: string,
  publicLocale: string,
  variant: SiteVariant,
): boolean {
  return publicMarket === variant.marketCode.toLowerCase() && publicLocale === variant.locale;
}
