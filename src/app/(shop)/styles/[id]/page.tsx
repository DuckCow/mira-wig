import { redirect } from "next/navigation";
import { getStorefrontContext } from "@/lib/market";
import { siteVariantPath } from "@/lib/market/site-variant";
import { appendSearchParams } from "@/lib/market/request-context";

type PageParams = Promise<{ id: string }>;

type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyStyleDetailPage({ params, searchParams }: { params: PageParams; searchParams: LegacySearchParams }) {
  const [{ id }, context, query] = await Promise.all([params, getStorefrontContext(), searchParams]);
  redirect(appendSearchParams(
    siteVariantPath(
      { marketCode: context.marketCode, locale: context.locale },
      `/styles/${encodeURIComponent(id)}`,
    ),
    query,
  ));
}
