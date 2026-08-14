import type { Locale } from "./locale";
import type { SiteVariant } from "./site-variant";

export type PresentationSlot =
  | "home.hero"
  | "home.primaryCta"
  | "home.featuredSection"
  | "home.trustMessage"
  | "home.deliveryMessage"
  | "home.campaignBanner";

export interface SiteVariantPresentation {
  fixture: true;
  slots: Record<PresentationSlot, string | null>;
}

export interface PresentationAsset {
  key: string;
  locale: Locale | null;
  marketCode: SiteVariant["marketCode"] | null;
  languageFree: boolean;
  neutralForLocale: boolean;
}

export function selectPresentationAsset(
  assets: readonly PresentationAsset[],
  variant: SiteVariant,
): PresentationAsset | null {
  const exact = assets.find(
    (asset) => asset.marketCode === variant.marketCode && asset.locale === variant.locale,
  );
  if (exact) return exact;
  const sameLocaleNeutral = assets.find(
    (asset) => asset.marketCode === null && asset.locale === variant.locale && asset.neutralForLocale,
  );
  if (sameLocaleNeutral) return sameLocaleNeutral;
  return assets.find(
    (asset) => asset.marketCode === null && asset.locale === null && asset.languageFree,
  ) ?? null;
}

export function presentationFor(
  variant: SiteVariant,
  copy: Omit<SiteVariantPresentation["slots"], "home.campaignBanner">,
): SiteVariantPresentation {
  return {
    fixture: true,
    slots: { ...copy, "home.campaignBanner": null },
  };
}
