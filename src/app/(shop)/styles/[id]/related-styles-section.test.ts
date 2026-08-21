import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CURRENCY_META } from "@/lib/market/types";

vi.mock("@/lib/storage", () => ({
  catalogStorage: { getViewUrl: vi.fn() },
}));
import {
  loadRelatedStylesForPdp,
  RelatedStylesSectionView,
  type RelatedStyleViewGroups,
} from "./RelatedStylesSection";

const EMPTY: RelatedStyleViewGroups = {
  SIMILAR_STYLE: [],
  COMPARE_WITH: [],
};

describe("related styles PDP section", () => {
  it("renders nothing for empty groups", () => {
    expect(renderToStaticMarkup(React.createElement(RelatedStylesSectionView, {
      groups: EMPTY,
      marketCode: "KR",
      currency: CURRENCY_META.KRW,
      locale: "ko",
    }))).toBe("");
  });

  it("groups purposes, hides empty groups, and links the exact target style", () => {
    const groups: RelatedStyleViewGroups = {
      SIMILAR_STYLE: [{
        id: "exact-target",
        name: "정확한 대상",
        category: "FASHION",
        tags: [],
        imageUrl: null,
        basePrice: 85000,
      }],
      COMPARE_WITH: [],
    };
    const html = renderToStaticMarkup(React.createElement(RelatedStylesSectionView, {
      groups,
      marketCode: "KR",
      currency: CURRENCY_META.KRW,
      locale: "ko",
    }));
    expect(html).toContain("비슷한 스타일");
    expect(html).not.toContain("함께 비교해 보세요");
    expect(html).toContain('href="/kr/ko/styles/exact-target"');
    expect(html).not.toContain("variant");
    expect(html).not.toContain("internalRationale");
  });

  it("keeps default-off pages empty and fails closed for invalid configuration", async () => {
    await expect(loadRelatedStylesForPdp("source", "KR", {})).resolves.toEqual({
      SIMILAR_STYLE: [],
      COMPARE_WITH: [],
    });
    await expect(loadRelatedStylesForPdp("source", "KR", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "invalid",
    })).resolves.toEqual({
      SIMILAR_STYLE: [],
      COMPARE_WITH: [],
    });
  });
});
