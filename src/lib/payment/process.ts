// ============================================================
// lib/payment/process.ts — 결제 처리 (STRICT 존)
// server-only: DB, Prisma 트랜잭션 포함
// ============================================================
import "server-only";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getPaymentProvider } from "./index";
import { validateOrderForPayment, canDecrementStock, isAlreadyProcessed } from "./core";
import { compensateUnconfirmedPayment, paidOrderResult, paidOrderResultOrEmpty, reconciliationRequired, unreconciledPaymentResult } from "./reconciliation";
import type { PaymentProvider } from "./types";

// ── 공개 결과 타입 ────────────────────────────────────────────
export type ProcessPaymentResult =
  | { status: "success"; success: true; paymentId: string }
  | { status: "pending"; success: false; orderId: string; amount: number; currency: string }
  | { status: "unconfirmed"; success: false; error: string; orderId: string; providerTransactionId: string | null }
  | { status: "failed"; success: false; error: string };

export type ConfirmPaymentInput = { orderId: string; userId: string; paymentKey: string; redirectAmount: number };

// ── 내부 타입 ────────────────────────────────────────────────

type LoadedOrder = {
  status: string; totalAmount: number; currency: string;
  marketCode: string; userId: string;
  items: Array<{ variantId: string; quantity: number }>;
};

type OrderEligibility = { eligible: true; order: LoadedOrder } | { eligible: false; result: ProcessPaymentResult };

// ── 주문 로딩 ────────────────────────────────────────────────

async function loadOrder(orderId: string): Promise<LoadedOrder | null> {
  const row = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true, totalAmount: true, currency: true,
      marketCode: true, userId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
  if (!row) return null;
  return {
    status: row.status,
    totalAmount: row.totalAmount,
    currency: row.currency,
    marketCode: row.marketCode,
    userId: row.userId,
    items: row.items,
  };
}

// ── 트랜잭션 내 재고 차감 ────────────────────────────────────

async function decrementStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  qty: number,
): Promise<void> {
  const result = await tx.wigVariant.updateMany({
    where: { id: variantId, stock: { gte: qty } },
    data: { stock: { decrement: qty } },
  });
  if (result.count === 0) throw new Error(`재고 부족 — variantId: ${variantId}`);
}

// ── 성공 트랜잭션 ────────────────────────────────────────────

type SuccessTxInput = {
  orderId: string; userId: string; idempotencyKey: string;
  providerTransactionId: string | null; amount: number; currency: string; provider: string;
  providerWebhookSecret?: string;
  items: Array<{ variantId: string; quantity: number }>;
};

export async function runSuccessTransaction(input: SuccessTxInput): Promise<string> {
  return db.$transaction(async (tx) => {
    for (const item of input.items) {
      await decrementStock(tx, item.variantId, item.quantity);
    }
    const updated = await tx.order.updateMany({
      where: { id: input.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAID", paymentStatus: "PAID" },
    });
    if (updated.count === 0) throw new Error("주문 상태 전이 실패 — 동시 결제 충돌");
    await tx.cartItem.deleteMany({ where: { userId: input.userId } });
    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId, provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        providerWebhookSecret: input.providerWebhookSecret ?? null,
        idempotencyKey: input.idempotencyKey,
        status: "SUCCEEDED", amount: input.amount, currency: input.currency,
      },
    });
    return payment.id;
  });
}

// ── 실패 트랜잭션 ────────────────────────────────────────────

type FailureTxInput = {
  orderId: string; idempotencyKey: string;
  providerTransactionId: string | null; amount: number;
  currency: string; provider: string; errorMessage: string;
};

async function runFailureTransaction(input: FailureTxInput): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { id: input.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_FAILED", paymentStatus: "FAILED" },
    });
    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId, provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        idempotencyKey: input.idempotencyKey,
        status: "FAILED", amount: input.amount, currency: input.currency,
        errorMessage: input.errorMessage,
      },
    });
    return payment.id;
  });
}

// ── Guard 함수 ────────────────────────────────────────────────

async function checkIdempotency(key: string): Promise<ProcessPaymentResult | null> {
  const existing = await db.payment.findUnique({ where: { idempotencyKey: key } });
  if (!existing || !isAlreadyProcessed(existing)) return null;
  return { status: "success", success: true, paymentId: existing.id };
}

async function checkOrderEligibility(
  orderId: string,
  userId: string,
): Promise<OrderEligibility> {
  const order = await loadOrder(orderId);
  if (!order) return { eligible: false, result: { status: "failed", success: false, error: "주문을 찾을 수 없습니다." } };
  if (order.userId !== userId) return { eligible: false, result: { status: "failed", success: false, error: "접근 권한이 없습니다." } };
  const v = validateOrderForPayment(order.status);
  if (!v.valid) return { eligible: false, result: { status: "failed", success: false, error: v.reason ?? "결제 불가" } };
  return { eligible: true, order };
}

// ── 성공 경로 ────────────────────────────────────────────────

async function handleSuccess(
  orderId: string, userId: string, idempotencyKey: string,
  providerTxId: string | null, order: LoadedOrder, providerName: string,
): Promise<ProcessPaymentResult> {
  const variantIds = order.items.map((i) => i.variantId);
  const variants = await db.wigVariant.findMany({
    where: { id: { in: variantIds } }, select: { id: true, stock: true },
  });
  for (const item of order.items) {
    const v = variants.find((vv) => vv.id === item.variantId);
    if (!v || !canDecrementStock(v.stock, item.quantity)) {
      await runFailureTransaction({
        orderId, idempotencyKey, providerTransactionId: providerTxId,
        amount: order.totalAmount, currency: order.currency,
        provider: providerName, errorMessage: "재고 부족",
      });
      return { status: "failed", success: false, error: "재고가 부족하여 결제를 완료할 수 없습니다." };
    }
  }
  try {
    const paymentId = await runSuccessTransaction({
      orderId, userId, idempotencyKey, providerTransactionId: providerTxId,
      amount: order.totalAmount, currency: order.currency,
      provider: providerName, items: order.items,
    });
    return { status: "success", success: true, paymentId };
  } catch (e) {
    if (e instanceof Error) return { status: "failed", success: false, error: e.message };
    return { status: "failed", success: false, error: "결제 처리 중 오류" };
  }
}

