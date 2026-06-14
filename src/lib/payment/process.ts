// ============================================================
// lib/payment/process.ts — 결제 처리 (STRICT 존)
// server-only: DB, Prisma 트랜잭션 포함
// ------------------------------------------------------------
// 흐름:
//   1. idempotency 가드
//   2. 주문 상태 검증
//   3. provider.initiate() 호출
//   4. 성공 → 재고 원자 차감 + PAID + 카트 비우기 + Payment SUCCEEDED
//   5. 실패 → PAYMENT_FAILED + Payment FAILED
// ============================================================
import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getPaymentProvider } from "./index";
import { validateOrderForPayment, canDecrementStock, isAlreadyProcessed } from "./core";

// ── 공개 결과 타입 ────────────────────────────────────────────

export type ProcessPaymentResult =
  | { success: true; paymentId: string }
  | { success: false; error: string };

// ── 내부 타입 ────────────────────────────────────────────────

type LoadedOrder = {
  status: string;
  totalAmount: number;
  currency: string;
  marketCode: string;
  userId: string;
  items: Array<{ variantId: string; quantity: number }>;
};

type OrderEligibility =
  | { eligible: true; order: LoadedOrder }
  | { eligible: false; result: ProcessPaymentResult };

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
  providerTransactionId: string | null; amount: number;
  currency: string; provider: string;
  items: Array<{ variantId: string; quantity: number }>;
};

async function runSuccessTransaction(input: SuccessTxInput): Promise<string> {
  return db.$transaction(async (tx) => {
    for (const item of input.items) {
      await decrementStock(tx, item.variantId, item.quantity);
    }
    const updated = await tx.order.updateMany({
      where: { id: input.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAID" },
    });
    if (updated.count === 0) throw new Error("주문 상태 전이 실패 — 동시 결제 충돌");
    await tx.cartItem.deleteMany({ where: { userId: input.userId } });
    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId, provider: input.provider,
        providerTransactionId: input.providerTransactionId,
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
  providerTransactionId: string | null;
  amount: number; currency: string; provider: string; errorMessage: string;
};

async function runFailureTransaction(input: FailureTxInput): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { id: input.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_FAILED" },
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
  return { success: true, paymentId: existing.id };
}

async function checkOrderEligibility(
  orderId: string,
  userId: string,
): Promise<OrderEligibility> {
  const order = await loadOrder(orderId);
  if (!order) return { eligible: false, result: { success: false, error: "주문을 찾을 수 없습니다." } };
  if (order.userId !== userId) return { eligible: false, result: { success: false, error: "접근 권한이 없습니다." } };
  const v = validateOrderForPayment(order.status);
  if (!v.valid) return { eligible: false, result: { success: false, error: v.reason ?? "결제 불가" } };
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
      return { success: false, error: "재고가 부족하여 결제를 완료할 수 없습니다." };
    }
  }
  try {
    const paymentId = await runSuccessTransaction({
      orderId, userId, idempotencyKey, providerTransactionId: providerTxId,
      amount: order.totalAmount, currency: order.currency,
      provider: providerName, items: order.items,
    });
    return { success: true, paymentId };
  } catch (e) {
    if (e instanceof Error) return { success: false, error: e.message };
    return { success: false, error: "결제 처리 중 오류" };
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
  return { success: false, error: "결제에 실패했습니다. 다시 시도해 주세요." };
}

// ── 공개 엔트리포인트 ─────────────────────────────────────────

/**
 * PENDING_PAYMENT 주문에 대한 결제를 처리한다.
 * @param orderId 처리할 주문 ID
 * @param userId 요청 유저 ID (소유권 검증용)
 * @param idempotencyKey 클라이언트가 생성한 멱등성 키 (UUID 권장)
 */
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

  if (result.status === "SUCCEEDED") {
    return handleSuccess(orderId, userId, idempotencyKey, result.providerTransactionId, order, provider.name);
  }
  return handleFailure(orderId, idempotencyKey, result.providerTransactionId, order, provider.name);
}
