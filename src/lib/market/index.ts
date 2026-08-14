// ============================================================
// lib/market/index.ts — 마켓 추상화 계층 공개 API
//
// 사용 패턴:
//   서버 컴포넌트/액션: import { getCurrentMarket } from "@/lib/market"
//   클라이언트 컴포넌트: import { MARKET_CONFIGS, formatPrice } from "@/lib/market/types"
//
// index.ts는 resolve.ts(server-only)를 포함하므로 서버 전용.
// 클라이언트에서 types.ts의 순수 유틸만 필요하면 직접 import.
// ============================================================

export { getAuthenticationLocale, getCurrentMarket, getCurrentMarketCode, getStorefrontContext } from "./resolve";

export {
  MarketCode,
  MARKET_CODES,
  MARKET_CONFIGS,
  CURRENCY_META,
  MARKET_COOKIE,
  DEFAULT_MARKET_CODE,
  formatPrice,
  isMarketCode,
  resolveMarketCode,
  type MarketConfig,
  type CurrencyMeta,
} from "./types";

export { Locale, LOCALES, LOCALE_COOKIE, isLocale, preferredEnabledLocale, type Locale as LocaleCode } from "./locale";
export {
  ENABLED_SITE_VARIANTS,
  enabledLocalesForMarket,
  equivalentSiteVariantPath,
  fallbackLocaleForMarket,
  isEnabledSiteVariant,
  resolveRouteSiteVariant,
  siteVariantPath,
  type SiteVariant,
} from "./site-variant";
export { resolveRootLocale, resolveRootMarket, type RootLocaleResolution, type RootMarketResolution } from "./resolution";
export { NoActiveMarketException, getActiveMarketCodes, getActiveSiteVariants, isActiveMarket } from "./active-market";
