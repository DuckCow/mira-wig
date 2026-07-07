import { PaymentProvider } from "@prisma/client";
import type {
  ProviderConfirmFailed,
  ProviderErrorCode,
  ProviderFailureClass,
} from "@/lib/payment/providers/contract";
import { tossProviderDiagnostics } from "./redaction";

export type TossConfirmTaxonomy =
  | "IDEMPOTENT_SUCCESS"
  | ProviderFailureClass;

export type TossConfirmClassifiedResult =
  | TossConfirmClassifiedSuccess
  | TossConfirmClassifiedFailure;

export interface TossConfirmClassifiedSuccess {
  kind: "idempotent_success";
  taxonomy: "IDEMPOTENT_SUCCESS";
  safeMessage: string;
  idempotencyKey?: string;
}

export type TossConfirmClassifiedFailure =
  ProviderConfirmFailed & { taxonomy: Exclude<TossConfirmTaxonomy, "IDEMPOTENT_SUCCESS"> };

export type TossConfirmErrorInput =
  | { kind: "idempotent_success"; idempotencyKey?: string }
  | { kind: "network_timeout"; idempotencyKey?: string }
  | { kind: "local_malformed"; reason: string; idempotencyKey?: string }
  | {
      kind: "toss_error";
      httpStatus?: number;
      code?: string;
      idempotencyKey?: string;
    };

interface TossFailureInput {
  classification: ProviderFailureClass;
  normalizedCode: ProviderErrorCode;
  safeMessage: string;
  providerErrorCode?: string;
  httpStatus?: number;
  ambiguousProviderState?: boolean;
  providerLookupRequired?: boolean;
  idempotencyKey?: string;
}

const RETRYABLE_CODES = [
  "PROVIDER_ERROR",
  "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING",
  "FAILED_INTERNAL_SYSTEM_PROCESSING",
  "IDEMPOTENT_REQUEST_PROCESSING",
] as const;

type TossCodeHandler = (
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
) => ProviderConfirmFailed;

const TOSS_CODE_HANDLERS: Readonly<Record<string, TossCodeHandler>> = {
  INVALID_API_KEY: authStop,
  UNAUTHORIZED_KEY: authStop,
  INCORRECT_BASIC_AUTH_FORMAT: authStop,
  INVALID_IDEMPOTENCY_KEY: invalidLocalRequest,
  REJECT_CARD_COMPANY: terminalDecline,
  REJECT_CARD_PAYMENT: terminalDecline,
  REJECT_ACCOUNT_PAYMENT: terminalDecline,
  NOT_FOUND_PAYMENT_SESSION: expiredSession,
  ALREADY_PROCESSED_PAYMENT: manualReview,
  FORBIDDEN_REQUEST: manualReview,
  INVALID_REQUEST: manualReview,
  UNKNOWN_PAYMENT_ERROR: manualReview,
};

export function classifyTossConfirmError(input: TossConfirmErrorInput): TossConfirmClassifiedResult {
  if (input.kind === "idempotent_success") return idempotentSuccess(input.idempotencyKey);
  if (input.kind === "network_timeout") return classified(networkTimeout(input.idempotencyKey));
  if (input.kind === "local_malformed") return classified(localMalformed(input.reason, input.idempotencyKey));
  return classified(classifyTossProviderError(input));
}

function classifyTossProviderError(input: Extract<TossConfirmErrorInput, { kind: "toss_error" }>): ProviderConfirmFailed {
  const code = normalizeCode(input.code);
  if (isRetryableProviderState(code, input.httpStatus)) {
    return retryableProvider(code, input.httpStatus, input.idempotencyKey);
  }
  const handled = handledTossCode(code, input.httpStatus, input.idempotencyKey);
  return handled ?? unknownProviderState(code, input.httpStatus, input.idempotencyKey);
}

