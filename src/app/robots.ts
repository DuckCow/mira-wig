import type { MetadataRoute } from "next";

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
  };
}
