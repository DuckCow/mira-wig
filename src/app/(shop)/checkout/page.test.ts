import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutSessionStatus, FulfillmentType, ShippingCountry } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENCY_META } from "@/lib/market/types";
import type { CartItemView } from "@/lib/cart";
import type { CheckoutSessionResumeResult } from "@/lib/payment/session/types";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStorefrontContext: vi.fn(),
  getCart: vi.fn(),
  getActiveMarketCommercialFacts: vi.fn(),
  readCheckoutSessionResume: vi.fn(),
  paymentMode: "SANDBOX",
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    createElement("a", { href, ...props }, children)
  ),
}));
vi.mock("@/lib/db", () => ({ db: { kind: "unit-test-client" } }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/market", () => ({ getStorefrontContext: mocks.getStorefrontContext }));
vi.mock("@/lib/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/market/active-market", () => ({
  getActiveMarketCommercialFacts: mocks.getActiveMarketCommercialFacts,
}));
vi.mock("@/lib/payment/session", () => ({ readCheckoutSessionResume: mocks.readCheckoutSessionResume }));
vi.mock("@/lib/payment/mode", () => ({ configuredPaymentMode: () => mocks.paymentMode }));
vi.mock("./CheckoutForm", () => ({
  CheckoutForm: (props: { marketLabel: string; currency: { code: string }; shippingCountry: string }) => (
    createElement("section", {
      "data-mode": "creation",
      "data-market-label": props.marketLabel,
      "data-currency": props.currency.code,
      "data-shipping-country": props.shippingCountry,
    })
  ),
}));
vi.mock("./CheckoutSessionResume", () => ({
  CheckoutSessionResume: (props: {
    session: CheckoutSessionResumeResult;
    eximbayCardEnabled: boolean;
  }) => createElement("section", {
    "data-mode": "resume",
    "data-session-id": props.session.sessionId,
    "data-total": String(props.session.totalAmount),
    "data-currency": props.session.currency,
    "data-disposition": props.session.disposition,
    "data-eximbay-card-enabled": String(props.eximbayCardEnabled),
  }),
  CheckoutSessionUnavailable: () => createElement("section", { "data-mode": "unavailable" }),
}));

import CheckoutPage, { checkoutCountry } from "./page";

const ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED = process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;

describe("checkout creation and durable resume modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "checkout-user" }, expires: "2099-01-01" });
    mocks.getStorefrontContext.mockResolvedValue(storefrontContext());
    mocks.getCart.mockResolvedValue([cartLine()]);
    mocks.getActiveMarketCommercialFacts.mockResolvedValue({
      code: "US",
      isActive: true,
      currency: CURRENCY_META.USD,
      shippableCountries: ["US"],
    });
    mocks.readCheckoutSessionResume.mockResolvedValue(resumeSession());
    mocks.paymentMode = "SANDBOX";
    delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
  });

  afterEach(() => {
    if (ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED === undefined) {
      delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
    } else {
      process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED = ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
    }
  });

  it("keeps current Cart and current Market authority in creation mode", async () => {
    mocks.getActiveMarketCommercialFacts.mockResolvedValue({
      code: "US",
      isActive: true,
      currency: CURRENCY_META.JPY,
      shippableCountries: ["JP"],
    });

    const html = renderToStaticMarkup(await CheckoutPage());

    expect(html).toContain("¥7,799");
    expect(html).toContain('data-mode="creation"');
    expect(html).toContain('data-currency="JPY"');
    expect(html).toContain('data-shipping-country="JP"');
    expect(mocks.readCheckoutSessionResume).not.toHaveBeenCalled();
  });

  it("fails closed for an empty, multi-country, or unsupported creation policy", () => {
    expect(() => checkoutCountry("US", [])).toThrow("exactly one shipping country");
    expect(() => checkoutCountry("US", ["US", "JP"])).toThrow("exactly one shipping country");
    expect(() => checkoutCountry("US", ["CA"])).toThrow("Unsupported checkout shipping country");
  });

  it("rehydrates the exact explicit session before current-cart gates", async () => {
    mocks.getCart.mockResolvedValue([]);

    const html = await renderResumePage();

    expect(html).toContain('data-session-id="resume-session"');
    expect(html).toContain('data-total="4999"');
    expect(html).toContain('data-currency="USD"');
    expect(mocks.readCheckoutSessionResume).toHaveBeenCalledWith(
      expect.anything(),
      { checkoutSessionId: "resume-session", authenticatedUserId: "checkout-user" },
    );
    expect(mocks.getCart).not.toHaveBeenCalled();
    expect(mocks.getActiveMarketCommercialFacts).not.toHaveBeenCalled();
  });

  it("uses the same unavailable presentation for nonexistent and non-owned sessions", async () => {
    mocks.readCheckoutSessionResume.mockResolvedValue(null);

    const html = await renderResumePage();

    expect(html).toContain('data-mode="unavailable"');
    expect(html).not.toContain("4999");
    expect(mocks.getCart).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT_EXISTS", "EXPIRED", "COMPLETED", "TERMINAL", "MARKET_UNAVAILABLE"] as const)(
    "keeps payment activation unavailable for %s resume disposition",
    async (disposition) => {
      process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED = "ENABLED";
      mocks.readCheckoutSessionResume.mockResolvedValue(resumeSession({ disposition }));

      const html = await renderResumePage();

      expect(html).toContain(`data-disposition="${disposition}"`);
      expect(html).toContain('data-eximbay-card-enabled="false"');
    },
  );

  it("covers the R10D OFF-create to ON-restart presentation reconstruction without a provider call", async () => {
    delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
    const beforeRestart = await renderResumePage();
    process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED = "ENABLED";
    const afterRestart = await renderResumePage();

    expect(beforeRestart).toContain('data-session-id="resume-session"');
    expect(beforeRestart).toContain('data-eximbay-card-enabled="false"');
    expect(afterRestart).toContain('data-session-id="resume-session"');
    expect(afterRestart).toContain('data-total="4999"');
    expect(afterRestart).toContain('data-eximbay-card-enabled="true"');
    expect(mocks.readCheckoutSessionResume).toHaveBeenCalledTimes(2);
    expect(mocks.getCart).not.toHaveBeenCalled();
  });
});

