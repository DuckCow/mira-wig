import {
  OutboxStatus,
  PaymentEventFailureStage,
  PaymentEventStatus,
  WebhookIngressRejectionStage,
} from "@prisma/client";
import type { PaymentEvent, PaymentProvider, PrismaClient, WebhookIngressRejection } from "@prisma/client";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox/types";
import type { ReconciliationFinding, ReconciliationRecommendedAction } from "./types";
import {
  cutoff,
  finding,
  isOlderThan,
  parseVoidPayload,
  RAW_MISMATCH_CODE,
  type NormalizedOptions,
  type VoidPayload,
  VOID_TOPIC,
} from "./utils";

export async function appendLayer2Findings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  await appendOutboxFindings(client, findings);
  await appendEventFindings(client, options, findings);
  await appendRejectionFindings(client, findings);
  await appendSpikeFindings(client, options, findings);
}

async function appendOutboxFindings(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const rows = await client.paymentOutbox.findMany({ where: { topic: VOID_TOPIC } });
  const payloads = rows.map((row) => ({ row, payload: parseVoidPayload(row.payload) }));
  const paymentIds = payloads.flatMap((item) => item.payload ? [item.payload.paymentId] : []);
  const payments = await client.payment.findMany({ where: { id: { in: paymentIds } } });
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  for (const item of payloads) appendVoidOutboxFinding(findings, item.row, item.payload, paymentById);
}

function appendVoidOutboxFinding(
  findings: ReconciliationFinding[],
  row: Awaited<ReturnType<PrismaClient["paymentOutbox"]["findMany"]>>[number],
  payload: VoidPayload | null,
  paymentById: Map<string, { provider: PaymentProvider; providerPaymentKey: string | null }>,
): void {
  if (row.status === OutboxStatus.FAILED && row.attempts >= OUTBOX_MAX_ATTEMPTS) {
    findings.push(voidMaxAttemptsFinding(row));
  }
  if (!payload) return;
  const payment = paymentById.get(payload.paymentId);
  if (!payment || payment.provider !== payload.provider || payment.providerPaymentKey !== payload.providerPaymentKey) {
    findings.push(voidMismatchFinding(row, payload, payment ?? null));
  }
}

async function appendEventFindings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  await appendParseFailedEvents(client, findings);
  await appendRetryableCompleteEvents(client, options, findings);
  await appendStaleReceivedEvents(client, options, findings);
  await appendStaleRetryableEvents(client, options, findings);
}

async function appendParseFailedEvents(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: { status: PaymentEventStatus.FAILED, failureStage: PaymentEventFailureStage.PARSE },
  });
  for (const event of events) findings.push(paymentEventFinding(event, "TRUSTED_EVENT_PARSE_FAILED", "ALERT_ONLY"));
}

async function appendRetryableCompleteEvents(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: { status: PaymentEventStatus.RETRYABLE_FAILED, failureStage: PaymentEventFailureStage.COMPLETE },
  });
  for (const event of events) {
    const stale = isRetryableEventStale(event, options);
    findings.push(paymentEventFinding(event, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", stale ? "WATCH_STALE" : "ALERT_ONLY"));
  }
}

async function appendStaleReceivedEvents(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: { status: PaymentEventStatus.RECEIVED, receivedAt: { lte: cutoff(options.now, options.staleReceivedAfterMs) } },
  });
  for (const event of events) findings.push(paymentEventFinding(event, "STALE_PAYMENT_EVENT_RECEIVED", "WATCH_STALE"));
}

async function appendStaleRetryableEvents(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const events = await client.paymentEvent.findMany({ where: { status: PaymentEventStatus.RETRYABLE_FAILED } });
  for (const event of events) {
    if (isRetryableEventStale(event, options)) {
      findings.push(paymentEventFinding(event, "STALE_PAYMENT_EVENT_RETRYABLE_FAILED", "WATCH_STALE"));
    }
  }
}

async function appendRejectionFindings(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const rejections = await client.webhookIngressRejection.findMany();
  for (const rejection of rejections) {
    if (rejection.stage === WebhookIngressRejectionStage.VERIFY) findings.push(verifyRejectionFinding(rejection));
    if (rejection.stage === WebhookIngressRejectionStage.METADATA_EXTRACT) findings.push(metadataRejectionFinding(rejection));
    if (rejection.code === RAW_MISMATCH_CODE) findings.push(rawMismatchFinding(rejection));
  }
}

async function appendSpikeFindings(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const since = cutoff(options.now, options.spikeWindowMs);
  await appendRejectionSpikes(client, findings, since, options);
  await appendTrustedEventSpikes(client, findings, since, options);
}

async function appendRejectionSpikes(
  client: PrismaClient,
  findings: ReconciliationFinding[],
  since: Date,
  options: NormalizedOptions,
): Promise<void> {
  const verify = await client.webhookIngressRejection.count({ where: { stage: WebhookIngressRejectionStage.VERIFY, receivedAt: { gte: since } } });
  const metadata = await client.webhookIngressRejection.count({ where: { stage: WebhookIngressRejectionStage.METADATA_EXTRACT, receivedAt: { gte: since } } });
  const rawMismatch = await client.webhookIngressRejection.count({ where: { code: RAW_MISMATCH_CODE, receivedAt: { gte: since } } });
  pushSpike(findings, "WEBHOOK_VERIFY_REJECTION_SPIKE", verify, options.verifySpikeThreshold, "SECURITY_SIGNAL");
  pushSpike(findings, "WEBHOOK_METADATA_REJECTION_SPIKE", metadata, options.metadataSpikeThreshold, "ALERT_ONLY");
  pushSpike(findings, "WEBHOOK_RAW_MISMATCH_SPIKE", rawMismatch, options.rawMismatchSpikeThreshold, "SECURITY_SIGNAL");
}

