import "server-only";
import { PaymentProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidEximbayProviderOrderId } from "@/lib/payment/attempt/provider-order-id";
import { EximbayProtocolError } from "@/lib/payment/providers/eximbay/errors";
import {
  projectEximbayReady,
  type EximbayCanonicalPreparationFacts,
} from "@/lib/payment/providers/eximbay/preparation";
import {
  isEximbayProviderOrderCandidateForPayment,
  type EximbayCurrency,
  type EximbayLanguage,
  type EximbayPaymentMethod,
  type EximbayProviderOrderCandidate,
} from "@/lib/payment/providers/eximbay/types";

const persistedBindingBrand: unique symbol = Symbol("TrustedEximbayProviderOrderBinding");
const trustedPersistedBindings = new WeakMap<object, PersistedBindingAuthority>();

interface PersistedBindingAuthority {
  readonly candidate: EximbayProviderOrderCandidate;
  readonly paymentId: string;
  readonly providerOrderId: string;
}

export interface TrustedEximbayProviderOrderBinding {
  readonly [persistedBindingBrand]: true;
}

export interface EximbayReadyRequestFacts {
  readonly payment: Readonly<{
    transaction_type: "PAYMENT";
    order_id: string;
    currency: EximbayCurrency;
    amount: string;
    lang: EximbayLanguage;
    payment_method?: EximbayPaymentMethod;
  }>;
  readonly merchant: Readonly<{ mid: string }>;
  readonly buyer: Readonly<{ name: string; email: string }>;
  readonly url: Readonly<{ return_url: string; status_url: string }>;
}

export async function createTrustedEximbayProviderOrderBinding(
  candidate: EximbayProviderOrderCandidate,
  expectedPaymentId: string,
): Promise<TrustedEximbayProviderOrderBinding> {
  if (!isEximbayProviderOrderCandidateForPayment(candidate, expectedPaymentId)) {
    throw new EximbayProtocolError("PROVIDER_ORDER_CANDIDATE_PAYMENT_MISMATCH");
  }
  const payment = await db.payment.findUnique({
    where: { id: expectedPaymentId },
    select: { id: true, provider: true, providerOrderId: true },
  });
  if (!payment || payment.id !== expectedPaymentId) {
    throw new EximbayProtocolError("PERSISTED_PAYMENT_NOT_FOUND");
  }
  if (payment.provider !== PaymentProvider.EXIMBAY) {
    throw new EximbayProtocolError("PERSISTED_PAYMENT_PROVIDER_MISMATCH");
  }
  if (!isValidEximbayProviderOrderId(payment.providerOrderId)) {
    throw new EximbayProtocolError("INVALID_PERSISTED_PROVIDER_ORDER_ID");
  }
  const binding: TrustedEximbayProviderOrderBinding = {
    [persistedBindingBrand]: true,
  };
  Object.defineProperty(binding, persistedBindingBrand, { enumerable: false });
  trustedPersistedBindings.set(binding, Object.freeze({
    candidate,
    paymentId: payment.id,
    providerOrderId: payment.providerOrderId,
  }));
  return Object.freeze(binding);
}

export function materializeEximbayReadyRequest(
  facts: EximbayCanonicalPreparationFacts,
  binding: TrustedEximbayProviderOrderBinding,
): EximbayReadyRequestFacts {
  const projected = projectEximbayReady(facts);
  const authority = trustedPersistedBindings.get(binding);
  if (!authority) throw new EximbayProtocolError("UNTRUSTED_PROVIDER_ORDER_BINDING");
  if (facts.providerOrderCandidate !== authority.candidate) {
    throw new EximbayProtocolError("PROVIDER_ORDER_BINDING_PAYMENT_MISMATCH");
  }
  if (!isValidEximbayProviderOrderId(authority.providerOrderId)) {
    throw new EximbayProtocolError("INVALID_PERSISTED_PROVIDER_ORDER_ID");
  }
  const payment = projected.payment.payment_method === undefined
    ? {
      transaction_type: projected.payment.transaction_type,
      order_id: authority.providerOrderId,
      currency: projected.payment.currency,
      amount: projected.payment.amount,
      lang: projected.payment.lang,
    }
    : {
      transaction_type: projected.payment.transaction_type,
      order_id: authority.providerOrderId,
      currency: projected.payment.currency,
      amount: projected.payment.amount,
      lang: projected.payment.lang,
      payment_method: projected.payment.payment_method,
    };
  return Object.freeze({
    payment: Object.freeze(payment),
    merchant: Object.freeze({ mid: projected.merchant.mid }),
    buyer: Object.freeze({ name: projected.buyer.name, email: projected.buyer.email }),
    url: Object.freeze({
      return_url: projected.url.return_url,
      status_url: projected.url.status_url,
    }),
  });
}
