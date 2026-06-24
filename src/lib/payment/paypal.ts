// ============================================================
// lib/payment/paypal.ts — PayPalPaymentProvider
// ------------------------------------------------------------
// PayPal Standard Checkout:
//   initiate: Orders v2 create order
//   confirm:  Orders v2 capture order
//   refund:   Payments v2 refund captured payment
// ============================================================

import { randomUUID } from "crypto";
import { CURRENCY_META } from "@/lib/market/types";
import type {
  ConfirmInput,
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  PaymentResult,
  RefundInput,
  RefundResult,
} from "./types";

const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

type PayPalEnv = keyof typeof PAYPAL_API_BASE;
type PayPalApiResult = { ok: true; data: Record<string, unknown> } | { ok: false; data: Record<string, unknown>; status: number };
type CaptureDetails = { id: string; amount: number; currency: string; referenceId: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} 환경변수가 필요합니다.`);
  return value;
}

function paypalEnv(): PayPalEnv {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

export function formatPayPalAmount(amount: number, currency: string): string {
  const meta = CURRENCY_META[currency];
  if (!meta) throw new Error(`지원하지 않는 PayPal 통화입니다: ${currency}`);
  const divisor = 10 ** meta.decimals;
  return meta.decimals === 0 ? String(amount) : (amount / divisor).toFixed(meta.decimals);
}

export function parsePayPalAmount(value: string, currency: string): number {
  const meta = CURRENCY_META[currency];
  if (!meta) throw new Error(`지원하지 않는 PayPal 통화입니다: ${currency}`);
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`PayPal 금액 형식 오류: ${value}`);
  const [wholeRaw, fractionRaw = ""] = value.split(".");
  if (fractionRaw.length > meta.decimals) throw new Error(`PayPal 금액 소수점 오류: ${value}`);
  const whole = Number.parseInt(wholeRaw ?? "0", 10);
  const fraction = Number.parseInt(fractionRaw.padEnd(meta.decimals, "0") || "0", 10);
  return whole * 10 ** meta.decimals + fraction;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await res.json().catch(() => ({}));
  if (!isRecord(raw)) throw new Error(`PayPal API 응답이 객체가 아닙니다 (HTTP ${res.status})`);
  return raw;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  return getString(data.message) ?? getString(data.name) ?? fallback;
}

function approveUrl(data: Record<string, unknown>): string | undefined {
  const links = data.links;
  if (!Array.isArray(links)) return undefined;
  for (const link of links) {
    if (!isRecord(link)) continue;
    if (getString(link.rel) === "approve") return getString(link.href);
  }
  return undefined;
}

function captureAmount(capture: Record<string, unknown>): { amount: number; currency: string } | null {
  if (!isRecord(capture.amount)) return null;
  const value = getString(capture.amount.value);
  const currency = getString(capture.amount.currency_code);
  if (!value || !currency) return null;
  try {
    return { amount: parsePayPalAmount(value, currency), currency };
  } catch {
    return null;
  }
}

function captureDetails(capture: unknown, referenceId: string): CaptureDetails | null {
  if (!isRecord(capture) || getString(capture.status) !== "COMPLETED") return null;
  const id = getString(capture.id);
  const amount = captureAmount(capture);
  if (!id || !amount) return null;
  return { id, referenceId, ...amount };
}

function completedCaptureFromUnit(unit: Record<string, unknown>): CaptureDetails | null {
  if (!isRecord(unit.payments)) return null;
  const referenceId = getString(unit.reference_id);
  const captures = unit.payments.captures;
  if (!Array.isArray(captures) || !referenceId) return null;
  for (const capture of captures) {
    const details = captureDetails(capture, referenceId);
    if (details) return details;
  }
  return null;
}

function firstCompletedCapture(data: Record<string, unknown>): CaptureDetails | null {
  const units = data.purchase_units;
  if (!Array.isArray(units)) return null;
  for (const unit of units) {
    if (!isRecord(unit)) continue;
    const capture = completedCaptureFromUnit(unit);
    if (capture) return capture;
  }
  return null;
}

function createOrderBody(input: InitiateInput): Record<string, unknown> {
  return {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: input.orderId,
      amount: {
        currency_code: input.currency,
        value: formatPayPalAmount(input.amount, input.currency),
      },
    }],
  };
}

function refundBody(input: RefundInput): Record<string, unknown> {
  if (input.amount === undefined) return {};
  return {
    amount: {
      currency_code: input.currency,
      value: formatPayPalAmount(input.amount, input.currency),
    },
  };
}

function refundStatus(status: string | undefined): RefundResult["status"] {
  if (status === "COMPLETED") return "SUCCEEDED";
  if (status === "PENDING") return "PENDING";
  return "FAILED";
}

export class PayPalPaymentProvider implements PaymentProvider {
  readonly name = "paypal";
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private readonly apiBase = PAYPAL_API_BASE[paypalEnv()];

  constructor() {
    this.clientId = requireEnv("PAYPAL_CLIENT_ID");
    this.clientSecret = requireEnv("PAYPAL_CLIENT_SECRET");
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const result = await this.postJson("/v2/checkout/orders", createOrderBody(input), input.idempotencyKey);
    if (!result.ok) return { providerTransactionId: null, status: "FAILED" };
    const { data } = result;
    if (!getString(data.id)) {
      return { providerTransactionId: null, status: "FAILED", redirectUrl: undefined };
    }
    return { providerTransactionId: getString(data.id) ?? null, status: "PENDING", redirectUrl: approveUrl(data) };
  }

  async confirm(input: ConfirmInput): Promise<PaymentResult> {
    if (!input.providerTransactionId) {
      return { providerTransactionId: null, status: "FAILED", errorMessage: "PayPal order id 없음" };
    }
    const result = await this.postJson(
      `/v2/checkout/orders/${encodeURIComponent(input.providerTransactionId)}/capture`,
      {},
      input.idempotencyKey,
    );
    if (!result.ok) return this.failedPayment(input.providerTransactionId, result.data, `PayPal capture 실패 (HTTP ${result.status})`);
    const { data } = result;
    const capture = firstCompletedCapture(data);
    if (getString(data.status) !== "COMPLETED" || !capture) {
      return this.failedPayment(input.providerTransactionId, data, "PayPal capture 실패");
    }
    return {
      providerTransactionId: capture.id,
      status: "SUCCEEDED",
      capturedAmount: capture.amount,
      capturedCurrency: capture.currency,
      captureReferenceId: capture.referenceId,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const result = await this.postJson(
      `/v2/payments/captures/${encodeURIComponent(input.providerTransactionId)}/refund`,
      refundBody(input),
      input.idempotencyKey,
    );
    if (!result.ok) return this.failedRefund(input, result.data, `PayPal refund 실패 (HTTP ${result.status})`);
    const { data } = result;
    const status = refundStatus(getString(data.status));
    const currency = getString(isRecord(data.amount) ? data.amount.currency_code : undefined) ?? input.currency;
    const refundedValue = getString(isRecord(data.amount) ? data.amount.value : undefined);
    return {
      providerTransactionId: input.providerTransactionId,
      providerRefundId: getString(data.id),
      status,
      amount: refundedValue ? parsePayPalAmount(refundedValue, currency) : input.amount,
      currency,
      raw: data,
      ...(status === "FAILED" && { errorMessage: errorMessage(data, "PayPal refund 실패") }),
    };
  }

  private async postJson(path: string, body: Record<string, unknown>, requestId: string): Promise<PayPalApiResult> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId || randomUUID(),
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    const data = await parseJson(res);
    if (!res.ok) return { ok: false, data, status: res.status };
    return { ok: true, data };
  }

  private failedPayment(providerTransactionId: string, data: Record<string, unknown>, fallback: string): PaymentResult {
    return { providerTransactionId, status: "FAILED", errorMessage: errorMessage(data, fallback) };
  }

  private failedRefund(input: RefundInput, data: Record<string, unknown>, fallback: string): RefundResult {
    return {
      providerTransactionId: input.providerTransactionId,
      status: "FAILED",
      amount: input.amount,
      currency: input.currency,
      raw: data,
      errorMessage: errorMessage(data, fallback),
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const res = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(errorMessage(data, `PayPal OAuth 실패 (HTTP ${res.status})`));
    const token = getString(data.access_token);
    if (!token) throw new Error("PayPal OAuth 응답에 access_token이 없습니다.");
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 300;
    this.accessToken = { value: token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  }
}
