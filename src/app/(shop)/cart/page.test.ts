import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItemView } from "@/lib/cart";
import type { StorefrontContext } from "@/lib/market/resolve";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStorefrontContext: vi.fn(),
  getCart: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/market", () => ({ getStorefrontContext: mocks.getStorefrontContext }));
vi.mock("@/lib/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/storage", () => ({ catalogStorage: { getViewUrl: vi.fn() } }));
vi.mock("./CartItemActions", () => ({
  RemoveButton: ({ cartItemId }: { cartItemId: string }) => createElement("button", { "data-remove": cartItemId }),
  QuantityControl: ({ marketCode }: { marketCode: string }) => createElement("span", { "data-quantity-market": marketCode }),
}));
vi.mock("@/components/features/MarketConfirmation", () => ({
  MarketConfirmation: ({ currentMarketCode, targetMarketCode }: { currentMarketCode: string | null; targetMarketCode: string }) => (
    createElement("section", {
      "data-current-market": currentMarketCode ?? "NONE",
      "data-target-market": targetMarketCode,
    })
  ),
}));

import CartPage from "./page";

describe("cart page current-versus-target presentation seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "cart-user" }, expires: "2099-01-01" });
    mocks.getCart.mockResolvedValue([cartLine()]);
  });

  it("keeps confirmed JP as displayed commerce authority when transient target is US", async () => {
    mocks.getStorefrontContext.mockResolvedValue(context({
      marketCode: "US",
      confirmedMarketCode: "JP",
      locale: "ko",
    }));

    const html = renderToStaticMarkup(await CartPage());

    expect(mocks.getCart).toHaveBeenCalledWith("cart-user", "JP");
    expect(html).toContain('data-current-market="JP"');
    expect(html).toContain('data-target-market="US"');
    expect(html).toContain("JP¥9,800");
    expect(html).not.toContain("US$98.00");
    expect(html).toContain('href="/us/ko/styles/style"');
    expect(html).toContain('data-quantity-market="JP"');
    expect(html).toContain("miraMarket=JP");
  });

  it("labels a no-confirmed US projection without fabricating current price authority", async () => {
    mocks.getStorefrontContext.mockResolvedValue(context({
      marketCode: "US",
      confirmedMarketCode: null,
      locale: "en",
    }));
    mocks.getCart.mockResolvedValue([cartLine({ price: 7_799 })]);

    const html = renderToStaticMarkup(await CartPage());

    expect(mocks.getCart).toHaveBeenCalledWith("cart-user", "US");
    expect(html).toContain('data-current-market="NONE"');
    expect(html).toContain('data-target-market="US"');
    expect(html).toContain("Projected unit price for the selected market: $77.99");
    expect(html).toContain("Projected cart subtotal for the selected market");
    expect(html).toContain("these amounts are proposals");
    expect(html).toContain("Confirm the delivery region to continue");
    expect(html).not.toContain('href="/checkout');
  });

  it("treats an inactive remembered Market as no current authority", async () => {
    mocks.getStorefrontContext.mockResolvedValue(context({
      marketCode: "JP",
      confirmedMarketCode: null,
      locale: "ja",
      marketSource: "DEFAULT",
    }));

    const html = renderToStaticMarkup(await CartPage());

    expect(html).toContain('data-current-market="NONE"');
    expect(html).toContain('data-target-market="JP"');
    expect(html).toContain("選択したマーケットでの予想単価");
    expect(html).not.toContain('href="/checkout');
  });

  it("keeps an unavailable current line visible and blocks checkout", async () => {
    mocks.getStorefrontContext.mockResolvedValue(context({
      marketCode: "US",
      confirmedMarketCode: "JP",
      locale: "en",
    }));
    mocks.getCart.mockResolvedValue([cartLine({
      unavailableCode: "STYLE_UNPUBLISHED",
      unavailableMessage: "unavailable",
    })]);

    const html = renderToStaticMarkup(await CartPage());

    expect(html).toContain("Cart fixture");
    expect(html).toContain("This style is not sold in the current market.");
    expect(html).toContain("Checkout unavailable");
    expect(html).not.toContain('href="/checkout');
  });
});

function context(overrides: Partial<StorefrontContext>): StorefrontContext {
  return {
    marketCode: "JP",
    confirmedMarketCode: "JP",
    locale: "en",
    marketSource: "TRANSIENT_HANDOFF",
    localeSource: "TRANSIENT_HANDOFF",
    marketConfirmed: true,
    pathname: "/cart",
    requestTarget: "/cart?miraMarket=JP&miraLocale=en&miraContext=public",
    ...overrides,
  };
}

function cartLine(overrides: Partial<CartItemView> = {}): CartItemView {
  return {
    id: "cart-item",
    quantity: 1,
    variantId: "variant",
    color: "Black",
    colorHex: "#000000",
    length: "medium",
    curl: "straight",
    price: 9_800,
    stock: 5,
    styleId: "style",
    styleName: "Cart fixture",
    coverImageKey: null,
    unavailableCode: null,
    unavailableMessage: null,
    ...overrides,
  };
}
