import { PaymentProvider } from "@prisma/client";
import type { NormalizedProviderConfirmResult, ProviderConfirmFailed } from "@/lib/payment/providers/contract";
import type {
  PaymentConfirmInput,
  PaymentInitiateInput,
  PaymentInitiateResult,
  PaymentProvider as PaymentProviderPort,
} from "@/lib/payment/providers/types";
import {
  buildTossConfirmRequest,
  normalizeTossConfirmResponse,
  type TossConfirmRequest,
} from "./confirm";
import { buildTossConfirmFailure, classifyTossConfirmError } from "./errors";

export type TossConfirmHttpRequest = TossConfirmRequest;

export const TOSS_API_ORIGIN = "https://api.tosspayments.com";

export type TossConfirmHttpResult =
  | {
      kind: "response";
      httpStatus: number;
      body: unknown;
      tossCode?: string;
      receivedAt?: Date;
    }
  | { kind: "network_timeout" };

export type TossConfirmHttpClient = (
  request: TossConfirmHttpRequest,
) => Promise<TossConfirmHttpResult>;

export interface TossConfirmAdapter {
  code: typeof PaymentProvider.TOSS;
  confirm(input: PaymentConfirmInput): Promise<NormalizedProviderConfirmResult>;
}

export interface TossConfirmAdapterOptions {
  httpClient: TossConfirmHttpClient;
}

export interface TossConfirmFetchClientOptions {
  secretKey: string;
  fetchFn?: typeof fetch;
  origin?: string;
  timeoutMs?: number;
}

const DEFAULT_TOSS_CONFIRM_TIMEOUT_MS = 10_000;

export function createTossConfirmAdapter(options: TossConfirmAdapterOptions): TossConfirmAdapter {
  return {
    code: PaymentProvider.TOSS,
    confirm: (input) => confirmWithFakeHttp(input, options.httpClient),
  };
}

export function createTossSandboxPaymentProvider(options: TossConfirmAdapterOptions): PaymentProviderPort {
  const confirmAdapter = createTossConfirmAdapter(options);
  return {
    code: PaymentProvider.TOSS,
    initiate: tossBrowserInitiateReady,
    confirm: (input) => confirmAdapter.confirm(input),
  };
}

export function createTossConfirmFetchClient(options: TossConfirmFetchClientOptions): TossConfirmHttpClient {
  const authorization = tossBasicAuthorization(options.secretKey);
  const fetchFn = options.fetchFn ?? fetch;
  const origin = options.origin ?? TOSS_API_ORIGIN;
  const timeoutMs = tossConfirmTimeoutMs(options.timeoutMs);
  return async (request) => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<TossConfirmHttpResult>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve({ kind: "network_timeout" });
      }, timeoutMs);
    });
    try {
      const fetched = fetchTossConfirm(fetchFn, request, origin, authorization, controller.signal);
      return await Promise.race([fetched, timeout]);
    } catch (error) {
      if (isAbortError(error)) return { kind: "network_timeout" };
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
}

function tossBrowserInitiateReady(_input: PaymentInitiateInput): Promise<PaymentInitiateResult> {
  return Promise.resolve({ kind: "ready" });
}

async function confirmWithFakeHttp(
  input: PaymentConfirmInput,
  httpClient: TossConfirmHttpClient,
): Promise<NormalizedProviderConfirmResult> {
  const wrongProvider = ensureTossProvider(input.provider);
  if (wrongProvider) return wrongProvider;

  const built = buildTossConfirmRequest({
    paymentId: input.paymentId,
    providerRef: input.providerRef,
    amount: input.amount,
    currency: input.currency,
    providerConfirmIdempotencyKey: input.providerConfirmIdempotencyKey,
  });
  if (!built.ok) return built.failure;

  try {
    const result = await httpClient(built.request);
    return handleHttpResult(input, result);
  } catch {
    return networkFailure(input.providerConfirmIdempotencyKey);
  }
}

function handleHttpResult(
  input: PaymentConfirmInput,
  result: TossConfirmHttpResult,
): NormalizedProviderConfirmResult {
  if (result.kind === "network_timeout") {
    return networkFailure(input.providerConfirmIdempotencyKey);
  }
  if (isSuccessStatus(result.httpStatus)) {
    return normalizeTossConfirmResponse({
      paymentId: input.paymentId,
      providerRef: input.providerRef ?? "",
      providerConfirmIdempotencyKey: input.providerConfirmIdempotencyKey,
      amount: input.amount,
      currency: input.currency,
      receivedAt: result.receivedAt ?? new Date(),
      tossPayment: result.body,
    });
  }
  return providerErrorFailure(result, input.providerConfirmIdempotencyKey);
}

function ensureTossProvider(provider: PaymentProvider): ProviderConfirmFailed | null {
  if (provider === PaymentProvider.TOSS) return null;
  return buildTossConfirmFailure({
    classification: "STOP",
    normalizedCode: "PROVIDER_UNSUPPORTED_CONTEXT",
    safeMessage: "Toss confirm adapter received a non-Toss provider.",
  });
}

function providerErrorFailure(
  result: Extract<TossConfirmHttpResult, { kind: "response" }>,
  idempotencyKey: string,
): ProviderConfirmFailed {
  const failure = classifyTossConfirmError({
    kind: "toss_error",
    httpStatus: result.httpStatus,
    code: result.tossCode ?? tossCodeFromBody(result.body),
    idempotencyKey,
  });
  if (failure.kind === "failed") return failure;
  return buildTossConfirmFailure({
    classification: "MANUAL_REVIEW",
    normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
    safeMessage: "Toss confirm error was ambiguous.",
    ambiguousProviderState: true,
    providerLookupRequired: true,
    idempotencyKey,
  });
}

function networkFailure(idempotencyKey: string): ProviderConfirmFailed {
  const failure = classifyTossConfirmError({ kind: "network_timeout", idempotencyKey });
  if (failure.kind === "failed") return failure;
  throw new Error("Unexpected Toss idempotent success from network failure classification.");
}

function tossCodeFromBody(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const code = body.code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

async function fetchTossConfirm(
  fetchFn: typeof fetch,
  request: TossConfirmHttpRequest,
  origin: string,
  authorization: string,
  signal: AbortSignal,
): Promise<TossConfirmHttpResult> {
  const response = await fetchFn(new URL(request.path, origin), fetchRequestInit(request, authorization, signal));
  return {
    kind: "response",
    httpStatus: response.status,
    body: await safeJsonBody(response),
    receivedAt: new Date(),
  };
}

function fetchRequestInit(
  request: TossConfirmHttpRequest,
  authorization: string,
  signal: AbortSignal,
): RequestInit {
  return {
    method: request.method,
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": request.headers["Idempotency-Key"],
    },
    body: JSON.stringify(request.body),
    signal,
  };
}

function tossBasicAuthorization(secretKey: string): string {
  const normalized = secretKey.trim();
  if (!normalized) throw new Error("Toss confirm secret key is required.");
  return `Basic ${Buffer.from(`${normalized}:`, "utf8").toString("base64")}`;
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

function tossConfirmTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TOSS_CONFIRM_TIMEOUT_MS;
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) return timeoutMs;
  throw new Error("Toss confirm timeout must be a positive integer.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
