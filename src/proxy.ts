import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminRole } from "@/lib/admin-role";
import {
  isCanonicalPublicVariantPrefix,
  resolveRouteSiteVariant,
  siteVariantPath,
} from "@/lib/market/site-variant";
import { configuredGeoIpTrustMode, readTrustedGeoCountry } from "@/lib/market/geo-trust";
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
  parseTransientStorefrontContext,
  stripIncomingMiraHeaders,
} from "@/lib/market/request-context";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isAdminPath(request.nextUrl.pathname)) {
    const adminResponse = await enforceAdminBoundary(request);
    if (adminResponse) return adminResponse;
  }

  const publicVariant = publicVariantFromPathname(request.nextUrl.pathname);
  if (publicVariant?.redirectPathname) {
    const destination = request.nextUrl.clone();
    destination.pathname = publicVariant.redirectPathname;
    return NextResponse.redirect(destination, 307);
  }

  const trustedGeo = readTrustedGeoCountry(
    request.headers,
    configuredGeoIpTrustMode(),
  );
  const sanitized = stripIncomingMiraHeaders(request.headers);
  sanitized.set(MIRA_CONTEXT_ATTESTATION_HEADER, MIRA_CONTEXT_ATTESTATION_VALUE);
  sanitized.set(MIRA_PATHNAME_HEADER, request.nextUrl.pathname);
  sanitized.set(MIRA_REQUEST_TARGET_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (trustedGeo) sanitized.set(MIRA_GEO_COUNTRY_HEADER, trustedGeo);
  if (publicVariant?.variant) {
    sanitized.set(MIRA_CONTEXT_SOURCE_HEADER, "EXPLICIT_URL");
    sanitized.set(MIRA_ROUTE_MARKET_HEADER, publicVariant.variant.marketCode);
    sanitized.set(MIRA_ROUTE_LOCALE_HEADER, publicVariant.variant.locale);
  } else {
    const transient = parseTransientStorefrontContext(request.nextUrl.searchParams);
    if (transient) {
      sanitized.set(MIRA_CONTEXT_SOURCE_HEADER, "TRANSIENT_PUBLIC");
      sanitized.set(MIRA_TRANSIENT_MARKET_HEADER, transient.marketCode);
      sanitized.set(MIRA_TRANSIENT_LOCALE_HEADER, transient.locale);
    }
  }
  return NextResponse.next({ request: { headers: sanitized } });
}

function publicVariantFromPathname(pathname: string): {
  variant?: { marketCode: "KR" | "US" | "JP"; locale: "ko" | "en" | "ja" };
  redirectPathname?: string;
} | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const resolution = resolveRouteSiteVariant(segments[0] ?? "", segments[1] ?? "");
  if (resolution.kind === "INVALID") return null;
  const suffix = segments.slice(2).join("/");
  if (resolution.kind === "FALLBACK") {
    return { redirectPathname: siteVariantPath(resolution.variant, suffix) };
  }
  if (!isCanonicalPublicVariantPrefix(segments[0] ?? "", segments[1] ?? "", resolution.variant)) {
    return { redirectPathname: siteVariantPath(resolution.variant, suffix) };
  }
  return { variant: resolution.variant };
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

async function enforceAdminBoundary(request: NextRequest): Promise<NextResponse | null> {
  const token = await getToken({ req: request });
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (!isAdminRole(token.role)) return NextResponse.redirect(new URL("/", request.url));
  return null;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
