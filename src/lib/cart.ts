// ============================================================
// lib/cart.ts — 장바구니 비즈니스 로직 (STRICT 존, 서버 전용)
// app/actions/cart.ts는 세션 → userId 변환 + revalidate만 담당.
// 비즈니스 규칙은 모두 여기에. 에러는 던진다.
// ============================================================
import "server-only";

import { db } from "./db";
import {
  variantPurchasableInMarketFailure,
  commerceIntegrityMessage,
  type CommerceIntegrityFailureCode,
} from "./commerce-integrity";
import type { MarketCode } from "./market/types";
import { MARKET_CONFIGS } from "./market/types";

// ── 에러 타입 ─────────────────────────────────────────────────

export type CartErrorCode =
  | "INVALID_QUANTITY"
  | CommerceIntegrityFailureCode
  | "VARIANT_NOT_FOUND"
  | "STOCK_EXCEEDED"
  | "ITEM_NOT_FOUND"
  | "FORBIDDEN";

export class CartException extends Error {
  constructor(
    public readonly code: CartErrorCode,
    message: string,
    public readonly meta?: Record<string, number>,
  ) {
    super(message);
    this.name = "CartException";
  }
}

// ── 공개 타입 ─────────────────────────────────────────────────

export interface CartItemView {
  id: string;
  quantity: number;
  variantId: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  price: number | null;
  stock: number;
  styleId: string;
  styleName: string;
  coverImageKey: string | null;
  unavailableCode: CommerceIntegrityFailureCode | null;
  unavailableMessage: string | null;
}

export type MarketSwitchLineClassification = "UNCHANGED" | "REPRICED" | "UNAVAILABLE" | "TARGET_PROJECTION";

export interface MarketSwitchLineImpact {
  cartItemId: string;
  variantId: string;
  styleName: string;
  quantity: number;
  currentUnitAmount: number | null;
  targetUnitAmount: number | null;
  targetAvailable: boolean;
  targetUnavailableCode: CommerceIntegrityFailureCode | null;
  classification: MarketSwitchLineClassification;
}

export interface MarketSwitchImpact {
  currentMarket: MarketCode | null;
  targetMarket: MarketCode;
  currentCurrency: string | null;
  targetCurrency: string;
  lines: MarketSwitchLineImpact[];
  fingerprint: string;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────

type CartRow = Awaited<ReturnType<typeof fetchCartRows>>[number];

async function fetchCartRows(userId: string, marketCode: MarketCode) {
  return db.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quantity: true,
      wigStyleId: true,
      variant: {
        select: {
          id: true,
          wigStyleId: true,
          isActive: true,
          color: true,
          colorHex: true,
          length: true,
          curl: true,
          stock: true,
          marketPrices: { where: { marketCode }, select: { amount: true }, take: 1 },
        },
      },
      style: {
        select: {
          id: true,
          name: true,
          coverImageKey: true,
          isActive: true,
          availableMarkets: {
            where: { marketCode, isActive: true, market: { isActive: true } },
            select: { marketCode: true },
            take: 1,
          },
        },
      },
    },
  });
}

function toView(row: CartRow): CartItemView {
  const unavailableCode = variantPurchasableInMarketFailure({
    selectedStyleId: row.wigStyleId,
    canonicalStyleId: row.variant.wigStyleId,
    styleActive: row.style.isActive,
    stylePublishedInMarket: row.style.availableMarkets.length === 1,
    variantActive: row.variant.isActive,
    hasMarketPrice: row.variant.marketPrices.length === 1,
    stock: row.variant.stock,
    quantity: row.quantity,
  });
  return {
    id: row.id,
    quantity: row.quantity,
    variantId: row.variant.id,
    color: row.variant.color,
    colorHex: row.variant.colorHex,
    length: row.variant.length,
    curl: row.variant.curl,
    price: row.variant.marketPrices[0]?.amount ?? null,
    stock: row.variant.stock,
    styleId: row.style.id,
    styleName: row.style.name,
    coverImageKey: row.style.coverImageKey,
    unavailableCode,
    unavailableMessage: unavailableCode ? commerceIntegrityMessage(unavailableCode) : null,
  };
}

// ── 공개 API ─────────────────────────────────────────────────

export async function getCart(userId: string, marketCode: MarketCode): Promise<CartItemView[]> {
  const rows = await fetchCartRows(userId, marketCode);
  return rows.map(toView);
}

export async function getCartItemCount(userId: string): Promise<number> {
  return db.cartItem.count({ where: { userId } });
}

export async function getMarketSwitchImpact(
  userId: string,
  currentMarket: MarketCode,
  targetMarket: MarketCode,
): Promise<MarketSwitchImpact> {
  const [currentItems, targetItems] = await Promise.all([
    getCart(userId, currentMarket),
    getCart(userId, targetMarket),
  ]);
  const targetById = new Map(targetItems.map((item) => [item.id, item]));
  const lines = currentItems.map((current): MarketSwitchLineImpact => {
    const target = targetById.get(current.id);
    if (!target) throw new Error(`Cart projection lost item ${current.id}.`);
    const targetAvailable = target.price !== null && target.unavailableCode === null;
    const classification: MarketSwitchLineClassification = !targetAvailable
      ? "UNAVAILABLE"
      : current.price === target.price
        ? "UNCHANGED"
        : "REPRICED";
    return {
      cartItemId: current.id,
      variantId: current.variantId,
      styleName: current.styleName,
      quantity: current.quantity,
      currentUnitAmount: current.price,
      targetUnitAmount: target.price,
      targetAvailable,
      targetUnavailableCode: target.unavailableCode,
      classification,
    };
  });
  const impactWithoutFingerprint = {
    currentMarket,
    targetMarket,
    currentCurrency: MARKET_CONFIGS[currentMarket].currency.code,
    targetCurrency: MARKET_CONFIGS[targetMarket].currency.code,
    lines,
  };
  return {
    ...impactWithoutFingerprint,
    fingerprint: JSON.stringify(impactWithoutFingerprint),
  };
}

