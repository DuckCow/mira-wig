import { isIP } from "node:net";

export const PUBLIC_SEARCH_INDEXING_ENABLED = "PUBLIC_SEARCH_INDEXING_ENABLED";

export const PublicPageClass = {
  GLOBAL_SELECTOR: "GLOBAL_SELECTOR",
  STOREFRONT_HOME: "STOREFRONT_HOME",
  CATALOG_LIST: "CATALOG_LIST",
  CATALOG_DETAIL: "CATALOG_DETAIL",
  TRANSACTIONAL_OR_PRIVATE: "TRANSACTIONAL_OR_PRIVATE",
} as const;

export type PublicPageClass = (typeof PublicPageClass)[keyof typeof PublicPageClass];
export type PublicDiscoveryEnv = Readonly<Record<string, string | undefined>>;

export const PRIVATE_HTML_ROUTE_PATTERNS = [
  "/admin/:path*",
  "/cart",
  "/checkout/:path*",
  "/orders/:path*",
  "/fitting/:path*",
  "/login",
] as const;

export const PRIVATE_X_ROBOTS_TAG = "noindex, nofollow";

const LOCAL_DEVELOPMENT_ORIGIN = "http://localhost:3000";

export class PublicDiscoveryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicDiscoveryConfigError";
  }
}

export function isPublicSearchIndexingEnabled(
  env: PublicDiscoveryEnv = process.env,
): boolean {
  const value = env[PUBLIC_SEARCH_INDEXING_ENABLED]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new PublicDiscoveryConfigError(
    `${PUBLIC_SEARCH_INDEXING_ENABLED} must be blank or the exact value ENABLED.`,
  );
}

export function canonicalPublicOrigin(
  env: PublicDiscoveryEnv = process.env,
): URL {
  const indexingEnabled = isPublicSearchIndexingEnabled(env);
  const configured = env.NEXTAUTH_URL?.trim();
  if (!indexingEnabled) return new URL(configured || LOCAL_DEVELOPMENT_ORIGIN);
  if (!configured) {
    throw new PublicDiscoveryConfigError(
      "NEXTAUTH_URL is required while public search indexing is enabled.",
    );
  }

  const origin = parseAbsoluteUrl(configured);
  if (!isAdmittedPublicOrigin(origin)) {
    throw new PublicDiscoveryConfigError(
      "NEXTAUTH_URL must be an external HTTPS root origin without credentials, query, or fragment while public search indexing is enabled.",
    );
  }
  return origin;
}

function isAdmittedPublicOrigin(origin: URL): boolean {
  return [
    origin.protocol === "https:",
    origin.username.length === 0,
    origin.password.length === 0,
    origin.pathname === "/",
    origin.search.length === 0,
    origin.hash.length === 0,
    !isLocalOrPrivateHostname(origin.hostname),
  ].every(Boolean);
}

export function robotsForPageClass(
  pageClass: PublicPageClass,
  context: Readonly<{
    indexingEnabled: boolean;
    activeSiteVariantCount: number;
  }>,
): Readonly<{ index: boolean; follow: boolean }> {
  if (pageClass === PublicPageClass.TRANSACTIONAL_OR_PRIVATE) {
    return { index: false, follow: false };
  }
  if (pageClass === PublicPageClass.CATALOG_LIST || pageClass === PublicPageClass.CATALOG_DETAIL) {
    return { index: false, follow: true };
  }
  if (pageClass === PublicPageClass.GLOBAL_SELECTOR) {
    return {
      index: context.indexingEnabled && context.activeSiteVariantCount > 0,
      follow: true,
    };
  }
  return { index: context.indexingEnabled, follow: true };
}

function parseAbsoluteUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new PublicDiscoveryConfigError(
      "NEXTAUTH_URL must be an absolute URL while public search indexing is enabled.",
    );
  }
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    normalized.endsWith(".")
    || normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
    || !normalized.includes(".")
  ) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);
  return false;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return [
    first === 0,
    first === 10,
    first === 127,
    first === 169 && second === 254,
    first === 172 && second >= 16 && second <= 31,
    first === 192 && second === 168,
  ].some(Boolean);
}

function isPrivateIpv6(hostname: string): boolean {
  if (hostname === "::" || hostname === "::1") return true;
  if (/^(?:fc|fd)/u.test(hostname) || /^fe[89ab]/u.test(hostname)) return true;
  if (!hostname.startsWith("::ffff:")) return false;
  const mappedIpv4 = hostname.slice("::ffff:".length);
  return isIP(mappedIpv4) === 4 && isPrivateIpv4(mappedIpv4);
}
