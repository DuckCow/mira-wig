import { decodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import type { EximbayRefundLookupAuthority } from "./refund-lookup";

export type ContactedRefundParserResult = "MATCHED_REFUND_TRANSACTION" | "NO_MATCHING_REFUND_TRANSACTION"
  | "PROVIDER_DEFINITIVE_ERROR" | "UNKNOWN_SHAPE" | "IDENTITY_MISMATCH" | "MONEY_MISMATCH" | "UNESTABLISHED";
export type ContactedRefundEvidence = Readonly<{
  parserResult: ContactedRefundParserResult;
  firstFailure: string | null;
  providerStatusClass: "REFUND" | "PARTIAL_REFUND" | "NONE" | "OTHER" | null;
  providerResponseSuccess: boolean | null;
  refundIdMatch: boolean | null;
  originalTransactionBindingMatch: boolean | null;
  currencyMatch: boolean | null;
  refundAmountMatch: boolean | null;
  refundTransactionIdPresent: boolean | null;
  refundDatePresent: boolean | null;
}>;

export function emptyContactedRefundEvidence(
  parserResult: ContactedRefundParserResult, firstFailure: string,
): ContactedRefundEvidence {
  return Object.freeze({ parserResult, firstFailure, providerStatusClass: null,
    providerResponseSuccess: null, refundIdMatch: null, originalTransactionBindingMatch: null,
    currencyMatch: null, refundAmountMatch: null, refundTransactionIdPresent: null, refundDatePresent: null });
}

const ROOT = ["rescode", "resmsg", "mid", "payment", "card_info", "other_param"];
const PAYMENT = ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date",
  "auth_code", "balance", "payment_method", "paypal_payer_id", "refund_id", "refund_transaction_id", "refund_amount"];

// Separate post-contact evidence grammar. It does not authorize a financial transition.
export function parseContactedRefundEvidence(
  value: unknown, authority: EximbayRefundLookupAuthority,
): ContactedRefundEvidence {
  if (!rootShape(value)) return unknownShape();
  if (value.rescode !== "0000") return Object.freeze({
    ...emptyContactedRefundEvidence("PROVIDER_DEFINITIVE_ERROR", "PROVIDER_NON_SUCCESS"),
    providerResponseSuccess: false,
  });
  if (!paymentShape(value.payment) || !text(value.mid, 512)) return unknownShape();
  const payment = value.payment;
  const facts = evidenceFacts(value.mid, payment, authority);
  const failure = classifyEvidence(payment, authority, facts);
  return Object.freeze({ ...facts, ...failure });
}

function rootShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && keysWithin(value, ROOT) && text(value.rescode, 32)
    && text(value.resmsg, 500) && metadataValid(value);
}

function paymentShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !keysWithin(value, PAYMENT)) return false;
  return ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date"]
    .every((key) => text(value[key], 512))
    && Object.values(value).every((member) => text(member, 512))
    && /^[0-9]{14}$/u.test(String(value.transaction_date));
}

function evidenceFacts(mid: unknown, p: Record<string, unknown>, a: EximbayRefundLookupAuthority) {
  return {
    providerResponseSuccess: true,
    providerStatusClass: statusClass(p.status),
    refundIdMatch: p.refund_id === a.providerOperationKey,
    originalTransactionBindingMatch: mid === a.mid && p.order_id === a.providerOrderId
      && p.transaction_id === a.originalTransactionId,
    currencyMatch: p.currency === a.currency,
    refundAmountMatch: amountMatches(p.refund_amount, a.expectedRefundAmount, a),
    refundTransactionIdPresent: text(p.refund_transaction_id, 512),
    // The inquiry contract has transaction_date, not refund_date. Do not invent it.
    refundDatePresent: false,
  };
}

function classifyEvidence(
  p: Record<string, unknown>, a: EximbayRefundLookupAuthority,
  facts: ReturnType<typeof evidenceFacts>,
): Pick<ContactedRefundEvidence, "parserResult" | "firstFailure"> {
  if (!facts.originalTransactionBindingMatch) return failure("IDENTITY_MISMATCH", "ORIGINAL_TRANSACTION_BINDING");
  if (!facts.currencyMatch || !amountMatches(p.amount, a.originalAmount, a)) return failure("MONEY_MISMATCH", "ORIGINAL_MONEY");
  if (p.status === "NONE") return noneEvidence(p, a);
  if (p.status !== "REFUND" && p.status !== "PARTIAL_REFUND") return failure("UNESTABLISHED", "UNSUPPORTED_STATUS");
  return matchedEvidence(p, a, facts);
}

