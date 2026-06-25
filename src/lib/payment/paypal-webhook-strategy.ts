import "server-only";

import { db } from "@/lib/db";
import { parsePayPalAmount } from "./paypal";
import type {
  ValidationResult,
  WebhookParseResult,
  WebhookValidationInput,
  WebhookValidationStrategy,
} from "./webhook-handler";

type PayPalEnv = "sandbox" | "live";
type HeaderBag = Headers | Record<string, string>;

const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;
const PAYPAL_COMPLETED_EVENT = "PAYMENT.CAPTURE.COMPLETED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function headerValue(headers: HeaderBag, key: string): string | undefined {
  if (headers instanceof Headers) return headers.get(key) ?? undefined;
  return headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} 환경변수가 필요합니다.`);
  return value;
}

function paypalEnv(): PayPalEnv {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

function parseJson(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function responseJson(res: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await res.json().catch(() => ({}));
  return isRecord(raw) ? raw : {};
}

function amountFromResource(resource: Record<string, unknown>): { amount: number; currency: string } | null {
  if (!isRecord(resource.amount)) return null;
  const currency = getString(resource.amount.currency_code);
  const value = getString(resource.amount.value);
  if (!currency || !value) return null;
  try {
    return { amount: parsePayPalAmount(value, currency), currency };
  } catch {
    return null;
  }
}

function paypalEventResource(payload: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(payload.resource) ? payload.resource : null;
}

function paypalTransmissionId(headers: HeaderBag): string | undefined {
  return headerValue(headers, "PAYPAL-TRANSMISSION-ID");
}

function captureEvent(
  payload: Record<string, unknown>,
  resource: Record<string, unknown>,
  transmissionId: string,
  eventType: string,
): WebhookParseResult {
  const captureId = getString(resource.id);
  const status = getString(resource.status);
  const orderId = getString(resource.custom_id);
  const amount = amountFromResource(resource);
  if (!captureId || !status || !orderId || !amount) return { ok: false, error: "missing_capture_fields" };
  return {
    ok: true,
    event: {
      eventId: transmissionId,
      eventType,
      orderId,
      providerTransactionId: captureId,
      status,
      amount: amount.amount,
      currency: amount.currency,
      raw: payload,
    },
  };
}

function verificationHeaders(input: WebhookValidationInput) {
  const authAlgo = headerValue(input.headers, "PAYPAL-AUTH-ALGO");
  const certUrl = headerValue(input.headers, "PAYPAL-CERT-URL");
  const transmissionId = headerValue(input.headers, "PAYPAL-TRANSMISSION-ID");
  const transmissionSig = headerValue(input.headers, "PAYPAL-TRANSMISSION-SIG");
  const transmissionTime = headerValue(input.headers, "PAYPAL-TRANSMISSION-TIME");
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return null;
  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime };
}

async function getAccessToken(apiBase: string): Promise<string> {
  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requireEnv("PAYPAL_CLIENT_SECRET");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await responseJson(res);
  const token = getString(data.access_token);
  if (!res.ok || !token) throw new Error(`PayPal OAuth 실패 (HTTP ${res.status})`);
  return token;
}

async function verifyWebhookSignature(input: WebhookValidationInput): Promise<ValidationResult> {
  const headers = verificationHeaders(input);
  if (!headers) return { ok: false, status: 401, error: "missing_paypal_webhook_headers" };
  const webhookEvent = parseJson(input.rawBody);
  if (!webhookEvent) return { ok: false, status: 400, error: "invalid_json" };

  const apiBase = PAYPAL_API_BASE[paypalEnv()];
  const token = await getAccessToken(apiBase);
  const res = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: requireEnv("PAYPAL_WEBHOOK_ID"),
      webhook_event: webhookEvent,
    }),
  });
  const data = await responseJson(res);
  if (!res.ok || data.verification_status !== "SUCCESS") {
    return { ok: false, status: 401, error: "invalid_paypal_signature" };
  }
  return { ok: true };
}

async function authorizePayPalEvent(input: WebhookValidationInput): Promise<ValidationResult> {
  const order = await db.order.findUnique({
    where: { id: input.event.orderId },
    select: { id: true },
  });
  return order ? { ok: true } : { ok: false, status: 401, error: "order_not_found" };
}

function parsePayPalWebhook(input: {
  headers: HeaderBag;
  rawBody: string;
}): Promise<WebhookParseResult> {
  const payload = parseJson(input.rawBody);
  if (!payload) return Promise.resolve({ ok: false, error: "invalid_json" });
  const eventType = getString(payload.event_type);
  const resource = paypalEventResource(payload);
  const transmissionId = paypalTransmissionId(input.headers);
  if (!eventType) return Promise.resolve({ ok: false, error: "missing_event_type" });
  if (!transmissionId) return Promise.resolve({ ok: false, error: "missing_transmission_id" });
  if (!resource) return Promise.resolve({ ok: false, error: "missing_resource" });
  return Promise.resolve(captureEvent(payload, resource, transmissionId, eventType));
}

export function paypalWebhookStrategy(): WebhookValidationStrategy {
  return {
    provider: "paypal",
    parse: parsePayPalWebhook,
    authenticateDelivery: verifyWebhookSignature,
    authorizeEvent: authorizePayPalEvent,
    toRecoveryInput(event) {
      if (event.eventType !== PAYPAL_COMPLETED_EVENT || event.status !== "COMPLETED") return null;
      if (typeof event.amount !== "number" || !event.currency) return null;
      return {
        orderId: event.orderId,
        paymentKey: event.providerTransactionId,
        amount: event.amount,
        currency: event.currency,
        status: "DONE",
        provider: "paypal",
      };
    },
  };
}