// ── 실패 경로 ────────────────────────────────────────────────

async function handleFailure(
  orderId: string, idempotencyKey: string,
  providerTxId: string | null, order: LoadedOrder, providerName: string,
): Promise<ProcessPaymentResult> {
  await runFailureTransaction({
    orderId, idempotencyKey, providerTransactionId: providerTxId,
    amount: order.totalAmount, currency: order.currency,
    provider: providerName, errorMessage: "공급자 결제 실패",
  });
  return { status: "failed", success: false, error: "결제에 실패했습니다. 다시 시도해 주세요." };
}

async function handleConfirmFailure(
  orderId: string, idempotencyKey: string,
  providerTxId: string | null, markerTxId: string | null, order: LoadedOrder, providerName: string,
): Promise<ProcessPaymentResult> {
  const paid = await paidOrderResult(orderId);
  if (paid) return paid;
  const unconfirmed = await unreconciledPaymentResult(orderId, markerTxId);
  if (unconfirmed) return unconfirmed;
  return handleFailure(orderId, idempotencyKey, providerTxId, order, providerName);
}

async function handleConfirmedSuccess(
  input: ConfirmPaymentInput, idempotencyKey: string,
  providerTxId: string | null, order: LoadedOrder, provider: PaymentProvider, providerWebhookSecret?: string,
): Promise<ProcessPaymentResult> {
  try {
    const paymentId = await runSuccessTransaction({
      orderId: input.orderId, userId: input.userId, idempotencyKey,
      providerTransactionId: providerTxId, amount: order.totalAmount,
      currency: order.currency, provider: provider.name, providerWebhookSecret, items: order.items,
    });
    return { status: "success", success: true, paymentId };
  } catch (error) {
    const paid = await paidOrderResult(input.orderId);
    if (paid) return paid;
    const confirmedProviderTxId = providerTxId ?? input.paymentKey;
    await compensateUnconfirmedPayment({
      orderId: input.orderId,
      paymentKey: input.paymentKey,
      providerTransactionId: confirmedProviderTxId,
      provider,
      amount: order.totalAmount,
      currency: order.currency,
      error,
      providerWebhookSecret,
    });
    return reconciliationRequired({
      orderId: input.orderId, paymentKey: input.paymentKey, providerTransactionId: confirmedProviderTxId,
      provider: provider.name, amount: order.totalAmount, currency: order.currency, error, providerWebhookSecret,
    });
  }
}

function pendingResult(orderId: string, order: LoadedOrder): ProcessPaymentResult {
  return { status: "pending", success: false, orderId, amount: order.totalAmount, currency: order.currency };
}

// ── 공개 엔트리포인트 ─────────────────────────────────────────

export async function processPayment(
  orderId: string,
  userId: string,
  idempotencyKey: string,
): Promise<ProcessPaymentResult> {
  const idempotencyHit = await checkIdempotency(idempotencyKey);
  if (idempotencyHit) return idempotencyHit;

  const eligibility = await checkOrderEligibility(orderId, userId);
  if (!eligibility.eligible) return eligibility.result;

  const { order } = eligibility;
  const provider = getPaymentProvider(order.marketCode);
  const result = await provider.initiate({
    orderId, amount: order.totalAmount, currency: order.currency, idempotencyKey,
  });

  if (result.status === "PENDING" || result.redirectUrl) {
    return pendingResult(orderId, order);
  }
  if (result.status === "SUCCEEDED") {
    return handleSuccess(orderId, userId, idempotencyKey, result.providerTransactionId, order, provider.name);
  }
  return handleFailure(orderId, idempotencyKey, result.providerTransactionId, order, provider.name);
}

export async function confirmPayment(input: ConfirmPaymentInput): Promise<ProcessPaymentResult> {
  const order = await loadOrder(input.orderId);
  if (!order) return { status: "failed", success: false, error: "주문을 찾을 수 없습니다." };
  if (order.userId !== input.userId) return { status: "failed", success: false, error: "접근 권한이 없습니다." };
  if (order.status === "PAID") {
    return paidOrderResultOrEmpty(input.orderId);
  }
  const validation = validateOrderForPayment(order.status);
  if (!validation.valid) {
    return { status: "failed", success: false, error: validation.reason ?? "결제 불가" };
  }
  const provider = getPaymentProvider(order.marketCode);
  const idempotencyKey = randomUUID();
  if (order.totalAmount !== input.redirectAmount) {
    return handleConfirmFailure(input.orderId, idempotencyKey, input.paymentKey, input.paymentKey, order, provider.name);
  }
  const result = await provider.confirm({
    orderId: input.orderId, amount: order.totalAmount,
    providerTransactionId: input.paymentKey, idempotencyKey,
  });
  if (result.status !== "SUCCEEDED") {
    return handleConfirmFailure(input.orderId, idempotencyKey, result.providerTransactionId, input.paymentKey, order, provider.name);
  }
  return handleConfirmedSuccess(input, idempotencyKey, result.providerTransactionId, order, provider, result.providerWebhookSecret);
}
