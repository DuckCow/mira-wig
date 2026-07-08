import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import { configuredPaymentMode, PaymentModeConfigException } from "@/lib/payment/mode";
import type { NormalizedProviderWebhookEvent, ProviderVerifiedWebhookInput, ProviderWebhookMetadataResult, ProviderWebhookParser, ProviderWebhookVerificationResult, ProviderWebhookVerifier } from "@/lib/payment/providers/contract";
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

export interface WebhookHandleResult { kind: "processed" | "duplicate" | "ignored" | "retryable" | "verifyFailed" | "failed"; status: number; eventId?: string }

type ParseResult = { kind: "capture"; facts: CaptureFacts } | { kind: "ignored"; reason: string };

interface WebhookProviderPipeline { verifier: ProviderWebhookVerifier; parser: ProviderWebhookParser; resolveDuplicate(input: DuplicateReplayInput): Promise<DuplicateReplayDecision> }

interface DuplicateReplayInput { client: PrismaClient; provider: PaymentProvider; event: RecordedEvent | null; incomingRawBody: string; receivedAt: Date }

type DuplicateReplayDecision =
  | { kind: "handled"; result: WebhookHandleResult }
  | { kind: "reprocess"; input: ProviderVerifiedWebhookInput; eventId: string };

class WebhookParseError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "WebhookParseError"; }
}

export async function handleWebhook(client: PrismaClient, provider: PaymentProvider, raw: RawWebhookRequest): Promise<WebhookHandleResult> {
  const receivedAt = raw.receivedAt ?? new Date();
  const receivedRaw = { ...raw, receivedAt };
  const pipeline = resolveWebhookPipeline(provider);
  const inspected = pipeline.verifier.extractCandidateMetadata(receivedRaw);
  if (inspected.kind === "rejected") {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.METADATA_EXTRACT, code: inspected.code, rawBody: raw.body, candidateTransmissionId: inspected.metadata.transmissionId, candidateEventType: inspected.metadata.eventType, lastError: inspected.safeMessage });
    return { kind: "verifyFailed", status: 400 };
  }

  const metadata = requiredMetadata(inspected.metadata);
  const verified = await pipeline.verifier.verify(receivedRaw);
  if (verified.kind === "rejected") {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.VERIFY, code: verified.code, rawBody: raw.body, candidateTransmissionId: metadata.transmissionId, candidateEventType: metadata.eventType, lastError: verified.safeMessage });
    return { kind: "verifyFailed", status: 400 };
  }

  const recorded = await recordEvent(client, { provider, ...metadata, rawBody: raw.body, receivedAt });
  if (recorded.kind === "duplicate") {
    const replay = await pipeline.resolveDuplicate({ client, provider, event: recorded.event, incomingRawBody: raw.body, receivedAt });
    if (replay.kind === "handled") return replay.result;
    return processRecorded(client, pipeline, replay.input, replay.eventId, receivedAt);
  }
  return processRecorded(client, pipeline, verified.input, recorded.event.id, receivedAt);
}

function resolveWebhookPipeline(provider: PaymentProvider): WebhookProviderPipeline {
  return createMockWebhookPipeline(provider);
}

function createMockWebhookPipeline(provider: PaymentProvider): WebhookProviderPipeline {
  return {
    verifier: createMockContractVerifier(provider),
    parser: createMockContractParser(provider),
    resolveDuplicate: (input) => resolveMockDuplicateReplay(provider, input),
  };
}

function createMockContractVerifier(provider: PaymentProvider): ProviderWebhookVerifier {
  const verifier = createMockWebhookVerifier();
  return {
    extractCandidateMetadata: (raw) => metadataInspectionToResult(inspectWebhookMetadata(raw)),
    verify: async (raw) => mockVerificationToContract(provider, raw, await verifier.verify(raw)),
  };
}

function createMockContractParser(provider: PaymentProvider): ProviderWebhookParser {
  return { parse: (input) => Promise.resolve(mockParsedEvent(provider, input)) };
}

async function resolveMockDuplicateReplay(provider: PaymentProvider, input: DuplicateReplayInput): Promise<DuplicateReplayDecision> {
  const { client, event, incomingRawBody, receivedAt } = input;
  if (!event) return { kind: "handled", result: { kind: "retryable", status: 500 } };
  if (isTerminalEventStatus(event.status)) {
    return { kind: "handled", result: { kind: "duplicate", status: 200, eventId: event.id } };
  }
  const storedRawBody = rawBodyFromEvent(event);
  const metadata = metadataFromEvent(event);
  if (!storedRawBody || !metadata) {
    return { kind: "handled", result: { kind: "retryable", status: 500, eventId: event.id } };
  }
  if (rawBodyHash(storedRawBody) !== rawBodyHash(incomingRawBody)) {
    await recordWebhookRejection(client, { provider, receivedAt, stage: WebhookIngressRejectionStage.VERIFY, code: "VERIFY.RAW_MISMATCH", rawBody: incomingRawBody, candidateTransmissionId: metadata.transmissionId, candidateEventType: metadata.eventType, lastError: "Duplicate webhook raw body did not match stored authenticated event" });
    return { kind: "handled", result: { kind: "retryable", status: 400, eventId: event.id } };
  }
  return {
    kind: "reprocess",
    input: mockVerifiedInput(provider, { body: storedRawBody, receivedAt }, metadata),
    eventId: event.id,
  };
}

