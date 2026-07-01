// ============================================================
// lib/payment/webhook-recovery.ts — 결제 웹훅 기반 로컬 확정 복구
// server-only: DB, Prisma 트랜잭션 포함
// ============================================================
import "server-only";

import { db } from "@/lib/db";
import { getPaymentProvider } from "./index";
import {
  compensateUnconfirmedPayment,
  paidOrderResult,
  paidOrderResultOrEmpty,
  reconciliationRequired,
  resolveUnreconciledMarker,
} from "./reconciliation";
import { runSuccessTransaction } from "./process";

export type RecoverPaymentFromWebhookInput = {
  orderId: string;
  paymentKey: string;
  amount: number;
  currency: string;
  status: string;
  provider?: string;
  providerWebhookSecret?: string;
};

export type RecoverPaymentFromWebhookResult =
  | { status: "success"; success: true; paymentId: string }
  | { status: "unconfirmed"; success: false; error: string; orderId: string; providerTransactionId: string | null }
  | { status: "ignored"; success: false; reason: string }
  | { status: "failed"; success: false; error: string };

type WebhookOrder = {
  status: string; totalAmount: number; currency: string; marketCode: string; userId: string;
  items: Array<{ variantId: string; quantity: number }>;
};

function recoveryIdempotencyKey(orderId: string, paymentKey: string): string {
  return `webhook-recovery:${orderId}:${paymentKey}`;
}

async function loadWebhookOrder(orderId: string): Promise<WebhookOrder | null> {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true, totalAmount: true, currency: true, marketCode: true, userId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
}

function amountMatches(order: WebhookOrder, input: RecoverPaymentFromWebhookInput): boolean {
  return order.totalAmount === input.amount && order.currency === input.currency;
}

async function compensateWebhookFailure(
  input: RecoverPaymentFromWebhookInput,
  order: WebhookOrder,
  error: unknown,
): Promise<RecoverPaymentFromWebhookResult> {
  const provider = getPaymentProvider(order.marketCode);
  await compensateUnconfirmedPayment({
    orderId: input.orderId,
    paymentKey: input.paymentKey,
    providerTransactionId: input.paymentKey,
    provider,
    amount: order.totalAmount,
    currency: order.currency,
    error,
    providerWebhookSecret: input.providerWebhookSecret,
  });
  return reconciliationRequired({
    orderId: input.orderId,
    paymentKey: input.paymentKey,
    providerTransactionId: input.paymentKey,
    provider: provider.name,
    amount: order.totalAmount,
    currency: order.currency,
    error,
    providerWebhookSecret: input.providerWebhookSecret,
  });
}

async function recoverDonePayment(
  input: RecoverPaymentFromWebhookInput,
): Promise<RecoverPaymentFromWebhookResult> {
  const order = await loadWebhookOrder(input.orderId);
  if (!order) return { status: "failed", success: false, error: "주문을 찾을 수 없습니다." };
  if (order.status === "PAID") return paidOrderResultOrEmpty(input.orderId);
  if (order.status !== "PENDING_PAYMENT") return { status: "ignored", success: false, reason: "order_not_payable" };
  if (!amountMatches(order, input)) return { status: "failed", success: false, error: "결제 금액 또는 통화가 일치하지 않습니다." };
  try {
    const paymentId = await runSuccessTransaction({
      orderId: input.orderId, userId: order.userId, idempotencyKey: recoveryIdempotencyKey(input.orderId, input.paymentKey),
      providerTransactionId: input.paymentKey, amount: order.totalAmount, currency: order.currency,
      provider: input.provider ?? "toss", providerWebhookSecret: input.providerWebhookSecret, items: order.items,
    });
    await resolveUnreconciledMarker(input.orderId, input.paymentKey, "CANCELLED");
    return { status: "success", success: true, paymentId };
  } catch (error) {
    const paid = await paidOrderResult(input.orderId);
    if (paid) return paid;
    return compensateWebhookFailure(input, order, error);
  }
}

export async function recoverPaymentFromWebhook(
  input: RecoverPaymentFromWebhookInput,
): Promise<RecoverPaymentFromWebhookResult> {
  if (input.status !== "DONE") return { status: "ignored", success: false, reason: "payment_not_done" };
  return recoverDonePayment(input);
}
