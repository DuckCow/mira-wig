import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../../next.config";
import { buildRobotsPolicy } from "./robots";
import { buildPublicSitemap } from "./sitemap";
import { ENABLED_SITE_VARIANTS } from "@/lib/market/site-variant";

const INDEXING_ON = {
  PUBLIC_SEARCH_INDEXING_ENABLED: "ENABLED",
  NEXTAUTH_URL: "https://www.mira.example.com",
} as const;

describe("public discovery sitemap", () => {
  it("returns no URLs while indexing is off", () => {
    expect(buildPublicSitemap(ENABLED_SITE_VARIANTS, {})).toEqual([]);
  });

  it("contains only global and active homes in deterministic fully-qualified order", () => {
    const entries = buildPublicSitemap([
      ENABLED_SITE_VARIANTS[0],
      ENABLED_SITE_VARIANTS[1],
      ENABLED_SITE_VARIANTS[4],
      ENABLED_SITE_VARIANTS[5],
    ], INDEXING_ON);

    expect(entries).toEqual([
      { url: "https://www.mira.example.com/global" },
      { url: "https://www.mira.example.com/kr/ko" },
      { url: "https://www.mira.example.com/kr/en" },
      { url: "https://www.mira.example.com/jp/ja" },
      { url: "https://www.mira.example.com/jp/en" },
    ]);
    expect(JSON.stringify(entries)).not.toMatch(
      /styles|cart|checkout|orders|fitting|admin|lastModified|changeFrequency|priority|\?/u,
    );
  });

  it("advertises nothing when no active SiteVariant exists", () => {
    expect(buildPublicSitemap([], INDEXING_ON)).toEqual([]);
  });
});

describe("crawler policy", () => {
  it("allows public crawl, preserves private exclusions for OAI-SearchBot, and blocks GPTBot", () => {
    expect(buildRobotsPolicy(INDEXING_ON)).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/admin", "/api", "/cart", "/checkout", "/orders", "/fitting", "/login"],
        },
        {
          userAgent: "OAI-SearchBot",
          allow: "/",
          disallow: ["/admin", "/api", "/cart", "/checkout", "/orders", "/fitting", "/login"],
        },
        { userAgent: "GPTBot", disallow: "/" },
      ],
      sitemap: "https://www.mira.example.com/sitemap.xml",
    });
  });

  it("does not guess a Google-Extended rule or block all ordinary crawlers", () => {
    const serialized = JSON.stringify(buildRobotsPolicy({}));
    expect(serialized).not.toContain("Google-Extended");
    expect(serialized).not.toContain('"userAgent":"*","disallow":"/"');
  });
});

describe("transactional and private X-Robots protection", () => {
  it.each([
    "/admin",
    "/admin/orders/1",
    "/cart",
    "/checkout",
    "/checkout/return/session",
    "/orders",
    "/orders/1",
    "/fitting/result",
    "/login",
  ])("emits noindex, nofollow for %s", async (pathname) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://www.mira.example.com${pathname}`,
      nextConfig,
    });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each(["/global", "/us/en", "/us/en/styles", "/us/en/styles/style-a"])(
    "does not classify public page %s as private",
    async (pathname) => {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://www.mira.example.com${pathname}`,
        nextConfig,
      });
      expect(response.headers.get("x-robots-tag")).toBeNull();
    },
  );
});

describe("public discovery route non-regression", () => {
  it("preserves the root html language from the current Locale authority", () => {
    const rootLayout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(rootLayout).toContain("lang={initialLocale}");
  });
});
