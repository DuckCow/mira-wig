import type { PaymentProvider as ProviderCode } from "@prisma/client";
import { createMockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export function resolveProvider(providerCode: ProviderCode): PaymentProvider {
  return createMockPaymentProvider(providerCode);
}

