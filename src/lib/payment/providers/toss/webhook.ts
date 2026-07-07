import { PaymentProvider } from "@prisma/client";
import type { NormalizedProviderWebhookEvent, ProviderAuthoritativeState, ProviderDiagnostics, ProviderVerifiedWebhookInput, ProviderWebhookCandidateMetadata, ProviderWebhookMetadataResult, ProviderWebhookParser, ProviderWebhookRawRequest, ProviderWebhookRejectionReason, ProviderWebhookVerificationResult, ProviderWebhookVerifier, VerifiedProviderContext } from "../contract";
import { parseTossOrderId } from "./order-id";
import { tossProviderDiagnostics } from "./redaction";

const TOSS_TRANSMISSION_ID_HEADER = "tosspayments-webhook-transmission-id";
const PAYMENT_STATUS_CHANGED = "PAYMENT_STATUS_CHANGED";
const CANCEL_STATUS_CHANGED = "CANCEL_STATUS_CHANGED";
const DEPOSIT_CALLBACK = "DEPOSIT_CALLBACK";

export type TossLookupHttpResult =
  | { kind: "response"; httpStatus: number; body: unknown; receivedAt?: Date }
  | { kind: "network_timeout" };

// `network_timeout` means provider lookup timeout/unavailability; thrown port errors are infrastructure failures for future retryable classification, not verified captures, and lookup code must not fabricate missing/invalid provider data on transient failure.
export type TossPaymentLookupPort = (paymentKey: string) => Promise<TossLookupHttpResult>;

// `null` means the paymentId is definitively absent, unknown, or not owned by Mira, so callers may ignore/no-capture; infrastructure, DB, timeout-like, or ambiguous failures must throw, and future Prisma ports must not catch transient DB errors as null.
export type TossPaymentCorrelationPort = (paymentId: string) => Promise<{ checkoutSessionId: string } | null>;

interface TossWebhookTrigger { eventType: string; eventId?: string; paymentKey?: string }

interface TossLookupPayment { paymentKey: string; orderId: string; status: string; totalAmount: number; currency: string; approvedAt?: Date }

export function createTossQueryWebhookVerifier({
  context,
  lookup,
}: {
  context: VerifiedProviderContext;
  lookup: TossPaymentLookupPort;
}): ProviderWebhookVerifier {
  return {
    extractCandidateMetadata: (raw) => extractTossCandidateMetadata(raw),
    verify: (raw) => verifyTossWebhook(raw, context, lookup),
  };
}

export function createTossWebhookParser({
  correlation,
}: {
  correlation: TossPaymentCorrelationPort;
}): ProviderWebhookParser {
  return {
    parse: (input) => parseTossWebhook(input, correlation),
  };
}

function extractTossCandidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookMetadataResult {
  const trigger = parseTrigger(raw.body);
  const metadata = tossMetadata(raw, trigger.ok ? trigger.value : undefined);
  if (metadata.transmissionId && metadata.eventType) return { kind: "metadata", metadata };
  return {
    kind: "rejected",
    reason: "METADATA_INVALID",
    code: "TOSS.METADATA_MISSING",
    safeMessage: "Toss webhook metadata is missing.",
    metadata,
  };
}

async function verifyTossWebhook(
  raw: ProviderWebhookRawRequest,
  context: VerifiedProviderContext,
  lookup: TossPaymentLookupPort,
): Promise<ProviderWebhookVerificationResult> {
  const trigger = parseTrigger(raw.body);
  const metadata = tossMetadata(raw, trigger.ok ? trigger.value : undefined);
  if (!metadata.transmissionId || !metadata.eventType || !trigger.ok) {
    return verificationRejected("METADATA_INVALID", "TOSS.METADATA_INVALID", "Toss webhook metadata is invalid.", metadata, 400);
  }
  if (!isLookupVerifiedEvent(trigger.value.eventType)) {
    return verificationRejected("UNSUPPORTED_EVENT", "TOSS.EVENT_UNSUPPORTED", "Toss webhook event is unsupported.", metadata, 400);
  }
  if (!trigger.value.paymentKey) {
    return verificationRejected("METADATA_INVALID", "TOSS.PAYMENT_KEY_MISSING", "Toss webhook paymentKey is missing.", metadata, 400);
  }

  const result = await lookup(trigger.value.paymentKey);
  const requiredMetadata: RequiredMetadata = { ...metadata, transmissionId: metadata.transmissionId, eventType: metadata.eventType };
  return verifiedFromLookup(raw, context, trigger.value, requiredMetadata, result);
}

