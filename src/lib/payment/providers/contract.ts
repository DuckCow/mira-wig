import type { PaymentProvider as ProviderCode } from "@prisma/client";
import type { CaptureFacts } from "@/lib/payment/complete/types";
import type { PaymentConfirmInput, PaymentInitiateInput } from "./types";
import type { PaymentMethod, PaymentMode, ProviderLiveGuardResult } from "./routing";

export interface ProviderDiagnostics {
  providerStatus?: string;
  httpStatus?: number;
  providerCode?: string;
  safeMessage?: string;
  requestId?: string;
}

export const PROVIDER_DIAGNOSTIC_FIELDS: readonly (keyof ProviderDiagnostics)[] = [
  "providerStatus",
  "httpStatus",
  "providerCode",
  "safeMessage",
  "requestId",
];

export type ProviderFailureClass =
  | "RETRYABLE"
  | "TERMINAL"
  | "MANUAL_REVIEW"
  | "STOP"
  | "PROGRAMMER_ERROR";

export type ProviderErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_DECLINED"
  | "PROVIDER_EXPIRED"
  | "PROVIDER_CANCELED"
  | "PROVIDER_STATE_AMBIGUOUS"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_CREDENTIAL_MISSING"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_UNSUPPORTED_CONTEXT"
  | "PROVIDER_PROGRAMMER_ERROR";

interface ProviderReferenceFields {
  providerRef?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
}

interface ProviderInitiateBase extends ProviderReferenceFields {
  provider: ProviderCode;
  idempotencyKey: string;
  diagnostics?: ProviderDiagnostics;
  providerPaymentKey?: never;
}

export type NormalizedProviderInitiateResult =
  | (ProviderInitiateBase & { kind: "ready"; approveUrl?: never })
  | (ProviderInitiateBase & { kind: "redirect"; approveUrl: string });

export type ProviderConfirmContractInput = PaymentConfirmInput;

export interface ProviderConfirmSucceeded extends ProviderReferenceFields {
  kind: "succeeded";
  provider: ProviderCode;
  providerPaymentKey: string;
  amountMinor: number;
  currency: string;
  capturedAt?: Date;
  approvedAt?: Date;
  providerTimestamp?: Date;
  idempotencyKey: string;
  rawProviderStatus?: string;
  diagnostics?: ProviderDiagnostics;
}

export interface ProviderConfirmFailed {
  kind: "failed";
  provider: ProviderCode;
  classification: ProviderFailureClass;
  normalizedCode: ProviderErrorCode;
  providerErrorCode?: string;
  safeMessage: string;
  httpStatus?: number;
  ambiguousProviderState: boolean;
  providerLookupRequired: boolean;
  idempotencyKey?: string;
  diagnostics?: ProviderDiagnostics;
}

export type NormalizedProviderConfirmResult =
  | ProviderConfirmSucceeded
  | ProviderConfirmFailed;

export interface ProviderPaymentAdapter {
  code: ProviderCode;
  initiate(input: PaymentInitiateInput): Promise<NormalizedProviderInitiateResult>;
  confirm(input: ProviderConfirmContractInput): Promise<NormalizedProviderConfirmResult>;
}

export interface ProviderWebhookRawRequest {
  body: string;
  headers?: Headers | Readonly<Record<string, string | undefined>>;
  receivedAt?: Date;
}

export interface ProviderWebhookCandidateMetadata {
  transmissionId?: string;
  eventId?: string;
  eventType?: string;
  diagnostics?: ProviderDiagnostics;
}

export type ProviderVerificationMethod = "QUERY_LOOKUP" | "SIGNATURE" | "MOCK";

export interface VerifiedProviderContext {
  provider: ProviderCode;
  mode: PaymentMode;
  credentialBinding: string;
  verificationMethod: ProviderVerificationMethod;
}

export interface ProviderAuthoritativeState {
  // lookedUpAt is when Mira fetched provider truth; approvedAt is the provider's
  // capture/approval time and should drive CaptureFacts.capturedAt when present.
  lookedUpAt: Date;
  approvedAt?: Date;
  providerPaymentKey: string;
  status: string;
  amountMinor: number;
  currency: string;
  raw?: unknown;
}

export type ProviderWebhookRejectionReason =
  | "METADATA_INVALID"
  | "SIGNATURE_INVALID"
  | "AUTHENTICATION_FAILED"
  | "LOOKUP_UNAVAILABLE"
  | "UNSUPPORTED_EVENT"
  | "RAW_BODY_MISMATCH";

