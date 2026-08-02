import {
  CheckoutSessionStatus,
  FulfillmentType,
  OutboxStatus,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox/types";
import type {
  ReconciliationConfidence,
  ReconciliationDetailValue,
  ReconciliationFinding,
  ReconciliationRecommendedAction,
  ReconciliationSource,
} from "./types";
import { ageMs, finding, isOlderThan, type NormalizedOptions } from "./utils";

const ORDER_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  payment: true,
  session: true,
  items: { include: { mr: true } },
  shipping: true,
});

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export async function appendLayer1Findings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  await appendPaymentOrderFindings(client, options, findings);
  await appendOrderFindings(client, findings);
  await appendCompletedSessionFindings(client, findings);
}

async function appendPaymentOrderFindings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const payments = await client.payment.findMany({
    where: { status: PaymentAttemptStatus.SUCCEEDED },
    include: { order: { select: { id: true } } },
  });
  const exposedSessionIds = new Set(payments
    .filter((payment) => payment.remediationStatus !== PaymentRemediationStatus.NONE
      && payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED)
    .map((payment) => payment.checkoutSessionId));
  const missingOrder = payments.filter((payment) => !payment.order);
  const voidPaths = await loadVoidPaths(client, missingOrder);
  for (const payment of missingOrder) {
    findings.push(paymentWithoutOrderFinding(
      payment,
      voidPaths,
      options,
      exposedSessionIds.has(payment.checkoutSessionId),
    ));
  }
}

async function loadVoidPaths(
  client: PrismaClient,
  payments: Array<{ provider: PaymentProvider; providerPaymentKey: string | null }>,
) {
  const dedupKeys = payments
    .map((payment) => payment.providerPaymentKey ? voidDedupKey(payment.provider, payment.providerPaymentKey) : null)
    .filter((key): key is string => key !== null);
  const rows = await client.paymentOutbox.findMany({
    where: { dedupKey: { in: dedupKeys } },
    select: { id: true, status: true, attempts: true, dedupKey: true },
  });
  return new Map(rows.flatMap((row) => row.dedupKey ? [[row.dedupKey, row]] : []));
}

function paymentWithoutOrderFinding(
  payment: { id: string; mode: string; provider: PaymentProvider; providerPaymentKey: string | null; updatedAt: Date },
  voidPaths: Awaited<ReturnType<typeof loadVoidPaths>>,
  options: NormalizedOptions,
  sessionExposed: boolean,
): ReconciliationFinding {
  const dedupKey = paymentVoidDedupKey(payment);
  const voidPath = dedupKey ? voidPaths.get(dedupKey) : undefined;
  const stale = isOlderThan(payment.updatedAt, options.now, options.staleSucceededPaymentAfterMs);
  const action = paymentAction(stale, sessionExposed, payment.providerPaymentKey, voidPath);
  return finding({
    kind: "SUCCEEDED_PAYMENT_WITHOUT_ORDER",
    severity: paymentSeverity(action),
    recommendedAction: action,
    source: paymentSources(Boolean(voidPath)),
    sourceIds: paymentSourceIds(payment.id, voidPath?.id),
    details: {
      ...paymentWithoutOrderDetails(payment, dedupKey, voidPath?.status ?? "absent", options),
      sessionExposed,
    },
    confidence: paymentConfidence(payment.providerPaymentKey),
  });
}

function paymentVoidDedupKey(
  payment: { provider: PaymentProvider; providerPaymentKey: string | null },
): string | null {
  if (!payment.providerPaymentKey) return null;
  return voidDedupKey(payment.provider, payment.providerPaymentKey);
}

function paymentAction(
  stale: boolean,
  sessionExposed: boolean,
  providerPaymentKey: string | null,
  voidPath: { status: OutboxStatus; attempts: number } | undefined,
): ReconciliationRecommendedAction {
  if (sessionExposed) return "MANUAL_REVIEW";
  if (!stale) return "NORMAL_IN_FLIGHT";
  return stalePaymentAction(providerPaymentKey, voidPath);
}

function paymentSources(hasVoidPath: boolean): ReconciliationSource[] {
  return hasVoidPath ? ["payment", "paymentOutbox"] : ["payment"];
}

function paymentSourceIds(paymentId: string, outboxId: string | undefined) {
  if (!outboxId) return { payment: [paymentId] };
  return { payment: [paymentId], paymentOutbox: [outboxId] };
}

function paymentSeverity(action: ReconciliationRecommendedAction): "info" | "warning" {
  return action === "NORMAL_IN_FLIGHT" ? "info" : "warning";
}

function paymentConfidence(providerPaymentKey: string | null): ReconciliationConfidence {
  return providerPaymentKey ? "high" : "medium";
}

function stalePaymentAction(
  providerPaymentKey: string | null,
  voidPath: { status: OutboxStatus; attempts: number } | undefined,
): ReconciliationRecommendedAction {
  if (!providerPaymentKey) return "MANUAL_REVIEW";
  if (!voidPath) return "AUTO_REENTRY_CANDIDATE";
  if (voidPath.status === OutboxStatus.PENDING || voidPath.status === OutboxStatus.PROCESSING) return "VOID_PENDING";
  if (voidPath.status === OutboxStatus.FAILED && voidPath.attempts >= OUTBOX_MAX_ATTEMPTS) return "VOID_FAILED_MAX_ATTEMPTS";
  return "MANUAL_REVIEW";
}

