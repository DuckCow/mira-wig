import type { Metadata } from "next";
import { siteVariantPath, type SiteVariant } from "./site-variant";
import { messagesFor } from "./messages";
import { getActiveSiteVariants } from "./active-market";

export function siteBaseUrl(): URL {
  return new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
}

export function storefrontMetadata(
  variant: SiteVariant,
  suffix: string,
  title: string,
  description: string,
  alternateVariants: readonly SiteVariant[],
): Metadata {
  const languages: Record<string, string> = {};
  for (const enabled of alternateVariants) {
    languages[`${enabled.locale}-${enabled.marketCode}`] = siteVariantPath(enabled, suffix);
  }
  languages["x-default"] = "/global";
  return {
    title,
    description,
    alternates: {
      canonical: siteVariantPath(variant, suffix),
      languages,
    },
  };
}

export async function publicPageMetadata(variant: SiteVariant, kind: "HOME" | "STYLES"): Promise<Metadata> {
  const messages = messagesFor(variant.locale);
  const activeVariants = await getActiveSiteVariants();
  if (kind === "HOME") {
    return storefrontMetadata(variant, "", messages.home.title, messages.home.description, activeVariants);
  }
  return storefrontMetadata(
    variant,
    "/styles",
    messages.styles.title,
    messages.home.description,
    activeVariants,
  );
}