function verifiedFromLookup(
  raw: ProviderWebhookRawRequest,
  context: VerifiedProviderContext,
  trigger: TossWebhookTrigger,
  metadata: RequiredMetadata,
  result: TossLookupHttpResult,
): ProviderWebhookVerificationResult {
  const failure = lookupFailure(result, metadata);
  if (failure) return failure;
  if (result.kind !== "response") throw new Error("Unexpected Toss lookup result.");

  const payment = parseLookupPayment(result.body);
  if (!payment) return verificationRejected("METADATA_INVALID", "TOSS.LOOKUP_MALFORMED", "Toss lookup response is invalid.", metadata, 502);
  if (payment.paymentKey !== trigger.paymentKey) {
    return verificationRejected("RAW_BODY_MISMATCH", "TOSS.PAYMENT_KEY_MISMATCH", "Toss webhook paymentKey mismatch.", metadata, 400);
  }

  return {
    kind: "verified",
    input: verifiedInput(raw, context, metadata, payment, result.receivedAt ?? new Date()),
    diagnostics: tossProviderDiagnostics({ providerStatus: payment.status }),
  };
}

async function parseTossWebhook(
  input: ProviderVerifiedWebhookInput,
  correlation: TossPaymentCorrelationPort,
): Promise<NormalizedProviderWebhookEvent> {
  const state = input.authoritativeState;
  if (!state) throw new Error("Toss query webhook missing authoritative state.");
  const ignoredReason = parseIgnoredReason(input.eventType, state.status);
  if (ignoredReason) return ignored(input, ignoredReason);

  const orderId = lookupOrderId(state);
  if (!orderId) return ignored(input, "TOSS_LOOKUP_ORDER_ID_MISSING");
  const parsed = parseTossOrderId(orderId);
  if (!parsed.ok) return ignored(input, `TOSS_ORDER_ID_${parsed.reason}`);

  const hit = await correlation(parsed.paymentId);
  if (!hit) return ignored(input, "TOSS_PAYMENT_CORRELATION_MISSING");
  return {
    kind: "capture",
    facts: {
      checkoutSessionId: hit.checkoutSessionId,
      provider: PaymentProvider.TOSS,
      mode: input.context.mode,
      providerPaymentKey: state.providerPaymentKey,
      amount: state.amountMinor,
      currency: state.currency,
      capturedAt: state.approvedAt,
      receivedAt: input.receivedAt ?? state.lookedUpAt,
    },
  };
}

type TriggerParseResult = { ok: true; value: TossWebhookTrigger } | { ok: false };
type RequiredMetadata = ProviderWebhookCandidateMetadata & { transmissionId: string; eventType: string };

function parseIgnoredReason(eventType: string, status: string): string | null {
  if (eventType === CANCEL_STATUS_CHANGED) return "TOSS_CANCEL_STATUS_CHANGED_OUT_OF_SCOPE";
  if (eventType === DEPOSIT_CALLBACK) return "TOSS_DEPOSIT_CALLBACK_OUT_OF_SCOPE";
  if (eventType !== PAYMENT_STATUS_CHANGED) return "TOSS_EVENT_UNSUPPORTED";
  return status === "DONE" ? null : statusIgnoredReason(status);
}

function parseTrigger(body: string): TriggerParseResult {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return { ok: false };
    const eventType = stringField(parsed, "eventType");
    if (!eventType) return { ok: false };
    const data = recordField(parsed, "data");
    return {
      ok: true,
      value: {
        eventType,
        eventId: stringField(parsed, "eventId") ?? stringField(parsed, "id"),
        paymentKey: data ? stringField(data, "paymentKey") : undefined,
      },
    };
  } catch {
    return { ok: false };
  }
}

function tossMetadata(raw: ProviderWebhookRawRequest, trigger: TossWebhookTrigger | undefined): ProviderWebhookCandidateMetadata {
  return {
    transmissionId: readHeader(raw, TOSS_TRANSMISSION_ID_HEADER),
    eventId: trigger?.eventId,
    eventType: trigger?.eventType,
  };
}

