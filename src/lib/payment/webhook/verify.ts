export interface RawWebhookRequest {
  body: string;
  headers?: Headers | Record<string, string | undefined>;
  receivedAt?: Date;
}

export interface WebhookMetadata {
  transmissionId: string;
  eventType: string;
}

export type WebhookMetadataFailureCode =
  | "METADATA.MISSING_TRANSMISSION_ID"
  | "METADATA.MISSING_EVENT_TYPE"
  | "METADATA.INVALID_JSON_FOR_METADATA";

export type WebhookMetadataInspection =
  | { kind: "ok"; metadata: WebhookMetadata }
  | {
      kind: "failed";
      code: WebhookMetadataFailureCode;
      message: string;
      candidateTransmissionId?: string;
      candidateEventType?: string;
    };

export type WebhookVerificationResult =
  | ({ ok: true } & WebhookMetadata)
  | ({ ok: false; reason: string } & WebhookMetadata);

export interface WebhookVerifier {
  verify(raw: RawWebhookRequest): Promise<WebhookVerificationResult>;
}

export type MockWebhookVerifyMode = "pass" | "fail";

export interface MockWebhookVerifierOptions {
  mode?: MockWebhookVerifyMode;
}

export function createMockWebhookVerifier(options: MockWebhookVerifierOptions = {}): WebhookVerifier {
  return { verify: (raw) => Promise.resolve(mockVerify(raw, options)) };
}

export function readWebhookMetadata(raw: RawWebhookRequest): WebhookMetadata {
  const inspected = inspectWebhookMetadata(raw);
  if (inspected.kind === "ok") return inspected.metadata;
  throw new Error(inspected.message);
}

export function inspectWebhookMetadata(raw: RawWebhookRequest): WebhookMetadataInspection {
  const parsed = parseBody(raw.body);
  const candidateTransmissionId = readMetadataValue(raw, parsed.record, "transmissionId", "x-mira-transmission-id");
  const candidateEventType = readMetadataValue(raw, parsed.record, "eventType", "x-mira-event-type");
  if (!candidateTransmissionId) {
    return metadataFailure(parsed, "METADATA.MISSING_TRANSMISSION_ID", "Webhook metadata missing: transmissionId", {
      candidateEventType,
    });
  }
  if (!candidateEventType) {
    return metadataFailure(parsed, "METADATA.MISSING_EVENT_TYPE", "Webhook metadata missing: eventType", {
      candidateTransmissionId,
    });
  }
  return { kind: "ok", metadata: { transmissionId: candidateTransmissionId, eventType: candidateEventType } };
}

function mockVerify(
  raw: RawWebhookRequest,
  options: MockWebhookVerifierOptions,
): WebhookVerificationResult {
  const metadata = readWebhookMetadata(raw);
  if (mockMode(raw, options) === "fail") return { ok: false, reason: "Mock webhook verification failed", ...metadata };
  return { ok: true, ...metadata };
}

function mockMode(raw: RawWebhookRequest, options: MockWebhookVerifierOptions): MockWebhookVerifyMode {
  const headerMode = readHeader(raw, "x-mira-verify");
  if (headerMode === "fail") return "fail";
  if (options.mode) return options.mode;
  return process.env.PAYMENT_WEBHOOK_MOCK_VERIFY === "fail" ? "fail" : "pass";
}

function readHeader(raw: RawWebhookRequest, key: string): string | undefined {
  if (!raw.headers) return undefined;
  if (raw.headers instanceof Headers) return raw.headers.get(key) ?? undefined;
  return raw.headers[key] ?? raw.headers[key.toLowerCase()];
}

function readMetadataValue(
  raw: RawWebhookRequest,
  record: Record<string, unknown> | null,
  bodyKey: string,
  headerKey: string,
): string | undefined {
  return readHeader(raw, headerKey) ?? stringField(record, bodyKey);
}

function metadataFailure(
  parsed: ParseBodyResult,
  fallbackCode: Exclude<WebhookMetadataFailureCode, "METADATA.INVALID_JSON_FOR_METADATA">,
  fallbackMessage: string,
  candidates: { candidateTransmissionId?: string; candidateEventType?: string },
): WebhookMetadataInspection {
  if (parsed.kind === "invalid-json") {
    return { kind: "failed", code: "METADATA.INVALID_JSON_FOR_METADATA", message: parsed.message, ...candidates };
  }
  return { kind: "failed", code: fallbackCode, message: fallbackMessage, ...candidates };
}

type ParseBodyResult =
  | { kind: "ok"; record: Record<string, unknown> | null }
  | { kind: "invalid-json"; record: null; message: string };

function parseBody(body: string): ParseBodyResult {
  try {
    const parsed: unknown = JSON.parse(body);
    return { kind: "ok", record: isRecord(parsed) ? parsed : null };
  } catch {
    return { kind: "invalid-json", record: null, message: "Webhook metadata body is invalid JSON" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