export type ProviderWebhookMetadataResult =
  | { kind: "metadata"; metadata: ProviderWebhookCandidateMetadata }
  | {
      kind: "rejected";
      reason: ProviderWebhookRejectionReason;
      code: string;
      safeMessage: string;
      metadata: ProviderWebhookCandidateMetadata;
      diagnostics?: ProviderDiagnostics;
    };

export interface ProviderVerifiedWebhookInput extends ProviderWebhookRawRequest {
  provider: ProviderCode;
  transmissionId: string;
  eventId?: string;
  eventType: string;
  context: VerifiedProviderContext;
  // Query-verified providers populate this from the verifier lookup. Parser/completion should
  // derive capture facts from it when present; signature-verified providers may omit it and parse
  // the authenticated body. Facts mode must come from context.mode, never configuredPaymentMode().
  // Replay re-runs lookup under context.credentialBinding per D1-C; this is only the typed channel.
  authoritativeState?: ProviderAuthoritativeState;
}

export type ProviderWebhookVerificationResult =
  | { kind: "verified"; input: ProviderVerifiedWebhookInput; diagnostics?: ProviderDiagnostics }
  | {
      kind: "rejected";
      reason: ProviderWebhookRejectionReason;
      code: string;
      safeMessage: string;
      metadata: ProviderWebhookCandidateMetadata;
      httpStatus?: number;
      diagnostics?: ProviderDiagnostics;
    };

export type NormalizedProviderWebhookEvent =
  | { kind: "capture"; facts: CaptureFacts; diagnostics?: ProviderDiagnostics }
  | {
      kind: "ignored";
      provider: ProviderCode;
      transmissionId: string;
      eventType: string;
      reason: string;
      diagnostics?: ProviderDiagnostics;
    }
  | { kind: "future_void"; provider: ProviderCode; providerPaymentKey: string; reason: string }
  | { kind: "future_refund"; provider: ProviderCode; providerPaymentKey: string; refundRef: string };

export interface ProviderWebhookVerifier {
  extractCandidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookMetadataResult;
  verify(raw: ProviderWebhookRawRequest): Promise<ProviderWebhookVerificationResult>;
}

export interface ProviderWebhookParser {
  parse(input: ProviderVerifiedWebhookInput): Promise<NormalizedProviderWebhookEvent>;
}

export interface ProviderVoidInput {
  provider: ProviderCode;
  providerPaymentKey: string;
  operationKey: string;
  reason: string;
}

interface ProviderVoidFailure {
  normalizedCode: ProviderErrorCode;
  safeMessage: string;
  providerErrorCode?: string;
  diagnostics?: ProviderDiagnostics;
}

export type ProviderVoidResult =
  | { kind: "succeeded"; diagnostics?: ProviderDiagnostics }
  | { kind: "idempotent_succeeded"; providerStatus?: string; diagnostics?: ProviderDiagnostics }
  | (ProviderVoidFailure & { kind: "retryable" })
  | (ProviderVoidFailure & { kind: "terminal" })
  | (ProviderVoidFailure & { kind: "manual_review"; ambiguousProviderState?: boolean })
  | (ProviderVoidFailure & { kind: "auth_stop" })
  | (ProviderVoidFailure & { kind: "invalid_request_stop" })
  | (ProviderVoidFailure & { kind: "ambiguous_state"; providerLookupRequired: true });

export interface ProviderVoidExecutor {
  void(input: ProviderVoidInput): Promise<ProviderVoidResult>;
}

export interface ProviderCredentialCheck {
  name: string;
  required: boolean;
  present: boolean;
}

export interface ProviderFactoryContext {
  provider: ProviderCode;
  mode: PaymentMode;
  market: string;
  method: PaymentMethod;
  currency: string;
  ruleId: string;
  credentials: readonly ProviderCredentialCheck[];
  liveGuard: ProviderLiveGuardResult;
}

export interface ProviderAdapterFactory {
  createPaymentAdapter(input: ProviderFactoryContext): ProviderPaymentAdapter;
  createWebhookVerifier(input: ProviderFactoryContext): ProviderWebhookVerifier;
  createWebhookParser(input: ProviderFactoryContext): ProviderWebhookParser;
  createVoidExecutor(input: ProviderFactoryContext): ProviderVoidExecutor;
}
