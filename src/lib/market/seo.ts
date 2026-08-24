import type { Metadata } from "next";
import {
  canonicalPublicOrigin,
  isPublicSearchIndexingEnabled,
  PublicPageClass,
  robotsForPageClass,
  type PublicDiscoveryEnv,
  type PublicPageClass as PublicPageClassValue,
} from "@/lib/public-discovery/policy";
import {
  hreflangForSiteVariant,
  siteVariantPath,
  type SearchTargetSiteVariant,
  type SiteVariant,
} from "./site-variant";
import { messagesFor } from "./messages";
import { getActiveSiteVariants } from "./active-market";

export function siteBaseUrl(env: PublicDiscoveryEnv = process.env): URL {
  return canonicalPublicOrigin(env);
}

export function storefrontMetadata(input: Readonly<{
  variant: SiteVariant;
  suffix: string;
  title: string;
  description: string;
  pageClass: PublicPageClassValue;
  alternateVariants: readonly SearchTargetSiteVariant[];
  env?: PublicDiscoveryEnv;
}>): Metadata {
  const env = input.env ?? process.env;
  const indexingEnabled = isPublicSearchIndexingEnabled(env);
  const robots = robotsForPageClass(input.pageClass, {
    indexingEnabled,
    activeSiteVariantCount: input.alternateVariants.length,
  });
  const languages = robots.index && input.pageClass === PublicPageClass.STOREFRONT_HOME
    ? homeLanguages(input.alternateVariants)
    : undefined;
  return {
    metadataBase: siteBaseUrl(env),
    title: input.title,
    description: input.description,
    robots,
    alternates: {
      canonical: siteVariantPath(input.variant, input.suffix),
      ...(languages ? { languages } : {}),
    },
  };
}

export async function publicPageMetadata(
  variant: SiteVariant,
  kind: "HOME" | "STYLES",
): Promise<Metadata> {
  const messages = messagesFor(variant.locale);
  const activeVariants = await getActiveSiteVariants();
  if (kind === "HOME") {
    return storefrontMetadata({
      variant,
      suffix: "",
      title: messages.home.title,
      description: messages.home.description,
      pageClass: PublicPageClass.STOREFRONT_HOME,
      alternateVariants: activeVariants,
    });
  }
  return storefrontMetadata({
    variant,
    suffix: "/styles",
    title: messages.styles.title,
    description: messages.home.description,
    pageClass: PublicPageClass.CATALOG_LIST,
    alternateVariants: activeVariants,
  });
}

export function globalSelectorMetadata(
  activeSiteVariantCount: number,
  env: PublicDiscoveryEnv = process.env,
): Metadata {
  const robots = robotsForPageClass(PublicPageClass.GLOBAL_SELECTOR, {
    indexingEnabled: isPublicSearchIndexingEnabled(env),
    activeSiteVariantCount,
  });
  return {
    metadataBase: siteBaseUrl(env),
    title: "Mira global storefront",
    description: "Choose a Mira delivery region and language.",
    robots,
    alternates: { canonical: "/global" },
  };
}

function homeLanguages(variants: readonly SearchTargetSiteVariant[]): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const variant of variants) {
    languages[hreflangForSiteVariant(variant)] = siteVariantPath(variant);
  }
  languages["x-default"] = "/global";
  return languages;
}