async function renderResumePage(): Promise<string> {
  const page = await CheckoutPage({
    searchParams: Promise.resolve({ checkoutSessionId: "resume-session" }),
  });
  return renderToStaticMarkup(page);
}

function storefrontContext() {
  return {
    marketCode: "US",
    confirmedMarketCode: "US",
    locale: "en",
    marketSource: "EXPLICIT_COOKIE",
    localeSource: "EXPLICIT_COOKIE",
    marketConfirmed: true,
    pathname: "/checkout",
    requestTarget: "/checkout",
  };
}

function resumeSession(
  overrides: Partial<CheckoutSessionResumeResult> = {},
): CheckoutSessionResumeResult {
  return {
    sessionId: "resume-session",
    marketCode: "US",
    currency: "USD",
    status: CheckoutSessionStatus.SUBMITTED,
    submittedAt: new Date("2026-08-23T00:00:00.000Z"),
    expiresAt: new Date("2026-08-23T00:30:00.000Z"),
    subtotalAmount: 4_999,
    discountAmount: 0,
    shippingAmount: 0,
    totalAmount: 4_999,
    lines: [{
      id: "resume-line",
      quantity: 1,
      unitAmount: 4_999,
      discountAmount: 0,
      fulfillmentType: FulfillmentType.MTO,
      snapshot: {
        styleName: "Frozen style",
        color: "Black",
        colorHex: "#000000",
        length: "Medium",
        curl: "Straight",
        coverImageKey: null,
        currencyCode: "USD",
      },
    }],
    shipping: {
      recipientName: "Resume Customer",
      phone: "+1-555-0100",
      country: ShippingCountry.US,
      postalCode: "10001",
      administrativeArea: "NY",
      city: "New York",
      addressLine1: "1 Frozen Street",
      addressLine2: null,
      memo: null,
    },
    disposition: "PAYMENT_ELIGIBLE",
    orderId: null,
    ...overrides,
    recoveryPaymentId: overrides.recoveryPaymentId ?? null,
  };
}

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
