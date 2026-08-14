import { redirect } from "next/navigation";
import { getStorefrontContext } from "@/lib/market";
import { siteVariantPath } from "@/lib/market/site-variant";
import { appendSearchParams } from "@/lib/market/request-context";

type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyStylesPage({ searchParams }: { searchParams: LegacySearchParams }) {
  const [context, query] = await Promise.all([getStorefrontContext(), searchParams]);
  redirect(appendSearchParams(
    siteVariantPath({ marketCode: context.marketCode, locale: context.locale }, "/styles"),
    query,
  ));
}
