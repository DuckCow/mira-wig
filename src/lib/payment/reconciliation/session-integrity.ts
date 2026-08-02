import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  containsSuspensionCycle,
  PAYMENT_REMEDIATION_REQUIRED_TOPIC,
} from "@/lib/payment/remediation";
import type { ReconciliationFinding } from "./types";
import { ageMs, finding, isOlderThan, type NormalizedOptions } from "./utils";

const PAYMENT_SELECT = Prisma.validator<Prisma.PaymentSelect>()({
  id: true,
  checkoutSessionId: true,
  status: true,
  attemptLifecycle: true,
  remediationStatus: true,
  blockingEndedAt: true,
  suspendedByPaymentId: true,
  initiationOutputKind: true,
  remediationOperation: true,
  remediationResultRef: true,
  remediatedAt: true,
  updatedAt: true,
});

type IntegrityPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export async function appendSessionIntegrityFindings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const payments = await client.payment.findMany({ select: PAYMENT_SELECT });
  const neutralOutboxes = await client.paymentOutbox.findMany({
    where: { topic: PAYMENT_REMEDIATION_REQUIRED_TOPIC },
    select: { id: true, status: true, attempts: true, payload: true },
  });
  const outboxByPaymentId = groupNeutralOutboxes(neutralOutboxes);
  for (const sessionPayments of groupBySession(payments).values()) {
    appendSessionFindings(sessionPayments, outboxByPaymentId, options, findings);
  }
}

function appendSessionFindings(
  payments: IntegrityPayment[],
  outboxByPaymentId: Map<string, NeutralOutbox[]>,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): void {
  const sessionId = payments[0]?.checkoutSessionId;
  if (!sessionId) return;
  const exposed = payments.filter(isExposed);
  const neutralOutboxes = exposed.flatMap((payment) => outboxByPaymentId.get(payment.id) ?? []);
  if (exposed.length > 0) {
    findings.push(exposureFinding(sessionId, exposed, neutralOutboxes));
    findings.push(neutralRemediationFinding(sessionId, exposed, neutralOutboxes));
    if (!payments.some((payment) => payment.blockingEndedAt === null)) {
      findings.push(noOpenOwnerFinding(sessionId, exposed));
    }
  }
  if (containsSuspensionCycle(payments)) {
    findings.push(cycleFinding(sessionId, payments));
  }
  for (const payment of payments) appendPaymentIntegrityFindings(payment, sessionId, options, findings);
}

function appendPaymentIntegrityFindings(
  payment: IntegrityPayment,
  sessionId: string,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): void {
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACT_AUTHORIZED
    && isOlderThan(payment.updatedAt, options.now, options.staleProviderConfirmAfterMs)) {
    findings.push(paymentFinding("STALE_CONTACT_AUTHORIZED", payment, sessionId, options));
  }
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED
    && payment.initiationOutputKind === null) {
    findings.push(paymentFinding("OUTPUTLESS_CONTACTED", payment, sessionId, options));
  }
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    findings.push(paymentFinding("PAYMENT_OUTCOME_UNKNOWN", payment, sessionId, options));
  }
  if (terminalEvidenceMismatch(payment)) {
    findings.push(paymentFinding("TERMINAL_REMEDIATION_EVIDENCE_MISMATCH", payment, sessionId, options));
  }
}

function exposureFinding(
  sessionId: string,
  payments: IntegrityPayment[],
  outboxes: NeutralOutbox[],
): ReconciliationFinding {
  return finding({
    kind: "SESSION_UNRESOLVED_PAYMENT_EXPOSURE",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: outboxes.length > 0 ? ["checkoutSession", "payment", "paymentOutbox"] : ["checkoutSession", "payment"],
    sourceIds: {
      checkoutSession: [sessionId],
      payment: payments.map((payment) => payment.id),
      ...(outboxes.length > 0 ? { paymentOutbox: outboxes.map((outbox) => outbox.id) } : {}),
    },
    details: {
      checkoutSessionId: sessionId,
      exposedPaymentIds: payments.map((payment) => payment.id),
      neutralOutboxStatuses: outboxes.map((outbox) => outbox.status),
      automaticProviderOperationAuthorized: false,
    },
    confidence: "high",
  });
}

