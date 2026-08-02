"use server";

// ============================================================
// app/actions/cart.ts — 세션 → userId 변환 + revalidate 전용
// 비즈니스 로직은 lib/cart.ts에 있음. 여기서는 절대 직접 DB 접근 금지.
// ============================================================

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getCurrentMarketCode } from "@/lib/market/resolve";
import {
  addToCart as libAddToCart,
  removeFromCart as libRemoveFromCart,
  updateQuantity as libUpdateQuantity,
  CartException,
} from "@/lib/cart";

export type CartActionResult =
  | { success: true }
  | { success: false; error: string };

async function requireUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

function handleCartException(e: unknown): CartActionResult {
  if (e instanceof CartException) return { success: false, error: e.message };
  throw e;
}

// ── 공개 액션 ─────────────────────────────────────────────────

export async function addToCart(
  variantId: string,
  wigStyleId: string,
  quantity: number,
): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "로그인이 필요합니다." };

  try {
    const marketCode = await getCurrentMarketCode();
    await libAddToCart(userId, variantId, wigStyleId, quantity, marketCode);
    revalidatePath("/cart");
    return { success: true };
  } catch (e) {
    return handleCartException(e);
  }
}

export async function removeFromCart(cartItemId: string): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "로그인이 필요합니다." };

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
): Promise<CartActionResult> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "로그인이 필요합니다." };

  try {
    const marketCode = await getCurrentMarketCode();
    await libUpdateQuantity(userId, cartItemId, quantity, marketCode);
    revalidatePath("/cart");
    return { success: true };
  } catch (e) {
    return handleCartException(e);
  }
}
