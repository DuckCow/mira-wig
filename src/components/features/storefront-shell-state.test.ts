import { describe, expect, it } from "vitest";
import { storefrontShellPresentation, syncDocumentLocale } from "./storefront-shell-state";

describe("navigation-reactive storefront shell state", () => {
  const fallback = { marketCode: "KR", locale: "ko" } as const;

  it.each([
    ["/kr/ko/styles", "", true, "KR", "ko"],
    ["/kr/en/styles", "", true, "KR", "en"],
    ["/jp/en/styles", "", true, "JP", "en"],
  ])("derives public navigation %s", (pathname, search, visible, marketCode, locale) => {
    expect(storefrontShellPresentation(pathname, search, fallback)).toMatchObject({
      headerVisible: visible,
      variant: { marketCode, locale },
      locale,
    });
  });

  it("hides the Header and uses neutral English on /global", () => {
    expect(storefrontShellPresentation("/global", "", fallback)).toEqual({
      headerVisible: false,
      variant: null,
      locale: "en",
    });
  });

  it("uses validated transient presentation on a private route", () => {
    const search = "miraMarket=JP&miraLocale=en&miraContext=public";
    expect(storefrontShellPresentation("/cart", search, fallback)).toMatchObject({
      headerVisible: true,
      variant: { marketCode: "JP", locale: "en" },
      locale: "en",
    });
  });

  it("preserves the locale-only fallback when no active storefront exists", () => {
    expect(storefrontShellPresentation("/login", "", null, "ja")).toEqual({
      headerVisible: false,
      variant: null,
      locale: "ja",
    });
  });

  it("updates document language after navigation", () => {
    const root = { lang: "ko" };
    syncDocumentLocale(root, "en");
    expect(root.lang).toBe("en");
    syncDocumentLocale(root, "ja");
    expect(root.lang).toBe("ja");
  });
});
