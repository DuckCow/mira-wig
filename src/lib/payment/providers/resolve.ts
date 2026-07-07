import { PaymentProvider as ProviderCode } from "@prisma/client";
import { createMockPaymentProvider } from "./mock";
import { PaymentMode, type PaymentMode as PaymentModeValue } from "./routing";
import type { PaymentProvider } from "./types";

export type ProviderResolveErrorCode =
  | "MOCK_PROVIDER_LIVE"
  | "LIVE_ADAPTER_UNAVAILABLE"
  | "PROVIDER_MODE_UNSUPPORTED";

export interface ResolveProviderInput {
  provider: ProviderCode;
  mode: PaymentModeValue;
}

export class ProviderResolveException extends Error {
  constructor(
    readonly code: ProviderResolveErrorCode,
    readonly provider: ProviderCode,
    readonly mode: PaymentModeValue,
    message: string,
  ) {
    super(message);
    this.name = "ProviderResolveException";
  }
}

export function resolveProvider(input: ResolveProviderInput): PaymentProvider {
  if (input.mode === PaymentMode.SANDBOX) {
    return createMockPaymentProvider(input.provider);
  }
  if (input.mode === PaymentMode.LIVE) {
    throw liveProviderError(input.provider);
  }
  throw new ProviderResolveException(
    "PROVIDER_MODE_UNSUPPORTED",
    input.provider,
    input.mode,
    "Payment provider mode is unsupported.",
  );
}

function liveProviderError(provider: ProviderCode): ProviderResolveException {
  if (provider === ProviderCode.MOCK) {
    return new ProviderResolveException(
      "MOCK_PROVIDER_LIVE",
      provider,
      PaymentMode.LIVE,
      "Mock payment provider cannot run in LIVE mode.",
    );
  }
  return new ProviderResolveException(
    "LIVE_ADAPTER_UNAVAILABLE",
    provider,
    PaymentMode.LIVE,
    "Live payment provider adapter is not wired.",
  );
}
