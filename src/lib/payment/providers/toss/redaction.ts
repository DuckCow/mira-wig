import { createHash } from "crypto";
import type { ProviderDiagnostics } from "@/lib/payment/providers/contract";

const MASK_PREFIX = 8;
const MASK_SUFFIX = 4;
const HASH_LENGTH = 12;
const SAFE_MESSAGE_LIMIT = 120;

export interface TossSafeDiagnostics {
  provider: "TOSS";
  localPaymentId?: string;
  httpStatus?: number;
  tossCode?: string;
  safeMessage?: string;
  derivedOrderId?: string;
  maskedPaymentKey?: string;
  idempotencyKeyHash?: string;
  providerStatus?: string;
}

export interface TossDiagnosticsInput {
  localPaymentId?: string;
  httpStatus?: number;
  tossCode?: string;
  safeMessage?: string;
  derivedOrderId?: string;
  paymentKey?: string | null;
  idempotencyKey?: string | null;
  providerStatus?: string;
}

export function maskTossPaymentKey(paymentKey: string | null | undefined): string | undefined {
  const normalized = normalize(paymentKey);
  if (!normalized) return undefined;
  if (normalized.length <= MASK_PREFIX + MASK_SUFFIX) return "*".repeat(normalized.length);
  return `${normalized.slice(0, MASK_PREFIX)}...${normalized.slice(-MASK_SUFFIX)}`;
}

export function hashTossIdempotencyKey(idempotencyKey: string | null | undefined): string | undefined {
  const normalized = normalize(idempotencyKey);
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex").slice(0, HASH_LENGTH);
}

export function buildTossSafeDiagnostics(input: TossDiagnosticsInput): TossSafeDiagnostics {
  const diagnostics: TossSafeDiagnostics = { provider: "TOSS" };
  assign(diagnostics, "localPaymentId", normalize(input.localPaymentId));
  assign(diagnostics, "httpStatus", input.httpStatus);
  assign(diagnostics, "tossCode", normalize(input.tossCode));
  assign(diagnostics, "safeMessage", bounded(input.safeMessage));
  assign(diagnostics, "derivedOrderId", normalize(input.derivedOrderId));
  assign(diagnostics, "maskedPaymentKey", maskTossPaymentKey(input.paymentKey));
  assign(diagnostics, "idempotencyKeyHash", hashTossIdempotencyKey(input.idempotencyKey));
  assign(diagnostics, "providerStatus", normalize(input.providerStatus));
  return diagnostics;
}

export function tossProviderDiagnostics(input: TossDiagnosticsInput): ProviderDiagnostics {
  const safe = buildTossSafeDiagnostics(input);
  const diagnostics: ProviderDiagnostics = {};
  assign(diagnostics, "providerStatus", safe.providerStatus);
  assign(diagnostics, "httpStatus", safe.httpStatus);
  assign(diagnostics, "providerCode", safe.tossCode);
  assign(diagnostics, "safeMessage", safe.safeMessage);
  assign(diagnostics, "requestId", safe.idempotencyKeyHash);
  return diagnostics;
}

function normalize(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function bounded(value: string | null | undefined): string | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  return normalized.slice(0, SAFE_MESSAGE_LIMIT);
}

function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}
