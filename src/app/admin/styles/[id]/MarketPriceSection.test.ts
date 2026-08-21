import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CURRENCY_META } from "@/lib/market/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/app/actions/admin/market-price", () => ({ setVariantPricesAction: vi.fn() }));

import { MarketPriceSection } from "./MarketPriceSection";

describe("admin Market price currency presentation", () => {
  it("shows current DB Market currency beside the unchanged minor-unit price list", () => {
    const html = renderToStaticMarkup(createElement(MarketPriceSection, {
      variantPrices: [{ id: "variant", sku: "SKU-1", prices: [{ marketCode: "US", amount: 7_799 }] }],
      marketPriceContexts: [
        { marketCode: "KR", isActive: true, currency: CURRENCY_META.KRW },
        { marketCode: "US", isActive: true, currency: CURRENCY_META.JPY },
        { marketCode: "JP", isActive: true, currency: CURRENCY_META.JPY },
      ],
    }));

    expect(html).toContain("¥ JPY");
    expect(html).toContain('aria-label="SKU-1 JPY 가격"');
    expect(html).toContain('value="7799"');
    expect(html).not.toContain('aria-label="SKU-1 USD 가격"');
  });
});
