import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutSessionStatus, FulfillmentType, ShippingCountry } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { CheckoutSessionResumeResult } from "@/lib/payment/session/types";

vi.mock("next/link", () => ({
  default: ({ href, children, replace: _replace, ...props }: { href: string; children: ReactNode; replace?: boolean }) => (
    createElement("a", { href, ...props }, children)
  ),
}));
vi.mock("./PaymentMethodSection", () => ({
  PaymentMethodSection: ({ checkoutSessionId }: { checkoutSessionId: string }) => (
    createElement("section", { "data-payment-session-id": checkoutSessionId })
  ),
}));

import { CheckoutSessionResume } from "./CheckoutSessionResume";

describe("frozen CheckoutSession resume presentation", () => {
  it("renders frozen commerce and shipping facts with a detachable fresh-checkout link", () => {
    const html = renderResume(sessionFixture());

    expect(html).toContain("Frozen style");
    expect(html).toContain("$49.99");
    expect(html).toContain("Resume Customer");
    expect(html).toContain("1 Frozen Street");
    expect(html).toContain('data-payment-session-id="session-a"');
    expect(html).toContain('href="/checkout?miraMarket=US&amp;miraLocale=en&amp;miraContext=public"');
    expect(html).not.toContain("checkoutSessionId=session-a");
    expect(html).not.toContain("<input");
  });

  it.each(["PAYMENT_EXISTS", "EXPIRED", "COMPLETED", "TERMINAL", "MARKET_UNAVAILABLE"] as const)(
    "does not render a payment surface for %s",
    (disposition) => {
      const html = renderResume(sessionFixture({ disposition }));

      expect(html).not.toContain("data-payment-session-id");
      expect(html).toContain(`data-resume-disposition="${disposition}"`);
    },
  );

  it("links an existing Payment to the provider-neutral return observer without initiating it", () => {
    const html = renderResume(sessionFixture({ disposition: "PAYMENT_EXISTS" }));

    expect(html).toContain("/checkout/return/session-a");
    expect(html).not.toContain("data-payment-session-id");
  });

  it("links a completed owned session to its existing Order without a payment surface", () => {
    const html = renderResume(sessionFixture({
      status: CheckoutSessionStatus.COMPLETED,
      disposition: "COMPLETED",
      orderId: "order-a",
    }));

    expect(html).toContain("/orders/order-a");
    expect(html).toContain("/checkout/return/session-a");
    expect(html).not.toContain("data-payment-session-id");
  });
});

function renderResume(session: CheckoutSessionResumeResult): string {
  return renderToStaticMarkup(createElement(CheckoutSessionResume, {
    session,
    locale: "en",
    mockPaymentEnabled: false,
    eximbayCardEnabled: true,
  }));
}

function sessionFixture(
  overrides: Partial<CheckoutSessionResumeResult> = {},
): CheckoutSessionResumeResult {
  return {
    sessionId: "session-a",
    marketCode: "US",
    currency: "USD",
    status: CheckoutSessionStatus.SUBMITTED,
    submittedAt: new Date("2026-08-23T00:00:00.000Z"),
    expiresAt: new Date("2026-08-23T00:30:00.000Z"),
    subtotalAmount: 4_999,
    shippingAmount: 0,
    totalAmount: 4_999,
    lines: [{
      id: "line-a",
      quantity: 1,
      unitAmount: 4_999,
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
  };
}
