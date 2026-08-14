import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MarketSelector", () => ({
  MarketSelector: ({ currentMarket, currentLocale }: { currentMarket: string; currentLocale: string }) => (
    createElement("span", { "data-selector": `${currentMarket}:${currentLocale}` })
  ),
}));
vi.mock("./SignOutButton", () => ({
  SignOutButton: ({ label }: { label: string }) => createElement("button", null, label),
}));

import { Header } from "./Header";

describe("localized Header presentation", () => {
  it.each([
    ["KR", "ko", "홈", "지역 및 언어", "로그인"],
    ["US", "en", "Home", "Region and language", "Sign in"],
    ["JP", "ja", "ホーム", "地域と言語", "ログイン"],
  ] as const)("renders %s/%s links, labels, and selector state", (marketCode, locale, home, navigation, login) => {
    const html = renderToStaticMarkup(createElement(Header, {
      user: null,
      cartItemCount: 0,
      variant: { marketCode, locale },
      requestTarget: `/${marketCode.toLowerCase()}/${locale}/styles`,
      activeMarketCodes: ["KR", "US", "JP"],
    }));

    expect(html).toContain(`aria-label="${home}"`);
    expect(html).toContain(`aria-label="${navigation}"`);
    expect(html).toContain(`data-selector="${marketCode}:${locale}"`);
    expect(html).toContain(login);
  });

  it("preserves localized session and cart-count behavior", () => {
    const html = renderToStaticMarkup(createElement(Header, {
      user: { id: "user-1", name: null, image: null },
      cartItemCount: 12,
      variant: { marketCode: "JP", locale: "en" },
      requestTarget: "/cart",
      activeMarketCodes: ["JP"],
    }));

    expect(html).toContain("Orders");
    expect(html).toContain('aria-label="Cart (12)"');
    expect(html).toContain("9+");
    expect(html).toContain("Customer");
    expect(html).toContain("Sign out");
  });
});
