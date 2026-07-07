import { PaymentProvider } from "@prisma/client";
import type { NormalizedProviderConfirmResult, ProviderConfirmFailed } from "@/lib/payment/providers/contract";
import type { PaymentConfirmInput } from "@/lib/payment/providers/types";
import {
  buildTossConfirmRequest,
  normalizeTossConfirmResponse,
  type TossConfirmRequest,
} from "./confirm";
import { buildTossConfirmFailure, classifyTossConfirmError } from "./errors";

export type TossConfirmHttpRequest = TossConfirmRequest;

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

export function createTossConfirmAdapter(options: TossConfirmAdapterOptions): TossConfirmAdapter {
  return {
    code: PaymentProvider.TOSS,
    confirm: (input) => confirmWithFakeHttp(input, options.httpClient),
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
