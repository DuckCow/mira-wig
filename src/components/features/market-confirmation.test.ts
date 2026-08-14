import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketSwitchResult } from "@/app/actions/market";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";
import { messagesFor } from "@/lib/market/messages";
import type { Locale } from "@/lib/market/locale";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/market", () => ({
  confirmMarketSwitch: vi.fn(),
  previewMarketSwitch: vi.fn(),
}));

import { MarketConfirmationView } from "./MarketConfirmation";

type Preview = Extract<MarketSwitchResult, { kind: "PREVIEW" | "IMPACT_CHANGED" }>;

describe("truthful cart Market impact presentation", () => {
  it.each(["ko", "en", "ja"] as const)("renders confirmed JP → US truth in %s", (locale) => {
    const html = renderView("JP", "US", locale, preview("JP", "US", 9_800, 7_799));
    const text = visibleText(html);
    const messages = messagesFor(locale).marketConfirmation;

    expect(text).toContain(`${messages.currentCartMarketLabel}:`);
    expect(text).toContain("日本 (¥) · JPY");
    expect(text).toContain(`${messages.proposedTargetMarketLabel}:`);
    expect(text).toContain("United States ($) · USD");
    expect(text).toMatch(/JPY.*→.*USD/u);
    expect(text).toContain(formatPrice(9_800, MARKET_CONFIGS.JP.currency, locale));
    expect(text).toContain(formatPrice(7_799, MARKET_CONFIGS.US.currency, locale));
    expect(text).not.toContain("Delivery region for displayed prices: United States");
    expect(html).toContain(`aria-label="${messages.previewRegionLabel}"`);
  });

  it("renders the symmetric confirmed US → JP change", () => {
    const html = renderView("US", "JP", "en", preview("US", "JP", 7_799, 9_800));
    const text = visibleText(html);

    expect(text).toContain("United States ($) · USD");
    expect(text).toContain("日本 (¥) · JPY");
    expect(text).toMatch(/USD.*→.*JPY/u);
    expect(text).toContain("$77.99");
    expect(text).toContain("¥9,800");
  });

  it("renders quantity-adjusted current → target line subtotals from the impact facts", () => {
    const impact = preview("JP", "US", 9_800, 7_799, "PREVIEW", true, 2);
    const text = visibleText(renderView("JP", "US", "en", impact));

    expect(text).toContain("Quantity-adjusted line subtotal change");
    expect(text).toContain("Current: ¥19,600");
    expect(text).toContain("Proposed: $155.98");
  });

  it("renders a target-only proposal when no commerce Market is confirmed", () => {
    const html = renderView(null, "US", "en", preview(null, "US", null, 7_799));
    const text = visibleText(html);
    const messages = messagesFor("en").marketConfirmation;

    expect(text).toContain(messages.noConfirmedMarketPremise);
    expect(text).toContain(`${messages.proposedTargetMarketLabel}: United States ($) · USD`);
    expect(text).toMatch(new RegExp(`${messages.proposedCurrencyLabel}.*USD`, "u"));
    expect(text).toContain(`${messages.targetAmountLabel}: $77.99`);
    expect(text).not.toContain(messages.currentCartMarketLabel);
    expect(text).not.toContain("USD→");
  });

  it("uses the no-current-authority presentation for an inactive remembered Market", () => {
    const html = renderView(null, "JP", "ja", preview(null, "JP", null, 9_800));
    const text = visibleText(html);
    const messages = messagesFor("ja").marketConfirmation;

    expect(text).toContain(messages.noConfirmedMarketPremise);
    expect(text).toContain(`${messages.proposedTargetMarketLabel}: 日本 (¥) · JPY`);
    expect(text).not.toContain(messages.currentCartMarketLabel);
    expect(text).not.toContain("KRW");
  });

  it("keeps the current line visible and announces target unavailability", () => {
    const impact = preview("JP", "US", 9_800, null, "PREVIEW", false);
    const html = renderView("JP", "US", "en", impact);
    const text = visibleText(html);

    expect(text).toContain("Cart fixture × 1");
    expect(text).toContain("Current: ¥9,800");
    expect(text).toContain("Proposed: Unavailable in the proposed market");
    expect(html).toContain('role="status"');
  });

  it("associates a refreshed stale impact with the preview and confirmation", () => {
    const html = renderView("JP", "US", "en", preview("JP", "US", 9_800, 8_899, "IMPACT_CHANGED"));
    const text = visibleText(html);

    expect(text).toContain("Current cart price authority: 日本 (¥) · JPY");
    expect(text).toContain("Your cart changed. Review the refreshed impact before confirming.");
    expect(text).toContain("Proposed: $88.99");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-describedby="market-switch-stale-impact"');
  });

  it("does not render a false delta for an already confirmed target", () => {
    const html = renderView("JP", "JP", "ja", null);
    const text = visibleText(html);

    expect(text).toContain("現在のカート価格基準: 日本 (¥) · JPY");
    expect(text).not.toContain("→");
    expect(text).not.toContain(messagesFor("ja").marketConfirmation.proposedTargetMarketLabel);
  });
});

function renderView(
  currentMarketCode: MarketCode | null,
  targetMarketCode: MarketCode,
  locale: Locale,
  impactPreview: Preview | null,
): string {
  return renderToStaticMarkup(createElement(MarketConfirmationView, {
    currentMarketCode,
    targetMarketCode,
    locale,
    preview: impactPreview,
    isPending: false,
    onReview: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  }));
}

function preview(
  currentMarket: MarketCode | null,
  targetMarket: MarketCode,
  currentUnitAmount: number | null,
  targetUnitAmount: number | null,
  kind: Preview["kind"] = "PREVIEW",
  targetAvailable = true,
  quantity = 1,
): Preview {
  return {
    kind,
    locale: "en",
    impact: {
      currentMarket,
      targetMarket,
      currentCurrency: currentMarket ? MARKET_CONFIGS[currentMarket].currency.code : null,
      targetCurrency: MARKET_CONFIGS[targetMarket].currency.code,
      lines: [{
        cartItemId: "cart-item",
        variantId: "variant",
        styleName: "Cart fixture",
        quantity,
        currentUnitAmount,
        targetUnitAmount,
        targetAvailable,
        targetUnavailableCode: targetAvailable ? null : "STYLE_UNPUBLISHED",
        classification: targetAvailable ? (currentMarket ? "REPRICED" : "TARGET_PROJECTION") : "UNAVAILABLE",
      }],
      fingerprint: "server-fingerprint",
    },
  };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/gu, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'");
}
