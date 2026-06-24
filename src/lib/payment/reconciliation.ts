// ============================================================
// lib/payment/reconciliation.ts — PG 확정 / 로컬 미확정 보정
// STRICT 존: confirm 성공 후 local finalize 실패를 운영이 볼 수 있게 남긴다.
// ============================================================

import { db } from "@/lib/db";
import { Prisma, type PaymentAttemptStatus } from "@prisma/client";
import type { PaymentProvider, RefundResult } from "./types";

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
  providerWebhookSecret?: string;
};

type RefundAdjustmentInput = ReconciliationInput & {
  reason: string;
  idempotencyKey: string;
  result: RefundResult;
};

type CompensationInput = {
  orderId: string;
  paymentKey: string;
  providerTransactionId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  error: unknown;
  providerWebhookSecret?: string;
};

const AUTO_REFUND_REASON = "AUTO_RECONCILIATION_REFUND: PG confirmed but local finalize failed";

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

function autoRefundIdempotencyKey(orderId: string, providerTransactionId: string): string {
  return `auto-refund:${orderId}:${providerTransactionId}`;
}

function failedRefundResult(providerTransactionId: string, error: unknown): RefundResult {
  const fallback = "자동 보상 환불 실패";
  const errorMessage = error instanceof Error ? error.message : fallback;
  return { providerTransactionId, status: "FAILED", errorMessage };
}

function refundUnavailableResult(providerTransactionId: string): RefundResult {
  return { providerTransactionId, status: "FAILED", errorMessage: "refund_not_supported" };
}

function logAutoRefundResult(input: CompensationInput, idempotencyKey: string, result: RefundResult): void {
  console.error(result.status === "SUCCEEDED" ? "PAYMENT_AUTO_REFUND_SUCCEEDED" : "PAYMENT_AUTO_REFUND_FAILED", {
    orderId: input.orderId,
    paymentKey: input.paymentKey,
    providerTransactionId: input.providerTransactionId,
    providerRefundId: result.providerRefundId,
    provider: input.provider.name,
    amount: input.amount,
    currency: input.currency,
    idempotencyKey,
    error: result.errorMessage,
  });
}

async function requestAutoRefund(input: CompensationInput, idempotencyKey: string): Promise<RefundResult> {
  if (!input.provider.refund) return refundUnavailableResult(input.providerTransactionId);
  try {
    return await input.provider.refund({
      orderId: input.orderId,
      providerTransactionId: input.providerTransactionId,
      amount: input.amount,
      currency: input.currency,
      reason: AUTO_REFUND_REASON,
      idempotencyKey,
    });
  } catch (error) {
    return failedRefundResult(input.providerTransactionId, error);
  }
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
    where: {
      orderId,
      status: "PENDING",
      providerTransactionId: { not: null },
      idempotencyKey: { startsWith: "unconfirmed:" },
    },
    select: { id: true },
  });
  return payment !== null;
}

export async function unreconciledPaymentResult(orderId: string, providerTransactionId: string | null): Promise<PaymentUnconfirmedResult | null> {
  if (!providerTransactionId) return null;
  const exists = await db.payment.findFirst({
    where: { orderId, status: "PENDING", providerTransactionId, idempotencyKey: { startsWith: "unconfirmed:" } },
    select: { id: true },
  });
  return exists ? unconfirmedResult(orderId, providerTransactionId) : null;
}

async function existingMarkerId(idempotencyKey: string, input: ReconciliationInput): Promise<string | null> {
  const existing = await db.payment.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, providerWebhookSecret: true },
  });
  if (!existing) return null;
  if (existing.status === "PENDING" && !existing.providerWebhookSecret && input.providerWebhookSecret) {
    await db.payment.update({ where: { id: existing.id }, data: { providerWebhookSecret: input.providerWebhookSecret } });
  }
  return existing.id;
}

async function markerCreatedByRace(error: unknown, idempotencyKey: string): Promise<string | null> {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const existing = await db.payment.findUnique({ where: { idempotencyKey }, select: { id: true } });
  return existing?.id ?? null;
}

async function ensureUnreconciledMarker(input: ReconciliationInput): Promise<string> {
  const idempotencyKey = markerKey(input.orderId, input.providerTransactionId);
  const existingId = await existingMarkerId(idempotencyKey, input);
  if (existingId) return existingId;
  try {
    const payment = await db.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        providerWebhookSecret: input.providerWebhookSecret ?? null,
        idempotencyKey,
        status: "PENDING",
        amount: input.amount,
        currency: input.currency,
        errorMessage: errorMessage(input.error),
      },
      select: { id: true },
    });
    return payment.id;
  } catch (error) {
    const racedId = await markerCreatedByRace(error, idempotencyKey);
    if (racedId) return racedId;
    throw error;
  }
}

export async function resolveUnreconciledMarker(
  orderId: string,
  providerTransactionId: string,
  status: Extract<PaymentAttemptStatus, "SUCCEEDED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED">,
): Promise<void> {
  await db.payment.updateMany({
    where: {
      orderId,
      providerTransactionId,
      status: "PENDING",
      idempotencyKey: { startsWith: "unconfirmed:" },
    },
    data: { status },
  });
}

export async function paymentAdjustmentExists(idempotencyKey: string): Promise<boolean> {
  const existing = await db.paymentAdjustment.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  return existing !== null;
}

export async function recordUnconfirmedPaymentAdjustment(input: RefundAdjustmentInput): Promise<void> {
  const paymentId = await ensureUnreconciledMarker(input);
  try {
    await db.paymentAdjustment.create({
      data: {
        paymentId,
        providerRefundId: input.result.providerRefundId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        status: input.result.status,
        idempotencyKey: input.idempotencyKey,
        refundableAmount: input.result.refundableAmount,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

export async function compensateUnconfirmedPayment(input: CompensationInput): Promise<void> {
  if (input.amount <= 0) {
    console.error("PAYMENT_AUTO_REFUND_SKIPPED", {
      orderId: input.orderId,
      providerTransactionId: input.providerTransactionId,
      provider: input.provider.name,
      amount: input.amount,
      reason: "non_positive_amount",
    });
    return;
  }
  const idempotencyKey = autoRefundIdempotencyKey(input.orderId, input.providerTransactionId);
  if (await paymentAdjustmentExists(idempotencyKey)) {
    console.error("PAYMENT_AUTO_REFUND_ALREADY_RECORDED", {
      orderId: input.orderId,
      providerTransactionId: input.providerTransactionId,
      provider: input.provider.name,
      idempotencyKey,
    });
    return;
  }
  const result = await requestAutoRefund(input, idempotencyKey);
  await recordUnconfirmedPaymentAdjustment({
    ...input,
    provider: input.provider.name,
    reason: AUTO_REFUND_REASON,
    idempotencyKey,
    result,
  });
  if (result.status === "SUCCEEDED") {
    await resolveUnreconciledMarker(input.orderId, input.providerTransactionId, "REFUNDED");
  }
  logAutoRefundResult(input, idempotencyKey, result);
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