export function buildTossConfirmFailure(input: TossFailureInput): ProviderConfirmFailed {
  const failure: ProviderConfirmFailed = {
    kind: "failed",
    provider: PaymentProvider.TOSS,
    classification: input.classification,
    normalizedCode: input.normalizedCode,
    safeMessage: input.safeMessage,
    ambiguousProviderState: input.ambiguousProviderState ?? false,
    providerLookupRequired: input.providerLookupRequired ?? false,
    diagnostics: tossProviderDiagnostics({
      httpStatus: input.httpStatus,
      tossCode: input.providerErrorCode,
      safeMessage: input.safeMessage,
      idempotencyKey: input.idempotencyKey,
    }),
  };
  if (input.providerErrorCode !== undefined) failure.providerErrorCode = input.providerErrorCode;
  if (input.httpStatus !== undefined) failure.httpStatus = input.httpStatus;
  if (input.idempotencyKey !== undefined) failure.idempotencyKey = input.idempotencyKey;
  return failure;
}

function idempotentSuccess(idempotencyKey: string | undefined): TossConfirmClassifiedSuccess {
  return {
    kind: "idempotent_success",
    taxonomy: "IDEMPOTENT_SUCCESS",
    safeMessage: "Same idempotency key returned matching Toss success evidence.",
    idempotencyKey,
  };
}

function classified(failure: ProviderConfirmFailed): TossConfirmClassifiedFailure {
  return { ...failure, taxonomy: failure.classification };
}

function networkTimeout(idempotencyKey: string | undefined): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "RETRYABLE",
    normalizedCode: "PROVIDER_TIMEOUT",
    safeMessage: "Toss confirm timed out before a response.",
    ambiguousProviderState: true,
    idempotencyKey,
  });
}

function localMalformed(reason: string, idempotencyKey: string | undefined): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "PROGRAMMER_ERROR",
    normalizedCode: "PROVIDER_PROGRAMMER_ERROR",
    safeMessage: reason,
    idempotencyKey,
  });
}

function retryableProvider(
  code: string | undefined,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "RETRYABLE",
    normalizedCode: "PROVIDER_UNAVAILABLE",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm failed with a retryable provider state.",
    ambiguousProviderState: true,
    idempotencyKey,
  });
}

function authStop(
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "STOP",
    normalizedCode: "PROVIDER_AUTH_FAILED",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm authentication or key configuration failed.",
    idempotencyKey,
  });
}

function invalidLocalRequest(
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "PROGRAMMER_ERROR",
    normalizedCode: "PROVIDER_PROGRAMMER_ERROR",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm request was malformed before provider execution.",
    idempotencyKey,
  });
}

function terminalDecline(
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "TERMINAL",
    normalizedCode: "PROVIDER_DECLINED",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm was declined by the payment method.",
    idempotencyKey,
  });
}

function expiredSession(
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "TERMINAL",
    normalizedCode: "PROVIDER_EXPIRED",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss payment session is no longer confirmable.",
    idempotencyKey,
  });
}

function manualReview(
  code: string,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "MANUAL_REVIEW",
    normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm returned an ambiguous provider state.",
    ambiguousProviderState: true,
    providerLookupRequired: true,
    idempotencyKey,
  });
}

function unknownProviderState(
  code: string | undefined,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed {
  return buildTossConfirmFailure({
    classification: "MANUAL_REVIEW",
    normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
    providerErrorCode: code,
    httpStatus,
    safeMessage: "Toss confirm state is unknown.",
    ambiguousProviderState: true,
    providerLookupRequired: true,
    idempotencyKey,
  });
}

function normalizeCode(code: string | undefined): string | undefined {
  const trimmed = code?.trim();
  return trimmed ? trimmed : undefined;
}

function hasCode(code: string | undefined, codes: readonly string[]): code is string {
  return code !== undefined && codes.includes(code);
}

function handledTossCode(
  code: string | undefined,
  httpStatus: number | undefined,
  idempotencyKey: string | undefined,
): ProviderConfirmFailed | null {
  if (!code) return null;
  const handler = TOSS_CODE_HANDLERS[code];
  return handler ? handler(code, httpStatus, idempotencyKey) : null;
}

function isRetryableProviderState(code: string | undefined, httpStatus: number | undefined): boolean {
  return isRetryableHttp(httpStatus) || hasCode(code, RETRYABLE_CODES);
}

function isRetryableHttp(httpStatus: number | undefined): boolean {
  return httpStatus !== undefined && httpStatus >= 500;
}
