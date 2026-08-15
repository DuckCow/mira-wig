import "server-only";
import { PaymentProvider } from "@prisma/client";
import { isValidEximbayProviderOrderId } from "@/lib/payment/attempt/provider-order-id";
import { PaymentMethod, type PaymentMethod as PaymentMethodValue } from "@/lib/payment/providers/routing";
import {
  createEximbayPreparationFacts,
  type EximbayCanonicalPreparationFacts,
} from "@/lib/payment/providers/eximbay/preparation";
import {
  createEximbayProviderOrderCandidate,
  requireEximbayCurrency,
  requireEximbayMode,
} from "@/lib/payment/providers/eximbay/types";

export interface EximbayReadyPaymentFacts {
  readonly id: string;
  readonly checkoutSessionId: string;
  readonly provider: PaymentProvider;
  readonly mode: string;
  readonly providerOrderId: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly routingRuleId: string | null;
}

export interface EximbayReadySessionFacts {
  readonly id: string;
  readonly userId: string;
  readonly marketCode: string;
  readonly currency: string;
  readonly totalAmount: number;
}

export interface EximbayReadyBuyerFacts {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
}

export interface CreateEximbayReadyFactsInput {
  readonly payment: EximbayReadyPaymentFacts;
  readonly session: EximbayReadySessionFacts;
  readonly buyer: EximbayReadyBuyerFacts;
  readonly method: PaymentMethodValue;
  readonly mid: string;
  readonly paymentPublicOrigin: string;
}

export type EximbayReadyFactsErrorCode =
  | "PAYMENT_PROVIDER_MISMATCH"
  | "PAYMENT_SESSION_MISMATCH"
  | "PAYMENT_MODE_INVALID"
  | "PAYMENT_PROVIDER_ORDER_INVALID"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "BUYER_OWNER_MISMATCH"
  | "UNSUPPORTED_MARKET"
  | "UNSUPPORTED_METHOD"
  | "UNSUPPORTED_CURRENCY";

export class EximbayReadyFactsError extends Error {
  constructor(readonly code: EximbayReadyFactsErrorCode) {
    super(code);
    this.name = "EximbayReadyFactsError";
  }
}

export function createCanonicalEximbayReadyFacts(
  input: CreateEximbayReadyFactsInput,
): EximbayCanonicalPreparationFacts {
  validatePaymentIdentity(input);
  const language = readyLanguage(input.session.marketCode);
  const paymentMethod = readyMethod(input.method);
  const currency = readyCurrency(input.session.currency);
  const providerOrderCandidate = createEximbayProviderOrderCandidate(input.payment.id);
  return createEximbayPreparationFacts({
    transactionType: "PAYMENT",
    providerOrderCandidate,
    currency,
    amountMinor: input.session.totalAmount,
    language,
    paymentMethod,
    mid: input.mid,
    buyerName: input.buyer.name,
    buyerEmail: input.buyer.email,
    returnUrl: `${input.paymentPublicOrigin}/checkout/return/${encodeURIComponent(input.session.id)}`,
    statusUrl: `${input.paymentPublicOrigin}/api/payments/eximbay/status`,
  });
}

function validatePaymentIdentity(input: CreateEximbayReadyFactsInput): void {
  if (input.payment.provider !== PaymentProvider.EXIMBAY) {
    throw new EximbayReadyFactsError("PAYMENT_PROVIDER_MISMATCH");
  }
  try {
    requireEximbayMode(input.payment.mode);
  } catch {
    throw new EximbayReadyFactsError("PAYMENT_MODE_INVALID");
  }
  if (!isValidEximbayProviderOrderId(input.payment.providerOrderId)) {
    throw new EximbayReadyFactsError("PAYMENT_PROVIDER_ORDER_INVALID");
  }
  if (input.payment.checkoutSessionId !== input.session.id) {
    throw new EximbayReadyFactsError("PAYMENT_SESSION_MISMATCH");
  }
  if (input.payment.amount !== input.session.totalAmount) {
    throw new EximbayReadyFactsError("PAYMENT_AMOUNT_MISMATCH");
  }
  if (input.payment.currency !== input.session.currency) {
    throw new EximbayReadyFactsError("PAYMENT_CURRENCY_MISMATCH");
  }
  if (input.buyer.id !== input.session.userId) {
    throw new EximbayReadyFactsError("BUYER_OWNER_MISMATCH");
  }
}

function readyLanguage(marketCode: string): "EN" | "JP" {
  if (marketCode === "JP") return "JP";
  if (marketCode === "US") return "EN";
  throw new EximbayReadyFactsError("UNSUPPORTED_MARKET");
}

function readyMethod(method: PaymentMethodValue): "P000" {
  if (method === PaymentMethod.CARD) return "P000";
  throw new EximbayReadyFactsError("UNSUPPORTED_METHOD");
}

function readyCurrency(currency: string): "USD" | "JPY" {
  try {
    return requireEximbayCurrency(currency);
  } catch {
    throw new EximbayReadyFactsError("UNSUPPORTED_CURRENCY");
  }
}