async function processRecorded(client: PrismaClient, pipeline: WebhookProviderPipeline, input: ProviderVerifiedWebhookInput, eventId: string, receivedAt: Date): Promise<WebhookHandleResult> {
  try {
    const parsed = await pipeline.parser.parse(input);
    if (parsed.kind === "ignored") return ignoreRecorded(client, eventId, receivedAt, parsed.reason);
    if (parsed.kind === "capture") return completeRecorded(client, eventId, receivedAt, parsed.facts);
    throw new WebhookParseError("PARSE.UNSUPPORTED_EVENT", "Webhook event kind is unsupported");
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

async function completeRecorded(client: PrismaClient, eventId: string, attemptedAt: Date, facts: CaptureFacts): Promise<WebhookHandleResult> {
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

async function markProcessedEvent(client: PrismaClient, eventId: string, processedAt: Date, facts: CaptureFacts, _result: CompleteFromCaptureResult): Promise<void> {
  await markProcessed(client, {
    eventId,
    processedAt,
    checkoutSessionId: facts.checkoutSessionId,
    providerPaymentKey: facts.providerPaymentKey,
  });
}

async function ignoreRecorded(client: PrismaClient, eventId: string, processedAt: Date, reason: string): Promise<WebhookHandleResult> {
  await markIgnored(client, { eventId, processedAt, reason });
  return { kind: "ignored", status: 200, eventId };
}

async function terminalCompleteFailure(client: PrismaClient, eventId: string, failedAt: Date, message: string, code: string): Promise<WebhookHandleResult> {
  await markCompleteFailed(client, { eventId, failedAt, code, message });
  return { kind: "failed", status: 200, eventId };
}

async function retryableCompleteFailure(client: PrismaClient, eventId: string, attemptedAt: Date, message: string, code: string): Promise<WebhookHandleResult> {
  await markRetryableCompleteFailed(client, { eventId, attemptedAt, code, message });
  return { kind: "retryable", status: 500, eventId };
}

function metadataFromEvent(event: RecordedEvent): WebhookMetadata | null {
  if (!event.transmissionId) return null;
  return { transmissionId: event.transmissionId, eventType: event.eventType };
}

function metadataInspectionToResult(inspected: ReturnType<typeof inspectWebhookMetadata>): ProviderWebhookMetadataResult {
  if (inspected.kind === "ok") return { kind: "metadata", metadata: inspected.metadata };
  return {
    kind: "rejected",
    reason: "METADATA_INVALID",
    code: inspected.code,
    safeMessage: inspected.message,
    metadata: { transmissionId: inspected.candidateTransmissionId, eventType: inspected.candidateEventType },
  };
}

function mockVerificationToContract(provider: PaymentProvider, raw: RawWebhookRequest, verified: Awaited<ReturnType<ReturnType<typeof createMockWebhookVerifier>["verify"]>>): ProviderWebhookVerificationResult {
  const metadata = { transmissionId: verified.transmissionId, eventType: verified.eventType };
  if (!verified.ok) {
    return { kind: "rejected", reason: "SIGNATURE_INVALID", code: "VERIFY.FAILED", safeMessage: verified.reason, metadata, httpStatus: 400 };
  }
  return { kind: "verified", input: mockVerifiedInput(provider, raw, metadata) };
}

function mockParsedEvent(provider: PaymentProvider, input: ProviderVerifiedWebhookInput): NormalizedProviderWebhookEvent {
  const parsed = parseMockWebhook(provider, input.body, input, input.receivedAt ?? new Date());
  if (parsed.kind === "capture") return { kind: "capture", facts: parsed.facts };
  return { kind: "ignored", provider, transmissionId: input.transmissionId, eventType: input.eventType, reason: parsed.reason };
}

function mockVerifiedInput(provider: PaymentProvider, raw: RawWebhookRequest, metadata: WebhookMetadata): ProviderVerifiedWebhookInput {
  return { ...raw, provider, ...metadata, context: mockContext(provider) };
}

function mockContext(provider: PaymentProvider): ProviderVerifiedWebhookInput["context"] {
  return { provider, mode: "SANDBOX", credentialBinding: "mock:interim", verificationMethod: "MOCK" };
}

function requiredMetadata(metadata: { transmissionId?: string; eventType?: string }): WebhookMetadata {
  if (metadata.transmissionId && metadata.eventType) {
    return { transmissionId: metadata.transmissionId, eventType: metadata.eventType };
  }
  throw new Error("Webhook metadata result is missing required metadata.");
}

function parseMockWebhook(provider: PaymentProvider, body: string, metadata: WebhookMetadata, receivedAt: Date): ParseResult {
  const payload = parseBody(body);
  if (isIgnored(metadata, payload)) return { kind: "ignored", reason: metadata.eventType };
  return { kind: "capture", facts: captureFacts(provider, payload, receivedAt) };
}

function captureFacts(provider: PaymentProvider, payload: Record<string, unknown>, receivedAt: Date): CaptureFacts {
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
