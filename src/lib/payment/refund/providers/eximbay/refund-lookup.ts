import { decodeEximbayAmount, encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import type { EximbayCurrency } from "@/lib/payment/providers/eximbay/types";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import { boundedEximbayRefundIdentifier } from "./preflight-contract";
import { isCanonicalEximbayMerchantRefundId } from "./refund-id";
import { readEximbayRawJsonResponse } from "./raw-response";

export const EXIMBAY_REFUND_LOOKUP_DEADLINE_MS = 25_000;
export const EXIMBAY_REFUND_LOOKUP_OFFSETS_MS = Object.freeze([
  5_000,
  30_000,
  120_000,
] as const);
export const EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS = 3;

const ENDPOINT = "https://api-test.eximbay.com/v1/payments/retrieve";
const ROOT_REQUIRED = ["rescode", "resmsg", "mid", "payment"] as const;
const ROOT_OPTIONAL = ["card_info", "other_param"] as const;
const PAYMENT_REQUIRED = [
  "status", "order_id", "currency", "amount", "transaction_id", "transaction_date",
] as const;
const PAYMENT_OPTIONAL = [
  "auth_code", "balance", "payment_method", "paypal_payer_id",
  "refund_id", "refund_transaction_id", "refund_amount",
] as const;

export type EximbayRefundLookupAuthority = Readonly<{
  targetDispatchAttemptId: string;
  mid: string;
  providerOrderId: string;
  originalTransactionId: string;
  currency: EximbayCurrency;
  originalAmount: number;
  preContactRefundableBalance: number;
  expectedRefundAmount: number;
  expectedRefundType: "F" | "P";
  providerOperationKey: string;
  language: "EN" | "JP";
}>;

export type EximbayRefundLookupPlan = Readonly<{
  mode: "SANDBOX";
  endpoint: typeof ENDPOINT;
  method: "POST";
  contentType: "application/json";
  body: string;
  targetDispatchAttemptId: string;
}>;

export type EximbayRefundLookupTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayRefundLookupResult =
  | Readonly<{
      kind: "found";
      status: "REFUND" | "PARTIAL_REFUND";
      providerRefundTransactionId: string;
      refundAmount: number;
    }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "unknown"; code: string }>
  | Readonly<{ kind: "conflict"; code: string }>;

export function createEximbayRefundLookupPlan(
  authority: EximbayRefundLookupAuthority,
): EximbayRefundLookupPlan {
  const normalized = normalizeAuthority(authority);
  return Object.freeze({
    mode: "SANDBOX",
    endpoint: ENDPOINT,
    method: "POST",
    contentType: "application/json",
    targetDispatchAttemptId: normalized.targetDispatchAttemptId,
    body: JSON.stringify({
      mid: normalized.mid,
      key_field: "refund_id",
      payment: {
        order_id: normalized.providerOrderId,
        currency: normalized.currency,
        amount: encodeEximbayAmount(normalized.currency, normalized.originalAmount),
        lang: normalized.language,
        transaction_id: normalized.originalTransactionId,
        refund_id: normalized.providerOperationKey,
      },
    }),
  });
}

export async function executeEximbayRefundLookup(
  plan: EximbayRefundLookupPlan,
  authority: EximbayRefundLookupAuthority,
  transport: EximbayRefundLookupTransport,
): Promise<EximbayRefundLookupResult> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), EXIMBAY_REFUND_LOOKUP_DEADLINE_MS);
  try {
    const response = await transport(plan.endpoint, {
      method: plan.method,
      headers: { "Content-Type": plan.contentType },
      body: plan.body,
      redirect: "error",
      signal: controller.signal,
    });
    const raw = await readEximbayRawJsonResponse(response);
    if (!raw.ok) return unknown(raw.code);
    return admitEximbayRefundLookupResponse(raw.value, authority);
  } catch {
    return unknown("TRANSPORT_FAILURE");
  } finally {
    clearTimeout(deadline);
  }
}

export function admitEximbayRefundLookupResponse(
  value: unknown,
  authority: EximbayRefundLookupAuthority,
): EximbayRefundLookupResult {
  const normalized = normalizeAuthority(authority);
  const admitted = admitLookupRoot(value);
  if (!admitted) return unknown("UNKNOWN_SHAPE");
  const rootFailure = lookupRootFailure(admitted.root, normalized);
  if (rootFailure) return rootFailure;
  const paymentFailure = lookupPaymentFailure(admitted.payment, normalized);
  if (paymentFailure) return paymentFailure;
  return classifyLookupStatus(admitted.payment, normalized);
}

type LookupRoot = Readonly<{
  root: Record<string, unknown>;
  payment: Record<string, unknown>;
}>;

