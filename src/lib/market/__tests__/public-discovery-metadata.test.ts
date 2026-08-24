import { describe, expect, it } from "vitest";
import { PublicPageClass } from "@/lib/public-discovery/policy";
import {
  globalSelectorMetadata,
  storefrontMetadata,
} from "../seo";
import {
  ENABLED_SITE_VARIANTS,
  hreflangForSiteVariant,
  type SearchTargetSiteVariant,
} from "../site-variant";

const INDEXING_ON = {
  PUBLIC_SEARCH_INDEXING_ENABLED: "ENABLED",
  NEXTAUTH_URL: "https://www.mira.example.com",
} as const;

describe("explicit SiteVariant hreflang authority", () => {
  it("installs the exact six explicit mappings without duplicates", () => {
    expect(ENABLED_SITE_VARIANTS).toEqual([
      { marketCode: "KR", locale: "ko", hreflang: "ko-KR" },
      { marketCode: "KR", locale: "en", hreflang: "en-KR" },
      { marketCode: "US", locale: "en", hreflang: "en-US" },
      { marketCode: "US", locale: "ko", hreflang: "ko-US" },
      { marketCode: "JP", locale: "ja", hreflang: "ja-JP" },
      { marketCode: "JP", locale: "en", hreflang: "en-JP" },
    ]);
    expect(new Set(ENABLED_SITE_VARIANTS.map(hreflangForSiteVariant)).size).toBe(
      ENABLED_SITE_VARIANTS.length,
    );
  });

  it("does not derive hreflang from a CommerceMarket code", () => {
    const explicitlyTargeted: SearchTargetSiteVariant = {
      marketCode: "KR",
      locale: "en",
      hreflang: "en-US",
    };
    expect(hreflangForSiteVariant(explicitlyTargeted)).toBe("en-US");
  });
});

describe("public page metadata policy", () => {
  it("emits self-inclusive reciprocal explicit alternates for an indexable home", () => {
    const metadata = storefrontMetadata({
      variant: ENABLED_SITE_VARIANTS[2],
      suffix: "",
      title: "US home",
      description: "US storefront",
      pageClass: PublicPageClass.STOREFRONT_HOME,
      alternateVariants: ENABLED_SITE_VARIANTS,
      env: INDEXING_ON,
    });

    expect(metadata.alternates).toEqual({
      canonical: "/us/en",
      languages: {
        "ko-KR": "/kr/ko",
        "en-KR": "/kr/en",
        "en-US": "/us/en",
        "ko-US": "/us/ko",
        "ja-JP": "/jp/ja",
        "en-JP": "/jp/en",
        "x-default": "/global",
      },
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("keeps home canonical but removes alternates and indexing while the gate is off", () => {
    const metadata = storefrontMetadata({
      variant: ENABLED_SITE_VARIANTS[2],
      suffix: "",
      title: "US home",
      description: "US storefront",
      pageClass: PublicPageClass.STOREFRONT_HOME,
      alternateVariants: ENABLED_SITE_VARIANTS,
      env: {},
    });

    expect(metadata.alternates).toEqual({ canonical: "/us/en" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it.each([
    [PublicPageClass.CATALOG_LIST, "/styles"],
    [PublicPageClass.CATALOG_DETAIL, "/styles/style-a"],
  ] as const)("keeps %s noindex without false localized equivalence", (pageClass, suffix) => {
    const metadata = storefrontMetadata({
      variant: ENABLED_SITE_VARIANTS[2],
      suffix,
      title: "Demo catalog",
      description: "Unlocalized demo catalog",
      pageClass,
      alternateVariants: ENABLED_SITE_VARIANTS,
      env: INDEXING_ON,
    });

    expect(metadata.alternates).toEqual({ canonical: `/us/en${suffix}` });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("indexes global only with activation and an available SiteVariant", () => {
    expect(globalSelectorMetadata(1, INDEXING_ON).robots).toEqual({ index: true, follow: true });
    expect(globalSelectorMetadata(0, INDEXING_ON).robots).toEqual({ index: false, follow: true });
    expect(globalSelectorMetadata(6, {}).robots).toEqual({ index: false, follow: true });
    expect(globalSelectorMetadata(1, INDEXING_ON).alternates).toEqual({ canonical: "/global" });
  });
});
