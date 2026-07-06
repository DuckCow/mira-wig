import { PaymentEventStatus } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import { markEvent, recordEvent } from "./record";
import { createMockWebhookVerifier, readWebhookMetadata } from "./verify";
import type { RawWebhookRequest, WebhookMetadata } from "./verify";

export interface WebhookHandleResult {
  kind: "processed" | "duplicate" | "ignored" | "retryable" | "verifyFailed";
  status: number;
  eventId?: string;
}

type ParseResult = { kind: "capture"; facts: CaptureFacts } | { kind: "ignored"; reason: string };

export async function handleWebhook(
  client: PrismaClient,
  provider: PaymentProvider,
  raw: RawWebhookRequest,
): Promise<WebhookHandleResult> {
  const receivedAt = raw.receivedAt ?? new Date();
  const metadata = readMetadata(raw);
  if (!metadata) return { kind: "verifyFailed", status: 400 };
  const recorded = await recordEvent(client, { provider, ...metadata, rawBody: raw.body, receivedAt });
  if (recorded.kind === "duplicate") return { kind: "duplicate", status: 200, eventId: recorded.event?.id };

  const verified = await createMockWebhookVerifier().verify(raw);
  if (!verified.ok) return failRecorded(client, recorded.event.id, receivedAt, verified.reason, "verifyFailed", 400);
  return processRecorded(client, provider, raw, metadata, recorded.event.id, receivedAt);
}

function readMetadata(raw: RawWebhookRequest): WebhookMetadata | null {
  try {
    return readWebhookMetadata(raw);
  } catch {
    return null;
  }
}

async function processRecorded(
  client: PrismaClient,
  provider: PaymentProvider,
  raw: RawWebhookRequest,
  metadata: WebhookMetadata,
  eventId: string,
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  try {
    const parsed = parseMockWebhook(provider, raw.body, metadata, receivedAt);
    if (parsed.kind === "ignored") return ignoreRecorded(client, eventId, receivedAt, parsed.reason);
    return completeRecorded(client, eventId, receivedAt, parsed.facts);
  } catch (e) {
    return failRecorded(client, eventId, receivedAt, errorMessage(e), "retryable", 500);
  }
}

async function completeRecorded(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  facts: CaptureFacts,
): Promise<WebhookHandleResult> {
  try {
    const result = await completeFromCapture(client, facts);
    if (result.kind === "retryableFailure") return failRecorded(client, eventId, processedAt, result.message, "retryable", 500);
    await markProcessed(client, eventId, processedAt, facts, result);
    return { kind: "processed", status: 200, eventId };
  } catch (e) {
    return failRecorded(client, eventId, processedAt, errorMessage(e), "retryable", 500);
  }
}

async function markProcessed(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  facts: CaptureFacts,
  _result: CompleteFromCaptureResult,
): Promise<void> {
  await markEvent(client, {
    eventId,
    status: PaymentEventStatus.PROCESSED,
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
  await markEvent(client, { eventId, status: PaymentEventStatus.IGNORED, processedAt, lastError: reason });
  return { kind: "ignored", status: 200, eventId };
}

async function failRecorded(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  reason: string,
  kind: "retryable" | "verifyFailed",
  status: number,
): Promise<WebhookHandleResult> {
  await markEvent(client, { eventId, status: PaymentEventStatus.FAILED, processedAt, lastError: reason });
  return { kind, status, eventId };
}

function parseMockWebhook(
  provider: PaymentProvider,
  body: string,
  metadata: WebhookMetadata,
  receivedAt: Date,
): ParseResult {
  const payload = parseBody(body);
  if (isIgnored(metadata, payload)) return { kind: "ignored", reason: metadata.eventType };
  if (stringField(payload, "kind") === "retryable") throw new Error("Mock webhook retryable failure");
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
  const parsed: unknown = JSON.parse(body);
  if (isRecord(parsed)) return parsed;
  throw new Error("Webhook body must be a JSON object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = stringField(payload, key);
  if (value) return value;
  throw new Error(`Webhook field missing: ${key}`);
}

function requiredNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`Webhook field missing: ${key}`);
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

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Webhook processing failed";
}
