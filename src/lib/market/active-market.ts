import "server-only";

import { db } from "@/lib/db";
import {
  CURRENCY_META,
  MARKET_CODES,
  isCurrencyCode,
  isMarketCode,
  type CurrencyMeta,
  type MarketCode,
} from "./types";
import { ENABLED_SITE_VARIANTS, type SearchTargetSiteVariant } from "./site-variant";

export class NoActiveMarketException extends Error {
  constructor() {
    super("No configured storefront market is active.");
    this.name = "NoActiveMarketException";
  }
}

export class MarketCommercialFactsUnavailableException extends Error {
  constructor(marketCode: MarketCode) {
    super(`Current commercial facts are unavailable for Market ${marketCode}.`);
    this.name = "MarketCommercialFactsUnavailableException";
  }
}

export class UnsupportedMarketCurrencyException extends Error {
  constructor(marketCode: MarketCode, currencyCode: string) {
    super(`Market ${marketCode} has unsupported currency ${currencyCode}.`);
    this.name = "UnsupportedMarketCurrencyException";
  }
}

export interface MarketCommercialFacts {
  code: MarketCode;
  isActive: boolean;
  currency: CurrencyMeta;
  shippableCountries: readonly string[];
}

export async function getMarketCommercialFacts(
  marketCode: MarketCode,
): Promise<MarketCommercialFacts> {
  const [facts] = await getMarketCommercialFactsForCodes([marketCode]);
  if (!facts) throw new MarketCommercialFactsUnavailableException(marketCode);
  return facts;
}

export async function getActiveMarketCommercialFacts(
  marketCode: MarketCode,
): Promise<MarketCommercialFacts> {
  const [facts] = await getActiveMarketCommercialFactsForCodes([marketCode]);
  if (!facts) throw new MarketCommercialFactsUnavailableException(marketCode);
  return facts;
}

export async function getActiveMarketCommercialFactsForCodes(
  marketCodes: readonly MarketCode[],
): Promise<readonly MarketCommercialFacts[]> {
  const facts = await getMarketCommercialFactsForCodes(marketCodes);
  for (const market of facts) {
    if (!market.isActive) throw new MarketCommercialFactsUnavailableException(market.code);
  }
  return facts;
}

export async function getMarketCommercialFactsForCodes(
  marketCodes: readonly MarketCode[],
): Promise<readonly MarketCommercialFacts[]> {
  const requested = MARKET_CODES.filter((code) => marketCodes.includes(code));
  if (requested.length === 0) return [];
  const rows = await db.market.findMany({
    where: { code: { in: [...requested] } },
    select: {
      code: true,
      currency: true,
      shippableCountries: true,
      isActive: true,
    },
  });
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return requested.map((marketCode) => {
    const row = byCode.get(marketCode);
    if (!row) throw new MarketCommercialFactsUnavailableException(marketCode);
    if (!isCurrencyCode(row.currency)) {
      throw new UnsupportedMarketCurrencyException(marketCode, row.currency);
    }
    return {
      code: marketCode,
      isActive: row.isActive,
      currency: CURRENCY_META[row.currency],
      shippableCountries: row.shippableCountries,
    };
  });
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

export async function getActiveSiteVariants(): Promise<readonly SearchTargetSiteVariant[]> {
  const active = new Set(await getActiveMarketCodes());
  return ENABLED_SITE_VARIANTS.filter((variant) => active.has(variant.marketCode));
}

export async function getPublishedSiteVariants(styleId: string): Promise<readonly SearchTargetSiteVariant[]> {
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
