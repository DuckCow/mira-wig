import { Children, isValidElement, type ReactNode } from "react";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

type GoogleButtonProps = {
  callbackUrl: string;
};

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session | null>>(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
  GoogleSignInButton: vi.fn((_props: GoogleButtonProps) => null),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./GoogleSignInButton", () => ({
  GoogleSignInButton: mocks.GoogleSignInButton,
}));

import LoginPage from "./page";

describe("login page callback boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
  });

  it("resolves the session before consuming searchParams", async () => {
    const sequence: string[] = [];
    mocks.getSession.mockImplementation(async () => {
      sequence.push("session:start");
      await Promise.resolve();
      sequence.push("session:end");
      return null;
    });
    const searchParams = new TrackedSearchParams(
      { callbackUrl: "/orders/order_123" },
      () => sequence.push("searchParams"),
    );

    await LoginPage({ searchParams });

    expect(sequence).toEqual(["session:start", "session:end", "searchParams"]);
  });

  it("propagates a session error without consuming searchParams", async () => {
    const error = new Error("session unavailable");
    let consumed = false;
    mocks.getSession.mockRejectedValue(error);
    const searchParams = new TrackedSearchParams(
      { callbackUrl: "/orders/private" },
      () => { consumed = true; },
    );

    await expect(LoginPage({ searchParams })).rejects.toBe(error);

    expect(consumed).toBe(false);
  });

  it("passes the exact sanitized callback to the unauthenticated Google button", async () => {
    const callbackUrl = "/orders/order_123?tab=refund#customer-refund-intakes";

    const element = await LoginPage({ searchParams: resolvedSearchParams(callbackUrl) });

    expect(googleButtonCallback(element)).toBe(callbackUrl);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    ["/orders/one", "/orders/two"],
    "//evil.example",
  ])("passes only the fallback for unauthenticated invalid callback %#", async (callbackUrl) => {
    const element = await LoginPage({ searchParams: resolvedSearchParams(callbackUrl) });

    expect(googleButtonCallback(element)).toBe("/styles");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an authenticated visitor to the exact sanitized callback", async () => {
    mocks.getSession.mockResolvedValue(authenticatedSession());

    await expect(LoginPage({ searchParams: resolvedSearchParams("/orders/order_123") }))
      .rejects.toThrow("REDIRECT:/orders/order_123");

    expect(mocks.redirect).toHaveBeenCalledWith("/orders/order_123");
  });

  it("redirects an authenticated visitor with an invalid callback to the fallback", async () => {
    mocks.getSession.mockResolvedValue(authenticatedSession());

    await expect(LoginPage({ searchParams: resolvedSearchParams("/\\evil.example") }))
      .rejects.toThrow("REDIRECT:/styles");

    expect(mocks.redirect).toHaveBeenCalledWith("/styles");
  });

  it("preserves query and fragment for an authenticated redirect", async () => {
    const callbackUrl = "/admin/orders/order_123?tab=refund#intake";
    mocks.getSession.mockResolvedValue(authenticatedSession());

    await expect(LoginPage({ searchParams: resolvedSearchParams(callbackUrl) }))
      .rejects.toThrow(`REDIRECT:${callbackUrl}`);

    expect(mocks.redirect).toHaveBeenCalledWith(callbackUrl);
  });
});

class TrackedSearchParams extends Promise<{ callbackUrl?: string | string[] }> {
  private readonly onConsumed: () => void;

  static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  constructor(
    value: { callbackUrl?: string | string[] },
    onConsumed: () => void,
  ) {
    super((resolve) => resolve(value));
    this.onConsumed = onConsumed;
  }

  override then<TResult1 = { callbackUrl?: string | string[] }, TResult2 = never>(
    onfulfilled?: ((value: { callbackUrl?: string | string[] }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.onConsumed();
    return super.then(onfulfilled, onrejected);
  }
}

function resolvedSearchParams(
  callbackUrl: string | string[] | undefined,
): Promise<{ callbackUrl?: string | string[] }> {
  return Promise.resolve({ callbackUrl });
}

function googleButtonCallback(node: ReactNode): string | null {
  if (isValidElement<GoogleButtonProps>(node) && node.type === mocks.GoogleSignInButton) {
    return node.props.callbackUrl;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;

  for (const child of Children.toArray(node.props.children)) {
    const callbackUrl = googleButtonCallback(child);
    if (callbackUrl !== null) return callbackUrl;
  }
  return null;
}

function authenticatedSession(): Session {
  return {
    user: {
      id: "user_1",
      role: "CUSTOMER",
      name: "Customer",
      email: "customer@example.test",
      image: null,
    },
    expires: "2099-01-01T00:00:00.000Z",
  };
}
