"use server";

// ============================================================
// app/actions/cart.ts — 세션 → userId 변환 + revalidate 전용
// 비즈니스 로직은 lib/cart.ts에 있음. 여기서는 절대 직접 DB 접근 금지.
// ============================================================

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getStorefrontContext } from "@/lib/market/resolve";
import { isMarketCode, type MarketCode } from "@/lib/market/types";
import {
  addToCart as libAddToCart,
  removeFromCart as libRemoveFromCart,
  updateQuantity as libUpdateQuantity,
  CartException,
} from "@/lib/cart";

export type CartActionResult =
  | { success: true }
  | { success: false; errorCode: "UNAUTHORIZED" | "MARKET_CHANGED" | "MARKET_CONFIRMATION_REQUIRED" | "CART_ERROR"; error: string };

async function requireUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

function handleCartException(e: unknown): CartActionResult {
  if (e instanceof CartException) return { success: false, errorCode: "CART_ERROR", error: e.message };
  throw e;
}

// ── 공개 액션 ─────────────────────────────────────────────────

export async function addToCart(
  expectedMarketValue: string,
  variantId: string,
  wigStyleId: string,
  quantity: number,
): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const context = await confirmedMutationContext(expectedMarketValue);
  if (!context.success) return context.result;

  try {
    await libAddToCart(userId, variantId, wigStyleId, quantity, context.marketCode);
    revalidatePath("/cart");
    return { success: true };
  } catch (e) {
    return handleCartException(e);
  }
}

export async function removeFromCart(cartItemId: string): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    await libRemoveFromCart(userId, cartItemId);
    revalidatePath("/cart");
    return { success: true };
  } catch (e) {
    return handleCartException(e);
  }
}

export async function updateCartQuantity(
  cartItemId: string,
  quantity: number,
  expectedMarketValue: string,
): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const context = await confirmedMutationContext(expectedMarketValue);
  if (!context.success) return context.result;

  try {
    await libUpdateQuantity(userId, cartItemId, quantity, context.marketCode);
    revalidatePath("/cart");
    return { success: true };
  } catch (e) {
    return handleCartException(e);
  }
}

type ConfirmedMutationContext =
  | { success: true; marketCode: MarketCode }
  | { success: false; result: CartActionResult };

async function confirmedMutationContext(expectedMarketValue: string): Promise<ConfirmedMutationContext> {
  if (!isMarketCode(expectedMarketValue)) {
    return { success: false, result: { success: false, errorCode: "MARKET_CHANGED", error: "배송 지역이 변경되었습니다." } };
  }
  const context = await getStorefrontContext();
  if (context.confirmedMarketCode === null) {
    return { success: false, result: { success: false, errorCode: "MARKET_CONFIRMATION_REQUIRED", error: "장바구니 변경 전에 배송 지역을 확인해 주세요." } };
  }
  if (context.confirmedMarketCode !== expectedMarketValue) {
    return { success: false, result: { success: false, errorCode: "MARKET_CHANGED", error: "배송 지역이 변경되었습니다." } };
  }
  return { success: true, marketCode: context.confirmedMarketCode };
}

function unauthorized(): CartActionResult {
  return { success: false, errorCode: "UNAUTHORIZED", error: "로그인이 필요합니다." };
}