async function appendOrderFindings(
  client: PrismaClient,
  findings: ReconciliationFinding[],
): Promise<void> {
  const orders = await client.order.findMany({ include: ORDER_INCLUDE });
  for (const order of orders) {
    appendOrderStatusFindings(findings, order);
    appendOrderShapeFindings(findings, order);
  }
}

function appendOrderStatusFindings(findings: ReconciliationFinding[], order: OrderRow): void {
  if (order.payment.status !== PaymentAttemptStatus.SUCCEEDED) findings.push(badPaymentFinding(order));
  if (hasAmountMismatch(order)) findings.push(amountMismatchFinding(order));
  if (order.session.status !== CheckoutSessionStatus.COMPLETED) findings.push(orderSessionMismatchFinding(order));
}

function appendOrderShapeFindings(findings: ReconciliationFinding[], order: OrderRow): void {
  if (order.items.length === 0) findings.push(partialCompletionFinding(order, "order has no items", []));
  if (!order.shipping) findings.push(partialCompletionFinding(order, "order missing shipping snapshot", []));
  const missingMr = order.items.filter((item) => item.fulfillmentType === FulfillmentType.MTO && !item.mr);
  if (missingMr.length > 0) {
    findings.push(partialCompletionFinding(order, "MTO order item missing manufacturing request", missingMr.map((item) => item.id)));
  }
}

async function appendCompletedSessionFindings(
  client: PrismaClient,
  findings: ReconciliationFinding[],
): Promise<void> {
  const sessions = await client.checkoutSession.findMany({
    where: { status: CheckoutSessionStatus.COMPLETED },
    include: { order: { select: { id: true } }, payments: { select: { id: true, status: true } } },
  });
  for (const session of sessions) {
    if (!session.order) findings.push(completedSessionWithoutOrderFinding(session));
  }
}

function badPaymentFinding(order: OrderRow): ReconciliationFinding {
  return finding({
    kind: "ORDER_BAD_PAYMENT_STATUS",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["order", "payment"],
    sourceIds: { order: [order.id], payment: [order.paymentId] },
    details: { orderId: order.id, paymentId: order.paymentId, paymentStatus: order.payment.status },
    confidence: "high",
  });
}

function amountMismatchFinding(order: OrderRow): ReconciliationFinding {
  return finding({
    kind: "AMOUNT_CURRENCY_MISMATCH",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["order", "payment", "checkoutSession"],
    sourceIds: { order: [order.id], payment: [order.paymentId], checkoutSession: [order.checkoutSessionId] },
    details: amountDetails(order),
    confidence: "high",
  });
}

function orderSessionMismatchFinding(order: OrderRow): ReconciliationFinding {
  return finding({
    kind: "SESSION_STATE_MISMATCH",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["order", "checkoutSession"],
    sourceIds: { order: [order.id], checkoutSession: [order.checkoutSessionId] },
    details: { orderId: order.id, checkoutSessionId: order.checkoutSessionId, sessionStatus: order.session.status },
    confidence: "high",
  });
}

function partialCompletionFinding(order: OrderRow, reason: string, orderItemIds: string[]): ReconciliationFinding {
  return finding({
    kind: "PARTIAL_LOCAL_COMPLETION",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["order", ...(orderItemIds.length > 0 ? ["orderItem" as const] : [])],
    sourceIds: { order: [order.id], ...(orderItemIds.length > 0 ? { orderItem: orderItemIds } : {}) },
    details: { orderId: order.id, reason, orderItemIds },
    confidence: "high",
  });
}

function completedSessionWithoutOrderFinding(
  session: { id: string; payments: Array<{ id: string; status: PaymentAttemptStatus }> },
): ReconciliationFinding {
  return finding({
    kind: "SESSION_STATE_MISMATCH",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["checkoutSession", "payment"],
    sourceIds: { checkoutSession: [session.id], payment: session.payments.map((payment) => payment.id) },
    details: { checkoutSessionId: session.id, sessionStatus: CheckoutSessionStatus.COMPLETED },
    confidence: "high",
  });
}

function hasAmountMismatch(order: OrderRow): boolean {
  return order.totalAmount !== order.payment.amount
    || order.currency !== order.payment.currency
    || order.totalAmount !== order.session.totalAmount
    || order.currency !== order.session.currency;
}

function amountDetails(order: OrderRow): Record<string, ReconciliationDetailValue> {
  return {
    orderAmount: order.totalAmount,
    orderCurrency: order.currency,
    paymentAmount: order.payment.amount,
    paymentCurrency: order.payment.currency,
    sessionAmount: order.session.totalAmount,
    sessionCurrency: order.session.currency,
  };
}

function paymentWithoutOrderDetails(
  payment: { id: string; mode: string; provider: PaymentProvider; providerPaymentKey: string | null; updatedAt: Date },
  dedupKey: string | null,
  voidPathStatus: string,
  options: NormalizedOptions,
): Record<string, ReconciliationDetailValue> {
  return {
    paymentId: payment.id,
    provider: payment.provider,
    paymentMode: payment.mode,
    providerPaymentKey: payment.providerPaymentKey,
    voidDedupKey: dedupKey,
    voidPathStatus,
    ageMs: ageMs(payment.updatedAt, options.now),
  };
}

function voidDedupKey(provider: PaymentProvider, providerPaymentKey: string): string {
  return `void:${provider}:${providerPaymentKey}`;
}
