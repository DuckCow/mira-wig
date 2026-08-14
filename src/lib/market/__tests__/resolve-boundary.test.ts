import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  headerValues: new Headers(),
  activeMarketCodes: ["KR", "US", "JP"],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: (name: string) => {
      const value = boundary.cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
  })),
  headers: vi.fn(() => Promise.resolve(boundary.headerValues)),
}));
vi.mock("../active-market", () => ({
  NoActiveMarketException: class NoActiveMarketException extends Error {},
  getActiveMarketCodes: vi.fn(() => Promise.resolve(boundary.activeMarketCodes)),
}));

import { getAuthenticationLocale, getStorefrontContext } from "../resolve";

describe("real storefront resolver trust boundary", () => {
  beforeEach(() => {
    boundary.cookieValues.clear();
    boundary.headerValues = new Headers();
    boundary.activeMarketCodes = ["KR", "US", "JP"];
  });

  it("does not trust hostile internal header names without proxy attestation", async () => {
    boundary.headerValues = new Headers({
      "x-mira-route-market": "US",
      "x-mira-route-locale": "ko",
      "x-mira-context-source": "EXPLICIT_URL",
      "x-vercel-ip-country": "JP",
    });

    await expect(getStorefrontContext()).resolves.toMatchObject({
      marketCode: "KR",
      confirmedMarketCode: null,
      marketSource: "DEFAULT",
      marketConfirmed: false,
    });
  });

  it("accepts proxy-attested explicit URL context but never confirms it by itself", async () => {
    boundary.headerValues = attestedHeaders({
      "x-mira-context-source": "EXPLICIT_URL",
      "x-mira-route-market": "US",
      "x-mira-route-locale": "ko",
    });

    await expect(getStorefrontContext()).resolves.toMatchObject({
      marketCode: "US",
      confirmedMarketCode: null,
      locale: "ko",
      marketSource: "EXPLICIT_URL",
      marketConfirmed: false,
    });
  });

  it("uses transient presentation context ahead of conflicting cookie and Geo without confirming it", async () => {
    boundary.cookieValues.set("mira-market", "JP");
    boundary.headerValues = attestedHeaders({
      "x-mira-context-source": "TRANSIENT_PUBLIC",
      "x-mira-transient-market": "US",
      "x-mira-transient-locale": "ko",
      "x-mira-geo-country": "KR",
    });

    await expect(getStorefrontContext()).resolves.toMatchObject({
      marketCode: "US",
      confirmedMarketCode: "JP",
      locale: "ko",
      marketSource: "TRANSIENT_HANDOFF",
      marketConfirmed: false,
    });
  });

  it("treats trusted Geo as inference only", async () => {
    boundary.headerValues = attestedHeaders({ "x-mira-geo-country": "JP" });

    await expect(getStorefrontContext()).resolves.toMatchObject({
      marketCode: "JP",
      confirmedMarketCode: null,
      marketSource: "GEO",
      marketConfirmed: false,
    });
  });

  it("does not treat an inactive remembered Market as confirmed commerce authority", async () => {
    boundary.cookieValues.set("mira-market", "JP");
    boundary.activeMarketCodes = ["KR", "US"];

    await expect(getStorefrontContext()).resolves.toMatchObject({
      marketCode: "KR",
      confirmedMarketCode: null,
      marketConfirmed: false,
    });
  });

  it("resolves authentication Locale without consulting active Markets", async () => {
    boundary.cookieValues.set("mira-locale", "ja");
    boundary.headerValues = new Headers({ "accept-language": "ko-KR,ko;q=0.9" });

    await expect(getAuthenticationLocale()).resolves.toBe("ja");
  });

  it("lets a safe explicit callback Locale lead login presentation", async () => {
    boundary.cookieValues.set("mira-locale", "ko");

    await expect(getAuthenticationLocale("/jp/en/styles/style%2Fone?q=1#details"))
      .resolves.toBe("en");
  });

  it("uses Accept-Language then deterministic English when no preference exists", async () => {
    boundary.headerValues = new Headers({ "accept-language": "ja-JP,ja;q=0.9" });
    await expect(getAuthenticationLocale()).resolves.toBe("ja");

    boundary.headerValues = new Headers();
    await expect(getAuthenticationLocale()).resolves.toBe("en");
  });
});

function attestedHeaders(values: Record<string, string>): Headers {
  return new Headers({
    "x-mira-context-attested": "proxy-v1",
    "x-mira-pathname": "/cart",
    "x-mira-request-target": "/cart?q=1",
    ...values,
  });
}
