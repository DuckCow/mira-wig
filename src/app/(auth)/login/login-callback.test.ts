import { describe, expect, it } from "vitest";
import { resolveLoginCallbackUrl } from "./login-callback";

const FALLBACK = "/styles";

describe("login callback resolver", () => {
  it.each([
    undefined,
    null,
    ["/orders/abc"],
    { callbackUrl: "/orders/abc" },
    42,
  ])("falls back for non-string input %#", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
  });

  it.each([
    "",
    " ",
    " /orders/abc",
    "/orders/abc ",
    "\u00A0/orders/abc",
    "/orders/abc\u00A0",
    "\uFEFF/orders/abc",
    "/orders/abc\uFEFF",
    "\u2003/orders/abc",
    "/orders/abc\u2003",
  ])("rejects blank or edge-whitespace input %# without trimming", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
    expect(resolveLoginCallbackUrl(value)).not.toBe(value.trim());
  });

  it.each([
    "/",
    "/orders/abc",
    "/orders/abc?tab=refund",
    "/orders/abc#customer-refund-intakes",
    "/orders/abc?next=https://evil.example",
    "/orders/abc?x=//evil.example",
    "/admin/orders/abc",
    "/orders/a b",
  ])("preserves valid local destination %s", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(value);
  });

  it.each([
    "https://evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "styles",
    "./orders/abc",
    "../admin",
    "%2F%2Fevil.example",
  ])("rejects scheme or non-root-relative input %s", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
  });

  it.each([
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/abc\\def",
  ])("rejects protocol-relative or literal-backslash input %#", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
  });

  it.each([
    "\t/orders/abc",
    "/orders/abc\t",
    "/orders/a\tb",
    "/orders/a\rb",
    "/orders/a\nb",
    "/orders/a\0b",
    "/orders/a\u007Fb",
  ])("rejects ASCII controls and DEL %#", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
  });

  it.each([
    "/%5Cevil.example",
    "/%2F%2Fevil.example",
  ])("preserves accepted percent-encoded literal %s", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(value);
  });

  it("bounds the callback by JavaScript UTF-16 code units", () => {
    const exactly512 = `/${"a".repeat(511)}`;
    const exactly513 = `/${"a".repeat(512)}`;
    const prefix511PlusAstral = `/${"a".repeat(510)}😀`;
    const validAstralWithinLimit = `/${"a".repeat(509)}😀`;

    expect(exactly512).toHaveLength(512);
    expect(resolveLoginCallbackUrl(exactly512)).toBe(exactly512);
    expect(exactly513).toHaveLength(513);
    expect(resolveLoginCallbackUrl(exactly513)).toBe(FALLBACK);
    expect(prefix511PlusAstral).toHaveLength(513);
    expect(resolveLoginCallbackUrl(prefix511PlusAstral)).toBe(FALLBACK);
    expect(validAstralWithinLimit).toHaveLength(512);
    expect(resolveLoginCallbackUrl(validAstralWithinLimit)).toBe(validAstralWithinLimit);
  });

  it.each([
    "/login",
    "/login/",
    "/login?x=1",
    "/login#x",
    "/login/path",
    "/api",
    "/api/",
    "/api?x=1",
    "/api#x",
    "/api/path",
    "/_next",
    "/_next/",
    "/_next?x=1",
    "/_next#x",
    "/_next/static/x",
  ])("rejects reserved first-segment destination %s", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(FALLBACK);
  });

  it.each([
    "/login-help",
    "/apiary",
    "/_nextish",
    "/admin",
  ])("does not overmatch reserved prefix %s", (value) => {
    expect(resolveLoginCallbackUrl(value)).toBe(value);
  });
});
