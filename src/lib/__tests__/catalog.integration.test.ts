import { randomUUID } from "crypto";
import { ShippingCountry, WigCategory } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCart, addToCart } from "@/lib/cart";
import { getWigStyleById, getWigStyles } from "@/lib/catalog";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";

const LEGACY_BASE_PRICE = 88_000;

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
}

interface StyleInput {
  markets?: MarketCode[];
}

interface VariantInput {
  styleId: string;
  skuPrefix?: string;
  legacyPrice?: number;
  marketPrices?: Partial<Record<MarketCode, number>>;
}

describe("catalog market pricing", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("resolves detail variant prices from VariantMarketPrice for each market", async () => {
    const style = await createStyle(ctx);
    const variant = await createVariant(ctx, {
      styleId: style.id,
      marketPrices: { KR: 12_000, US: 2_999, JP: 1_500 },
    });

    await expect(detailVariantPrice(style.id, variant.id, MarketCode.KR)).resolves.toBe(12_000);
    await expect(detailVariantPrice(style.id, variant.id, MarketCode.US)).resolves.toBe(2_999);
    await expect(detailVariantPrice(style.id, variant.id, MarketCode.JP)).resolves.toBe(1_500);
    for (const marketCode of [MarketCode.KR, MarketCode.US, MarketCode.JP]) {
      await expect(detailVariantPrice(style.id, variant.id, marketCode)).resolves.not.toBe(LEGACY_BASE_PRICE);
    }
  });

  it("returns null for a missing detail market price", async () => {
    const style = await createStyle(ctx);
    const variant = await createVariant(ctx, { styleId: style.id, marketPrices: { KR: 12_000 } });

    const price = await detailVariantPrice(style.id, variant.id, MarketCode.US);

    expect(price).toBeNull();
    expect(price).not.toBe(0);
    expect(price).not.toBe(LEGACY_BASE_PRICE);
  });

  it("uses the listing publication predicate for direct PDP access", async () => {
    const style = await createStyle(ctx, { markets: [MarketCode.KR] });
    await createVariant(ctx, { styleId: style.id, marketPrices: { KR: 12_000, US: 2_999 } });

    const usListing = await getWigStyles({}, MarketCode.US, "en");
    const usDetail = await getWigStyleById(style.id, MarketCode.US, "en");

    expect(usListing.some((item) => item.id === style.id)).toBe(false);
    expect(usDetail).toBeNull();
  });

  it("returns null listing basePrice for styles with no priced variants in the requested market", async () => {
    const style = await createStyle(ctx, { markets: [MarketCode.US] });
    await createVariant(ctx, { styleId: style.id, marketPrices: { KR: 12_000 } });

    const summaries = await getWigStyles({}, MarketCode.US, "en");
    const summary = summaries.find((item) => item.id === style.id);

    expect(summary?.id).toBe(style.id);
    expect(summary?.basePrice).toBeNull();
    expect(summary?.basePrice).not.toBe(0);
  });

  it("computes listing basePrice from the minimum priced variant only", async () => {
    const style = await createStyle(ctx, { markets: [MarketCode.US] });
    await createVariant(ctx, { styleId: style.id, skuPrefix: "UNPRICED", marketPrices: { KR: 12_000 } });
    await createVariant(ctx, { styleId: style.id, skuPrefix: "HIGH", marketPrices: { US: 4_500 } });
    await createVariant(ctx, { styleId: style.id, skuPrefix: "LOW", marketPrices: { US: 2_999 } });

    const summaries = await getWigStyles({}, MarketCode.US, "en");
    const summary = summaries.find((item) => item.id === style.id);

    expect(summary?.id).toBe(style.id);
    expect(summary?.basePrice).toBe(2_999);
  });

  it("keeps catalog detail prices aligned with cart prices for the same market", async () => {
    const style = await createStyle(ctx);
    const variant = await createVariant(ctx, { styleId: style.id, marketPrices: { US: 2_999 } });
    await addToCart(ctx.userId, variant.id, style.id, 1, MarketCode.US);

    const catalogPrice = await detailVariantPrice(style.id, variant.id, MarketCode.US);
    const [cartItem] = await getCart(ctx.userId, MarketCode.US);

    expect(catalogPrice).toBe(2_999);
    expect(cartItem?.variantId).toBe(variant.id);
    expect(cartItem?.price).toBe(catalogPrice);
  });

  it("fails catalog and cart projection closed when the Market is inactive", async () => {
    const style = await createStyle(ctx, { markets: [MarketCode.US] });
    const variant = await createVariant(ctx, { styleId: style.id, marketPrices: { US: 2_999 } });
    await addToCart(ctx.userId, variant.id, style.id, 1, MarketCode.US);
    await db.market.update({ where: { code: MarketCode.US }, data: { isActive: false } });

    try {
      await expect(getWigStyles({}, MarketCode.US, "en")).resolves.not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: style.id })]),
      );
      await expect(getWigStyleById(style.id, MarketCode.US, "en")).resolves.toBeNull();
      await expect(getCart(ctx.userId, MarketCode.US)).resolves.toEqual([
        expect.objectContaining({ variantId: variant.id, unavailableCode: "STYLE_UNPUBLISHED" }),
      ]);
    } finally {
      await db.market.update({ where: { code: MarketCode.US }, data: { isActive: true } });
    }
  });
});

