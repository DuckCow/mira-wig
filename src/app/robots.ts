import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/market/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Private/auth surfaces are crawl-disallowed as defense-in-depth on top of auth redirects.
    // Fitting pages may contain face-photo or user-specific content and should not be crawled.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/cart",
        "/checkout",
        "/orders",
        "/fitting",
        "/login",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteBaseUrl()).toString(),
  };
}
