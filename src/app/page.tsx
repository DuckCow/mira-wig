import { redirect } from "next/navigation";
import { getStorefrontContext } from "@/lib/market";
import { siteVariantPath } from "@/lib/market/site-variant";
import { NoActiveMarketException } from "@/lib/market/active-market";
import { appendSearchParams } from "@/lib/market/request-context";

type RootSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RootResolverPage({ searchParams }: { searchParams: RootSearchParams }) {
  const query = await searchParams;
  try {
    const context = await getStorefrontContext();
    redirect(appendSearchParams(
      siteVariantPath({ marketCode: context.marketCode, locale: context.locale }),
      query,
    ));
  } catch (error) {
    if (error instanceof NoActiveMarketException) redirect(appendSearchParams("/global", query));
    throw error;
  }
}
