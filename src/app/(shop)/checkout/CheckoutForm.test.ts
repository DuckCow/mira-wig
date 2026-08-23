import { ShippingCountry } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutShippingInput } from "@/lib/payment/session/types";

const createCheckoutSessionAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/app/actions/checkout", () => ({ createCheckoutSessionAction }));

import { createSessionAndNavigate } from "./CheckoutForm";
import { checkoutPageMode, checkoutSessionResumeHref } from "./checkout-url";

describe("checkout durable navigation identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the current URL with the exact server-created CheckoutSession ID", async () => {
    createCheckoutSessionAction.mockResolvedValue({
      success: true,
      session: {
        sessionId: "created-session",
        expiresAt: new Date("2026-08-23T00:30:00.000Z"),
        subtotalAmount: 4_999,
        shippingAmount: 0,
        totalAmount: 4_999,
        currency: "USD",
      },
    });
    const replace = vi.fn();
    const setFormError = vi.fn();

    await createSessionAndNavigate(shipping(), "US", "ko", replace, setFormError);

    expect(createCheckoutSessionAction).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/checkout?checkoutSessionId=created-session&miraMarket=US&miraLocale=ko&miraContext=public",
    );
    expect(setFormError).not.toHaveBeenCalled();
  });

  it("does not navigate or create a second session after a failed action", async () => {
    createCheckoutSessionAction.mockResolvedValue({
      success: false,
      errorCode: "CART_EMPTY",
      error: "raw-error",
    });
    const replace = vi.fn();
    const setFormError = vi.fn();

    await createSessionAndNavigate(shipping(), "US", "en", replace, setFormError);

    expect(createCheckoutSessionAction).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(setFormError).toHaveBeenCalledWith("Your cart is empty.");
  });

  it("rejects duplicated or malformed explicit resume identities instead of falling into creation mode", () => {
    expect(checkoutPageMode(undefined)).toEqual({ kind: "CREATION" });
    expect(checkoutPageMode("session-a")).toEqual({ kind: "RESUME", checkoutSessionId: "session-a" });
    expect(checkoutPageMode(["session-a", "session-b"])).toEqual({ kind: "INVALID_RESUME" });
    expect(checkoutPageMode(" session-a")).toEqual({ kind: "INVALID_RESUME" });
    expect(checkoutSessionResumeHref("session-a", { marketCode: "US", locale: "ja" })).toContain(
      "checkoutSessionId=session-a",
    );
  });
});

function shipping(): CheckoutShippingInput {
  return {
    recipientName: "Resume Customer",
    phone: "+1-555-0100",
    country: ShippingCountry.US,
    postalCode: "10001",
    administrativeArea: "NY",
    city: "New York",
    addressLine1: "1 Frozen Street",
    addressLine2: "Suite 2",
    memo: "Front desk",
  };
}
