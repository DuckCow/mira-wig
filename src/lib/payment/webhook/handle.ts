import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import { configuredPaymentMode, PaymentModeConfigException } from "@/lib/payment/mode";
import {
  isTerminalEventStatus,
  markCompleteFailed,
  markIgnored,
  markParseFailed,
  markProcessed,
  markRetryableCompleteFailed,
  rawBodyFromEvent,
  recordEvent,
  type RecordedEvent,
} from "./record";
import { rawBodyHash, recordWebhookRejection } from "./rejections";
import { createMockWebhookVerifier, inspectWebhookMetadata } from "./verify";
import type { RawWebhookRequest, WebhookMetadata } from "./verify";

export interface WebhookHandleResult {
  kind: "processed" | "duplicate" | "ignored" | "retryable" | "verifyFailed" | "failed";
  status: number;
  eventId?: string;
}

type ParseResult = { kind: "capture"; facts: CaptureFacts } | { kind: "ignored"; reason: string };

class WebhookParseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WebhookParseError";
  }
}

export async function handleWebhook(
  client: PrismaClient,
  provider: PaymentProvider,
  raw: RawWebhookRequest,
): Promise<WebhookHandleResult> {
  const receivedAt = raw.receivedAt ?? new Date();
  const inspected = inspectWebhookMetadata(raw);
  if (inspected.kind === "failed") {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.METADATA_EXTRACT, code: inspected.code, rawBody: raw.body, candidateTransmissionId: inspected.candidateTransmissionId, candidateEventType: inspected.candidateEventType, lastError: inspected.message });
    return { kind: "verifyFailed", status: 400 };
  }

  const verified = await createMockWebhookVerifier().verify(raw);
  if (!verified.ok) {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.VERIFY, code: "VERIFY.FAILED", rawBody: raw.body, candidateTransmissionId: inspected.metadata.transmissionId, candidateEventType: inspected.metadata.eventType, lastError: verified.reason });
    return { kind: "verifyFailed", status: 400 };
  }

  const recorded = await recordEvent(client, { provider, ...inspected.metadata, rawBody: raw.body, receivedAt });
  if (recorded.kind === "duplicate") {
    return handleDuplicate(client, provider, recorded.event, raw.body, receivedAt);
  }
  return processRecorded(client, provider, raw.body, inspected.metadata, recorded.event.id, receivedAt);
}

async function handleDuplicate(
  client: PrismaClient,
  provider: PaymentProvider,
  event: RecordedEvent | null,
  incomingRawBody: string,
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  if (!event) return { kind: "retryable", status: 500 };
  if (isTerminalEventStatus(event.status)) return { kind: "duplicate", status: 200, eventId: event.id };
  const storedRawBody = rawBodyFromEvent(event);
  const metadata = metadataFromEvent(event);
  if (!storedRawBody || !metadata) return { kind: "retryable", status: 500, eventId: event.id };
  if (rawBodyHash(storedRawBody) !== rawBodyHash(incomingRawBody)) {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.VERIFY, code: "VERIFY.RAW_MISMATCH", rawBody: incomingRawBody, candidateTransmissionId: metadata.transmissionId, candidateEventType: metadata.eventType, lastError: "Duplicate webhook raw body did not match stored authenticated event" });
    return { kind: "retryable", status: 400, eventId: event.id };
  }
  return processRecorded(client, provider, storedRawBody, metadata, event.id, receivedAt);
}

async function processRecorded(
  client: PrismaClient,
  provider: PaymentProvider,
  rawBody: string,
  metadata: WebhookMetadata,
  eventId: string,
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  try {
    const parsed = parseMockWebhook(provider, rawBody, metadata, receivedAt);
    if (parsed.kind === "ignored") return ignoreRecorded(client, eventId, receivedAt, parsed.reason);
    return completeRecorded(client, eventId, receivedAt, parsed.facts);
  } catch (e) {
    if (e instanceof PaymentModeConfigException) {
      return retryableCompleteFailure(
        client,
        eventId,
        receivedAt,
        "Payment processing is temporarily unavailable.",
        "COMPLETE.CONFIG_UNAVAILABLE",
      );
    }
    const failure = parseFailure(e);
    await markParseFailed(client, { eventId, failedAt: receivedAt, code: failure.code, message: failure.message });
    return { kind: "failed", status: 200, eventId };
  }
}

