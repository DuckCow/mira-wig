import { randomUUID } from "crypto";
import { FulfillmentType, ShippingCountry, WigCategory } from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CartException,
  addToCart,
  getCart,
  getCartItemCount,
  getMarketAdmissionImpact,
  getMarketSwitchImpact,
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

  it("preserves malformed existing-parent precedence over request stock validation", async () => {
    const persistedStyle = await createCatalogVariant(ctx);
    const requestedVariant = await createCatalogVariant(ctx, { stock: 1 });
    await db.cartItem.create({
      data: {
        userId: ctx.userId,
        wigStyleId: persistedStyle.styleId,
        variantId: requestedVariant.id,
        quantity: 1,
      },
    });

    await expectCartFailure("VARIANT_PARENT_MISMATCH", () => (
      addToCart(ctx.userId, requestedVariant.id, requestedVariant.styleId, 2, MarketCode.KR)
    ));
    await expect(db.cartItem.findUnique({
      where: { userId_variantId: { userId: ctx.userId, variantId: requestedVariant.id } },
      select: { wigStyleId: true, quantity: true },
    })).resolves.toEqual({ wigStyleId: persistedStyle.styleId, quantity: 1 });
  });

  it("atomically preserves concurrent increments for an existing cart identity", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 5 });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const itemId = await firstCartItemId(ctx.userId);
    const boundary = await holdCartItemRowWriteBoundary(itemId);
    const contenders = [
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)),
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)),
    ];

    try {
      const blocked = await waitForBlockedCartWrites(boundary, 1);
      expect(blocked).toHaveLength(1);
      await boundary.release();

      const results = await Promise.all(contenders);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      await expect(cartQuantity(itemId)).resolves.toBe(3);
    } finally {
      await boundary.close();
      await Promise.all(contenders);
    }
  });

  it("converges concurrent empty-row adds without exposing a create collision", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 5 });
    const boundary = await holdCartItemTableWriteBoundary();
    const contenders = [
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)),
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 2, MarketCode.KR)),
    ];

    try {
      const blocked = await waitForBlockedCartWrites(boundary, 1);
      expect(blocked).toHaveLength(1);
      await boundary.release();

      const results = await Promise.all(contenders);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      await expect(db.cartItem.findMany({
        where: { userId: ctx.userId, variantId: variant.id },
        select: { quantity: true },
      })).resolves.toEqual([{ quantity: 3 }]);
    } finally {
      await boundary.close();
      await Promise.all(contenders);
    }
  });

  it("rolls back the concurrent increment that would exceed stock", async () => {
    const variant = await createCatalogVariant(ctx, { stock: 2 });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const itemId = await firstCartItemId(ctx.userId);
    const boundary = await holdCartItemRowWriteBoundary(itemId);
    const contenders = [
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)),
      settle(addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)),
    ];

    try {
      const blocked = await waitForBlockedCartWrites(boundary, 1);
      expect(blocked).toHaveLength(1);
      await boundary.release();

      const results = await Promise.all(contenders);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        reason: { name: "CartException", code: "STOCK_EXCEEDED" },
      });
      await expect(cartQuantity(itemId)).resolves.toBe(2);
    } finally {
      await boundary.close();
      await Promise.all(contenders);
    }
  });

  it("keeps a different cart identity writable while one identity is row-locked", async () => {
    const blockedVariant = await createCatalogVariant(ctx, { stock: 3 });
    const independentVariant = await createCatalogVariant(ctx, { stock: 3 });
    await addToCart(ctx.userId, blockedVariant.id, blockedVariant.styleId, 1, MarketCode.KR);
    await addToCart(ctx.userId, independentVariant.id, independentVariant.styleId, 1, MarketCode.KR);
    const blockedItem = await cartItemForVariant(ctx.userId, blockedVariant.id);
    const independentItem = await cartItemForVariant(ctx.userId, independentVariant.id);
    const boundary = await holdCartItemRowWriteBoundary(blockedItem.id);
    const blockedAdd = settle(addToCart(
      ctx.userId,
      blockedVariant.id,
      blockedVariant.styleId,
      1,
      MarketCode.KR,
    ));

    try {
      await waitForBlockedCartWrites(boundary, 1);
      await expect(addToCart(
        ctx.userId,
        independentVariant.id,
        independentVariant.styleId,
        1,
        MarketCode.KR,
      )).resolves.toBeUndefined();
      await expect(cartQuantity(independentItem.id)).resolves.toBe(2);

      await boundary.release();
      await expect(blockedAdd).resolves.toMatchObject({ status: "fulfilled" });
      await expect(cartQuantity(blockedItem.id)).resolves.toBe(2);
    } finally {
      await boundary.close();
      await blockedAdd;
    }
  });

  it("rejects addToCart when requested market price is missing", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: {} });

    await expectCartFailure("VARIANT_PRICE_UNAVAILABLE", () => (
      addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR)
    ));
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(0);
  });

  it("rejects addToCart when the style is unpublished in the requested market", async () => {
    const variant = await createCatalogVariant(ctx);
    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: { wigStyleId: variant.styleId, marketCode: MarketCode.KR } },
      data: { isActive: false },
    });

    await expectCartFailure("STYLE_UNPUBLISHED", () => (
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

  it("previews exact repricing and unavailability without deleting cart rows", async () => {
    const repriced = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000, US: 2_999 } });
    const unavailable = await createCatalogVariant(ctx, { marketPrices: { KR: 18_000 } });
    await addToCart(ctx.userId, repriced.id, repriced.styleId, 2, MarketCode.KR);
    await addToCart(ctx.userId, unavailable.id, unavailable.styleId, 1, MarketCode.KR);

    const impact = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    expect(impact).toMatchObject({
      currentMarket: "KR",
      targetMarket: "US",
      currentCurrency: "KRW",
      targetCurrency: "USD",
    });
    expect(impact.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ variantId: repriced.id, currentUnitAmount: 12_000, targetUnitAmount: 2_999, classification: "REPRICED", targetAvailable: true }),
      expect.objectContaining({ variantId: unavailable.id, currentUnitAmount: 18_000, targetUnitAmount: null, classification: "UNAVAILABLE", targetAvailable: false }),
    ]));
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(2);
  });

  it("changes the impact fingerprint when price facts change", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000, US: 2_999 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const before = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    await db.variantMarketPrice.update({
      where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.US } },
      data: { amount: 3_499 },
    });
    const after = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.lines[0]?.targetUnitAmount).toBe(3_499);
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(1);
  });

  it("binds DB-backed currencies into switch impact and its confirmation fingerprint", async () => {
    const variant = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000, US: 2_999 } });
    await addToCart(ctx.userId, variant.id, variant.styleId, 1, MarketCode.KR);
    const before = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    await db.market.update({ where: { code: MarketCode.US }, data: { currency: "JPY" } });
    const afterCurrencyChange = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    expect(afterCurrencyChange.targetCurrency).toBe("JPY");
    expect(afterCurrencyChange.lines[0]?.targetUnitAmount).toBe(2_999);
    expect(afterCurrencyChange.fingerprint).not.toBe(before.fingerprint);

    await db.market.update({ where: { code: MarketCode.US }, data: { defaultLocale: "ko" } });
    const afterLocaleOnlyChange = await getMarketSwitchImpact(ctx.userId, MarketCode.KR, MarketCode.US);

    expect(afterLocaleOnlyChange).toEqual(afterCurrencyChange);
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(1);
  });

  it("projects target facts for an unconfirmed cart without inventing current price authority", async () => {
    const available = await createCatalogVariant(ctx, { marketPrices: { US: 2_999 } });
    const unavailable = await createCatalogVariant(ctx, { marketPrices: { KR: 12_000 } });
    await db.cartItem.createMany({
      data: [
        { userId: ctx.userId, wigStyleId: available.styleId, variantId: available.id, quantity: 2 },
        { userId: ctx.userId, wigStyleId: unavailable.styleId, variantId: unavailable.id, quantity: 1 },
      ],
    });

    const impact = await getMarketAdmissionImpact(ctx.userId, MarketCode.US);

    expect(impact).toMatchObject({
      currentMarket: null,
      currentCurrency: null,
      targetMarket: "US",
      targetCurrency: "USD",
    });
    expect(impact.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ variantId: available.id, currentUnitAmount: null, targetUnitAmount: 2_999, classification: "TARGET_PROJECTION", targetAvailable: true }),
      expect.objectContaining({ variantId: unavailable.id, currentUnitAmount: null, targetUnitAmount: null, classification: "UNAVAILABLE", targetAvailable: false }),
    ]));
    await expect(getCartItemCount(ctx.userId)).resolves.toBe(2);
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