function admitLookupRoot(value: unknown): LookupRoot | null {
  if (!isRecord(value) || !validLookupRootHeader(value) || !isRecord(value.payment)) return null;
  if (!validLookupMembers(value, value.payment)) return null;
  const transactionDate = boundedText(value.payment.transaction_date, 32);
  return transactionDate && /^[0-9]{14}$/u.test(transactionDate)
    ? Object.freeze({ root: value, payment: value.payment })
    : null;
}

function validLookupRootHeader(value: Record<string, unknown>): boolean {
  return exactKeys(value, ROOT_REQUIRED, ROOT_OPTIONAL)
    && Boolean(boundedText(value.rescode, 32))
    && Boolean(boundedText(value.resmsg, 500));
}

function validLookupMembers(
  root: Record<string, unknown>,
  payment: Record<string, unknown>,
): boolean {
  return exactKeys(payment, PAYMENT_REQUIRED, PAYMENT_OPTIONAL)
    && validOptionalPayment(payment)
    && validOptionalRoot(root);
}

function lookupRootFailure(
  root: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): EximbayRefundLookupResult | null {
  if (root.rescode !== "0000") return unknown("PROVIDER_NON_SUCCESS");
  return root.mid === authority.mid ? null : conflict("IDENTITY_MISMATCH");
}

function lookupPaymentFailure(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): EximbayRefundLookupResult | null {
  if (!lookupIdentityMatches(payment, authority)) return conflict("IDENTITY_MISMATCH");
  if (!lookupOriginalAmountMatches(payment, authority)) return conflict("MONEY_MISMATCH");
  return lookupBalance(payment, authority) === "INVALID"
    ? conflict("BALANCE_MISMATCH")
    : null;
}

function lookupIdentityMatches(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): boolean {
  return payment.order_id === authority.providerOrderId
    && payment.currency === authority.currency
    && payment.transaction_id === authority.originalTransactionId;
}

function lookupOriginalAmountMatches(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): boolean {
  try {
    return decodeEximbayAmount(authority.currency, payment.amount) === authority.originalAmount;
  } catch {
    return false;
  }
}

function classifyLookupStatus(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): EximbayRefundLookupResult {
  const balance = lookupBalance(payment, authority);
  if (balance === "INVALID") return conflict("BALANCE_MISMATCH");
  if (payment.status === "NONE") return admitNone(payment, authority, balance);
  if (payment.status === "REFUND" || payment.status === "PARTIAL_REFUND") {
    return admitFound(payment, authority, payment.status, balance);
  }
  return unknown("UNSUPPORTED_STATUS");
}

function admitNone(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
  balance: number | null,
): EximbayRefundLookupResult {
  if (["refund_id", "refund_transaction_id", "refund_amount"]
    .some((key) => Object.hasOwn(payment, key))) return conflict("CONTRADICTORY_NONE");
  if (balance !== null && balance !== authority.preContactRefundableBalance) {
    return conflict("BALANCE_DRIFT");
  }
  return Object.freeze({ kind: "none" });
}

function admitFound(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
  status: "REFUND" | "PARTIAL_REFUND",
  balance: number | null,
): EximbayRefundLookupResult {
  const refundId = canonicalMerchantRefundId(payment.refund_id);
  const providerRefundTransactionId = boundedEximbayRefundIdentifier(
    payment.refund_transaction_id,
  );
  if (!refundId || !providerRefundTransactionId
    || refundId !== authority.providerOperationKey) return conflict("REFUND_IDENTITY_MISMATCH");
  let refundAmount: number;
  try {
    refundAmount = decodeEximbayAmount(authority.currency, payment.refund_amount);
  } catch {
    return conflict("REFUND_AMOUNT_MISMATCH");
  }
  if (refundAmount !== authority.expectedRefundAmount
    || !lookupStatusMatchesExpectedType(status, authority.expectedRefundType)) {
    return conflict("REFUND_AMOUNT_MISMATCH");
  }
  if (!foundBalanceCoherent(status, balance, authority)) {
    return conflict("BALANCE_MISMATCH");
  }
  return Object.freeze({ kind: "found", status, providerRefundTransactionId, refundAmount });
}

function lookupBalance(
  payment: Record<string, unknown>,
  authority: EximbayRefundLookupAuthority,
): number | null | "INVALID" {
  if (!Object.hasOwn(payment, "balance")) return null;
  try {
    const balance = decodeNonnegativeAmount(authority.currency, payment.balance);
    return balance <= authority.originalAmount ? balance : "INVALID";
  } catch {
    return "INVALID";
  }
}