async function appendTrustedEventSpikes(
  client: PrismaClient,
  findings: ReconciliationFinding[],
  since: Date,
  options: NormalizedOptions,
): Promise<void> {
  const parseFailed = await countTrustedEventSpike(client, PaymentEventStatus.FAILED, PaymentEventFailureStage.PARSE, since);
  const completeFailed = await countTrustedEventSpike(client, PaymentEventStatus.RETRYABLE_FAILED, PaymentEventFailureStage.COMPLETE, since);
  pushSpike(findings, "TRUSTED_EVENT_PARSE_FAILED_SPIKE", parseFailed, options.parseFailureSpikeThreshold, "ALERT_ONLY");
  pushSpike(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED_SPIKE", completeFailed, options.completeRetryableSpikeThreshold, "MANUAL_REVIEW");
}

function countTrustedEventSpike(
  client: PrismaClient,
  status: PaymentEventStatus,
  failureStage: PaymentEventFailureStage,
  since: Date,
): Promise<number> {
  return client.paymentEvent.count({ where: { status, failureStage, receivedAt: { gte: since } } });
}

function pushSpike(
  findings: ReconciliationFinding[],
  kind: ReconciliationFinding["kind"],
  count: number,
  threshold: number,
  action: ReconciliationRecommendedAction,
): void {
  if (threshold < 1 || count < threshold) return;
  findings.push(finding({
    kind,
    severity: action === "SECURITY_SIGNAL" ? "critical" : "warning",
    recommendedAction: action,
    source: kind.includes("WEBHOOK") ? ["webhookIngressRejection"] : ["paymentEvent"],
    sourceIds: {},
    details: { count, threshold },
    confidence: "high",
  }));
}

function voidMaxAttemptsFinding(row: VoidOutboxRow): ReconciliationFinding {
  return finding({
    kind: "PG_VOID_MAX_ATTEMPTS",
    severity: "critical",
    recommendedAction: "VOID_FAILED_MAX_ATTEMPTS",
    source: ["paymentOutbox"],
    sourceIds: { paymentOutbox: [row.id] },
    details: { outboxId: row.id, attempts: row.attempts, status: row.status, dedupKey: row.dedupKey },
    confidence: "high",
  });
}

function voidMismatchFinding(
  row: VoidOutboxRow,
  payload: VoidPayload,
  payment: { provider: PaymentProvider; providerPaymentKey: string | null } | null,
): ReconciliationFinding {
  return finding({
    kind: "PG_VOID_MISMATCH_TERMINAL",
    severity: "critical",
    recommendedAction: "VOID_MISMATCH_TERMINAL",
    source: ["paymentOutbox", "payment"],
    sourceIds: { paymentOutbox: [row.id], payment: [payload.paymentId] },
    details: {
      outboxId: row.id,
      paymentId: payload.paymentId,
      payloadProvider: payload.provider,
      actualProvider: payment?.provider ?? null,
      payloadProviderPaymentKey: payload.providerPaymentKey,
      actualProviderPaymentKey: payment?.providerPaymentKey ?? null,
    },
    confidence: "high",
  });
}

function paymentEventFinding(
  event: PaymentEvent,
  kind: ReconciliationFinding["kind"],
  action: ReconciliationRecommendedAction,
): ReconciliationFinding {
  return finding({
    kind,
    severity: action === "WATCH_STALE" || action === "MANUAL_REVIEW" ? "warning" : "info",
    recommendedAction: action,
    source: ["paymentEvent"],
    sourceIds: { paymentEvent: [event.id] },
    details: {
      eventId: event.id,
      status: event.status,
      failureStage: event.failureStage,
      failureCode: event.failureCode,
      attemptCount: event.attemptCount,
    },
    confidence: "high",
  });
}

function verifyRejectionFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  return rejectionFinding(rejection, "WEBHOOK_VERIFY_REJECTION", "SECURITY_SIGNAL", "warning");
}

function metadataRejectionFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  return rejectionFinding(rejection, "WEBHOOK_METADATA_REJECTION", "ALERT_ONLY", "info");
}

function rawMismatchFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  return rejectionFinding(rejection, "WEBHOOK_RAW_MISMATCH", "SECURITY_SIGNAL", "critical");
}

function rejectionFinding(
  rejection: WebhookIngressRejection,
  kind: ReconciliationFinding["kind"],
  action: ReconciliationRecommendedAction,
  severity: ReconciliationFinding["severity"],
): ReconciliationFinding {
  return finding({
    kind,
    severity,
    recommendedAction: action,
    source: ["webhookIngressRejection"],
    sourceIds: { webhookIngressRejection: [rejection.id] },
    details: {
      rejectionId: rejection.id,
      stage: rejection.stage,
      code: rejection.code,
      candidateTransmissionId: rejection.candidateTransmissionId,
      candidateEventType: rejection.candidateEventType,
    },
    confidence: "high",
  });
}

function isRetryableEventStale(event: PaymentEvent, options: NormalizedOptions): boolean {
  return isOlderThan(event.lastAttemptAt ?? event.receivedAt, options.now, options.staleRetryableFailedAfterMs);
}

type VoidOutboxRow = Awaited<ReturnType<PrismaClient["paymentOutbox"]["findMany"]>>[number];