function makeContext(): TestContext {
  return { userId: `catalog_${randomUUID()}`, styleIds: [], variantIds: [] };
}

async function ensureMarkets(): Promise<void> {
  await upsertMarket(MarketCode.KR, "KRW", [ShippingCountry.KR], "ko");
  await upsertMarket(MarketCode.US, "USD", [ShippingCountry.US], "en");
  await upsertMarket(MarketCode.JP, "JPY", [ShippingCountry.JP], "ja");
}

async function upsertMarket(
  code: MarketCode,
  currency: string,
  shippableCountries: ShippingCountry[],
  defaultLocale: string,
): Promise<void> {
  await db.market.upsert({
    where: { code },
    update: { currency, shippableCountries, defaultLocale, isActive: true },
    create: { code, currency, shippableCountries, defaultLocale, isActive: true },
  });
}

async function createStyle(context: TestContext, input: StyleInput = {}) {
  const style = await db.wigStyle.create({
    data: {
      name: `Catalog Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/catalog-cover.png",
      availableMarkets: {
        create: (input.markets ?? [MarketCode.KR, MarketCode.US, MarketCode.JP]).map((marketCode) => ({
          marketCode,
          isActive: true,
        })),
      },
    },
    select: { id: true },
  });
  context.styleIds.push(style.id);
  return style;
}

async function createVariant(context: TestContext, input: VariantInput) {
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: input.styleId,
      color: "Natural Black",
      colorHex: "#111111",
      length: "Medium",
      curl: "C Curl",
      price: input.legacyPrice ?? LEGACY_BASE_PRICE,
      stock: 10,
      sku: `${input.skuPrefix ?? "CAT"}-${randomUUID()}`,
    },
    select: { id: true },
  });
  context.variantIds.push(variant.id);
  await createMarketPrices(variant.id, input.marketPrices ?? {});
  return variant;
}

async function createMarketPrices(variantId: string, prices: Partial<Record<MarketCode, number>>): Promise<void> {
  for (const [marketCode, amount] of Object.entries(prices)) {
    if (amount === undefined) continue;
    await db.variantMarketPrice.create({ data: { variantId, marketCode, amount } });
  }
}

async function detailVariantPrice(styleId: string, variantId: string, marketCode: MarketCode): Promise<number | null> {
  const style = await getWigStyleById(styleId, marketCode, "en");
  const variant = style?.variants.find((item) => item.id === variantId);
  if (!variant) throw new Error(`Missing variant ${variantId}`);
  return variant.price;
}

async function cleanup(context: TestContext): Promise<void> {
  await db.cartItem.deleteMany({ where: { userId: context.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  await db.wigStyleMarket.deleteMany({ where: { wigStyleId: { in: context.styleIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
