import { decodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import type { EximbayCurrency } from "@/lib/payment/providers/eximbay/types";
import { boundedEximbayRefundIdentifier } from "./preflight-contract";
import { isCanonicalEximbayMerchantRefundId } from "./refund-id";
import { readEximbayRawJsonResponse } from "./raw-response";
import type { EximbayCancelPlan, EximbayCancelWireAuthority } from "./cancel-wire";

export const EXIMBAY_REFUND_CANCEL_DEADLINE_MS = 25_000;

const ROOT_KEYS = ["rescode", "resmsg", "mid", "refund", "payment"] as const;
const REFUND_KEYS = [
  "refund_amount", "refund_id", "refund_date", "refund_transaction_id",
] as const;
const PAYMENT_REQUIRED_KEYS = [
  "order_id", "currency", "amount", "transaction_id", "balance",
] as const;
const PAYMENT_OPTIONAL_KEYS = [
  "auth_code", "base_currency", "base_amount", "base_rate", "dcc_rate", "payment_method",
] as const;
const ROOT_OPTIONAL_KEYS = ["foreign", "other_param"] as const;

export type EximbayCancelTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayCancelSuccess = Readonly<{
  providerRefundTransactionId: string;
  refundAmount: number;
  resultingBalance: number;
  refundDate: string;
}>;

export type EximbayCancelContactResult =
  | Readonly<{ kind: "succeeded"; success: EximbayCancelSuccess }>
  | Readonly<{ kind: "unknown"; code: string }>;

export async function executeEximbayCancel(
  plan: EximbayCancelPlan,
  authority: EximbayCancelWireAuthority,
  transport: EximbayCancelTransport,
): Promise<EximbayCancelContactResult> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), EXIMBAY_REFUND_CANCEL_DEADLINE_MS);
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
    return admitCancelResponse(raw.value, authority);
  } catch {
    return unknown("TRANSPORT_FAILURE");
  } finally {
    clearTimeout(deadline);
  }
}

export function admitCancelResponse(
  value: unknown,
  authority: EximbayCancelWireAuthority,
): EximbayCancelContactResult {
  const root = admitRootShape(value);
  if (!root) return unknown("UNKNOWN_SHAPE");
  const rootFailure = rootSemanticFailure(root, authority);
  if (rootFailure) return unknown(rootFailure);
  const refundIdentity = admitRefundIdentity(root.refund, authority);
  if (!refundIdentity) return unknown("IDENTITY_MISMATCH");
  if (!paymentIdentityMatches(root.payment, authority)) return unknown("IDENTITY_MISMATCH");
  const amounts = decodeAmounts(root.refund, root.payment, authority.currency);
  if (!amounts || !amountsMatch(amounts, authority)) return unknown("MONEY_MISMATCH");
  return Object.freeze({
    kind: "succeeded",
    success: Object.freeze({
      providerRefundTransactionId: refundIdentity.refundTransactionId,
      refundAmount: amounts.refundAmount,
      resultingBalance: amounts.resultingBalance,
      refundDate: refundIdentity.refundDate,
    }),
  });
}

type CancelRoot = Readonly<{
  root: Record<string, unknown>;
  refund: Record<string, unknown>;
  payment: Record<string, unknown>;
}>;

function admitRootShape(value: unknown): CancelRoot | null {
  if (!isRecord(value) || !validCancelRootHeader(value)
    || !isRecord(value.refund) || !isRecord(value.payment)) return null;
  if (!validCancelMembers(value, value.refund, value.payment)) return null;
  return Object.freeze({ root: value, refund: value.refund, payment: value.payment });
}

function validCancelRootHeader(value: Record<string, unknown>): boolean {
  return exactKeys(value, ROOT_KEYS, ROOT_OPTIONAL_KEYS)
    && Boolean(boundedText(value.resmsg, 500))
    && Boolean(boundedText(value.rescode, 32));
}

function validCancelMembers(
  root: Record<string, unknown>,
  refund: Record<string, unknown>,
  payment: Record<string, unknown>,
): boolean {
  return exactKeys(refund, REFUND_KEYS)
    && exactKeys(payment, PAYMENT_REQUIRED_KEYS, PAYMENT_OPTIONAL_KEYS)
    && validOptionalPayment(payment)
    && validOptionalRoot(root);
}

