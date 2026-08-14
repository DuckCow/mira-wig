import "server-only";

import { db } from "@/lib/db";
import { MARKET_CODES, isMarketCode, type MarketCode } from "./types";
import { ENABLED_SITE_VARIANTS, type SiteVariant } from "./site-variant";

export class NoActiveMarketException extends Error {
  constructor() {
    super("No configured storefront market is active.");
    this.name = "NoActiveMarketException";
  }
}

export async function getActiveMarketCodes(): Promise<readonly MarketCode[]> {
  const rows = await db.market.findMany({
    where: { code: { in: [...MARKET_CODES] }, isActive: true },
    select: { code: true },
  });
  const active = new Set(rows.map((row) => row.code).filter(isMarketCode));
  return MARKET_CODES.filter((code) => active.has(code));
}

export async function isActiveMarket(marketCode: MarketCode): Promise<boolean> {
  return (await db.market.count({ where: { code: marketCode, isActive: true } })) === 1;
}

export async function getActiveSiteVariants(): Promise<readonly SiteVariant[]> {
  const active = new Set(await getActiveMarketCodes());
  return ENABLED_SITE_VARIANTS.filter((variant) => active.has(variant.marketCode));
}

export async function getPublishedSiteVariants(styleId: string): Promise<readonly SiteVariant[]> {
  const style = await db.wigStyle.findFirst({
    where: { id: styleId, isActive: true },
    select: {
      availableMarkets: {
        where: { isActive: true, market: { isActive: true } },
        select: { marketCode: true },
      },
    },
  });
  if (!style) return [];
  const published = new Set(style.availableMarkets.map((entry) => entry.marketCode));
  return ENABLED_SITE_VARIANTS.filter((variant) => published.has(variant.marketCode));
}
