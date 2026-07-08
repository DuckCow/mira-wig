import type { PaymentEvent, PaymentProvider, Prisma, WebhookIngressRejection } from "@prisma/client";
import type {
  ReconciliationFinding,
  ReconciliationRecommendedAction,
  ReconcilePaymentCoreOptions,
} from "./types";

export const VOID_TOPIC = "pg.void";
export const RAW_MISMATCH_CODE = "VERIFY.RAW_MISMATCH";
export const TOSS_IGNORED_STATUS_PREFIX = "TOSS_STATUS_";
export const TOSS_UNKNOWN_STATUS = "TOSS_STATUS_UNKNOWN";
export const ACKED_UNSUPPORTED_CODE = "TOSS.EVENT_ACKED_UNSUPPORTED";
export const MODE_COLLISION_CODE = "VERIFY.MODE_COLLISION";
export const BINDING_UNAVAILABLE_CODE = "COMPLETE.CREDENTIAL_BINDING_UNAVAILABLE";
export const MODE_DIVERGENCE_CODE = "COMPLETE.MODE_DIVERGENCE";
export const LOOKUP_UNAVAILABLE_CODES = [
  "TOSS.LOOKUP_TIMEOUT",
  "TOSS.LOOKUP_NETWORK_ERROR",
  "TOSS.LOOKUP_HTTP_ERROR",
  "TOSS.LOOKUP_PORT_UNAVAILABLE",
  "SANDBOX_EXTERNAL_MISCONFIGURED",
  "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
  "SANDBOX_EXTERNAL_CONFIG_INVALID",
];
export const VERIFY_SPIKE_EXCLUDED_CODES = [ACKED_UNSUPPORTED_CODE, ...LOOKUP_UNAVAILABLE_CODES];
// Toss redelivery schedule in docs/payment_policy/provider_docs_snapshot_v1.md:
// 1 + 4 + 16 + 64 + 256 + 1024 + 4096 minutes = 5,461 minutes.
export const TOSS_REDELIVERY_HORIZON_MS = 5_461 * 60 * 1000;

// C2-v0 defaults are detector defaults, not final product or retention policy.
const DEFAULTS = {
  staleReceivedAfterMs: 10 * 60_000,
  staleRetryableFailedAfterMs: 10 * 60_000,
  staleSucceededPaymentAfterMs: 10 * 60_000,
  staleProviderConfirmAfterMs: 10 * 60_000,
  tossRedeliveryHorizonMs: TOSS_REDELIVERY_HORIZON_MS,
  spikeWindowMs: 10 * 60_000,
  verifySpikeThreshold: 10,
  metadataSpikeThreshold: 10,
  rawMismatchSpikeThreshold: 3,
  lookupUnavailableSpikeThreshold: 10,
  parseFailureSpikeThreshold: 5,
  completeRetryableSpikeThreshold: 5,
};

export type NormalizedOptions = Required<ReconcilePaymentCoreOptions>;

export interface VoidPayload {
  paymentId: string;
  provider: string;
  providerPaymentKey: string;
}

export function normalizeOptions(options: ReconcilePaymentCoreOptions): NormalizedOptions {
  const now = options.now ?? new Date();
  return {
    ...DEFAULTS,
    ...options,
    now,
  };
}

export function finding(input: ReconciliationFinding): ReconciliationFinding {
  return input;
}

export function pushSpike(
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

export function voidMaxAttemptsFinding(row: VoidOutboxFindingRow): ReconciliationFinding {
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

export function voidMismatchFinding(
  row: VoidOutboxFindingRow,
  payload: VoidPayload,
  payment: VoidMismatchPayment | null,
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
      actualPaymentMode: payment?.mode ?? null,
      payloadProviderPaymentKey: payload.providerPaymentKey,
      actualProviderPaymentKey: payment?.providerPaymentKey ?? null,
    },
    confidence: "high",
  });
}

export function tossIgnoredStatusFinding(event: PaymentEvent): ReconciliationFinding {
  const action = event.lastError === TOSS_UNKNOWN_STATUS ? "MANUAL_REVIEW" : "ALERT_ONLY";
  const severity = event.lastError === TOSS_UNKNOWN_STATUS ? "warning" : "info";
  return paymentEventFinding(event, "TOSS_IGNORED_PROVIDER_STATUS", action, severity);
}

