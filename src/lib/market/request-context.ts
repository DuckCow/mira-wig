import { isLocale, type Locale } from "./locale";
import { equivalentSiteVariantPath, isEnabledSiteVariant, type SiteVariant } from "./site-variant";
import { isMarketCode, type MarketCode } from "./types";

export const MIRA_CONTEXT_ATTESTATION_HEADER = "x-mira-context-attested";
export const MIRA_CONTEXT_ATTESTATION_VALUE = "proxy-v1";
export const MIRA_CONTEXT_SOURCE_HEADER = "x-mira-context-source";
export const MIRA_ROUTE_MARKET_HEADER = "x-mira-route-market";
export const MIRA_ROUTE_LOCALE_HEADER = "x-mira-route-locale";
export const MIRA_TRANSIENT_MARKET_HEADER = "x-mira-transient-market";
export const MIRA_TRANSIENT_LOCALE_HEADER = "x-mira-transient-locale";
export const MIRA_GEO_COUNTRY_HEADER = "x-mira-geo-country";
export const MIRA_PATHNAME_HEADER = "x-mira-pathname";
export const MIRA_REQUEST_TARGET_HEADER = "x-mira-request-target";

export const STOREFRONT_CONTEXT_MARKET_PARAM = "miraMarket";
export const STOREFRONT_CONTEXT_LOCALE_PARAM = "miraLocale";
export const STOREFRONT_CONTEXT_SOURCE_PARAM = "miraContext";
export const STOREFRONT_CONTEXT_SOURCE_VALUE = "public";
const MAX_APPLICATION_PATH_DECODE_DEPTH = 4;

export type MiraContextSource = "EXPLICIT_URL" | "TRANSIENT_PUBLIC";

export function stripIncomingMiraHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  for (const name of [...sanitized.keys()]) {
    if (name.toLowerCase().startsWith("x-mira-")) sanitized.delete(name);
  }
  return sanitized;
}

export function parseTransientStorefrontContext(
  searchParams: Pick<URLSearchParams, "get">,
): SiteVariant | null {
  if (searchParams.get(STOREFRONT_CONTEXT_SOURCE_PARAM) !== STOREFRONT_CONTEXT_SOURCE_VALUE) {
    return null;
  }
  const market = searchParams.get(STOREFRONT_CONTEXT_MARKET_PARAM);
  const locale = searchParams.get(STOREFRONT_CONTEXT_LOCALE_PARAM);
  if (!market || !locale || !isMarketCode(market) || !isLocale(locale)) return null;
  if (!isEnabledSiteVariant(market, locale)) return null;
  return { marketCode: market, locale };
}

export function withStorefrontHandoff(href: string, variant: SiteVariant): string {
  if (!isSafeRelativeApplicationPath(href)) return href;
  const url = new URL(href, "https://mira.invalid");
  url.searchParams.set(STOREFRONT_CONTEXT_MARKET_PARAM, variant.marketCode);
  url.searchParams.set(STOREFRONT_CONTEXT_LOCALE_PARAM, variant.locale);
  url.searchParams.set(STOREFRONT_CONTEXT_SOURCE_PARAM, STOREFRONT_CONTEXT_SOURCE_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginHref(returnTarget: string, variant: SiteVariant): string {
  const safeTarget = isSafeRelativeApplicationPath(returnTarget)
    ? returnTarget
    : siteVariantFallback(variant);
  const login = new URL(withStorefrontHandoff("/login", variant), "https://mira.invalid");
  login.searchParams.set("callbackUrl", safeTarget);
  return `${login.pathname}${login.search}${login.hash}`;
}

export function appendSearchParams(
  href: string,
  values: Record<string, string | string[] | undefined>,
): string {
  const url = new URL(href, "https://mira.invalid");
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") url.searchParams.append(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function siteVariantNavigationTarget(
  pathname: string,
  search: string,
  hash: string,
  variant: SiteVariant,
): string {
  const equivalentPath = equivalentSiteVariantPath(pathname, variant);
  const normalizedSearch = search.length === 0 || search.startsWith("?") ? search : `?${search}`;
  const normalizedHash = hash.length === 0 || hash.startsWith("#") ? hash : `#${hash}`;
  const preserved = `${equivalentPath}${normalizedSearch}${normalizedHash}`;
  return equivalentPath === pathname ? withStorefrontHandoff(preserved, variant) : preserved;
}

export function isSafeRelativeApplicationPath(value: string): boolean {
  return decodeSafeRelativeApplicationPath(value) !== null;
}

export function decodeSafeRelativeApplicationPath(value: string): string | null {
  let decoded = value;
  for (let depth = 0; depth <= MAX_APPLICATION_PATH_DECODE_DEPTH; depth += 1) {
    if (!hasSafeLayerShape(decoded)) return null;
    if (depth === MAX_APPLICATION_PATH_DECODE_DEPTH) {
      try {
        return decodeURIComponent(decoded) === decoded ? sameOriginDecoded(value, decoded) : null;
      } catch {
        return null;
      }
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return sameOriginDecoded(value, decoded);
      decoded = next;
    } catch {
      return null;
    }
  }
  return null;
}

function hasSafeLayerShape(value: string): boolean {
  if (value.length < 1 || value.length > 2_048) return false;
  if (value.trim() !== value || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\")) return false;
  if (hasAsciiControlOrDel(value)) return false;
  return !hasTraversalSegment(value);
}

function sameOriginDecoded(original: string, decoded: string): string | null {
  const originalUrl = new URL(original, "https://mira.invalid");
  const decodedUrl = new URL(decoded, "https://mira.invalid");
  if (originalUrl.origin !== "https://mira.invalid") return null;
  if (decodedUrl.origin !== "https://mira.invalid") return null;
  return decoded;
}

export function parseHeaderSiteVariant(
  marketValue: string | null,
  localeValue: string | null,
): { marketCode: MarketCode; locale: Locale } | null {
  if (!marketValue || !localeValue || !isMarketCode(marketValue) || !isLocale(localeValue)) {
    return null;
  }
  if (!isEnabledSiteVariant(marketValue, localeValue)) return null;
  return { marketCode: marketValue, locale: localeValue };
}

function siteVariantFallback(variant: SiteVariant): string {
  return `/${variant.marketCode.toLowerCase()}/${variant.locale}`;
}

function hasTraversalSegment(value: string): boolean {
  const pathname = value.split(/[?#]/u, 1)[0] ?? "";
  return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

function hasAsciiControlOrDel(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1F || codePoint === 0x7F)) return true;
  }
  return false;
}
