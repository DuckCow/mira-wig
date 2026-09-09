import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/market/seo";
import type { PublicDiscoveryEnv } from "@/lib/public-discovery/policy";

// Portable images receive their canonical origin at application runtime.
export const dynamic = "force-dynamic";

const NON_PUBLIC_ROUTE_PREFIXES = [
  "/admin",
  "/api",
  "/cart",
  "/checkout",
  "/orders",
  "/fitting",
  "/login",
] as const;

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy();
}

export function buildRobotsPolicy(
  env: PublicDiscoveryEnv = process.env,
): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: [...NON_PUBLIC_ROUTE_PREFIXES] },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: [...NON_PUBLIC_ROUTE_PREFIXES],
      },
      { userAgent: "GPTBot", disallow: "/" },
    ],
    sitemap: new URL("/sitemap.xml", siteBaseUrl(env)).toString(),
  };
}