async function completeRecorded(
  client: PrismaClient,
  eventId: string,
  attemptedAt: Date,
  facts: CaptureFacts,
): Promise<WebhookHandleResult> {
  try {
    const result = await completeFromCapture(client, facts);
    if (result.kind === "retryableFailure") return retryableCompleteFailure(client, eventId, attemptedAt, result.message, `COMPLETE.${result.code}`);
    if (result.kind === "compensationSkipped") return terminalCompleteFailure(client, eventId, attemptedAt, result.failure.message, `COMPLETE.${result.failure.code}`);
    await markProcessedEvent(client, eventId, attemptedAt, facts, result);
    return { kind: "processed", status: 200, eventId };
  } catch (e) {
    return retryableCompleteFailure(client, eventId, attemptedAt, errorMessage(e), "COMPLETE.EXCEPTION");
  }
}

async function markProcessedEvent(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  facts: CaptureFacts,
  _result: CompleteFromCaptureResult,
): Promise<void> {
  await markProcessed(client, {
    eventId,
    processedAt,
    checkoutSessionId: facts.checkoutSessionId,
    providerPaymentKey: facts.providerPaymentKey,
  });
}

async function ignoreRecorded(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  reason: string,
): Promise<WebhookHandleResult> {
  await markIgnored(client, { eventId, processedAt, reason });
  return { kind: "ignored", status: 200, eventId };
}

async function terminalCompleteFailure(
  client: PrismaClient,
  eventId: string,
  failedAt: Date,
  message: string,
  code: string,
): Promise<WebhookHandleResult> {
  await markCompleteFailed(client, { eventId, failedAt, code, message });
  return { kind: "failed", status: 200, eventId };
}

async function retryableCompleteFailure(
  client: PrismaClient,
  eventId: string,
  attemptedAt: Date,
  message: string,
  code: string,
): Promise<WebhookHandleResult> {
  await markRetryableCompleteFailed(client, { eventId, attemptedAt, code, message });
  return { kind: "retryable", status: 500, eventId };
}

function metadataFromEvent(event: RecordedEvent): WebhookMetadata | null {
  if (!event.transmissionId) return null;
  return { transmissionId: event.transmissionId, eventType: event.eventType };
}

function parseMockWebhook(
  provider: PaymentProvider,
  body: string,
  metadata: WebhookMetadata,
  receivedAt: Date,
): ParseResult {
  const payload = parseBody(body);
  if (isIgnored(metadata, payload)) return { kind: "ignored", reason: metadata.eventType };
  return { kind: "capture", facts: captureFacts(provider, payload, receivedAt) };
}

function captureFacts(
  provider: PaymentProvider,
  payload: Record<string, unknown>,
  receivedAt: Date,
): CaptureFacts {
  return {
    checkoutSessionId: requiredString(payload, "checkoutSessionId"),
    provider,
    // Interim source until authenticated provider events carry an explicit persisted mode.
    mode: configuredPaymentMode(),
    providerPaymentKey: requiredString(payload, "providerPaymentKey"),
    amount: requiredNumber(payload, "amount"),
    currency: requiredString(payload, "currency"),
    capturedAt: optionalDate(payload, "capturedAt"),
    receivedAt,
  };
}

function isIgnored(metadata: WebhookMetadata, payload: Record<string, unknown>): boolean {
  return metadata.eventType.includes("PENDING") || stringField(payload, "kind") === "ignore";
}

function parseBody(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) return parsed;
    throw new WebhookParseError("PARSE.BODY_NOT_OBJECT", "Webhook body must be a JSON object");
  } catch (e) {
    if (e instanceof WebhookParseError) throw e;
    throw new WebhookParseError("PARSE.JSON_INVALID", "Webhook body is invalid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = stringField(payload, key);
  if (value) return value;
  throw new WebhookParseError("PARSE.FIELD_MISSING", `Webhook field missing: ${key}`);
}

function requiredNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new WebhookParseError("PARSE.FIELD_MISSING", `Webhook field missing: ${key}`);
}

function optionalDate(payload: Record<string, unknown>, key: string): Date | undefined {
  const value = stringField(payload, key);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseFailure(e: unknown): { code: string; message: string } {
  if (e instanceof WebhookParseError) return { code: e.code, message: e.message };
  return { code: "PARSE.UNKNOWN", message: errorMessage(e) };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Webhook processing failed";
}
