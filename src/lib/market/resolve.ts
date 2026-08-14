// ============================================================
// lib/market/resolve.ts — 서버 사이드 마켓 결정 (서버 전용)
// next/headers (cookies + geo 헤더)로 현재 요청의 마켓을 결정한다.
//
// 마켓 결정은 서버의 단일 출처: 클라이언트는 이 결과를 props/context로
// 전달받을 뿐, 쿠키를 직접 읽어 재결정하지 않는다.
// → hydration mismatch 구조적 방지
// ============================================================
import "server-only";

import { cookies, headers } from "next/headers";
import {
  MARKET_CONFIGS,
  MARKET_COOKIE,
  type MarketCode,
  type MarketConfig,
} from "./types";
import {
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  preferredEnabledLocale,
  type Locale,
} from "./locale";
import { resolveRootLocale, resolveRootMarket } from "./resolution";
import { getActiveMarketCodes, NoActiveMarketException } from "./active-market";
import {
  MIRA_CONTEXT_ATTESTATION_HEADER,
  MIRA_CONTEXT_ATTESTATION_VALUE,
  MIRA_CONTEXT_SOURCE_HEADER,
  MIRA_GEO_COUNTRY_HEADER,
  MIRA_PATHNAME_HEADER,
  MIRA_REQUEST_TARGET_HEADER,
  MIRA_ROUTE_LOCALE_HEADER,
  MIRA_ROUTE_MARKET_HEADER,
  MIRA_TRANSIENT_LOCALE_HEADER,
  MIRA_TRANSIENT_MARKET_HEADER,
  parseHeaderSiteVariant,
  decodeSafeRelativeApplicationPath,
  parseTransientStorefrontContext,
} from "./request-context";
import { resolveRouteSiteVariant } from "./site-variant";

export type MarketResolutionSource = "EXPLICIT_COOKIE" | "GEO" | "DEFAULT" | "EXPLICIT_URL" | "TRANSIENT_HANDOFF";
export type LocaleResolutionSource = "EXPLICIT_COOKIE" | "ACCEPT_LANGUAGE" | "MARKET_DEFAULT" | "EXPLICIT_URL" | "TRANSIENT_HANDOFF";

export interface StorefrontContext {
  marketCode: MarketCode;
  confirmedMarketCode: MarketCode | null;
  locale: Locale;
  marketSource: MarketResolutionSource;
  localeSource: LocaleResolutionSource;
  marketConfirmed: boolean;
  pathname: string;
  requestTarget: string;
}

export async function getCurrentMarketCode(): Promise<MarketCode> {
  return (await getStorefrontContext()).marketCode;
}

export async function getAuthenticationLocale(callbackUrl?: string): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const callbackLocale = callbackUrl ? localeFromSafeApplicationPath(callbackUrl) : null;
  if (callbackLocale) return callbackLocale;
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (localeCookie && isLocale(localeCookie)) return localeCookie;
  return preferredEnabledLocale(
    headerStore.get("accept-language") ?? undefined,
    LOCALES,
  ) ?? "en";
}

export async function getStorefrontContext(): Promise<StorefrontContext> {
  const [cookieStore, headerStore, activeMarketCodes] = await Promise.all([
    cookies(),
    headers(),
    getActiveMarketCodes(),
  ]);
  if (activeMarketCodes.length === 0) throw new NoActiveMarketException();
  const cookieValue = cookieStore.get(MARKET_COOKIE)?.value;
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const requestOwned = requestOwnedContext(headerStore, cookieValue, activeMarketCodes);
  if (requestOwned) return requestOwned;
  return rootStorefrontContext(headerStore, cookieValue, localeCookie, activeMarketCodes);
}

