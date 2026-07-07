import { PaymentMode } from "@/lib/payment/providers/routing";

export class PaymentModeConfigException extends Error {
  constructor(readonly rawValue: string | undefined) {
    super("Payment mode configuration is invalid.");
    this.name = "PaymentModeConfigException";
  }
}

export function configuredPaymentMode(): PaymentMode {
  return parsePaymentMode(process.env.PAYMENT_MODE);
}

function parsePaymentMode(rawValue: string | undefined): PaymentMode {
  if (rawValue === undefined) return PaymentMode.SANDBOX;

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return PaymentMode.SANDBOX;
  if (trimmed === PaymentMode.SANDBOX) return PaymentMode.SANDBOX;
  if (trimmed === PaymentMode.LIVE) return PaymentMode.LIVE;
  throw new PaymentModeConfigException(rawValue);
}
