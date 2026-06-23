// ============================================================
// lib/payment/reconciliation.ts — PG 확정 / 로컬 미확정 보정
// STRICT 존: confirm 성공 후 local finalize 실패를 운영이 볼 수 있게 남긴다.
// ============================================================

import { db } from "@/lib/db";

type PaymentSuccessResult = { status: "success"; success: true; paymentId: string };
type PaymentUnconfirmedResult = {
  status: "unconfirmed";
  success: false;
  error: string;
  orderId: string;
  providerTransactionId: string | null;
};

type ReconciliationInput = {
  orderId: string;
  paymentKey: string;
  providerTransactionId: string | null;
  provider: string;
  amount: number;
  currency: string;
  error: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 결제 확정 오류";
}

export async function paidOrderResult(orderId: string): Promise<PaymentSuccessResult | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (order?.status !== "PAID") return null;
  const payment = await db.payment.findFirst({
    where: { orderId, status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return { status: "success", success: true, paymentId: payment?.id ?? "" };
}

export async function paidOrderResultOrEmpty(orderId: string): Promise<PaymentSuccessResult> {
  return (await paidOrderResult(orderId)) ?? { status: "success", success: true, paymentId: "" };
}

export function reconciliationRequired(input: ReconciliationInput): PaymentUnconfirmedResult {
  const error = errorMessage(input.error);
  console.error("PAYMENT_RECONCILIATION_REQUIRED", {
    orderId: input.orderId,
    paymentKey: input.paymentKey,
    providerTransactionId: input.providerTransactionId,
    provider: input.provider,
    amount: input.amount,
    currency: input.currency,
    error,
  });
  return {
    status: "unconfirmed",
    success: false,
    error: "결제가 승인되었지만 주문 확정이 지연 중입니다. 고객센터에서 확인 중입니다.",
    orderId: input.orderId,
    providerTransactionId: input.providerTransactionId,
  };
}