function rootSemanticFailure(
  value: CancelRoot,
  authority: EximbayCancelWireAuthority,
): "PROVIDER_NON_SUCCESS" | "IDENTITY_MISMATCH" | null {
  if (value.root.rescode !== "0000") return "PROVIDER_NON_SUCCESS";
  return value.root.mid === authority.mid ? null : "IDENTITY_MISMATCH";
}

function admitRefundIdentity(
  refund: Record<string, unknown>,
  authority: EximbayCancelWireAuthority,
): Readonly<{ refundTransactionId: string; refundDate: string }> | null {
  const refundId = isCanonicalEximbayMerchantRefundId(refund.refund_id)
    ? refund.refund_id
    : null;
  const refundTransactionId = boundedEximbayRefundIdentifier(refund.refund_transaction_id);
  const refundDate = boundedText(refund.refund_date, 32);
  return refundId === authority.providerOperationKey && refundTransactionId
    && refundDate && /^[0-9]{14}$/u.test(refundDate)
    ? Object.freeze({ refundTransactionId, refundDate })
    : null;
}

function paymentIdentityMatches(
  payment: Record<string, unknown>,
  authority: EximbayCancelWireAuthority,
): boolean {
  return payment.order_id === authority.providerOrderId
    && payment.currency === authority.currency
    && payment.transaction_id === authority.originalTransactionId;
}

function amountsMatch(
  amounts: Readonly<{ refundAmount: number; originalAmount: number; resultingBalance: number }>,
  authority: EximbayCancelWireAuthority,
): boolean {
  return amounts.refundAmount === authority.requestedAmount
    && amounts.originalAmount === authority.originalAmount
    && amounts.resultingBalance <= authority.refundableBalance
    && amounts.resultingBalance === authority.refundableBalance - authority.requestedAmount;
}

function decodeAmounts(
  refund: Record<string, unknown>,
  payment: Record<string, unknown>,
  currency: EximbayCurrency,
): Readonly<{ refundAmount: number; originalAmount: number; resultingBalance: number }> | null {
  try {
    return Object.freeze({
      refundAmount: decodeEximbayAmount(currency, refund.refund_amount),
      originalAmount: decodeEximbayAmount(currency, payment.amount),
      resultingBalance: decodeNonnegativeAmount(currency, payment.balance),
    });
  } catch {
    return null;
  }
}

function decodeNonnegativeAmount(currency: EximbayCurrency, value: unknown): number {
  if (value === (currency === "JPY" ? "0" : "0.00")) return 0;
  return decodeEximbayAmount(currency, value);
}

function validOptionalRoot(root: Record<string, unknown>): boolean {
  if (Object.hasOwn(root, "foreign") && !validForeign(root.foreign)) return false;
  return !Object.hasOwn(root, "other_param") || validOptionalObject(root.other_param, [
    "param1", "param2", "param3",
  ]);
}

function validForeign(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const formal = ["foreign_currency", "foreign_amount", "foreign_rate"] as const;
  const documentedExample = ["foregin_currency", "foregin_amount", "foregin_rate"] as const;
  const fields = exactKeys(value, formal)
    ? formal
    : exactKeys(value, documentedExample)
      ? documentedExample
      : null;
  return fields !== null
    && fields.every((field) => Boolean(boundedText(value[field], 512)));
}

function validOptionalPayment(payment: Record<string, unknown>): boolean {
  return PAYMENT_OPTIONAL_KEYS.every((key) => (
    !Object.hasOwn(payment, key) || Boolean(boundedText(payment[key], 512))
  ));
}

function validOptionalObject(value: unknown, fields: readonly string[]): boolean {
  if (!isRecord(value) || !exactKeys(value, [], fields)) return false;
  return Object.values(value).every((member) => Boolean(boundedText(member, 512)));
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

function unknown(code: string): EximbayCancelContactResult {
  return Object.freeze({ kind: "unknown", code });
}
