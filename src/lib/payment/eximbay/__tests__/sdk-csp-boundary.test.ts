import { describe, expect, it } from "vitest";
import nextConfig, { EXIMBAY_SDK_CSP_BOUNDARY } from "../../../../../next.config";
import { EXIMBAY_SDK_ORIGINS, EXIMBAY_SDK_SOURCES } from "../sdk-origins";

describe("dormant Eximbay SDK CSP boundary", () => {
  it("represents only the exact SANDBOX and LIVE origins with neither mode active", () => {
    expect(EXIMBAY_SDK_CSP_BOUNDARY).toEqual({
      origins: {
        SANDBOX: "https://api-test.eximbay.com",
        LIVE: "https://api.eximbay.com",
      },
      activeModes: [],
    });
    expect(EXIMBAY_SDK_CSP_BOUNDARY.activeModes).toHaveLength(0);
    expect(EXIMBAY_SDK_SOURCES).toEqual({
      SANDBOX: `${EXIMBAY_SDK_ORIGINS.SANDBOX}/v2/javascriptSDK.js`,
      LIVE: `${EXIMBAY_SDK_ORIGINS.LIVE}/v2/javascriptSDK.js`,
    });
  });

  it("does not install a global CSP header or broad script allowance", () => {
    expect(nextConfig.headers).toBeUndefined();

    const representation = JSON.stringify(EXIMBAY_SDK_CSP_BOUNDARY);
    expect(representation).not.toContain("*");
    expect(representation).not.toContain("unsafe-inline");
    expect(representation).not.toContain("unsafe-eval");
    expect(representation).not.toContain("http://");
  });
});
