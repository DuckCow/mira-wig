export interface RawWebhookRequest {
  body: string;
  headers?: Headers | Record<string, string | undefined>;
  receivedAt?: Date;
}

export interface WebhookMetadata {
  transmissionId: string;
  eventType: string;
}

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
  return {
    transmissionId: requiredMetadata(raw, "transmissionId", "x-mira-transmission-id"),
    eventType: requiredMetadata(raw, "eventType", "x-mira-event-type"),
  };
}

function mockVerify(
  raw: RawWebhookRequest,
  options: MockWebhookVerifierOptions,
): WebhookVerificationResult {
  const metadata = readWebhookMetadata(raw);
  if (mockMode(raw, options) === "fail") return { ok: false, reason: "Mock webhook verification failed", ...metadata };
  return { ok: true, ...metadata };
}

function requiredMetadata(
  raw: RawWebhookRequest,
  bodyKey: string,
  headerKey: string,
): string {
  const value = readHeader(raw, headerKey) ?? stringField(parseBody(raw.body), bodyKey);
  if (value) return value;
  throw new Error(`Webhook metadata missing: ${bodyKey}`);
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

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
