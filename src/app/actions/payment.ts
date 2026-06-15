"use server";

// ============================================================
// app/actions/payment.ts — 결제 진행 서버 액션 (thin wrapper)
// 세션·ownership 확인 후 processPayment 호출.
// 성공 시 redirect(throws) → 실패 시 에러 반환.
// ------------------------------------------------------------
// 실제 PG(Toss 등) 연동 시:
//   - shouldSucceed 파라미터 제거
//   - processPayment 호출 전 PG redirect URL을 클라이언트에 반환
//   - PG 콜백(/orders/[id]/payment/callback 등)에서 confirm() 후 처리
// ============================================================

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getOrderById } from "@/lib/order";
import { processPayment } from "@/lib/payment/process";

export type PayOrderResult = { success: false; error: string };

/**
 * @param orderId 결제할 주문 ID
 * @param shouldSucceed @mock-only mock 성공/실패 제어. 실제 PG 연동 시 제거.
 */
export async function payOrderAction(
  orderId: string,
  shouldSucceed: boolean,
): Promise<PayOrderResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "로그인이 필요합니다." };

  // ownership 확인 — getOrderById는 userId 불일치 시 null 반환
  const order = await getOrderById(orderId, session.user.id);
  if (!order) return { success: false, error: "주문을 찾을 수 없습니다." };

  const idempotencyKey = randomUUID();
  const result = await processPayment(orderId, session.user.id, idempotencyKey, shouldSucceed);

  if (result.success) {
    revalidatePath(`/orders/${orderId}`);
    redirect(`/orders/${orderId}`); // 성공 → 영수증 뷰(throws, 클라이언트 이동)
  }

  return { success: false, error: result.error };
}