function rootStorefrontContext(
  headerStore: Awaited<ReturnType<typeof headers>>,
  cookieValue: string | undefined,
  localeCookie: string | undefined,
  activeMarketCodes: readonly MarketCode[],
): StorefrontContext {
  const attested = isAttested(headerStore);
  const geoCountry = attested ? headerStore.get(MIRA_GEO_COUNTRY_HEADER) ?? undefined : undefined;
  const market = resolveRootMarket(cookieValue, geoCountry, activeMarketCodes);
  const confirmedMarketCode = activeConfirmedMarket(cookieValue, activeMarketCodes);
  const locale = resolveRootLocale(
    localeCookie,
    headerStore.get("accept-language") ?? undefined,
    market.marketCode,
  );
  return {
    marketCode: market.marketCode,
    confirmedMarketCode,
    locale: locale.locale,
    marketSource: market.source,
    localeSource: locale.source,
    marketConfirmed: confirmedMarketCode === market.marketCode,
    pathname: attested ? headerStore.get(MIRA_PATHNAME_HEADER) ?? "/" : "/",
    requestTarget: attested ? headerStore.get(MIRA_REQUEST_TARGET_HEADER) ?? "/" : "/",
  };
}

function requestOwnedContext(
  headerStore: Awaited<ReturnType<typeof headers>>,
  marketCookie: string | undefined,
  activeMarketCodes: readonly MarketCode[],
): StorefrontContext | null {
  if (!isAttested(headerStore)) return null;
  const source = headerStore.get(MIRA_CONTEXT_SOURCE_HEADER);
  const values = source === "EXPLICIT_URL"
    ? parseHeaderSiteVariant(
      headerStore.get(MIRA_ROUTE_MARKET_HEADER),
      headerStore.get(MIRA_ROUTE_LOCALE_HEADER),
    )
    : source === "TRANSIENT_PUBLIC"
      ? parseHeaderSiteVariant(
        headerStore.get(MIRA_TRANSIENT_MARKET_HEADER),
        headerStore.get(MIRA_TRANSIENT_LOCALE_HEADER),
      )
      : null;
  if (!values || !activeMarketCodes.includes(values.marketCode)) return null;
  const explicit = source === "EXPLICIT_URL";
  const confirmedMarketCode = activeConfirmedMarket(marketCookie, activeMarketCodes);
  return {
    marketCode: values.marketCode,
    confirmedMarketCode,
    locale: values.locale,
    marketSource: explicit ? "EXPLICIT_URL" : "TRANSIENT_HANDOFF",
    localeSource: explicit ? "EXPLICIT_URL" : "TRANSIENT_HANDOFF",
    marketConfirmed: confirmedMarketCode === values.marketCode,
    pathname: headerStore.get(MIRA_PATHNAME_HEADER) ?? "/",
    requestTarget: headerStore.get(MIRA_REQUEST_TARGET_HEADER) ?? "/",
  };
}

function activeConfirmedMarket(
  cookieValue: string | undefined,
  activeMarketCodes: readonly MarketCode[],
): MarketCode | null {
  return activeMarketCodes.find((marketCode) => marketCode === cookieValue) ?? null;
}

function localeFromSafeApplicationPath(callbackUrl: string): Locale | null {
  const decoded = decodeSafeRelativeApplicationPath(callbackUrl);
  if (decoded === null) return null;
  const url = new URL(decoded, "https://mira.invalid");
  const transient = parseTransientStorefrontContext(url.searchParams);
  if (transient) return transient.locale;
  const [publicMarket, publicLocale] = url.pathname.split("/").filter(Boolean);
  if (!publicMarket || !publicLocale) return null;
  const resolution = resolveRouteSiteVariant(publicMarket, publicLocale);
  return resolution.kind === "INVALID" ? null : resolution.variant.locale;
}

export async function getCurrentMarket(): Promise<MarketConfig> {
  const code = await getCurrentMarketCode();
  return MARKET_CONFIGS[code];
}

function isAttested(headerStore: Awaited<ReturnType<typeof headers>>): boolean {
  return headerStore.get(MIRA_CONTEXT_ATTESTATION_HEADER) === MIRA_CONTEXT_ATTESTATION_VALUE;
}
