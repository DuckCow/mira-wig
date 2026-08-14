import { parseTransientStorefrontContext } from "@/lib/market/request-context";
import { resolveRouteSiteVariant, type SiteVariant } from "@/lib/market/site-variant";
import type { Locale } from "@/lib/market/locale";

export interface StorefrontShellPresentation {
  headerVisible: boolean;
  locale: Locale;
  variant: SiteVariant | null;
}

export function storefrontShellPresentation(
  pathname: string,
  search: string,
  fallbackVariant: SiteVariant | null,
  fallbackLocale: Locale = "en",
): StorefrontShellPresentation {
  if (pathname === "/global") return { headerVisible: false, locale: "en", variant: null };
  const explicit = explicitVariant(pathname);
  const transient = parseTransientStorefrontContext(new URLSearchParams(search));
  const variant = explicit ?? transient ?? fallbackVariant;
  return {
    headerVisible: variant !== null,
    locale: variant?.locale ?? fallbackLocale,
    variant,
  };
}

export function syncDocumentLocale(root: { lang: string }, locale: Locale): void {
  root.lang = locale;
}

function explicitVariant(pathname: string): SiteVariant | null {
  const [market, locale] = pathname.split("/").filter(Boolean);
  if (!market || !locale) return null;
  const resolution = resolveRouteSiteVariant(market, locale);
  return resolution.kind === "INVALID" ? null : resolution.variant;
}
