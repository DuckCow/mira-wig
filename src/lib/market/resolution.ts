import { DEFAULT_MARKET_CODE, isMarketCode, type MarketCode } from "./types";
import { isLocale, preferredEnabledLocale, type Locale } from "./locale";
import { enabledLocalesForMarket, fallbackLocaleForMarket } from "./site-variant";

export type RootMarketSource = "EXPLICIT_COOKIE" | "GEO" | "DEFAULT";
export type RootLocaleSource = "EXPLICIT_COOKIE" | "ACCEPT_LANGUAGE" | "MARKET_DEFAULT";

export interface RootMarketResolution {
  marketCode: MarketCode;
  source: RootMarketSource;
}

export interface RootLocaleResolution {
  locale: Locale;
  source: RootLocaleSource;
}

export function resolveRootMarket(
  cookieValue: string | undefined,
  geoCountry: string | undefined,
  activeMarketCodes: readonly MarketCode[] = ["KR", "US", "JP"],
): RootMarketResolution {
  if (activeMarketCodes.length === 0) throw new Error("No active Market is available.");
  const cookieMarket = activeMarketCode(cookieValue, activeMarketCodes);
  if (cookieMarket) return { marketCode: cookieMarket, source: "EXPLICIT_COOKIE" };
  const geoMarket = activeMarketCode(geoCountry?.toUpperCase(), activeMarketCodes);
  if (geoMarket) return { marketCode: geoMarket, source: "GEO" };
  const defaultMarket = defaultActiveMarket(activeMarketCodes);
  return { marketCode: defaultMarket, source: "DEFAULT" };
}

function activeMarketCode(
  value: string | undefined,
  activeMarketCodes: readonly MarketCode[],
): MarketCode | null {
  if (!value || !isMarketCode(value) || !activeMarketCodes.includes(value)) return null;
  return value;
}

function defaultActiveMarket(activeMarketCodes: readonly MarketCode[]): MarketCode {
  if (activeMarketCodes.includes(DEFAULT_MARKET_CODE)) return DEFAULT_MARKET_CODE;
  const firstMarket = activeMarketCodes[0];
  if (!firstMarket) throw new Error("No active Market is available.");
  return firstMarket;
}

export function resolveRootLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | undefined,
  marketCode: MarketCode,
): RootLocaleResolution {
  const enabled = enabledLocalesForMarket(marketCode);
  if (cookieValue && isLocale(cookieValue) && enabled.includes(cookieValue)) {
    return { locale: cookieValue, source: "EXPLICIT_COOKIE" };
  }
  const accepted = preferredEnabledLocale(acceptLanguage, enabled);
  if (accepted) return { locale: accepted, source: "ACCEPT_LANGUAGE" };
  return { locale: fallbackLocaleForMarket(marketCode), source: "MARKET_DEFAULT" };
}
