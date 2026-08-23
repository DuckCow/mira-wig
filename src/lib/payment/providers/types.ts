import type {
  PaymentAdapterExecutionKind,
  PaymentProvider as ProviderCode,
} from "@prisma/client";
import type { NormalizedProviderConfirmResult } from "./contract";

export interface PaymentInitiateInput {
  checkoutSessionId: string;
  paymentId: string;
  provider: ProviderCode;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentInitiateReady {
  kind: "ready";
  providerRef?: string;
}

export interface PaymentInitiateRedirect {
  kind: "redirect";
  approveUrl: string;
  providerRef?: string;
}

export interface PaymentInitiateInProgress {
  kind: "inProgress";
}

export type PaymentInitiateResult = PaymentInitiateReady | PaymentInitiateRedirect | PaymentInitiateInProgress;

export interface PaymentConfirmInput {
  checkoutSessionId: string;
  paymentId: string;
  provider: ProviderCode;
  providerPaymentKey?: string;
  providerRef?: string;
  providerConfirmIdempotencyKey: string;
  amount: number;
  currency: string;
}

export interface PaymentConfirmFacts {
  providerPaymentKey: string;
  amount: number;
  currency: string;
  capturedAt?: Date;
}

export type PaymentConfirmResult = PaymentConfirmFacts | NormalizedProviderConfirmResult;

export interface PaymentInitiationProvider<Result extends PaymentInitiateResult = PaymentInitiateResult> {
  readonly code: ProviderCode;
  readonly adapterExecutionKind: PaymentAdapterExecutionKind;
  initiate(input: PaymentInitiateInput): Promise<Result>;
}

export interface PaymentConfirmationProvider<Result extends PaymentConfirmResult = PaymentConfirmResult> {
  readonly code: ProviderCode;
  readonly adapterExecutionKind: PaymentAdapterExecutionKind;
  confirm(input: PaymentConfirmInput): Promise<Result>;
}

export interface PaymentProvider extends PaymentInitiationProvider, PaymentConfirmationProvider {}