export async function getMarketAdmissionImpact(
  userId: string,
  targetMarket: MarketCode,
): Promise<MarketSwitchImpact> {
  const targetItems = await getCart(userId, targetMarket);
  const lines = targetItems.map((target): MarketSwitchLineImpact => {
    const targetAvailable = target.price !== null && target.unavailableCode === null;
    return {
      cartItemId: target.id,
      variantId: target.variantId,
      styleName: target.styleName,
      quantity: target.quantity,
      currentUnitAmount: null,
      targetUnitAmount: target.price,
      targetAvailable,
      targetUnavailableCode: target.unavailableCode,
      classification: targetAvailable ? "TARGET_PROJECTION" : "UNAVAILABLE",
    };
  });
  const impactWithoutFingerprint = {
    currentMarket: null,
    targetMarket,
    currentCurrency: null,
    targetCurrency: MARKET_CONFIGS[targetMarket].currency.code,
    lines,
  };
  return {
    ...impactWithoutFingerprint,
    fingerprint: JSON.stringify(impactWithoutFingerprint),
  };
}

export async function addToCart(
  userId: string,
  variantId: string,
  wigStyleId: string,
  quantity: number,
  marketCode: MarketCode,
): Promise<void> {
  if (quantity < 1) throw new CartException("INVALID_QUANTITY", "수량은 1 이상이어야 합니다.");

  const variant = await db.wigVariant.findUnique({
    where: { id: variantId },
    select: {
      wigStyleId: true,
      isActive: true,
      stock: true,
      wigStyle: {
        select: {
          isActive: true,
          availableMarkets: {
            where: { marketCode, isActive: true, market: { isActive: true } },
            select: { marketCode: true },
            take: 1,
          },
        },
      },
      marketPrices: {
        where: { marketCode },
        select: { amount: true },
        take: 1,
      },
    },
  });
  if (!variant) throw new CartException("VARIANT_NOT_FOUND", "옵션을 찾을 수 없습니다.");

  const existing = await db.cartItem.findUnique({
    where: { userId_variantId: { userId, variantId } },
    select: { id: true, quantity: true, wigStyleId: true },
  });

  const newQty = (existing?.quantity ?? 0) + quantity;
  if (existing && existing.wigStyleId !== wigStyleId) {
    throwIntegrityFailure("VARIANT_PARENT_MISMATCH", variant.stock);
  }
  const failure = variantPurchasableInMarketFailure({
    selectedStyleId: wigStyleId,
    canonicalStyleId: variant.wigStyleId,
    styleActive: variant.wigStyle.isActive,
    stylePublishedInMarket: variant.wigStyle.availableMarkets.length === 1,
    variantActive: variant.isActive,
    hasMarketPrice: variant.marketPrices.length === 1,
    stock: variant.stock,
    quantity: newQty,
  });
  if (failure) throwIntegrityFailure(failure, variant.stock);

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
  } else {
    await db.cartItem.create({ data: { userId, variantId, wigStyleId, quantity } });
  }
}

export async function updateQuantity(
  userId: string,
  cartItemId: string,
  quantity: number,
  marketCode: MarketCode,
): Promise<void> {
  if (quantity < 1) throw new CartException("INVALID_QUANTITY", "수량은 1 이상이어야 합니다.");

  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    select: {
      userId: true,
      wigStyleId: true,
      style: {
        select: {
          isActive: true,
          availableMarkets: {
            where: { marketCode, isActive: true, market: { isActive: true } },
            select: { marketCode: true },
            take: 1,
          },
        },
      },
      variant: {
        select: {
          wigStyleId: true,
          isActive: true,
          stock: true,
          marketPrices: {
            where: { marketCode },
            select: { amount: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!item) throw new CartException("ITEM_NOT_FOUND", "장바구니 항목을 찾을 수 없습니다.");
  if (item.userId !== userId) throw new CartException("FORBIDDEN", "권한이 없습니다.");
  const failure = variantPurchasableInMarketFailure({
    selectedStyleId: item.wigStyleId,
    canonicalStyleId: item.variant.wigStyleId,
    styleActive: item.style.isActive,
    stylePublishedInMarket: item.style.availableMarkets.length === 1,
    variantActive: item.variant.isActive,
    hasMarketPrice: item.variant.marketPrices.length === 1,
    stock: item.variant.stock,
    quantity,
  });
  if (failure) throwIntegrityFailure(failure, item.variant.stock);

  await db.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
}

function throwIntegrityFailure(code: CommerceIntegrityFailureCode, stock: number): never {
  if (code === "STOCK_INSUFFICIENT") {
    throw new CartException("STOCK_EXCEEDED", `재고 부족 (최대 ${stock}개)`, { available: stock });
  }
  throw new CartException(code, commerceIntegrityMessage(code));
}

export async function removeFromCart(
  userId: string,
  cartItemId: string,
): Promise<void> {
  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    select: { userId: true },
  });
  if (!item) throw new CartException("ITEM_NOT_FOUND", "장바구니 항목을 찾을 수 없습니다.");
  if (item.userId !== userId) throw new CartException("FORBIDDEN", "권한이 없습니다.");

  await db.cartItem.delete({ where: { id: cartItemId } });
}
