import { PaymentAttemptStatus, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  ReconciliationFinding,
  ReconciliationFindingKind,
  ReconciliationRecommendedAction,
  ReconciliationSeverity,
} from "./types";
import { ageMs, cutoff, finding, type NormalizedOptions } from "./utils";

const PROVIDER_CONFIRM_MARKERS = [
  "PROVIDER_CONFIRM_TERMINAL",
  "PROVIDER_CONFIRM_MANUAL_REVIEW",
  "PROVIDER_CONFIRM_STOP",
] as const;

const PENDING_STATUSES = [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] as const;

const PAYMENT_SELECT = Prisma.validator<Prisma.PaymentSelect>()({
  id: true,
  checkoutSessionId: true,
  provider: true,
  mode: true,
  status: true,
  providerRef: true,
  providerConfirmIdempotencyKey: true,
  providerPaymentKey: true,
  errorCode: true,
  updatedAt: true,
  order: { select: { id: true } },
});

type ProviderConfirmPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;
type ProviderConfirmFindingKind = Extract<
  ReconciliationFindingKind,
  | "STALE_PROVIDER_CONFIRM_ATTEMPT"
  | "PROVIDER_CONFIRM_TERMINAL_FAILED"
  | "PROVIDER_CONFIRM_MANUAL_REVIEW"
  | "PROVIDER_CONFIRM_STOP"
>;

export async function appendProviderConfirmFindings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const markedPayments = await loadMarkedPayments(client);
  for (const payment of markedPayments) appendMarkerFinding(findings, payment, options);

  const stalePayments = await loadStaleConfirmPayments(client, options);
  for (const payment of stalePayments) appendStaleFinding(findings, payment, options);
}

async function loadMarkedPayments(client: PrismaClient): Promise<ProviderConfirmPayment[]> {
  return client.payment.findMany({
    where: {
      OR: [
        { errorCode: "PROVIDER_CONFIRM_TERMINAL", status: PaymentAttemptStatus.FAILED },
        { errorCode: "PROVIDER_CONFIRM_MANUAL_REVIEW" },
        { errorCode: "PROVIDER_CONFIRM_STOP" },
      ],
    },
    select: PAYMENT_SELECT,
  });
}

async function loadStaleConfirmPayments(
  client: PrismaClient,
  options: NormalizedOptions,
): Promise<ProviderConfirmPayment[]> {
  return client.payment.findMany({
    where: staleConfirmWhere(options),
    select: PAYMENT_SELECT,
  });
}

function staleConfirmWhere(options: NormalizedOptions): Prisma.PaymentWhereInput {
  return {
    providerConfirmIdempotencyKey: { not: null },
    providerPaymentKey: null,
    order: { is: null },
    status: { in: [...PENDING_STATUSES] },
    updatedAt: { lte: cutoff(options.now, options.staleProviderConfirmAfterMs) },
    OR: [{ errorCode: null }, { errorCode: { notIn: [...PROVIDER_CONFIRM_MARKERS] } }],
  };
}

function appendMarkerFinding(
  findings: ReconciliationFinding[],
  payment: ProviderConfirmPayment,
  options: NormalizedOptions,
): void {
  const kind = markerKind(payment);
  if (!kind) return;
  findings.push(finding({
    kind,
    severity: markerSeverity(kind),
    recommendedAction: markerAction(kind),
    source: ["payment", "checkoutSession"],
    sourceIds: sourceIds(payment),
    details: paymentDetails(payment, options),
    confidence: "high",
  }));
}

function appendStaleFinding(
  findings: ReconciliationFinding[],
  payment: ProviderConfirmPayment,
  options: NormalizedOptions,
): void {
  findings.push(finding({
    kind: "STALE_PROVIDER_CONFIRM_ATTEMPT",
    severity: "warning",
    recommendedAction: "WATCH_STALE",
    source: ["payment", "checkoutSession"],
    sourceIds: sourceIds(payment),
    details: paymentDetails(payment, options),
    confidence: "medium",
  }));
}

function markerKind(payment: ProviderConfirmPayment): ProviderConfirmFindingKind | null {
  if (payment.errorCode === "PROVIDER_CONFIRM_TERMINAL" && payment.status === PaymentAttemptStatus.FAILED) {
    return "PROVIDER_CONFIRM_TERMINAL_FAILED";
  }
  if (payment.errorCode === "PROVIDER_CONFIRM_MANUAL_REVIEW") return "PROVIDER_CONFIRM_MANUAL_REVIEW";
  if (payment.errorCode === "PROVIDER_CONFIRM_STOP") return "PROVIDER_CONFIRM_STOP";
  return null;
}

function markerSeverity(kind: ProviderConfirmFindingKind): ReconciliationSeverity {
  return kind === "PROVIDER_CONFIRM_TERMINAL_FAILED" ? "warning" : "critical";
}

function markerAction(kind: ProviderConfirmFindingKind): ReconciliationRecommendedAction {
  return kind === "PROVIDER_CONFIRM_TERMINAL_FAILED" ? "ALERT_ONLY" : "MANUAL_REVIEW";
}

function sourceIds(payment: ProviderConfirmPayment): ReconciliationFinding["sourceIds"] {
  return { payment: [payment.id], checkoutSession: [payment.checkoutSessionId] };
}

function paymentDetails(
  payment: ProviderConfirmPayment,
  options: NormalizedOptions,
): ReconciliationFinding["details"] {
  return {
    paymentId: payment.id,
    checkoutSessionId: payment.checkoutSessionId,
    provider: payment.provider,
    paymentMode: payment.mode,
    paymentStatus: payment.status,
    errorCode: payment.errorCode,
    ageMs: ageMs(payment.updatedAt, options.now),
    hasProviderRef: Boolean(payment.providerRef),
    hasProviderConfirmIdempotencyKey: Boolean(payment.providerConfirmIdempotencyKey),
    hasProviderPaymentKey: Boolean(payment.providerPaymentKey),
    hasOrder: Boolean(payment.order),
  };
}