export function retryableCompleteFinding(event: PaymentEvent): ReconciliationFinding | null {
  if (event.failureCode === BINDING_UNAVAILABLE_CODE) {
    return paymentEventFinding(event, "WEBHOOK_EVENT_BINDING_UNAVAILABLE", "ALERT_ONLY", "warning");
  }
  if (event.failureCode === MODE_DIVERGENCE_CODE) {
    return paymentEventFinding(event, "WEBHOOK_EVENT_MODE_DIVERGENCE", "ALERT_ONLY", "warning");
  }
  return null;
}

export function paymentEventFinding(
  event: PaymentEvent,
  kind: ReconciliationFinding["kind"],
  action: ReconciliationRecommendedAction,
  severity = paymentEventSeverity(action),
): ReconciliationFinding {
  return finding({
    kind,
    severity,
    recommendedAction: action,
    source: ["paymentEvent"],
    sourceIds: { paymentEvent: [event.id] },
    details: {
      eventId: event.id,
      provider: event.provider,
      transmissionId: event.transmissionId,
      status: event.status,
      failureStage: event.failureStage,
      failureCode: event.failureCode,
      lastError: event.lastError,
      verifiedMode: event.verifiedMode,
      verifiedCredentialBinding: event.verifiedCredentialBinding,
      attemptCount: event.attemptCount,
    },
    confidence: "high",
  });
}

export function verifyRejectionFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  if (rejection.code === ACKED_UNSUPPORTED_CODE) {
    return rejectionFinding(rejection, "WEBHOOK_ACKED_UNSUPPORTED_EVENT", "ALERT_ONLY", "info");
  }
  if (LOOKUP_UNAVAILABLE_CODES.includes(rejection.code)) {
    return rejectionFinding(rejection, "WEBHOOK_LOOKUP_UNAVAILABLE", "ALERT_ONLY", "warning");
  }
  if (rejection.code === MODE_COLLISION_CODE) {
    return rejectionFinding(rejection, "WEBHOOK_MODE_COLLISION", "SECURITY_SIGNAL", "critical");
  }
  return rejectionFinding(rejection, "WEBHOOK_VERIFY_REJECTION", "SECURITY_SIGNAL", "warning");
}

export function metadataRejectionFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  return rejectionFinding(rejection, "WEBHOOK_METADATA_REJECTION", "ALERT_ONLY", "info");
}

export function rawMismatchFinding(rejection: WebhookIngressRejection): ReconciliationFinding {
  return rejectionFinding(rejection, "WEBHOOK_RAW_MISMATCH", "SECURITY_SIGNAL", "critical");
}

export function parseVoidPayload(payload: Prisma.JsonValue): VoidPayload | null {
  if (!isRecord(payload)) return null;
  const paymentId = stringField(payload, "paymentId");
  const provider = stringField(payload, "provider");
  const providerPaymentKey = stringField(payload, "providerPaymentKey");
  if (!paymentId || !provider || !providerPaymentKey) return null;
  return { paymentId, provider, providerPaymentKey };
}

export function isOlderThan(value: Date, now: Date, thresholdMs: number): boolean {
  return value.getTime() <= now.getTime() - thresholdMs;
}

export function ageMs(value: Date, now: Date): number {
  return Math.max(0, now.getTime() - value.getTime());
}

export function cutoff(now: Date, ms: number): Date {
  return new Date(now.getTime() - ms);
}

export function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Prisma.JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function paymentEventSeverity(action: ReconciliationRecommendedAction): ReconciliationFinding["severity"] {
  return action === "WATCH_STALE" || action === "MANUAL_REVIEW" ? "warning" : "info";
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
      provider: rejection.provider,
      candidateTransmissionId: rejection.candidateTransmissionId,
      candidateEventType: rejection.candidateEventType,
      lastError: rejection.lastError,
    },
    confidence: "high",
  });
}

interface VoidOutboxFindingRow {
  id: string;
  attempts: number;
  status: string;
  dedupKey: string | null;
}

interface VoidMismatchPayment {
  mode: string;
  provider: PaymentProvider;
  providerPaymentKey: string | null;
}