function foundBalanceCoherent(
  status: "REFUND" | "PARTIAL_REFUND",
  balance: number | null,
  authority: EximbayRefundLookupAuthority,
): boolean {
  if (balance === null) return true;
  return status === "REFUND"
    ? balance === 0
    : balance <= authority.preContactRefundableBalance - authority.expectedRefundAmount;
}

function decodeNonnegativeAmount(currency: EximbayCurrency, value: unknown): number {
  if (value === (currency === "JPY" ? "0" : "0.00")) return 0;
  return decodeEximbayAmount(currency, value);
}

function lookupStatusMatchesExpectedType(
  status: "REFUND" | "PARTIAL_REFUND",
  expectedType: "F" | "P",
): boolean {
  return expectedType === "F" ? status === "REFUND" : status === "PARTIAL_REFUND";
}

function normalizeAuthority(
  input: EximbayRefundLookupAuthority,
): EximbayRefundLookupAuthority {
  const identity = normalizeLookupIdentity(input);
  if (!identity || !lookupAuthorityValuesValid(input)) {
    throw new Error("INVALID_EXIMBAY_REFUND_LOOKUP_AUTHORITY");
  }
  return Object.freeze({ ...input, ...identity });
}

function normalizeLookupIdentity(input: EximbayRefundLookupAuthority) {
  const targetDispatchAttemptId = boundedText(input.targetDispatchAttemptId, 128);
  const mid = boundedEximbayRefundIdentifier(input.mid);
  const providerOrderId = boundedEximbayRefundIdentifier(input.providerOrderId);
  const originalTransactionId = boundedEximbayRefundIdentifier(input.originalTransactionId);
  const providerOperationKey = canonicalMerchantRefundId(input.providerOperationKey);
  return targetDispatchAttemptId && mid && providerOrderId && originalTransactionId
    && providerOperationKey
    ? Object.freeze({
    targetDispatchAttemptId,
    mid,
    providerOrderId,
    originalTransactionId,
    providerOperationKey,
    })
    : null;
}

function lookupAuthorityValuesValid(input: EximbayRefundLookupAuthority): boolean {
  return lookupAuthorityEnumsValid(input) && positiveAmount(input.originalAmount)
    && positiveAmount(input.preContactRefundableBalance)
    && positiveAmount(input.expectedRefundAmount)
    && input.preContactRefundableBalance <= input.originalAmount
    && input.expectedRefundAmount <= input.preContactRefundableBalance;
}

function lookupAuthorityEnumsValid(input: EximbayRefundLookupAuthority): boolean {
  return (input.currency === "USD" || input.currency === "JPY")
    && (input.expectedRefundType === "F" || input.expectedRefundType === "P")
    && input.language === (input.currency === "JPY" ? "JP" : "EN");
}

function canonicalMerchantRefundId(value: unknown): string | null {
  return isCanonicalEximbayMerchantRefundId(value) ? value : null;
}

function validOptionalRoot(root: Record<string, unknown>): boolean {
  if (Object.hasOwn(root, "card_info") && !validCardInfo(root.card_info)) return false;
  return !Object.hasOwn(root, "other_param") || validOptionalObject(root.other_param, [
    "param1", "param2", "param3",
  ]);
}

function validOptionalPayment(payment: Record<string, unknown>): boolean {
  return PAYMENT_OPTIONAL.every((key) => (
    !Object.hasOwn(payment, key) || Boolean(boundedText(payment[key], 512))
  ));
}

function validCardInfo(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [], [
    "card_number1", "card_number4", "cardno1", "cardno4",
  ])) return false;
  const formal = Object.hasOwn(value, "card_number1") || Object.hasOwn(value, "card_number4");
  const example = Object.hasOwn(value, "cardno1") || Object.hasOwn(value, "cardno4");
  if (formal === example) return false;
  const required = formal
    ? ["card_number1", "card_number4"]
    : ["cardno1", "cardno4"];
  return required.every((key) => Boolean(boundedText(value[key], 32)));
}

function validOptionalObject(value: unknown, fields: readonly string[]): boolean {
  return isRecord(value) && exactKeys(value, [], fields)
    && Object.values(value).every((member) => Boolean(boundedText(member, 512)));
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function boundedText(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string" || !value || value !== value.trim()
    || /\p{Cc}/u.test(value)
    || new TextEncoder().encode(value).byteLength > maxBytes) return null;
  return value;
}

function positiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= 2_147_483_647;
}

function unknown(code: string): EximbayRefundLookupResult {
  return Object.freeze({ kind: "unknown", code });
}

function conflict(code: string): EximbayRefundLookupResult {
  return Object.freeze({ kind: "conflict", code });
}
