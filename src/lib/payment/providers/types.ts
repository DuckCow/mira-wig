import type { PaymentProvider as ProviderCode } from "@prisma/client";

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

export type PaymentInitiateResult = PaymentInitiateReady | PaymentInitiateRedirect;

export interface PaymentConfirmInput {
  checkoutSessionId: string;
  provider: ProviderCode;
  providerPaymentKey?: string;
  amount: number;
  currency: string;
}

export interface PaymentConfirmFacts {
  providerPaymentKey: string;
  amount: number;
  currency: string;
  capturedAt?: Date;
}

export interface PaymentProvider {
  code: ProviderCode;
  initiate(input: PaymentInitiateInput): Promise<PaymentInitiateResult>;
  confirm(input: PaymentConfirmInput): Promise<PaymentConfirmFacts>;
}
