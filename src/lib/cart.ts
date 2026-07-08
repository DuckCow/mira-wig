// ============================================================
// lib/cart.ts — 장바구니 비즈니스 로직 (STRICT 존, 서버 전용)
// app/actions/cart.ts는 세션 → userId 변환 + revalidate만 담당.
// 비즈니스 규칙은 모두 여기에. 에러는 던진다.
// ============================================================
import "server-only";

import { db } from "./db";
import type { MarketCode } from "./market/types";

// ── 에러 타입 ─────────────────────────────────────────────────

export type CartErrorCode =
  | "INVALID_QUANTITY"
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
      variant: {
        select: {
          id: true,
          color: true,
          colorHex: true,
          length: true,
          curl: true,
          stock: true,
          marketPrices: { where: { marketCode }, select: { amount: true }, take: 1 },
        },
      },
      style: { select: { id: true, name: true, coverImageKey: true } },
    },
  });
}

function toView(row: CartRow): CartItemView {
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

export async function addToCart(
  userId: string,
  variantId: string,
  wigStyleId: string,
  quantity: number,
): Promise<void> {
  if (quantity < 1) throw new CartException("INVALID_QUANTITY", "수량은 1 이상이어야 합니다.");

  const variant = await db.wigVariant.findUnique({
    where: { id: variantId, isActive: true },
    select: { stock: true },
  });
  if (!variant) throw new CartException("VARIANT_NOT_FOUND", "옵션을 찾을 수 없습니다.");

  const existing = await db.cartItem.findUnique({
    where: { userId_variantId: { userId, variantId } },
    select: { id: true, quantity: true },
  });

  const newQty = (existing?.quantity ?? 0) + quantity;
  if (newQty > variant.stock) {
    throw new CartException("STOCK_EXCEEDED", `재고 부족 (최대 ${variant.stock}개)`, { available: variant.stock });
  }

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
): Promise<void> {
  if (quantity < 1) throw new CartException("INVALID_QUANTITY", "수량은 1 이상이어야 합니다.");

  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    select: { userId: true, variant: { select: { stock: true } } },
  });
  if (!item) throw new CartException("ITEM_NOT_FOUND", "장바구니 항목을 찾을 수 없습니다.");
  if (item.userId !== userId) throw new CartException("FORBIDDEN", "권한이 없습니다.");
  if (quantity > item.variant.stock) {
    throw new CartException("STOCK_EXCEEDED", `재고 부족 (최대 ${item.variant.stock}개)`, { available: item.variant.stock });
  }

  await db.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
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
