import { describe, expect, it } from "vitest";
import {
  admitControlPointTessellationBrowser,
  deriveBrowserVersionConclusion,
  validateRawBrowserVersionEvidence,
} from "../benchmark-control-point-tessellation-browser-admission";

const chromeUa = "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36";

function raw(userAgent: string, brands: unknown = null) {
  return { userAgent, userAgentDataBrands: brands };
}

describe("R2C-A-S2 browser admission", () => {
  it.each([
    ["CHROME", chromeUa, [{ brand: "Chromium", version: "151" }, { brand: "Google Chrome", version: "151" }]],
    ["EDGE", `${chromeUa} Edg/151.0.0.0`, [{ brand: "Chromium", version: "151" }, { brand: "Microsoft Edge", version: "151" }]],
    ["OPERA", `${chromeUa} OPR/151.0.0.0`, [{ brand: "Chromium", version: "151" }, { brand: "Opera", version: "151" }]],
    ["CHROMIUM", "Mozilla/5.0 Chromium/151.0.0.0 Safari/537.36", [{ brand: "Chromium", version: "151" }]],
  ] as const)("selects %s with wrapper precedence", (product, userAgent, brands) => {
    expect(deriveBrowserVersionConclusion(raw(userAgent, brands))).toEqual({
      product,
      major: 151,
    });
  });

  it("ignores grease and admits only an exact declared product/major match", () => {
    const evidence = raw(chromeUa, [
      { brand: "Not(A:Brand", version: "99" },
      { brand: "Google Chrome", version: "151" },
      { brand: "Chromium", version: "151" },
    ]);
    expect(admitControlPointTessellationBrowser({
      browserEngine: "CHROMIUM_FAMILY",
      declaredBrowserProduct: "CHROME",
      declaredBrowserMajor: 151,
    }, evidence).actualBrowserProduct).toBe("CHROME");
    expect(() => admitControlPointTessellationBrowser({
      browserEngine: "CHROMIUM_FAMILY",
      declaredBrowserProduct: "CHROMIUM",
      declaredBrowserMajor: 151,
    }, evidence)).toThrow(/MISMATCH/);
  });

  it("falls back to the UA when UAData contains only recognized grease", () => {
    expect(deriveBrowserVersionConclusion(raw(chromeUa, [
      { brand: "Not_A Brand", version: "99" },
      { brand: "Not;A=Brand", version: "99" },
    ]))).toEqual({ product: "CHROME", major: 151 });
  });

  it.each([
    ["Edge plus Opera", raw(`${chromeUa} Edg/151.0.0.0 OPR/151.0.0.0`)],
    ["unsupported Vivaldi UA wrapper", raw(`${chromeUa} Vivaldi/7.7.3851.61`)],
    ["unsupported Vivaldi UAData wrapper", raw(chromeUa, [
      { brand: "Vivaldi", version: "7" },
      { brand: "Google Chrome", version: "151" },
      { brand: "Chromium", version: "151" },
    ])],
    ["another unsupported UAData wrapper", raw(chromeUa, [
      { brand: "Arc", version: "1" },
      { brand: "Google Chrome", version: "151" },
    ])],
    ["conflicting Chrome majors", raw(`${chromeUa} Chrome/150.0.0.0`)],
    ["UAData and UA product conflict", raw(`${chromeUa} Edg/151.0.0.0`, [
      { brand: "Google Chrome", version: "151" },
    ])],
    ["UAData and UA major conflict", raw(chromeUa, [
      { brand: "Google Chrome", version: "150" },
    ])],
    ["malformed Chrome suffix", raw("Mozilla/5.0 Chrome/151.0beta Safari/537.36")],
    ["malformed Chrome empty component", raw("Mozilla/5.0 Chrome/151..0 Safari/537.36")],
    ["malformed Edge suffix", raw(`${chromeUa} Edg/151x`)],
    ["malformed Edge with embedded Chrome", raw(`${chromeUa} Edg/151.0beta`)],
    ["malformed Opera with embedded Chrome", raw(`${chromeUa} OPR/120..0`)],
    ["recognized token without version", raw("Mozilla/5.0 Chrome/ Safari/537.36")],
    ["unsafe major", raw("Mozilla/5.0 Chrome/9007199254740992 Safari/537.36")],
    ["missing recognized product", raw("Mozilla/5.0 Safari/605.1.15")],
  ])("fails closed for %s", (_label, evidence) => {
    expect(() => deriveBrowserVersionConclusion(evidence)).toThrow();
  });

  it("requires the exact raw bounded shape", () => {
    expect(() => validateRawBrowserVersionEvidence({
      userAgent: chromeUa,
      userAgentDataBrands: null,
      extra: true,
    })).toThrow(/shape/);
  });
});
