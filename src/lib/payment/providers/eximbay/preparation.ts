import { createEximbayCanonicalAmount, type EximbayCanonicalAmount } from "./amount";
import { EximbayProtocolError } from "./errors";
import {
  isEximbayProviderOrderCandidate,
  type EximbayCurrency,
  type EximbayLanguage,
  type EximbayPaymentMethod,
  type EximbayProviderOrderCandidate,
} from "./types";
import { isRecord, requireExactKeys, requireExactText } from "./validation";

const REQUIRED_PREPARATION_KEYS: readonly string[] = [
  "transactionType",
  "providerOrderCandidate",
  "currency",
  "amountMinor",
  "language",
  "mid",
  "buyerName",
  "buyerEmail",
  "returnUrl",
  "statusUrl",
];
const OPTIONAL_PREPARATION_KEYS: readonly string[] = ["paymentMethod"];
const canonicalPreparationFactsBrand: unique symbol = Symbol("EximbayCanonicalPreparationFacts");
const authorizedCanonicalPreparationFacts = new WeakSet<object>();

export interface EximbayCanonicalPreparationFacts {
  readonly transactionType: "PAYMENT";
  readonly providerOrderCandidate: EximbayProviderOrderCandidate;
  readonly currency: EximbayCurrency;
  readonly amount: EximbayCanonicalAmount;
  readonly language: EximbayLanguage;
  readonly paymentMethod?: EximbayPaymentMethod;
  readonly mid: string;
  readonly buyerName: string;
  readonly buyerEmail: string;
  readonly returnUrl: string;
  readonly statusUrl: string;
  readonly [canonicalPreparationFactsBrand]: true;
}

export interface EximbayProjectedPayment {
  transaction_type: "PAYMENT";
  order_id: EximbayProviderOrderCandidate;
  currency: EximbayCurrency;
  amount: string;
  lang: EximbayLanguage;
  payment_method?: EximbayPaymentMethod;
}

export interface EximbayReadyProjection {
  payment: EximbayProjectedPayment;
  merchant: { mid: string };
  buyer: { name: string; email: string };
  url: { return_url: string; status_url: string };
}

export interface EximbaySdkProjection extends EximbayReadyProjection {
  fgkey: string;
}

export function createEximbayPreparationFacts(input: unknown): EximbayCanonicalPreparationFacts {
  if (!isRecord(input)) throw new EximbayProtocolError("INVALID_PREPARATION_INPUT");
  requireExactKeys(input, REQUIRED_PREPARATION_KEYS, OPTIONAL_PREPARATION_KEYS);
  if (input.transactionType !== "PAYMENT") {
    throw new EximbayProtocolError("INVALID_TRANSACTION_TYPE");
  }
  if (!isEximbayProviderOrderCandidate(input.providerOrderCandidate)) {
    throw new EximbayProtocolError("INVALID_PROVIDER_ORDER_CANDIDATE");
  }
  const language = requireLanguage(input.language);
  const paymentMethod = Object.hasOwn(input, "paymentMethod")
    ? requirePaymentMethod(input.paymentMethod)
    : undefined;
  const amount = createEximbayCanonicalAmount(input.currency, input.amountMinor);
  const shared: Omit<EximbayCanonicalPreparationFacts, "paymentMethod"> = {
    transactionType: "PAYMENT",
    providerOrderCandidate: input.providerOrderCandidate,
    currency: amount.currency,
    amount,
    language,
    mid: requireExactText(input.mid, "INVALID_MID"),
    buyerName: requireExactText(input.buyerName, "INVALID_BUYER_NAME"),
    buyerEmail: requireExactText(input.buyerEmail, "INVALID_BUYER_EMAIL"),
    returnUrl: requireExactText(input.returnUrl, "INVALID_RETURN_URL"),
    statusUrl: requireExactText(input.statusUrl, "INVALID_STATUS_URL"),
    [canonicalPreparationFactsBrand]: true,
  };
  if (paymentMethod === undefined) return authorizeCanonicalPreparationFacts(shared);
  return authorizeCanonicalPreparationFacts({ ...shared, paymentMethod });
}

export function projectEximbayReady(
  facts: EximbayCanonicalPreparationFacts,
): EximbayReadyProjection {
  requireAuthorizedCanonicalPreparationFacts(facts);
  return {
    payment: projectPayment(facts),
    merchant: { mid: facts.mid },
    buyer: { name: facts.buyerName, email: facts.buyerEmail },
    url: { return_url: facts.returnUrl, status_url: facts.statusUrl },
  };
}

export function projectEximbaySdk(
  facts: EximbayCanonicalPreparationFacts,
  fgkeyInput: unknown,
): EximbaySdkProjection {
  requireAuthorizedCanonicalPreparationFacts(facts);
  const ready = projectEximbayReady(facts);
  return {
    fgkey: requireExactText(fgkeyInput, "INVALID_FGKEY"),
    ...ready,
  };
}

function projectPayment(facts: EximbayCanonicalPreparationFacts): EximbayProjectedPayment {
  const payment = {
    transaction_type: facts.transactionType,
    order_id: facts.providerOrderCandidate,
    currency: facts.currency,
    amount: facts.amount.wire,
    lang: facts.language,
  };
  if (facts.paymentMethod === undefined) return payment;
  return { ...payment, payment_method: facts.paymentMethod };
}

function authorizeCanonicalPreparationFacts(
  facts: EximbayCanonicalPreparationFacts,
): EximbayCanonicalPreparationFacts {
  Object.defineProperty(facts, canonicalPreparationFactsBrand, { enumerable: false });
  authorizedCanonicalPreparationFacts.add(facts);
  return Object.freeze(facts);
}

function requireAuthorizedCanonicalPreparationFacts(value: unknown): asserts value is EximbayCanonicalPreparationFacts {
  if (typeof value !== "object" || value === null || !authorizedCanonicalPreparationFacts.has(value)) {
    throw new EximbayProtocolError("INVALID_CANONICAL_PREPARATION_FACTS");
  }
}

function requireLanguage(value: unknown): EximbayLanguage {
  if (value === "EN" || value === "JP") return value;
  throw new EximbayProtocolError("INVALID_LANGUAGE");
}

function requirePaymentMethod(value: unknown): EximbayPaymentMethod {
  if (value === "P000") return value;
  throw new EximbayProtocolError("INVALID_PAYMENT_METHOD");
}
