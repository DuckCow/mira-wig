import Link from "next/link";
import { siteVariantPath } from "@/lib/market/site-variant";
import { MARKET_CONFIGS } from "@/lib/market/types";
import { getActiveSiteVariants } from "@/lib/market/active-market";
import { globalSelectorMetadata } from "@/lib/market/seo";

const LANGUAGE_NAMES = { ko: "한국어", en: "English", ja: "日本語" } as const;

export async function generateMetadata() {
  return globalSelectorMetadata((await getActiveSiteVariants()).length);
}

export default async function GlobalSelectorPage() {
  const activeVariants = await getActiveSiteVariants();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Mira</h1>
      <p className="mt-3 text-sm text-gray-600">Region · Language / 지역 · 언어 / 地域・言語</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {activeVariants.map((variant) => (
          <li key={`${variant.marketCode}-${variant.locale}`}>
            <Link
              href={siteVariantPath(variant)}
              className="block rounded-lg border border-gray-200 p-4 hover:border-gray-500"
            >
              <span className="font-medium text-gray-900">{MARKET_CONFIGS[variant.marketCode].label}</span>
              <span className="ml-2 text-sm text-gray-500">{LANGUAGE_NAMES[variant.locale]}</span>
            </Link>
          </li>
        ))}
      </ul>
      {activeVariants.length === 0 ? (
        <p role="status" className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
          Mira storefronts are temporarily unavailable.
        </p>
      ) : null}
    </main>
  );
}