function lookupFailure(
  result: TossLookupHttpResult,
  metadata: RequiredMetadata,
): ProviderWebhookVerificationResult | null {
  if (result.kind === "network_timeout") {
    return verificationRejected("AUTHENTICATION_FAILED", "TOSS.LOOKUP_TIMEOUT", "Toss lookup timed out.", metadata, 503);
  }
  if (result.httpStatus >= 200 && result.httpStatus < 300) return null;
  const diagnostics = tossProviderDiagnostics({
    httpStatus: result.httpStatus,
    safeMessage: "Toss lookup failed.",
  });
  return verificationRejected("AUTHENTICATION_FAILED", "TOSS.LOOKUP_HTTP_ERROR", "Toss lookup failed.", metadata, result.httpStatus, diagnostics);
}

function parseLookupPayment(body: unknown): TossLookupPayment | null {
  if (!isRecord(body)) return null;
  const paymentKey = stringField(body, "paymentKey");
  const orderId = stringField(body, "orderId");
  const status = stringField(body, "status");
  const totalAmount = integerField(body, "totalAmount");
  const currency = stringField(body, "currency");
  if (!paymentKey || !orderId || !status || totalAmount === null || !currency) return null;
  const approvedAt = optionalDate(body, "approvedAt");
  if (approvedAt === null) return null;
  return { paymentKey, orderId, status, totalAmount, currency, approvedAt };
}

function verifiedInput(
  raw: ProviderWebhookRawRequest,
  context: VerifiedProviderContext,
  metadata: RequiredMetadata,
  payment: TossLookupPayment,
  lookedUpAt: Date,
): ProviderVerifiedWebhookInput {
  const authoritativeState: ProviderAuthoritativeState = {
    lookedUpAt,
    approvedAt: payment.approvedAt,
    providerPaymentKey: payment.paymentKey,
    status: payment.status,
    amountMinor: payment.totalAmount,
    currency: payment.currency,
    raw: { orderId: payment.orderId },
  };
  return {
    ...raw,
    provider: context.provider,
    transmissionId: metadata.transmissionId,
    eventId: metadata.eventId,
    eventType: metadata.eventType,
    context,
    authoritativeState,
  };
}

function lookupOrderId(state: ProviderAuthoritativeState): string | null {
  if (!isRecord(state.raw)) return null;
  return stringField(state.raw, "orderId") ?? null;
}

function statusIgnoredReason(status: string): string {
  if (status === "READY") return "TOSS_STATUS_READY";
  if (status === "IN_PROGRESS") return "TOSS_STATUS_IN_PROGRESS";
  if (status === "WAITING_FOR_DEPOSIT") return "TOSS_STATUS_WAITING_FOR_DEPOSIT";
  if (status === "CANCELED") return "TOSS_STATUS_CANCELED";
  if (status === "PARTIAL_CANCELED") return "TOSS_STATUS_PARTIAL_CANCELED";
  if (status === "ABORTED") return "TOSS_STATUS_ABORTED";
  if (status === "EXPIRED") return "TOSS_STATUS_EXPIRED";
  return "TOSS_STATUS_UNKNOWN";
}

function ignored(input: ProviderVerifiedWebhookInput, reason: string): NormalizedProviderWebhookEvent {
  return { kind: "ignored", provider: PaymentProvider.TOSS, transmissionId: input.transmissionId, eventType: input.eventType, reason };
}

function verificationRejected(
  reason: ProviderWebhookRejectionReason,
  code: string,
  safeMessage: string,
  metadata: ProviderWebhookCandidateMetadata,
  httpStatus: number,
  diagnostics?: ProviderDiagnostics,
): ProviderWebhookVerificationResult {
  return { kind: "rejected", reason, code, safeMessage, metadata, httpStatus, diagnostics };
}

function isLookupVerifiedEvent(eventType: string): boolean {
  return eventType === PAYMENT_STATUS_CHANGED || eventType === CANCEL_STATUS_CHANGED;
}

function readHeader(raw: ProviderWebhookRawRequest, key: string): string | undefined {
  if (!raw.headers) return undefined;
  if (raw.headers instanceof Headers) return raw.headers.get(key) ?? undefined;
  return raw.headers[key] ?? raw.headers[key.toLowerCase()];
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function integerField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function optionalDate(record: Record<string, unknown>, key: string): Date | undefined | null {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
