import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const add = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const resolverBoundary = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Headers() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/cart", () => ({
  CartException: class CartException extends Error {},
  addToCart: add,
  updateQuantity: update,
  removeFromCart: remove,
}));

import { getSession } from "@/lib/session";
import { addToCart, removeFromCart, updateCartQuantity } from "../cart";

const session: Session = {
  user: { id: "cart-user", email: "cart@example.test", name: "Cart" },
  expires: "2099-01-01",
};

describe("cart market confirmation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(session);
    resolverBoundary.cookies.clear();
    resolverBoundary.headers = attestedHeaders({ "x-mira-geo-country": "KR" });
  });

  it("shows inferred prices but blocks Add to Cart until explicit confirmation", async () => {
    await expect(addToCart("KR", "variant", "style", 1)).resolves.toMatchObject({ success: false, errorCode: "MARKET_CONFIRMATION_REQUIRED" });
    expect(add).not.toHaveBeenCalled();
  });

  it("allows guarded cart mutations only after the server context is confirmed", async () => {
    resolverBoundary.cookies.set("mira-market", "KR");

    await expect(addToCart("KR", "variant", "style", 1)).resolves.toEqual({ success: true });
    await expect(updateCartQuantity("item", 2, "KR")).resolves.toEqual({ success: true });
    expect(add).toHaveBeenCalledWith("cart-user", "variant", "style", 1, "KR");
    expect(update).toHaveBeenCalledWith("cart-user", "item", 2, "KR");
  });

  it("does not let a transient target override a different confirmed commerce Market", async () => {
    resolverBoundary.cookies.set("mira-market", "JP");
    resolverBoundary.headers = attestedHeaders({
      "x-mira-context-source": "TRANSIENT_PUBLIC",
      "x-mira-transient-market": "US",
      "x-mira-transient-locale": "en",
    });

    await expect(updateCartQuantity("item", 2, "US")).resolves.toMatchObject({
      success: false,
      errorCode: "MARKET_CHANGED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps explicit removal available even without market confirmation", async () => {
    await expect(removeFromCart("item")).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith("cart-user", "item");
  });
});

function attestedHeaders(values: Record<string, string>): Headers {
  return new Headers({
    "x-mira-context-attested": "proxy-v1",
    "x-mira-pathname": "/cart",
    "x-mira-request-target": "/cart",
    ...values,
  });
}
