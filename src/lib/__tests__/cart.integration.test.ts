import { randomUUID } from "crypto";
import { FulfillmentType, ShippingCountry, WigCategory } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CartException,
  addToCart,
  getCart,
  getCartItemCount,
  removeFromCart,
  updateQuantity,
} from "@/lib/cart";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";

const LEGACY_BASE_PRICE = 88_000;

interface TestContext {
  userId: string;
  otherUserId: string;
  styleIds: string[];
  variantIds: string[];
}

interface VariantOptions {
  stock?: number;
  legacyPrice?: number;
  marketPrices?: Partial<Record<MarketCode, number>>;
}

describe("cart pricing", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.createMany({
      data: [
        { id: ctx.userId, email: `${ctx.userId}@example.test` },
        { id: ctx.otherUserId, email: `${ctx.otherUserId}@example.test` },
      ],
    });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("resolves cart line prices from VariantMarketPrice for each market", async () => {
    const variant = await createCatalogVariant(ctx, {
      marketPrices: { KR: 12_000, US: 2_999, JP: 1_500 },
    });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);

    await expect(firstCartPrice(ctx.userId, MarketCode.KR)).resolves.toBe(12_000);
    await expect(firstCartPrice(ctx.userId, MarketCode.US)).resolves.toBe(2_999);
    await expect(firstCartPrice(ctx.userId, MarketCode.JP)).resolves.toBe(1_500);
    for (const marketCode of [MarketCode.KR, MarketCode.US, MarketCode.JP]) {
      await expect(firstCartPrice(ctx.userId, marketCode)).resolves.not.toBe(LEGACY_BASE_PRICE);
    }
  });

  it("returns null when the current market price is missing", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);

    const [item] = await getCart(ctx.userId, MarketCode.US);

    expect(item?.price).toBeNull();
    expect(item?.price).not.toBe(0);
    expect(item?.price).not.toBe(LEGACY_BASE_PRICE);
  });

  it("keeps cart display line prices equal to checkout session snapshots", async () => {
    const first = await createCatalogVariant(ctx, { marketPrices: { US: 2_999 } });
    const second = await createCatalogVariant(ctx, { marketPrices: { US: 4_500 } });
    await addToCart(ctx.userId, first.id, first.styleId, 2, MarketCode.US);
    await addToCart(ctx.userId, second.id, second.styleId, 1, MarketCode.US);

    const cartItems = await getCart(ctx.userId, MarketCode.US);
    const created = await createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.US,
      shipping: validShipping(ShippingCountry.US),
    });
    const session = await checkoutSessionWithLines(created.sessionId);
    const unitAmountByVariant = new Map(session.lines.map((line) => [line.variantId, line.unitAmount]));

    for (const item of cartItems) {
      expect(item.price).toBe(unitAmountByVariant.get(item.variantId));
    }
    expect(cartSubtotal(cartItems)).toBe(session.subtotalAmount);
  });

  it("rejects addToCart when requested quantity exceeds stock", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 1 });

    await expectCartFailure("STOCK_EXCEEDED", () => (
      addToCart(ctx.userId, variant.id, variant.styleId, 2, MarketCode.KR)
    ));
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(0);
  });

  it("rejects addToCart when requested market price is missing", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: {} });

    await expectCartFailure("VARIANT_PRICE_UNAVAILABLE", () => (
      addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)
    ));
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(0);
  });

  it("adds only in markets with a VariantMarketPrice", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000 } });

    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    await expectCartFailure("VARIANT_PRICE_UNAVAILABLE", () => (
      addToCart(ctx.otherUserId, variant.id, variant.styleId, 1, MarketCode.US)
    ));

    await expect(getCartItemCount(ctx.userId)).resolves.toBe(1);
    await expect(getCartItemCount(ctx.otherUserId)).resolves.toBe(0);
  });

  it("enforces market price guard on existing item increments", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const itemId = await firstCartItemId(ctx.userId);

    await deleteMarketPrice(variant.id, MarketCode.KR);

    await expectCartFailure("VARIANT_PRICE_UNAVAILABLE", () => (
      addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)
    ));
    await expect(cartQuantity(itemId)).resolves.toBe(1);
  });

  it("blocks mutation but allows explicit removal after a cart line loses its market price", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 3, marketPrices: { KR: 12_000 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const itemId = await firstCartItemId(ctx.userId);

    await deleteMarketPrice(variant.id, MarketCode.KR);

    await expectCartFailure("VARIANT_PRICE_UNAVAILABLE", () => (
      updateQuantity(ctx.userId, itemId, 2, MarketCode.KR)
    ));
    await expect(cartQuantity(itemId)).resolves.toBe(1);
    await removeFromCart(ctx.userId, itemId);
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(0);
  });

  it("rejects updateQuantity for a cart item owned by another user", async () => {
    const variant = await createCatalogVariant(ctx);
    await addToCart(ctx.otherUserId, variant.id, variant.styleId, 1, MarketCode.KR);
    const otherItem = await firstCartItemId(ctx.otherUserId);

    await expectCartFailure("FORBIDDEN", () => updateQuantity(ctx.userId, otherItem, 2, MarketCode.KR));
  });

  it("rejects updateQuantity when requested quantity exceeds stock", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 2 });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const itemId = await firstCartItemId(ctx.userId);

    await expectCartFailure("STOCK_EXCEEDED", () => updateQuantity(ctx.userId, itemId, 3, MarketCode.KR));
    await expect(cartQuantity(itemId)).resolves.toBe(1);
  });

  it("rejects removeFromCart for a cart item owned by another user", async () => {
    const variant = await createCatalogVariant(ctx);
    await addToCart(ctx.otherUserId, variant.id, variant.styleId, 1, MarketCode.KR);
    const otherItem = await firstCartItemId(ctx.otherUserId);

    await expectCartFailure("FORBIDDEN", () => removeFromCart(ctx.userId, otherItem));
    await expect(getCartItemCount(ctx.otherUserId)).resolves.toBe(1);
  });

  it("keeps getCartItemCount as an identity-count query", async () => {
    const first = await createCatalogVariant(ctx);
    const second = await createCatalogVariant(ctx);
    await addToCart(ctx.userId, first.id, first.styleId, 2, MarketCode.KR);
    await addToCart(ctx.userId, second.id, second.styleId, 3, MarketCode.KR);

    await expect(getCartItemCount(ctx.userId)).resolves.toBe(2);
  });

  it("rejects a forged style and variant pair before any cart write", async () => {
    const first = await createCatalogVariant(ctx);
    const second = await createCatalogVariant(ctx);

    await expectCartFailure("VARIANT_PARENT_MISMATCH", () => (
      addToCart(ctx.userId, second.id, first.styleId, 1, MarketCode.KR)
    ));

    await expect(getCartItemCount(ctx.userId)).resolves.toBe(0);
  });

  it("keeps a malformed row visible and blocks checkout without repairing it", async () => {
    const first = await createCatalogVariant(ctx);
    const second = await createCatalogVariant(ctx);
    await db.cartItem.create({
      data: { userId: ctx.userId, wigStyleId: first.styleId, variantId: second.id, quantity: 1 },
    });

    const [line] = await getCart(ctx.userId, MarketCode.KR);
    expect(line?.unavailableCode).toBe("VARIANT_PARENT_MISMATCH");
    await expect(createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.KR,
      shipping: validShipping(ShippingCountry.KR),
    })).rejects.toMatchObject({ code: "VARIANT_PARENT_MISMATCH" });
    await expect(db.checkoutSession.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
    await expect(db.cartItem.findUnique({
      where: { userId_variantId: { userId: ctx.userId, variantId: second.id } },
      select: { wigStyleId: true },
    })).resolves.toEqual({ wigStyleId: first.styleId });
  });

  it("revalidates publication when the market changes", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000, US: 2_999 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: { wigStyleId: variant.styleId, marketCode: MarketCode.US } },
      data: { isActive: false },
    });

    const [line] = await getCart(ctx.userId, MarketCode.US);
    expect(line?.unavailableCode).toBe("STYLE_UNPUBLISHED");
    await expect(createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.US,
      shipping: validShipping(ShippingCountry.US),
    })).rejects.toMatchObject({ code: "STYLE_UNPUBLISHED" });
    await expect(db.checkoutSession.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
  });
});

