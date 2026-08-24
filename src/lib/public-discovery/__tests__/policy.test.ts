import { describe, expect, it } from "vitest";
import {
  PRIVATE_HTML_ROUTE_PATTERNS,
  PUBLIC_SEARCH_INDEXING_ENABLED,
  PublicDiscoveryConfigError,
  PublicPageClass,
  canonicalPublicOrigin,
  isPublicSearchIndexingEnabled,
  robotsForPageClass,
} from "../policy";

describe("public search indexing activation", () => {
  it.each([undefined, "", " \t\n "])("keeps indexing off for %j", (value) => {
    expect(isPublicSearchIndexingEnabled({ [PUBLIC_SEARCH_INDEXING_ENABLED]: value })).toBe(false);
  });

  it("accepts only trimmed exact ENABLED", () => {
    expect(isPublicSearchIndexingEnabled({
      [PUBLIC_SEARCH_INDEXING_ENABLED]: "  ENABLED \n",
    })).toBe(true);
  });

  it.each(["enabled", "true", "DISABLED", "ENABLED=true"])(
    "fails closed for malformed nonblank value %s",
    (value) => {
      expect(() => isPublicSearchIndexingEnabled({
        [PUBLIC_SEARCH_INDEXING_ENABLED]: value,
      })).toThrow(PublicDiscoveryConfigError);
    },
  );
});

describe("canonical public origin admission", () => {
  it("requires an admitted external HTTPS root origin while indexing is on", () => {
    expect(canonicalPublicOrigin(enabledEnv("https://www.mira.example.com"))).toEqual(
      new URL("https://www.mira.example.com/"),
    );
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "http://www.mira.example.com",
    "https://localhost",
    "https://localhost.",
    "https://foo.localhost.",
    "https://dev.local.",
    "https://dev.internal.",
    "https://example.com.",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://[::1]",
    "https://user:password@www.mira.example.com",
    "https://www.mira.example.com/path",
    "https://www.mira.example.com/?query=1",
    "https://www.mira.example.com/#fragment",
  ])("rejects non-public canonical origin %j while indexing is on", (origin) => {
    expect(() => canonicalPublicOrigin(enabledEnv(origin))).toThrow(PublicDiscoveryConfigError);
  });

  it("retains the local development fallback while indexing is off", () => {
    expect(canonicalPublicOrigin({})).toEqual(new URL("http://localhost:3000/"));
    expect(canonicalPublicOrigin({ NEXTAUTH_URL: "  " })).toEqual(
      new URL("http://localhost:3000/"),
    );
  });
});

describe("page-class indexing policy", () => {
  it("indexes global and storefront home only at their explicit activation boundary", () => {
    expect(robotsForPageClass(PublicPageClass.GLOBAL_SELECTOR, {
      indexingEnabled: true,
      activeSiteVariantCount: 1,
    })).toEqual({ index: true, follow: true });
    expect(robotsForPageClass(PublicPageClass.STOREFRONT_HOME, {
      indexingEnabled: true,
      activeSiteVariantCount: 0,
    })).toEqual({ index: true, follow: true });
    expect(robotsForPageClass(PublicPageClass.GLOBAL_SELECTOR, {
      indexingEnabled: true,
      activeSiteVariantCount: 0,
    })).toEqual({ index: false, follow: true });
    expect(robotsForPageClass(PublicPageClass.STOREFRONT_HOME, {
      indexingEnabled: false,
      activeSiteVariantCount: 6,
    })).toEqual({ index: false, follow: true });
  });

  it("keeps catalog crawlable/noindex and private routes noindex/nofollow", () => {
    for (const pageClass of [PublicPageClass.CATALOG_LIST, PublicPageClass.CATALOG_DETAIL]) {
      expect(robotsForPageClass(pageClass, {
        indexingEnabled: true,
        activeSiteVariantCount: 6,
      })).toEqual({ index: false, follow: true });
    }
    expect(robotsForPageClass(PublicPageClass.TRANSACTIONAL_OR_PRIVATE, {
      indexingEnabled: true,
      activeSiteVariantCount: 6,
    })).toEqual({ index: false, follow: false });
  });

  it("classifies only current private and transactional HTML route families", () => {
    expect(PRIVATE_HTML_ROUTE_PATTERNS).toEqual([
      "/admin/:path*",
      "/cart",
      "/checkout/:path*",
      "/orders/:path*",
      "/fitting/:path*",
      "/login",
    ]);
    expect(PRIVATE_HTML_ROUTE_PATTERNS).not.toContain("/global");
    expect(PRIVATE_HTML_ROUTE_PATTERNS).not.toContain("/:market/:locale/styles/:path*");
  });
});

function enabledEnv(nextAuthUrl: string | undefined): Readonly<Record<string, string | undefined>> {
  return {
    [PUBLIC_SEARCH_INDEXING_ENABLED]: "ENABLED",
    NEXTAUTH_URL: nextAuthUrl,
  };
}
