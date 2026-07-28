import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider } from "@prisma/client";
import { configuredPaymentMode } from "@/lib/payment/mode";
import type {
  NormalizedProviderWebhookEvent,
  ProviderVerifiedWebhookInput,
  ProviderWebhookMetadataResult,
  ProviderWebhookParser,
  ProviderWebhookVerificationResult,
  ProviderWebhookVerifier,
} from "@/lib/payment/providers/contract";
import type { CaptureFacts } from "@/lib/payment/complete";
import {
  isTerminalEventStatus,
  rawBodyFromEvent,
} from "./record";
import { recordWebhookRejection, utf8StringBodyHash } from "./rejections";
import { createMockWebhookVerifier, inspectWebhookMetadata } from "./verify";
import type { RawWebhookRequest, WebhookMetadata } from "./verify";
import {
  WebhookParseError,
  type DuplicateReplayDecision,
  type DuplicateReplayInput,
  type WebhookProviderPipeline,
} from "./pipeline-types";

type ParseResult = { kind: "capture"; facts: CaptureFacts } | { kind: "ignored"; reason: string };

export function createMockWebhookPipeline(provider: PaymentProvider): WebhookProviderPipeline {
  return {
    kind: "mock",
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

async function resolveMockDuplicateReplay(
  provider: PaymentProvider,
  input: DuplicateReplayInput,
): Promise<DuplicateReplayDecision> {
  const {
    client,
    event,
    incomingBodyEvidence,
    incomingRawBody,
    receivedAt,
  } = input;
  if (!event) return { kind: "handled", result: { kind: "retryable", status: 500 } };
  if (isTerminalEventStatus(event.status)) {
    return { kind: "handled", result: { kind: "duplicate", status: 200, eventId: event.id } };
  }
  const storedRawBody = rawBodyFromEvent(event);
  const metadata = metadataFromEvent(event);
  if (!storedRawBody || !metadata) {
    return { kind: "handled", result: { kind: "retryable", status: 500, eventId: event.id } };
  }
  if (utf8StringBodyHash(storedRawBody) !== utf8StringBodyHash(incomingRawBody)) {
    await recordWebhookRejection(client, {
      provider,
      receivedAt,
      stage: WebhookIngressRejectionStage.VERIFY,
      code: "VERIFY.RAW_MISMATCH",
      rawBody: incomingRawBody,
      completeBodyEvidence: incomingBodyEvidence,
      candidateTransmissionId: metadata.transmissionId,
      candidateEventType: metadata.eventType,
      lastError: "Duplicate webhook raw body did not match stored authenticated event",
    });
    return { kind: "handled", result: { kind: "retryable", status: 400, eventId: event.id } };
  }
  return {
    kind: "reprocess",
    input: mockVerifiedInput(provider, { body: storedRawBody, receivedAt }, metadata),
    eventId: event.id,
  };
}

function metadataFromEvent(event: { transmissionId: string | null; eventType: string }): WebhookMetadata | null {
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

function mockVerificationToContract(
  provider: PaymentProvider,
  raw: RawWebhookRequest,
  verified: Awaited<ReturnType<ReturnType<typeof createMockWebhookVerifier>["verify"]>>,
): ProviderWebhookVerificationResult {
  const metadata = { transmissionId: verified.transmissionId, eventType: verified.eventType };
  if (!verified.ok) {
    return {
      kind: "rejected",
      reason: "SIGNATURE_INVALID",
      code: "VERIFY.FAILED",
      safeMessage: verified.reason,
      metadata,
      httpStatus: 400,
    };
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
