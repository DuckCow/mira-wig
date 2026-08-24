import type { NextConfig } from "next";
import { EXIMBAY_SDK_ORIGINS } from "./src/lib/payment/eximbay/sdk-origins";
import {
  PRIVATE_HTML_ROUTE_PATTERNS,
  PRIVATE_X_ROBOTS_TAG,
} from "./src/lib/public-discovery/policy";

const ACTIVE_EXIMBAY_SDK_MODES: readonly ["SANDBOX"] = Object.freeze(["SANDBOX"]);

export const EXIMBAY_SDK_CSP_BOUNDARY = Object.freeze({
  origins: EXIMBAY_SDK_ORIGINS,
  activeModes: ACTIVE_EXIMBAY_SDK_MODES,
});

const nextConfig: NextConfig = {
  headers() {
    return Promise.resolve(PRIVATE_HTML_ROUTE_PATTERNS.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: PRIVATE_X_ROBOTS_TAG }],
    })));
  },
  outputFileTracingIncludes: {
    "/admin/render-lab/strand-bundle/\\[file\\]": [
      "src/lib/rendering/fixtures/r2-diagnostic-v1/manifest.json",
      "src/lib/rendering/fixtures/r2-diagnostic-v1/strands.bin",
    ],
  },
  images: {
    dangerouslyAllowLocalIP: true, // Next/Image가 로컬 mock-storage URL을 최적화할 수 있게 허용
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com", // S3 presigned URL 허용
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/api/mock-storage",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/api/mock-storage",
      },
    ],
  },
};

export default nextConfig;
