import {
  PaymentAdapterExecutionKind,
  PaymentProvider as ProviderCode,
} from "@prisma/client";
import type {
  PaymentConfirmFacts,
  PaymentConfirmInput,
  PaymentConfirmationProvider,
  PaymentInitiateInput,
  PaymentInitiationProvider,
  PaymentInitiateResult,
  PaymentProvider,
} from "./types";

export type MockPaymentMode = "success" | "amount-mismatch" | "retryable-throw";

export interface MockPaymentProviderOptions {
  mode?: MockPaymentMode;
}

export function createMockPaymentProvider(
  code: ProviderCode = ProviderCode.MOCK,
  options: MockPaymentProviderOptions = {},
): PaymentProvider {
  return {
    code,
    adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
    initiate: async (input) => mockInitiate(input),
    confirm: async (input) => mockConfirm(input, options),
  };
}

export function createMockPaymentInitiationProvider(
  code: ProviderCode = ProviderCode.MOCK,
): PaymentInitiationProvider {
  return {
    code,
    adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
    initiate: async (input) => mockInitiate(input),
  };
}

export function createMockPaymentConfirmationProvider(
  code: ProviderCode = ProviderCode.MOCK,
  options: MockPaymentProviderOptions = {},
): PaymentConfirmationProvider {
  return {
    code,
    adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
    confirm: async (input) => mockConfirm(input, options),
  };
}

function mockInitiate(_input: PaymentInitiateInput): Promise<PaymentInitiateResult> {
  return Promise.resolve({ kind: "ready" });
}

function mockConfirm(
  input: PaymentConfirmInput,
  options: MockPaymentProviderOptions,
): Promise<PaymentConfirmFacts> {
  const mode = options.mode ?? configuredMode();
  if (mode === "retryable-throw") return Promise.reject(new Error("Mock provider retryable failure"));
  return Promise.resolve({
    providerPaymentKey: input.providerPaymentKey ?? `mock:${input.checkoutSessionId}`,
    amount: confirmedAmount(input.amount, mode),
    currency: input.currency,
  });
}

function confirmedAmount(amount: number, mode: MockPaymentMode): number {
  if (mode === "amount-mismatch") return amount + 1;
  return amount;
}

function configuredMode(): MockPaymentMode {
  const raw = process.env.PAYMENT_MOCK_MODE;
  if (isMockPaymentMode(raw)) return raw;
  return "success";
}

function isMockPaymentMode(value: string | undefined): value is MockPaymentMode {
  return value === "success" || value === "amount-mismatch" || value === "retryable-throw";
}
