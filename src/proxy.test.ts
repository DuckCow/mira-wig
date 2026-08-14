import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

describe("storefront proxy trust and routing boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps API/provider ingress outside presentation matching", () => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/api/payments/toss/webhook" })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/checkout/return/session" })).toBe(true);
  });

  it.each([
    "/cart",
    "/checkout",
    "/login",
    "/orders",
    "/fitting/result",
    "/checkout/return/session",
  ])("strips every hostile x-mira header on %s", async (pathname) => {
    const response = await proxy(new NextRequest(`https://mira.example${pathname}`, {
      headers: {
        "x-mira-route-market": "US",
        "x-mira-route-locale": "ko",
        "x-mira-context-attested": "hostile",
        "x-mira-future-authority": "hostile",
      },
    }));

    expect(requestHeader(response, "x-mira-route-market")).toBeNull();
    expect(requestHeader(response, "x-mira-route-locale")).toBeNull();
    expect(requestHeader(response, "x-mira-future-authority")).toBeNull();
    expect(requestHeader(response, "x-mira-context-attested")).toBe("proxy-v1");
    expect(requestHeader(response, "x-mira-pathname")).toBe(pathname);
  });

  it("overwrites hostile route context from an explicit public pathname", async () => {
    const response = await proxy(new NextRequest("https://mira.example/us/ko/styles/a", {
      headers: {
        "x-mira-route-market": "JP",
        "x-mira-route-locale": "ja",
        "x-mira-context-attested": "hostile",
      },
    }));

    expect(requestHeader(response, "x-mira-context-source")).toBe("EXPLICIT_URL");
    expect(requestHeader(response, "x-mira-route-market")).toBe("US");
    expect(requestHeader(response, "x-mira-route-locale")).toBe("ko");
  });

  it("does not trust spoofed managed-platform GeoIP in unknown/self-hosted mode", async () => {
    vi.stubEnv("MIRA_GEOIP_TRUST_MODE", "none");
    const response = await proxy(new NextRequest("https://mira.example/cart", {
      headers: { "x-vercel-ip-country": "US", "cf-ipcountry": "JP" },
    }));

    expect(requestHeader(response, "x-mira-geo-country")).toBeNull();
  });

  it("forwards only the configured trusted deployment GeoIP as inference", async () => {
    vi.stubEnv("MIRA_GEOIP_TRUST_MODE", "vercel");
    const response = await proxy(new NextRequest("https://mira.example/cart", {
      headers: { "x-vercel-ip-country": "us", "cf-ipcountry": "JP" },
    }));

    expect(requestHeader(response, "x-mira-geo-country")).toBe("US");
  });

  it("reconstructs a validated transient public handoff on an unprefixed route", async () => {
    const response = await proxy(new NextRequest(
      "https://mira.example/cart?miraMarket=US&miraLocale=ko&miraContext=public",
    ));

    expect(requestHeader(response, "x-mira-context-source")).toBe("TRANSIENT_PUBLIC");
    expect(requestHeader(response, "x-mira-transient-market")).toBe("US");
    expect(requestHeader(response, "x-mira-transient-locale")).toBe("ko");
  });

  it("ignores an unsupported transient pair", async () => {
    const response = await proxy(new NextRequest(
      "https://mira.example/cart?miraMarket=JP&miraLocale=ko&miraContext=public",
    ));

    expect(requestHeader(response, "x-mira-context-source")).toBeNull();
    expect(requestHeader(response, "x-mira-transient-market")).toBeNull();
  });

  it.each([
    ["/US/EN/styles/a?q=lace", "/us/en/styles/a?q=lace"],
    ["/jp/ko/styles/a?q=lace", "/jp/ja/styles/a?q=lace"],
    ["/US/EN/styles/a%2Fone?q=lace", "/us/en/styles/a%2Fone?q=lace"],
  ])("temporarily canonicalizes %s while preserving suffix and query", async (source, expected) => {
    const response = await proxy(new NextRequest(`https://mira.example${source}`));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`https://mira.example${expected}`);
  });

  it("leaves unknown market/locale pairs for route-level fail-closed handling", async () => {
    const response = await proxy(new NextRequest("https://mira.example/xx/en/styles"));

    expect(response.status).toBe(200);
    expect(requestHeader(response, "x-mira-route-market")).toBeNull();
  });
});

function requestHeader(response: NextResponse, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}
