import { MarketCode } from "@/lib/market/types";
import { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export const EXIMBAY_CHECKOUT_SANDBOX_ENABLED = "EXIMBAY_CHECKOUT_SANDBOX_ENABLED";

export type EximbayCheckoutSandboxActivation = "DISABLED" | "ENABLED" | "INVALID";

export function parseEximbayCheckoutSandboxActivation(
  rawValue: string | undefined,
): EximbayCheckoutSandboxActivation {
  if (rawValue === undefined || rawValue === "") return "DISABLED";
  if (rawValue === "ENABLED") return "ENABLED";
  return "INVALID";
}

export function isEximbayCheckoutSandboxAvailable(input: Readonly<{
  mode: string;
  market: string;
  method: string;
  currency: string;
  env?: ActivationEnv;
}>): boolean {
  const activation = parseEximbayCheckoutSandboxActivation(
    (input.env ?? process.env)[EXIMBAY_CHECKOUT_SANDBOX_ENABLED],
  );
  return activation === "ENABLED"
    && input.mode === PaymentMode.SANDBOX
    && input.market === MarketCode.US
    && input.method === PaymentMethod.CARD
    && input.currency === "USD";
}