function neutralRemediationFinding(
  sessionId: string,
  payments: IntegrityPayment[],
  outboxes: NeutralOutbox[],
): ReconciliationFinding {
  return finding({
    kind: "NEUTRAL_REMEDIATION_PENDING",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: outboxes.length > 0 ? ["checkoutSession", "payment", "paymentOutbox"] : ["checkoutSession", "payment"],
    sourceIds: {
      checkoutSession: [sessionId],
      payment: payments.map((payment) => payment.id),
      ...(outboxes.length > 0 ? { paymentOutbox: outboxes.map((outbox) => outbox.id) } : {}),
    },
    details: {
      checkoutSessionId: sessionId,
      remediationStatuses: payments.map((payment) => payment.remediationStatus),
      neutralOutboxAttempts: outboxes.map((outbox) => outbox.attempts),
    },
    confidence: "high",
  });
}

function noOpenOwnerFinding(sessionId: string, payments: IntegrityPayment[]): ReconciliationFinding {
  return finding({
    kind: "EXPOSED_SESSION_WITHOUT_OPEN_OWNER",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["checkoutSession", "payment"],
    sourceIds: { checkoutSession: [sessionId], payment: payments.map((payment) => payment.id) },
    details: { checkoutSessionId: sessionId, exposedPaymentIds: payments.map((payment) => payment.id) },
    confidence: "high",
  });
}

function cycleFinding(sessionId: string, payments: IntegrityPayment[]): ReconciliationFinding {
  const cycleRows = payments.filter((payment) => payment.suspendedByPaymentId !== null);
  return finding({
    kind: "PAYMENT_SUSPENSION_CYCLE",
    severity: "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["checkoutSession", "payment"],
    sourceIds: { checkoutSession: [sessionId], payment: cycleRows.map((payment) => payment.id) },
    details: {
      checkoutSessionId: sessionId,
      suspendedPaymentIds: cycleRows.map((payment) => payment.id),
      automaticRepairAuthorized: false,
    },
    confidence: "high",
  });
}

function paymentFinding(
  kind: Extract<ReconciliationFinding["kind"],
    | "STALE_CONTACT_AUTHORIZED"
    | "OUTPUTLESS_CONTACTED"
    | "PAYMENT_OUTCOME_UNKNOWN"
    | "TERMINAL_REMEDIATION_EVIDENCE_MISMATCH">,
  payment: IntegrityPayment,
  sessionId: string,
  options: NormalizedOptions,
): ReconciliationFinding {
  return finding({
    kind,
    severity: kind === "STALE_CONTACT_AUTHORIZED" ? "warning" : "critical",
    recommendedAction: "MANUAL_REVIEW",
    source: ["checkoutSession", "payment"],
    sourceIds: { checkoutSession: [sessionId], payment: [payment.id] },
    details: {
      checkoutSessionId: sessionId,
      paymentId: payment.id,
      paymentStatus: payment.status,
      attemptLifecycle: payment.attemptLifecycle,
      remediationStatus: payment.remediationStatus,
      ageMs: ageMs(payment.updatedAt, options.now),
    },
    confidence: "high",
  });
}

function isExposed(payment: IntegrityPayment): boolean {
  return payment.remediationStatus !== PaymentRemediationStatus.NONE
    && payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED;
}

function terminalEvidenceMismatch(payment: IntegrityPayment): boolean {
  const terminal = payment.status === PaymentAttemptStatus.VOIDED
    || payment.attemptLifecycle === PaymentAttemptLifecycle.TERMINAL_REMEDIATED;
  if (!terminal) return false;
  return payment.status !== PaymentAttemptStatus.VOIDED
    || payment.attemptLifecycle !== PaymentAttemptLifecycle.TERMINAL_REMEDIATED
    || payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED
    || payment.remediationOperation === null
    || payment.remediationResultRef === null
    || payment.remediatedAt === null;
}

function groupBySession(payments: IntegrityPayment[]): Map<string, IntegrityPayment[]> {
  const groups = new Map<string, IntegrityPayment[]>();
  for (const payment of payments) {
    const group = groups.get(payment.checkoutSessionId) ?? [];
    group.push(payment);
    groups.set(payment.checkoutSessionId, group);
  }
  return groups;
}

interface NeutralOutbox {
  id: string;
  status: string;
  attempts: number;
}

function groupNeutralOutboxes(
  rows: Array<NeutralOutbox & { payload: Prisma.JsonValue }>,
): Map<string, NeutralOutbox[]> {
  const groups = new Map<string, NeutralOutbox[]>();
  for (const row of rows) {
    const paymentId = paymentIdFromPayload(row.payload);
    if (!paymentId) continue;
    const group = groups.get(paymentId) ?? [];
    group.push({ id: row.id, status: row.status, attempts: row.attempts });
    groups.set(paymentId, group);
  }
  return groups;
}

function paymentIdFromPayload(payload: Prisma.JsonValue): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const paymentId = payload.paymentId;
  return typeof paymentId === "string" && paymentId.length > 0 ? paymentId : null;
}
