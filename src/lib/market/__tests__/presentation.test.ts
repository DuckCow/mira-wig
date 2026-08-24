import { describe, expect, it, vi } from "vitest";

vi.mock("../active-market", () => ({
  getActiveSiteVariants: vi.fn().mockResolvedValue([
    { marketCode: "KR", locale: "ko", hreflang: "ko-KR" },
    { marketCode: "KR", locale: "en", hreflang: "en-KR" },
    { marketCode: "US", locale: "en", hreflang: "en-US" },
    { marketCode: "US", locale: "ko", hreflang: "ko-US" },
    { marketCode: "JP", locale: "ja", hreflang: "ja-JP" },
    { marketCode: "JP", locale: "en", hreflang: "en-JP" },
  ]),
}));
import { selectPresentationAsset, type PresentationAsset } from "../presentation";
import { publicPageMetadata } from "../seo";
import { localizedVariantOptionLabel } from "../catalog-presentation";

const ASSETS: PresentationAsset[] = [
  { key: "exact-us-ko", marketCode: "US", locale: "ko", languageFree: false, neutralForLocale: false },
  { key: "neutral-ko", marketCode: null, locale: "ko", languageFree: false, neutralForLocale: true },
  { key: "wrong-ja", marketCode: null, locale: "ja", languageFree: false, neutralForLocale: true },
  { key: "global-photo", marketCode: null, locale: null, languageFree: true, neutralForLocale: false },
];

describe("site-variant presentation", () => {
  it("selects exact, then explicitly neutral same-locale, then language-free", () => {
    expect(selectPresentationAsset(ASSETS, { marketCode: "US", locale: "ko" })?.key).toBe("exact-us-ko");
    expect(selectPresentationAsset(ASSETS, { marketCode: "KR", locale: "ko" })?.key).toBe("neutral-ko");
    expect(selectPresentationAsset(ASSETS, { marketCode: "JP", locale: "en" })?.key).toBe("global-photo");
  });

  it("never selects a wrong-language asset", () => {
    const selected = selectPresentationAsset(
      ASSETS.filter((asset) => asset.key !== "global-photo"),
      { marketCode: "JP", locale: "en" },
    );
    expect(selected).toBeNull();
  });

  it("keeps the untranslated catalog canonical and crawlable noindex without alternates", async () => {
    const metadata = await publicPageMetadata({ marketCode: "US", locale: "ko" }, "STYLES");
    expect(metadata.alternates?.canonical).toBe("/us/ko/styles");
    expect(metadata.alternates?.languages).toBeUndefined();
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it.each([
    ["ko", "Natural Black / 미디 / 직모"],
    ["en", "Natural Black / Medium / Straight"],
    ["ja", "Natural Black / ミディアム / ストレート"],
  ] as const)("localizes cart and checkout option labels for %s without changing identity", (locale, expected) => {
    expect(localizedVariantOptionLabel("Natural Black", "medium", "straight", locale)).toBe(expected);
  });
});