function makeContext(): TestContext {
  return {
    userId: `cart_${randomUUID()}`,
    otherUserId: `cart_other_${randomUUID()}`,
    styleIds: [],
    variantIds: [],
  };
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

async function createCatalogVariant(context: TestContext, options: VariantOptions = {}) {
  const style = await db.wigStyle.create({
    data: {
      name: `Cart Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/cart-cover.png",
      availableMarkets: {
        create: [MarketCode.KR, MarketCode.US, MarketCode.JP].map((marketCode) => ({
          marketCode,
          isActive: true,
        })),
      },
    },
    select: { id: true },
  });
  context.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      colorHex: "#111111",
      length: "Medium",
      curl: "C Curl",
      price: options.legacyPrice ?? LEGACY_BASE_PRICE,
      stock: options.stock ?? 10,
      sku: `CART-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
    },
    select: { id: true, wigStyleId: true },
  });
  context.variantIds.push(variant.id);
  await createMarketPrices(variant.id, options.marketPrices ?? { KR: 12_000 });
  return { id: variant.id, styleId: variant.wigStyleId };
}

async function createMarketPrices(variantId: string, prices: Partial<Record<MarketCode, number>>): Promise<void> {
  for (const [marketCode, amount] of Object.entries(prices)) {
    if (amount === undefined) continue;
    await db.variantMarketPrice.create({ data: { variantId, marketCode, amount } });
  }
}

async function firstCartPrice(userId: string, marketCode: MarketCode): Promise<number | null> {
  const [item] = await getCart(userId, marketCode);
  if (!item) throw new Error("Expected cart item");
  return item.price;
}

async function checkoutSessionWithLines(sessionId: string) {
  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    select: {
      subtotalAmount: true,
      lines: { select: { variantId: true, unitAmount: true, quantity: true } },
    },
  });
  if (!session) throw new Error(`Missing checkout session ${sessionId}`);
  return session;
}

