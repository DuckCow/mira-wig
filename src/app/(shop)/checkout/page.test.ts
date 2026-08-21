import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENCY_META } from "@/lib/market/types";
import type { CartItemView } from "@/lib/cart";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStorefrontContext: vi.fn(),
  getCart: vi.fn(),
  getActiveMarketCommercialFacts: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    createElement("a", { href, ...props }, children)
  ),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/market", () => ({ getStorefrontContext: mocks.getStorefrontContext }));
vi.mock("@/lib/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/market/active-market", () => ({
  getActiveMarketCommercialFacts: mocks.getActiveMarketCommercialFacts,
}));
vi.mock("@/lib/payment/mode", () => ({ configuredPaymentMode: () => "SANDBOX" }));
vi.mock("./CheckoutForm", () => ({
  CheckoutForm: (props: {
    marketLabel: string;
    currency: { code: string };
    shippingCountry: string;
  }) => createElement("section", {
    "data-market-label": props.marketLabel,
    "data-currency": props.currency.code,
    "data-shipping-country": props.shippingCountry,
  }),
}));

import CheckoutPage, { checkoutCountry } from "./page";

describe("checkout current Market commercial facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "checkout-user" }, expires: "2099-01-01" });
    mocks.getStorefrontContext.mockResolvedValue({
      marketCode: "US",
      confirmedMarketCode: "US",
      locale: "en",
      marketSource: "EXPLICIT_COOKIE",
      localeSource: "EXPLICIT_COOKIE",
      marketConfirmed: true,
      pathname: "/checkout",
      requestTarget: "/checkout",
    });
    mocks.getCart.mockResolvedValue([cartLine()]);
  });

  it("renders DB currency and DB-authorized shipping country even when they drift from former static values", async () => {
    mocks.getActiveMarketCommercialFacts.mockResolvedValue({
      code: "US",
      isActive: true,
      currency: CURRENCY_META.JPY,
      shippableCountries: ["JP"],
    });

    const html = renderToStaticMarkup(await CheckoutPage());

    expect(html).toContain("¥7,799");
    expect(html).not.toContain("$77.99");
    expect(html).toContain('data-market-label="United States"');
    expect(html).toContain('data-currency="JPY"');
    expect(html).toContain('data-shipping-country="JP"');
  });

  it("fails closed for an empty, multi-country, or unsupported checkout rendering policy", () => {
    expect(() => checkoutCountry("US", [])).toThrow("exactly one shipping country");
    expect(() => checkoutCountry("US", ["US", "JP"])).toThrow("exactly one shipping country");
    expect(() => checkoutCountry("US", ["CA"])).toThrow("Unsupported checkout shipping country");
  });
});

function cartLine(): CartItemView {
  return {
    id: "cart-item",
    quantity: 1,
    variantId: "variant",
    color: "Black",
    colorHex: "#000000",
    length: "medium",
    curl: "straight",
    price: 7_799,
    stock: 5,
    styleId: "style",
    styleName: "Checkout fixture",
    coverImageKey: null,
    unavailableCode: null,
    unavailableMessage: null,
  };
}
