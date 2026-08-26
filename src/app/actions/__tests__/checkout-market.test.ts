import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const createSession = vi.hoisted(() => vi.fn());
const resolverBoundary = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Headers() }));

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: (name: string) => {
    const value = resolverBoundary.cookies.get(name);
    return value === undefined ? undefined : { name, value };
  } })),
  headers: vi.fn(() => Promise.resolve(resolverBoundary.headers)),
}));
vi.mock("@/lib/market/active-market", () => ({
  NoActiveMarketException: class NoActiveMarketException extends Error {},
  getActiveMarketCodes: vi.fn().mockResolvedValue(["KR", "US", "JP"]),
}));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/payment/session", () => ({
  SessionException: class SessionException extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
  },
  createCheckoutSession: createSession,
}));

import { getSession } from "@/lib/session";
import { createCheckoutSessionAction, type CheckoutActionInput } from "../checkout";

const session: Session = {
  user: { id: "checkout-user", email: "checkout@example.test", name: "Checkout" },
  expires: "2099-01-01",
};

const input: CheckoutActionInput = {
  expectedMarketCode: "KR",
  recipientName: "Test User",
  phone: "010-1234-5678",
  country: "KR",
  postalCode: "12345",
  administrativeArea: "Seoul",
  city: "Gangnam",
  addressLine1: "1 Test Road",
};

describe("checkout expected market gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(session);
    setResolverMarket("KR", true);
    createSession.mockResolvedValue({ sessionId: "session-1", expiresAt: new Date(), subtotalAmount: 100, shippingAmount: 0, totalAmount: 100, currency: "KRW" });
  });

  it("rejects a cross-tab mismatch before creating a CheckoutSession", async () => {
    setResolverMarket("US", true);

    await expect(createCheckoutSessionAction(input)).resolves.toMatchObject({ success: false, errorCode: "MARKET_CHANGED" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("uses confirmed commerce authority when a transient target conflicts", async () => {
    resolverBoundary.cookies.set("mira-market", "US");
    resolverBoundary.headers = new Headers({
      "x-mira-context-attested": "proxy-v1",
      "x-mira-context-source": "TRANSIENT_PUBLIC",
      "x-mira-transient-market": "KR",
      "x-mira-transient-locale": "ko",
      "x-mira-pathname": "/checkout",
      "x-mira-request-target": "/checkout?market=KR&locale=ko",
    });

    await expect(createCheckoutSessionAction(input)).resolves.toMatchObject({
      success: false,
      errorCode: "MARKET_CHANGED",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid expected market before creating a CheckoutSession", async () => {
    await expect(createCheckoutSessionAction({ ...input, expectedMarketCode: "kr" })).resolves.toMatchObject({ success: false, errorCode: "MARKET_CHANGED" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects inferred or transient-only context before creating a CheckoutSession", async () => {
    setResolverMarket("KR", false);

    await expect(createCheckoutSessionAction(input)).resolves.toMatchObject({
      success: false,
      errorCode: "MARKET_CONFIRMATION_REQUIRED",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("does not accept hostile client confirmation fields", async () => {
    setResolverMarket("KR", false);
    const hostileInput = { ...input, confirmed: true, marketConfirmed: true };

    await expect(createCheckoutSessionAction(hostileInput)).resolves.toMatchObject({
      success: false,
      errorCode: "MARKET_CONFIRMATION_REQUIRED",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("passes the exact matched server market into the existing session creator", async () => {
    await expect(createCheckoutSessionAction(input)).resolves.toMatchObject({ success: true });
    expect(createSession).toHaveBeenCalledOnce();
    expect(createSession.mock.calls[0]?.[1]).toMatchObject({
      userId: "checkout-user",
      marketCode: "KR",
      communicationLocale: "ko",
      shipping: { country: "KR" },
    });
  });
});

function setResolverMarket(marketCode: "KR" | "US", marketConfirmed: boolean): void {
  resolverBoundary.cookies.clear();
  if (marketConfirmed) resolverBoundary.cookies.set("mira-market", marketCode);
  resolverBoundary.headers = new Headers({
    "x-mira-context-attested": "proxy-v1",
    "x-mira-pathname": "/checkout",
    "x-mira-request-target": "/checkout",
    "x-mira-geo-country": marketCode,
  });
}