function cartSubtotal(items: Awaited<ReturnType<typeof getCart>>): number {
  return items.reduce((sum, item) => {
    if (item.price === null) throw new Error("Expected priced cart item");
    return sum + item.price * item.quantity;
  }, 0);
}

function validShipping(country: ShippingCountry): CheckoutShippingInput {
  return {
    recipientName: "홍길동",
    phone: "010-1234-5678",
    country,
    postalCode: "12345",
    administrativeArea: "서울특별시",
    city: "강남구",
    addressLine1: "테헤란로 1",
    addressLine2: "101호",
    memo: "문 앞에 놓아주세요",
  };
}

async function firstCartItemId(userId: string): Promise<string> {
  const item = await db.cartItem.findFirst({ where: { userId }, select: { id: true } });
  if (!item) throw new Error("Expected cart item");
  return item.id;
}

async function cartQuantity(cartItemId: string): Promise<number> {
  const item = await db.cartItem.findUnique({ where: { id: cartItemId }, select: { quantity: true } });
  if (!item) throw new Error("Expected cart item");
  return item.quantity;
}

async function deleteMarketPrice(variantId: string, marketCode: MarketCode): Promise<void> {
  await db.variantMarketPrice.delete({ where: { variantId_marketCode: { variantId, marketCode } } });
}

async function expectCartFailure(code: CartException["code"], act: () => Promise<unknown>): Promise<void> {
  await expect(act()).rejects.toMatchObject({ code });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.checkoutSessionLine.deleteMany({ where: { session: { userId: context.userId } } });
  await db.checkoutSessionShipping.deleteMany({ where: { session: { userId: context.userId } } });
  await db.checkoutSession.deleteMany({ where: { userId: context.userId } });
  await db.cartItem.deleteMany({ where: { userId: { in: [context.userId, context.otherUserId] } } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  await db.user.deleteMany({ where: { id: { in: [context.userId, context.otherUserId] } } });
}
