// ============================================================
// lib/payment/reconciliation.ts — PG 확정 / 로컬 미확정 보정
// STRICT 존: confirm 성공 후 local finalize 실패를 운영이 볼 수 있게 남긴다.
// ============================================================

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

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
  providerTransactionId: string;
  provider: string;
  amount: number;
  currency: string;
  error: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 결제 확정 오류";
}

function unconfirmedError(): string {
  return "결제가 승인되었지만 주문 확정이 지연 중입니다. 고객센터에서 확인 중입니다.";
}

function unconfirmedResult(orderId: string, providerTransactionId: string): PaymentUnconfirmedResult {
  return {
    status: "unconfirmed",
    success: false,
    error: unconfirmedError(),
    orderId,
    providerTransactionId,
  };
}

function markerKey(orderId: string, providerTransactionId: string): string {
  return `unconfirmed:${orderId}:${providerTransactionId}`;
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

export async function orderHasUnreconciledPayment(orderId: string): Promise<boolean> {
  const payment = await db.payment.findFirst({
    where: { orderId, status: "PENDING", providerTransactionId: { not: null } },
    select: { id: true },
  });
  return payment !== null;
}

export async function unreconciledPaymentResult(
  orderId: string,
  providerTransactionId: string | null,
): Promise<PaymentUnconfirmedResult | null> {
  if (!providerTransactionId) return null;
  const exists = await db.payment.findFirst({
    where: { orderId, status: "PENDING", providerTransactionId },
    select: { id: true },
  });
  return exists ? unconfirmedResult(orderId, providerTransactionId) : null;
}

async function ensureUnreconciledMarker(input: ReconciliationInput): Promise<void> {
  const idempotencyKey = markerKey(input.orderId, input.providerTransactionId);
  const existing = await db.payment.findFirst({
    where: { orderId: input.orderId, status: "PENDING", providerTransactionId: input.providerTransactionId },
    select: { id: true },
  });
  if (existing) return;
  try {
    await db.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        idempotencyKey,
        status: "PENDING",
        amount: input.amount,
        currency: input.currency,
        errorMessage: errorMessage(input.error),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingMarker = await unreconciledPaymentResult(input.orderId, input.providerTransactionId);
      if (existingMarker) return;
    }
    throw error;
  }
}

export async function reconciliationRequired(input: ReconciliationInput): Promise<PaymentUnconfirmedResult> {
  await ensureUnreconciledMarker(input);
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
  return unconfirmedResult(input.orderId, input.providerTransactionId);
}
