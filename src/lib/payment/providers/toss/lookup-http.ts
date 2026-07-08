import { TOSS_API_ORIGIN } from "./adapter";
import type { TossLookupHttpResult, TossPaymentLookupPort } from "./webhook";

export type TossLookupFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export interface TossLookupHttpClientOptions {
  fetchFn: TossLookupFetch;
  authorization: string;
  timeoutMs?: number;
  now?: () => Date;
  baseUrl?: string;
}

export const DEFAULT_TOSS_LOOKUP_TIMEOUT_MS = 3_000;

export function createTossLookupHttpPort(options: TossLookupHttpClientOptions): TossPaymentLookupPort {
  const authorization = requiredAuthorization(options.authorization);
  const timeoutMs = tossLookupTimeoutMs(options.timeoutMs);
  const baseUrl = options.baseUrl ?? TOSS_API_ORIGIN;
  const now = options.now ?? (() => new Date());

  return (paymentKey) => lookupPayment({
    paymentKey,
    fetchFn: options.fetchFn,
    authorization,
    timeoutMs,
    now,
    baseUrl,
  });
}

interface LookupPaymentInput {
  paymentKey: string;
  fetchFn: TossLookupFetch;
  authorization: string;
  timeoutMs: number;
  now: () => Date;
  baseUrl: string;
}

async function lookupPayment(input: LookupPaymentInput): Promise<TossLookupHttpResult> {
  if (!isValidPaymentKey(input.paymentKey)) return invalidPaymentKey(input.now);

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TossLookupHttpResult>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ kind: "network_timeout" });
    }, input.timeoutMs);
  });

  try {
    const fetched = fetchTossLookup(input, controller.signal);
    return await Promise.race([fetched, timeout]);
  } catch {
    return { kind: "network_timeout" };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchTossLookup(
  input: LookupPaymentInput,
  signal: AbortSignal,
): Promise<TossLookupHttpResult> {
  const response = await input.fetchFn(lookupUrl(input.baseUrl, input.paymentKey), {
    method: "GET",
    headers: { Authorization: input.authorization },
    signal,
  });
  return {
    kind: "response",
    httpStatus: response.status,
    body: await safeJsonBody(response),
    receivedAt: input.now(),
  };
}

function lookupUrl(baseUrl: string, paymentKey: string): URL {
  return new URL(`/v1/payments/${encodeURIComponent(paymentKey)}`, baseUrl);
}

function invalidPaymentKey(now: () => Date): TossLookupHttpResult {
  return { kind: "response", httpStatus: 400, body: null, receivedAt: now() };
}

function isValidPaymentKey(paymentKey: string): boolean {
  return paymentKey.length > 0
    && !/[/\s]/u.test(paymentKey)
    && !hasControlCharacter(paymentKey);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

async function safeJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function requiredAuthorization(authorization: string): string {
  const trimmed = authorization.trim();
  if (!trimmed) throw new Error("Toss lookup authorization is required.");
  return trimmed;
}

function tossLookupTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TOSS_LOOKUP_TIMEOUT_MS;
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) return timeoutMs;
  throw new Error("Toss lookup timeout must be a positive integer.");
}
