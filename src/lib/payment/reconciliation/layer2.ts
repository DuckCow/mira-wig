import {
  OutboxStatus,
  PaymentEventFailureStage,
  PaymentEventStatus,
  PaymentProvider,
  WebhookIngressRejectionStage,
} from "@prisma/client";
import type { PaymentEvent, PrismaClient } from "@prisma/client";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox/types";
import type { ReconciliationFinding } from "./types";
import {
  cutoff,
  isOlderThan,
  LOOKUP_UNAVAILABLE_CODES,
  metadataRejectionFinding,
  parseVoidPayload,
  paymentEventFinding,
  pushSpike,
  RAW_MISMATCH_CODE,
  rawMismatchFinding,
  retryableCompleteFinding,
  tossIgnoredStatusFinding,
  TOSS_IGNORED_STATUS_PREFIX,
  type NormalizedOptions,
  type VoidPayload,
  verifyRejectionFinding,
  VERIFY_SPIKE_EXCLUDED_CODES,
  voidMaxAttemptsFinding,
  voidMismatchFinding,
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
  paymentById: Map<string, { mode: string; provider: PaymentProvider; providerPaymentKey: string | null }>,
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
  await appendIgnoredTossStatusEvents(client, findings);
  await appendParseFailedEvents(client, findings);
  await appendTerminalCompleteEvents(client, findings);
  await appendRetryableCompleteEvents(client, options, findings);
  await appendStaleReceivedEvents(client, options, findings);
  await appendStaleRetryableEvents(client, options, findings);
  await appendTossBeyondRedeliveryHorizonEvents(client, options, findings);
}

async function appendIgnoredTossStatusEvents(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: {
      provider: PaymentProvider.TOSS,
      status: PaymentEventStatus.IGNORED,
      lastError: { startsWith: TOSS_IGNORED_STATUS_PREFIX },
    },
  });
  for (const event of events) {
    findings.push(tossIgnoredStatusFinding(event));
  }
}

async function appendParseFailedEvents(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: { status: PaymentEventStatus.FAILED, failureStage: PaymentEventFailureStage.PARSE },
  });
  for (const event of events) findings.push(paymentEventFinding(event, "TRUSTED_EVENT_PARSE_FAILED", "ALERT_ONLY"));
}

async function appendTerminalCompleteEvents(client: PrismaClient, findings: ReconciliationFinding[]): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: { status: PaymentEventStatus.FAILED, failureStage: PaymentEventFailureStage.COMPLETE },
  });
  for (const event of events) {
    findings.push(paymentEventFinding(event, "TRUSTED_EVENT_TERMINAL_COMPLETE_FAILED", "MANUAL_REVIEW"));
  }
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
    const specific = retryableCompleteFinding(event);
    if (specific) {
      findings.push(specific);
      continue;
    }
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

async function appendTossBeyondRedeliveryHorizonEvents(
  client: PrismaClient,
  options: NormalizedOptions,
  findings: ReconciliationFinding[],
): Promise<void> {
  const events = await client.paymentEvent.findMany({
    where: {
      provider: PaymentProvider.TOSS,
      status: PaymentEventStatus.RETRYABLE_FAILED,
      receivedAt: { lte: cutoff(options.now, options.tossRedeliveryHorizonMs) },
    },
  });
  for (const event of events) {
    findings.push(paymentEventFinding(event, "PAYMENT_EVENT_BEYOND_REDELIVERY_HORIZON", "MANUAL_REVIEW"));
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
  const verify = await client.webhookIngressRejection.count({
    where: { stage: WebhookIngressRejectionStage.VERIFY, code: { notIn: VERIFY_SPIKE_EXCLUDED_CODES }, receivedAt: { gte: since } },
  });
  const metadata = await client.webhookIngressRejection.count({ where: { stage: WebhookIngressRejectionStage.METADATA_EXTRACT, receivedAt: { gte: since } } });
  const rawMismatch = await client.webhookIngressRejection.count({ where: { code: RAW_MISMATCH_CODE, receivedAt: { gte: since } } });
  const lookupUnavailable = await client.webhookIngressRejection.count({
    where: { code: { in: LOOKUP_UNAVAILABLE_CODES }, receivedAt: { gte: since } },
  });
  pushSpike(findings, "WEBHOOK_VERIFY_REJECTION_SPIKE", verify, options.verifySpikeThreshold, "SECURITY_SIGNAL");
  pushSpike(findings, "WEBHOOK_METADATA_REJECTION_SPIKE", metadata, options.metadataSpikeThreshold, "ALERT_ONLY");
  pushSpike(findings, "WEBHOOK_RAW_MISMATCH_SPIKE", rawMismatch, options.rawMismatchSpikeThreshold, "SECURITY_SIGNAL");
  pushSpike(findings, "WEBHOOK_LOOKUP_UNAVAILABLE_SPIKE", lookupUnavailable, options.lookupUnavailableSpikeThreshold, "ALERT_ONLY");
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

function isRetryableEventStale(event: PaymentEvent, options: NormalizedOptions): boolean {
  return isOlderThan(event.lastAttemptAt ?? event.receivedAt, options.now, options.staleRetryableFailedAfterMs);
}