function matchedEvidence(
  p: Record<string, unknown>, a: EximbayRefundLookupAuthority,
  facts: ReturnType<typeof evidenceFacts>,
): Pick<ContactedRefundEvidence, "parserResult" | "firstFailure"> {
  if (!facts.refundIdMatch) return failure("IDENTITY_MISMATCH", "REFUND_ID");
  if (!facts.refundTransactionIdPresent) return failure("UNKNOWN_SHAPE", "REFUND_TRANSACTION_ID_MISSING");
  if (!facts.refundAmountMatch) return failure("MONEY_MISMATCH", "REFUND_AMOUNT");
  const expectedStatus = a.expectedRefundType === "F" ? "REFUND" : "PARTIAL_REFUND";
  if (p.status !== expectedStatus) return failure("UNESTABLISHED", "REFUND_TYPE_MISMATCH");
  if (!balanceMatches(p, a)) return failure("MONEY_MISMATCH", "BALANCE_MISMATCH");
  return { parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null };
}

function noneEvidence(p: Record<string, unknown>, a: EximbayRefundLookupAuthority): Pick<ContactedRefundEvidence, "parserResult" | "firstFailure"> {
  if (["refund_id", "refund_transaction_id", "refund_amount"].some((key) => Object.hasOwn(p, key))) {
    return failure("UNESTABLISHED", "CONTRADICTORY_NONE");
  }
  if (Object.hasOwn(p, "balance") && !amountMatches(p.balance, a.preContactRefundableBalance, a)) {
    return failure("MONEY_MISMATCH", "BALANCE_MISMATCH");
  }
  return { parserResult: "NO_MATCHING_REFUND_TRANSACTION", firstFailure: null };
}

function balanceMatches(p: Record<string, unknown>, a: EximbayRefundLookupAuthority): boolean {
  if (!Object.hasOwn(p, "balance")) return true;
  if (a.expectedRefundType === "F") return p.balance === "0.00";
  try {
    const balance = p.balance === "0.00" ? 0 : decodeEximbayAmount(a.currency, p.balance);
    return balance <= a.preContactRefundableBalance - a.expectedRefundAmount;
  } catch { return false; }
}

function amountMatches(value: unknown, amount: number, a: EximbayRefundLookupAuthority): boolean {
  try { return decodeEximbayAmount(a.currency, value) === amount; }
  catch { return false; }
}

function metadataValid(root: Record<string, unknown>): boolean {
  if (Object.hasOwn(root, "other_param") && !optionalMetadata(root.other_param)) return false;
  if (!Object.hasOwn(root, "card_info")) return true;
  const card = root.card_info;
  if (!isRecord(card) || !keysWithin(card, ["card_number1", "card_number4", "cardno1", "cardno4"])) return false;
  return Object.values(card).every((v) => text(v, 32));
}

function optionalMetadata(value: unknown): boolean {
  return isRecord(value) && keysWithin(value, ["param1", "param2"])
    && Object.values(value).every((v) => typeof v === "string" && v.length <= 255 && safeText(v, 1020));
}

function safeText(value: string, maxBytes: number): boolean {
  return !/[\p{Cc}\p{Cs}]/u.test(value) && new TextEncoder().encode(value).byteLength <= maxBytes;
}
function text(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && safeText(value, maxBytes);
}
function keysWithin(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function statusClass(value: unknown): ContactedRefundEvidence["providerStatusClass"] {
  if (value === "REFUND" || value === "PARTIAL_REFUND" || value === "NONE") return value;
  return "OTHER";
}
function failure(parserResult: ContactedRefundParserResult, firstFailure: string) { return { parserResult, firstFailure }; }
function unknownShape(): ContactedRefundEvidence { return emptyContactedRefundEvidence("UNKNOWN_SHAPE", "UNKNOWN_SHAPE"); }
