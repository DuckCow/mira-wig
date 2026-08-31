import "server-only";

import {
  FulfillmentType,
  ShippingCountry,
  UserRole,
  WigCategory,
  type PrismaClient,
} from "@prisma/client";
import { createCheckoutSession } from "@/lib/payment/session";
import {
  SYNTHETIC_SALE_AMOUNT_MINOR,
  SYNTHETIC_SALE_CURRENCY,
  SYNTHETIC_SALE_LOCALE,
  SYNTHETIC_SALE_MARKET,
} from "./contract";

export type SyntheticSaleFixture = Readonly<{
  runIdentity: string;
  userId: string;
  styleId: string;
  variantId: string;
  cartItemId: string;
  sessionId: string;
}>;

export async function materializeSyntheticSaleFixture(
  client: PrismaClient,
  runIdentity: string,
  now: Date = new Date(),
): Promise<SyntheticSaleFixture> {
  requireRunIdentity(runIdentity);
  const ids = fixtureIds(runIdentity);
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'mira.synthetic-sale.' + runIdentity}, 0)) IS NULL AS "locked"`;
    const market = await tx.market.findUnique({ where: { code: SYNTHETIC_SALE_MARKET } });
    if (!market || !market.isActive || market.currency !== SYNTHETIC_SALE_CURRENCY
      || !market.shippableCountries.includes(SYNTHETIC_SALE_MARKET)) {
      throw new Error("SYNTHETIC_SALE_MARKET_INVALID");
    }
    await ensureExact(tx.user, ids.userId, {
      id: ids.userId,
      email: `mira-eximbay-canary+${runIdentity}@example.test`,
      name: "Mira Eximbay Canary",
      role: UserRole.CUSTOMER,
    }, ["id", "email", "name", "role"]);
    await ensureExact(tx.wigStyle, ids.styleId, {
      id: ids.styleId,
      name: "Mira Eximbay Canary",
      description: null,
      category: WigCategory.FASHION,
      tags: ["synthetic-eximbay-canary"],
      coverImageKey: null,
      imageKeys: [],
      sortOrder: 0,
      isActive: true,
    }, ["id", "name", "description", "category", "tags", "coverImageKey", "imageKeys", "sortOrder", "isActive"]);
    await ensureExact(tx.wigVariant, ids.variantId, {
      id: ids.variantId,
      wigStyleId: ids.styleId,
      color: "Synthetic Black",
      colorHex: "#000000",
      length: "Synthetic",
      curl: "Synthetic",
      price: SYNTHETIC_SALE_AMOUNT_MINOR,
      stock: 1,
      sku: `MIRA-EXR-${runIdentity.toUpperCase()}`,
      isActive: true,
      fulfillmentType: FulfillmentType.STOCKED,
    }, ["id", "wigStyleId", "color", "colorHex", "length", "curl", "price", "stock", "sku", "isActive", "fulfillmentType"]);
    await ensureCompositeExact(tx.wigStyleMarket, {
      wigStyleId_marketCode: { wigStyleId: ids.styleId, marketCode: SYNTHETIC_SALE_MARKET },
    }, {
      wigStyleId: ids.styleId,
      marketCode: SYNTHETIC_SALE_MARKET,
      isActive: true,
    }, ["wigStyleId", "marketCode", "isActive"]);
    await ensureCompositeExact(tx.variantMarketPrice, {
      variantId_marketCode: { variantId: ids.variantId, marketCode: SYNTHETIC_SALE_MARKET },
    }, {
      variantId: ids.variantId,
      marketCode: SYNTHETIC_SALE_MARKET,
      amount: SYNTHETIC_SALE_AMOUNT_MINOR,
    }, ["variantId", "marketCode", "amount"]);
    await ensureExact(tx.cartItem, ids.cartItemId, {
      id: ids.cartItemId,
      userId: ids.userId,
      wigStyleId: ids.styleId,
      variantId: ids.variantId,
      quantity: 1,
    }, ["id", "userId", "wigStyleId", "variantId", "quantity"]);
  });

  const sessions = await client.checkoutSession.findMany({
    where: { userId: ids.userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (sessions.length > 1) throw new Error("SYNTHETIC_SALE_SESSION_AMBIGUOUS");
  const existing = sessions[0];
  const sessionId = existing?.id ?? (await createCheckoutSession(client, {
    userId: ids.userId,
    marketCode: SYNTHETIC_SALE_MARKET,
    communicationLocale: SYNTHETIC_SALE_LOCALE,
    shipping: {
      recipientName: "Mira Eximbay Canary",
      phone: "+1-202-555-0100",
      country: ShippingCountry.US,
      postalCode: "10001",
      administrativeArea: "NY",
      city: "Synthetic City",
      addressLine1: "1 Synthetic Avenue",
      addressLine2: undefined,
      memo: undefined,
    },
    now,
  })).sessionId;
  return Object.freeze({ runIdentity, ...ids, sessionId });
}

function fixtureIds(runIdentity: string) {
  return Object.freeze({
    userId: `exsale_user_${runIdentity}`,
    styleId: `exsale_style_${runIdentity}`,
    variantId: `exsale_variant_${runIdentity}`,
    cartItemId: `exsale_cart_${runIdentity}`,
  });
}

function requireRunIdentity(value: string): void {
  if (!/^[0-9a-f]{32}$/u.test(value)) throw new Error("SYNTHETIC_SALE_RUN_IDENTITY_INVALID");
}

type Delegate = { findUnique(input: object): Promise<unknown>; create(input: object): Promise<unknown> };

async function ensureExact(
  delegate: Delegate,
  id: string,
  data: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Promise<void> {
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) {
    await delegate.create({ data });
    return;
  }
  requireExactFields(existing, data, fields);
}

async function ensureCompositeExact(
  delegate: Delegate,
  where: Readonly<Record<string, unknown>>,
  data: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Promise<void> {
  const existing = await delegate.findUnique({ where });
  if (!existing) {
    await delegate.create({ data });
    return;
  }
  requireExactFields(existing, data, fields);
}

function requireExactFields(
  actual: unknown,
  expected: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): void {
  if (!isRecord(actual)) throw new Error("SYNTHETIC_SALE_FIXTURE_DRIFT");
  for (const field of fields) {
    if (JSON.stringify(actual[field]) !== JSON.stringify(expected[field])) {
      throw new Error("SYNTHETIC_SALE_FIXTURE_DRIFT");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
