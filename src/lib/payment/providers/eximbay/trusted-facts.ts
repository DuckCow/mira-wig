import { decodeEximbayAmount } from "./amount";
import { EximbayProtocolError } from "./errors";
import {
  isEximbayProviderOrderCandidateForPayment,
  type EximbayCurrency,
  type EximbayPaymentMode,
  type EximbayProviderOrderCandidate,
} from "./types";
import type { ProviderVerifiedEximbayStatus } from "./verified-status";

export interface ExpectedEximbayPaymentFacts {
  readonly paymentIdentity: string;
  readonly provider: "EXIMBAY";
  readonly mode: EximbayPaymentMode;
  readonly currency: EximbayCurrency;
  readonly amountMinor: number;
  readonly providerOrderCandidate: EximbayProviderOrderCandidate;
  readonly providerOrderId: string;
  readonly mid: string;
}

export interface TrustedEximbayCompletionCandidate {
  readonly authority: "TRUSTED_LOCAL_COMPLETION_CANDIDATE";
  readonly transactionType: "PAYMENT";
  readonly rescode: "0000";
  readonly status: "SALE";
  readonly mid: string;
  readonly providerOrderId: string;
  readonly paymentIdentity: string;
  readonly provider: "EXIMBAY";
  readonly mode: EximbayPaymentMode;
  readonly currency: EximbayCurrency;
  readonly amountMinor: number;
  readonly transactionId: string;
}

export function validateTrustedEximbayFacts(
  verified: ProviderVerifiedEximbayStatus,
  expected: ExpectedEximbayPaymentFacts,
): TrustedEximbayCompletionCandidate {
  requireSuccessfulSale(verified);
  requireExpectedCorrelation(verified, expected);
  const amountMinor = requireExpectedMoney(verified, expected);
  const transactionId = requireTransactionId(verified.transactionId);

  return Object.freeze({
    authority: "TRUSTED_LOCAL_COMPLETION_CANDIDATE",
    transactionType: "PAYMENT",
    rescode: "0000",
    status: "SALE",
    mid: verified.mid,
    providerOrderId: verified.orderId,
    paymentIdentity: expected.paymentIdentity,
    provider: "EXIMBAY",
    mode: expected.mode,
    currency: expected.currency,
    amountMinor,
    transactionId,
  });
}

function requireSuccessfulSale(verified: ProviderVerifiedEximbayStatus): void {
  if (verified.transactionType !== "PAYMENT") mismatch("TRANSACTION_TYPE_MISMATCH");
  if (verified.rescode !== "0000") mismatch("RESPONSE_CODE_MISMATCH");
  if (verified.status !== "SALE") mismatch("STATUS_NOT_SALE");
}

function requireExpectedCorrelation(
  verified: ProviderVerifiedEximbayStatus,
  expected: ExpectedEximbayPaymentFacts,
): void {
  if (verified.mid !== expected.mid) mismatch("MID_MISMATCH");
  if (verified.orderId !== expected.providerOrderId) {
    mismatch("PROVIDER_ORDER_ID_MISMATCH");
  }
  if (!isEximbayProviderOrderCandidateForPayment(
    expected.providerOrderCandidate,
    expected.paymentIdentity,
  )) {
    mismatch("PAYMENT_IDENTITY_MISMATCH");
  }
  if (verified.correlation.paymentIdentity !== expected.paymentIdentity) {
    mismatch("PAYMENT_IDENTITY_MISMATCH");
  }
  if (expected.provider !== "EXIMBAY" || verified.correlation.provider !== "EXIMBAY") {
    mismatch("PROVIDER_MISMATCH");
  }
  if (verified.correlation.mode !== expected.mode) mismatch("MODE_MISMATCH");
}

function requireExpectedMoney(
  verified: ProviderVerifiedEximbayStatus,
  expected: ExpectedEximbayPaymentFacts,
): number {
  if (verified.currency !== expected.currency) mismatch("CURRENCY_MISMATCH");
  const amountMinor = decodeVerifiedAmount(verified, expected.currency);
  if (amountMinor !== expected.amountMinor) mismatch("AMOUNT_MISMATCH");
  return amountMinor;
}

function decodeVerifiedAmount(
  verified: ProviderVerifiedEximbayStatus,
  currency: EximbayCurrency,
): number {
  try {
    return decodeEximbayAmount(currency, verified.amount);
  } catch {
    mismatch("AMOUNT_MISMATCH");
  }
}

function requireTransactionId(value: string | undefined): string {
  if (value === undefined || value.length === 0) mismatch("TRANSACTION_ID_MISSING");
  if (value.trim().length === 0 || value !== value.trim()) mismatch("TRANSACTION_ID_MISSING");
  return value;
}

function mismatch(code: string): never {
  throw new EximbayProtocolError(code);
}
