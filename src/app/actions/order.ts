"use server";

// ============================================================
// app/actions/order.ts — 주문 생성 서버 액션 (thin wrapper)
// 세션 → userId 변환 + lib/order/db.ts 호출만 담당.
// 금액·가격·통화는 절대 클라이언트에서 받지 않는다.
// ============================================================

import { getSession } from "@/lib/session";
import { getCurrentMarketCode } from "@/lib/market";
import { createOrder, OrderException, type CreateOrderResult } from "@/lib/order";
import type { CheckoutAddressInput } from "@/lib/order/types";

export async function createOrderAction(
  address: CheckoutAddressInput,
): Promise<CreateOrderResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "로그인이 필요합니다." };

  const marketCode = await getCurrentMarketCode();

  try {
    const orderId = await createOrder(session.user.id, marketCode, address);
    return { success: true, orderId };
  } catch (e) {
    if (e instanceof OrderException) return { success: false, error: e.message };
    throw e;
  }
}
