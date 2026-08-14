import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type { MarketSwitchImpact } from "@/lib/cart";

const cookieSet = vi.hoisted(() => vi.fn());
const impact = vi.hoisted(() => vi.fn());
const admissionImpact = vi.hoisted(() => vi.fn());
const cartItemCount = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => Promise.resolve({ set: cookieSet })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/market/resolve", () => ({ getStorefrontContext: vi.fn() }));
vi.mock("@/lib/cart", () => ({
  getCartItemCount: cartItemCount,
  getMarketAdmissionImpact: admissionImpact,
  getMarketSwitchImpact: impact,
}));
vi.mock("@/lib/market/active-market", () => ({ isActiveMarket: vi.fn().mockResolvedValue(true) }));

import { getSession } from "@/lib/session";
import { getStorefrontContext } from "@/lib/market/resolve";
import {
  confirmMarketSwitch,
  previewMarketSwitch,
  setLocalePreference,
  confirmCurrentMarket,
} from "../market";

const session: Session = {
  user: { id: "switch-user", email: "switch@example.test", name: "Switch" },
  expires: "2099-01-01",
};

function marketImpact(lines: MarketSwitchImpact["lines"], fingerprint = "fingerprint"): MarketSwitchImpact {
  return {
    currentMarket: "KR",
    targetMarket: "US",
    currentCurrency: "KRW",
    targetCurrency: "USD",
    lines,
    fingerprint,
  };
}

describe("market and locale preference actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(session);
    vi.mocked(getStorefrontContext).mockResolvedValue({
      marketCode: "KR",
      confirmedMarketCode: "KR",
      locale: "ko",
      marketSource: "EXPLICIT_URL",
      localeSource: "EXPLICIT_URL",
      marketConfirmed: true,
      pathname: "/kr/ko/styles",
      requestTarget: "/kr/ko/styles",
    });
    cartItemCount.mockResolvedValue(1);
  });

  it("switches an empty authenticated cart immediately", async () => {
    impact.mockResolvedValue(marketImpact([]));

    await expect(previewMarketSwitch("US")).resolves.toEqual({ kind: "SWITCHED", marketCode: "US", locale: "ko" });
    expect(cookieSet).toHaveBeenCalledWith("mira-market", "US", expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
  });

  it("returns nonempty cart impact without writing a preference", async () => {
    impact.mockResolvedValue(marketImpact([
      { cartItemId: "item", variantId: "variant", styleName: "Style", quantity: 1, currentUnitAmount: 12_000, targetUnitAmount: 2_999, targetAvailable: true, targetUnavailableCode: null, classification: "REPRICED" },
    ]));

    await expect(previewMarketSwitch("US")).resolves.toMatchObject({ kind: "PREVIEW", impact: { targetMarket: "US" } });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("projects a target without fabricating a current Market when no confirmed authority exists", async () => {
    vi.mocked(getStorefrontContext).mockResolvedValue({
      marketCode: "US",
      confirmedMarketCode: null,
      locale: "en",
      marketSource: "TRANSIENT_HANDOFF",
      localeSource: "TRANSIENT_HANDOFF",
      marketConfirmed: false,
      pathname: "/cart",
      requestTarget: "/cart?market=US&locale=en",
    });
    admissionImpact.mockResolvedValue({
      currentMarket: null,
      targetMarket: "US",
      currentCurrency: null,
      targetCurrency: "USD",
      lines: [{ cartItemId: "item", variantId: "variant", styleName: "Style", quantity: 1, currentUnitAmount: null, targetUnitAmount: 2_999, targetAvailable: true, targetUnavailableCode: null, classification: "TARGET_PROJECTION" }],
      fingerprint: "admission",
    });

    await expect(previewMarketSwitch("US")).resolves.toMatchObject({
      kind: "PREVIEW",
      impact: { currentMarket: null, targetMarket: "US", currentCurrency: null },
    });
    expect(admissionImpact).toHaveBeenCalledWith("switch-user", "US");
    expect(impact).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("returns IMPACT_CHANGED and does not write when confirmation facts are stale", async () => {
    impact.mockResolvedValue(marketImpact([], "fresh"));

    await expect(confirmMarketSwitch("US", "stale")).resolves.toMatchObject({ kind: "IMPACT_CHANGED", impact: { fingerprint: "fresh" } });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("recomputes against a newer confirmed Market in a two-tab collision", async () => {
    impact
      .mockResolvedValueOnce(marketImpact([
        { cartItemId: "item", variantId: "variant", styleName: "Style", quantity: 1, currentUnitAmount: 12_000, targetUnitAmount: 2_999, targetAvailable: true, targetUnavailableCode: null, classification: "REPRICED" },
      ], "kr-preview"))
      .mockResolvedValueOnce({
        ...marketImpact([], "jp-recomputed"),
        currentMarket: "JP",
        currentCurrency: "JPY",
      });
    const preview = await previewMarketSwitch("US");
    if (preview.kind !== "PREVIEW") throw new Error("Expected a preview");
    vi.mocked(getStorefrontContext).mockResolvedValue({
      marketCode: "JP",
      confirmedMarketCode: "JP",
      locale: "en",
      marketSource: "EXPLICIT_COOKIE",
      localeSource: "EXPLICIT_COOKIE",
      marketConfirmed: true,
      pathname: "/cart",
      requestTarget: "/cart",
    });

    await expect(confirmMarketSwitch("US", preview.impact.fingerprint)).resolves.toMatchObject({
      kind: "IMPACT_CHANGED",
      impact: { currentMarket: "JP", fingerprint: "jp-recomputed" },
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("writes the market only after exact recomputation matches", async () => {
    impact.mockResolvedValue(marketImpact([], "exact"));

    await expect(confirmMarketSwitch("US", "exact")).resolves.toEqual({ kind: "SWITCHED", marketCode: "US", locale: "ko" });
    expect(cookieSet).toHaveBeenCalledWith("mira-market", "US", expect.any(Object));
  });

  it("locale switching writes only the locale cookie and never computes commerce impact", async () => {
    await expect(setLocalePreference("en")).resolves.toBe(true);

    expect(cookieSet).toHaveBeenCalledWith("mira-locale", "en", expect.any(Object));
    expect(cookieSet).not.toHaveBeenCalledWith("mira-market", expect.anything(), expect.anything());
    expect(impact).not.toHaveBeenCalled();
  });

  it("does not let direct confirmation bypass a nonempty cart switch", async () => {
    await expect(confirmCurrentMarket("US")).resolves.toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("allows direct active-Market confirmation for an empty cart", async () => {
    cartItemCount.mockResolvedValue(0);

    await expect(confirmCurrentMarket("US")).resolves.toBe(true);
    expect(cookieSet).toHaveBeenCalledWith("mira-market", "US", expect.any(Object));
  });

  it("treats the already confirmed Market as a safe nonempty-cart no-op", async () => {
    await expect(confirmCurrentMarket("KR")).resolves.toBe(true);
    expect(cartItemCount).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