async function cartItemForVariant(userId: string, variantId: string): Promise<{ id: string }> {
  const item = await db.cartItem.findUnique({
    where: { userId_variantId: { userId, variantId } },
    select: { id: true },
  });
  if (!item) throw new Error("Expected cart item");
  return item;
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );
}

interface CartWriteBoundary {
  client: Client;
  blockerPid: number;
  release(): Promise<void>;
  close(): Promise<void>;
}

interface CartWriteWaitEvidence {
  pid: number;
  blockingPids: number[];
}

async function holdCartItemRowWriteBoundary(cartItemId: string): Promise<CartWriteBoundary> {
  return openCartWriteBoundary(async (client) => {
    const locked = await client.query<{ id: string }>(
      'SELECT "id" FROM "CartItem" WHERE "id" = $1 FOR UPDATE',
      [cartItemId],
    );
    if (locked.rowCount !== 1) throw new Error(`Expected to lock CartItem ${cartItemId}`);
  });
}

async function holdCartItemTableWriteBoundary(): Promise<CartWriteBoundary> {
  return openCartWriteBoundary(async (client) => {
    await client.query('LOCK TABLE "CartItem" IN ACCESS EXCLUSIVE MODE');
  });
}

async function openCartWriteBoundary(acquire: (client: Client) => Promise<void>): Promise<CartWriteBoundary> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for cart concurrency tests");
  const client = new Client({
    connectionString,
    application_name: `wig_wrr_02_cart_boundary_${randomUUID()}`,
  });
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await acquire(client);
    const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const blockerPid = pidResult.rows[0]?.pid;
    if (blockerPid === undefined) throw new Error("Expected cart lock-holder pid");
    return {
      client,
      blockerPid,
      release: async () => {
        if (!transactionOpen) return;
        await client.query("COMMIT");
        transactionOpen = false;
      },
      close: async () => {
        if (transactionOpen) await client.query("ROLLBACK");
        transactionOpen = false;
        await client.end();
      },
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    await client.end();
    throw error;
  }
}

async function waitForBlockedCartWrites(
  boundary: CartWriteBoundary,
  expectedCount: number,
): Promise<CartWriteWaitEvidence[]> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await boundary.client.query<CartWriteWaitEvidence>(`
      SELECT a.pid,
             pg_blocking_pids(a.pid) AS "blockingPids"
      FROM pg_stat_activity a
      WHERE a.datname = current_database()
        AND a.pid <> pg_backend_pid()
        AND $1 = ANY(pg_blocking_pids(a.pid))
      ORDER BY a.pid
    `, [boundary.blockerPid]);
    if (result.rows.length >= expectedCount) {
      return result.rows.slice(0, expectedCount);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${expectedCount} blocked CartItem writes`);
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
