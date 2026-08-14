import { describe, expect, it } from "vitest";
import {
  isSafeRelativeApplicationPath,
  loginHref,
  parseTransientStorefrontContext,
  siteVariantNavigationTarget,
  withStorefrontHandoff,
} from "../request-context";

describe("transient storefront context helpers", () => {
  it("preserves identity, safe query, and fragment while adding presentation provenance", () => {
    expect(withStorefrontHandoff("/fitting/fit_1?tab=result#saved", { marketCode: "US", locale: "ko" }))
      .toBe("/fitting/fit_1?tab=result&miraMarket=US&miraLocale=ko&miraContext=public#saved");
  });

  it("builds login with the exact safe return target", () => {
    const href = loginHref("/us/ko/styles/style%2Fone?q=lace#details", { marketCode: "US", locale: "ko" });
    const url = new URL(href, "https://mira.example");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/us/ko/styles/style%2Fone?q=lace#details");
    expect(parseTransientStorefrontContext(url.searchParams)).toEqual({ marketCode: "US", locale: "ko" });
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/%2f%2fevil.example/path",
    "/%252f%252fevil.example/path",
    "/styles/%2e%2e/admin",
    "/styles/%252e%252e/admin",
    "/styles/%5cevil",
  ])("rejects unsafe callback target %s", (value) => {
    expect(isSafeRelativeApplicationPath(value)).toBe(false);
  });

  it("keeps an encoded ID that does not change authority or traverse", () => {
    expect(isSafeRelativeApplicationPath("/us/en/styles/a%2Fb?q=1")).toBe(true);
  });

  it.each([3, 4])("rejects %i-layer encoded authority, traversal, and backslash payloads", (depth) => {
    expect(isSafeRelativeApplicationPath(`/${nestedEncode("//evil.example", depth)}`)).toBe(false);
    expect(isSafeRelativeApplicationPath(`/styles/${nestedEncode("..", depth)}/admin`)).toBe(false);
    expect(isSafeRelativeApplicationPath(`/styles/${nestedEncode("\\evil", depth)}`)).toBe(false);
  });

  it.each(["\0", "\r", "\n", "\u0001", "\u001f", "\u007f"])("rejects recursively encoded control %#", (control) => {
    expect(isSafeRelativeApplicationPath(`/styles/${nestedEncode(control, 3)}`)).toBe(false);
  });

  it("rejects a recursively encoded value that does not stabilize within the bound", () => {
    expect(isSafeRelativeApplicationPath(`/styles/${nestedEncode("safe/id", 6)}`)).toBe(false);
  });

  it("preserves public path identity, query, and hash when switching locale", () => {
    expect(siteVariantNavigationTarget(
      "/us/ko/styles/style%2Fone",
      "q=lace&tab=details",
      "#reviews",
      { marketCode: "US", locale: "en" },
    )).toBe("/us/en/styles/style%2Fone?q=lace&tab=details#reviews");
  });

  it("updates transient context while preserving a private target's query and hash", () => {
    expect(siteVariantNavigationTarget(
      "/fitting/fit_1",
      "tab=result",
      "#saved",
      { marketCode: "JP", locale: "en" },
    )).toBe("/fitting/fit_1?tab=result&miraMarket=JP&miraLocale=en&miraContext=public#saved");
  });
});

function nestedEncode(value: string, depth: number): string {
  let encoded = value;
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}
