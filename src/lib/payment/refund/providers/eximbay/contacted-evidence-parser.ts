import { decodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import type { EximbayRefundLookupAuthority } from "./refund-lookup";

export type ContactedRefundParserResult = "MATCHED_REFUND_TRANSACTION" | "NO_MATCHING_REFUND_TRANSACTION"
  | "PROVIDER_DEFINITIVE_ERROR" | "UNKNOWN_SHAPE" | "IDENTITY_MISMATCH" | "MONEY_MISMATCH" | "UNESTABLISHED";
export type ContactedRefundValueClass = "ABSENT" | "NOT_STRING" | "EMPTY_OR_WHITESPACE_ONLY"
  | "TRIM_MISMATCH" | "CONTROL_OR_SURROGATE" | "OVER_MAX_TEXT_UNITS"
  | "OVER_MAX_UTF8_BYTES" | "FORMAT_INVALID"
  | "VALID" | "NOT_OBJECT";
export type ContactedRefundUnknownKeyClass = "NONE" | "ONE" | "MULTIPLE";
type ContactedRefundObjectDiagnostic = Readonly<{
  present: boolean;
  objectValid: boolean;
  knownKeyPresence: Readonly<Record<string, boolean>>;
  unknownKeyClass: ContactedRefundUnknownKeyClass;
  fields: Readonly<Record<string, ContactedRefundValueClass>>;
}>;
type ContactedRefundRecordDiagnostic = Readonly<{
  valueClass: "VALID";
  knownKeyPresence: Readonly<Record<string, boolean>>;
  missingRequiredKeys: readonly string[];
  unknownKeyClass: ContactedRefundUnknownKeyClass;
  exactKeysValid: boolean;
  fields: Readonly<Record<string, ContactedRefundValueClass>>;
}>;
type ContactedRefundNonRecordDiagnostic = Readonly<{ valueClass: "NOT_OBJECT" }>;
type ContactedRefundPaymentDiagnostic = ContactedRefundRecordDiagnostic | Readonly<{
  valueClass: "ABSENT" | "NOT_OBJECT";
}>;
export type ContactedRefundShapeDiagnostic = Readonly<{
  root: ContactedRefundRecordDiagnostic | ContactedRefundNonRecordDiagnostic;
  payment: ContactedRefundPaymentDiagnostic;
  cardInfo: ContactedRefundObjectDiagnostic;
  otherParam: ContactedRefundObjectDiagnostic;
}>;
export type ContactedRefundEvidence = Readonly<{
  parserResult: ContactedRefundParserResult;
  firstFailure: string | null;
  shapeDiagnostic: ContactedRefundShapeDiagnostic | null;
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
  return Object.freeze({ parserResult, firstFailure, shapeDiagnostic: null, providerStatusClass: null,
    providerResponseSuccess: null, refundIdMatch: null, originalTransactionBindingMatch: null,
    currencyMatch: null, refundAmountMatch: null, refundTransactionIdPresent: null, refundDatePresent: null });
}

const ROOT = ["rescode", "resmsg", "mid", "payment", "card_info", "other_param"];
const ROOT_REQUIRED = ["rescode", "resmsg", "mid", "payment"];
const PAYMENT = ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date",
  "auth_code", "balance", "payment_method", "paypal_payer_id", "refund_id", "refund_transaction_id", "refund_amount"];
const PAYMENT_REQUIRED = ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date"];

// Separate post-contact evidence grammar. It does not authorize a financial transition.
export function parseContactedRefundEvidence(
  value: unknown, authority: EximbayRefundLookupAuthority,
): ContactedRefundEvidence {
  const shapeDiagnostic = diagnoseShape(value);
  if (!rootShape(value)) return unknownShape(rootFailure(value), shapeDiagnostic);
  if (value.rescode !== "0000") return Object.freeze({
    ...emptyContactedRefundEvidence("PROVIDER_DEFINITIVE_ERROR", "PROVIDER_NON_SUCCESS"),
    providerResponseSuccess: false, shapeDiagnostic,
  });
  if (!paymentShape(value.payment)) {
    return unknownShape(paymentFailure(value.payment), shapeDiagnostic);
  }
  if (!text(value.mid, 512)) return unknownShape("MID_MISSING_OR_INVALID", shapeDiagnostic);
  const payment = value.payment;
  const facts = evidenceFacts(value.mid, payment, authority);
  const failure = classifyEvidence(payment, authority, facts);
  return Object.freeze({ ...facts, ...failure, shapeDiagnostic });
}

function rootShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && keysWithin(value, ROOT) && text(value.rescode, 32)
    && text(value.resmsg, 500) && metadataValid(value);
}

function paymentShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !keysWithin(value, PAYMENT)) return false;
  return ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date"]
    .every((key) => text(value[key], 512))
    && Object.entries(value).every(([key, member]) => paymentText(key, member))
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

function diagnoseShape(value: unknown): ContactedRefundShapeDiagnostic {
  if (!isRecord(value)) {
    return Object.freeze({
      root: Object.freeze({ valueClass: "NOT_OBJECT" }),
      payment: Object.freeze({ valueClass: "ABSENT" }),
      cardInfo: optionalObjectDiagnostic(undefined, false, ["card_number1", "card_number4", "cardno1", "cardno4"], 32, false),
      otherParam: optionalObjectDiagnostic(undefined, false, ["param1", "param2"], 1020, true, 255),
    });
  }
  return Object.freeze({
    root: recordDiagnostic(value, ROOT, ROOT_REQUIRED, {
      rescode: classifyText(value, "rescode", 32),
      resmsg: classifyText(value, "resmsg", 500),
      mid: classifyText(value, "mid", 512),
      payment: classifyObjectMember(value, "payment"),
      card_info: classifyObjectMember(value, "card_info"),
      other_param: classifyObjectMember(value, "other_param"),
    }),
    payment: paymentDiagnostic(value),
    cardInfo: optionalObjectDiagnostic(value.card_info, Object.hasOwn(value, "card_info"),
      ["card_number1", "card_number4", "cardno1", "cardno4"], 32, false),
    otherParam: optionalObjectDiagnostic(value.other_param, Object.hasOwn(value, "other_param"),
      ["param1", "param2"], 1020, true, 255),
  });
}

function paymentDiagnostic(root: Record<string, unknown>): ContactedRefundPaymentDiagnostic {
  if (!Object.hasOwn(root, "payment")) return Object.freeze({ valueClass: "ABSENT" });
  if (!isRecord(root.payment)) return Object.freeze({ valueClass: "NOT_OBJECT" });
  const fields: Record<string, ContactedRefundValueClass> = {};
  for (const key of PAYMENT) {
    fields[key] = classifyText(root.payment, key, 512);
  }
  if (fields.transaction_date === "VALID"
      && !/^[0-9]{14}$/u.test(String(root.payment.transaction_date))) {
    fields.transaction_date = "FORMAT_INVALID";
  }
  return recordDiagnostic(root.payment, PAYMENT, PAYMENT_REQUIRED, fields);
}

function optionalObjectDiagnostic(
  value: unknown,
  present: boolean,
  allowedKeys: readonly string[],
  maxBytes: number,
  allowBlank: boolean,
  maxTextUnits?: number,
): ContactedRefundObjectDiagnostic {
  const record = isRecord(value) ? value : null;
  const unknownClass = record ? classifyUnknownKeys(record, allowedKeys) : "NONE";
  const fields: Record<string, ContactedRefundValueClass> = {};
  for (const key of allowedKeys) {
    fields[key] = record ? classifyText(record, key, maxBytes, allowBlank, maxTextUnits) : "ABSENT";
  }
  return Object.freeze({
    present,
    objectValid: validOptionalObject(present, record, unknownClass, allowedKeys, fields),
    knownKeyPresence: knownKeyPresence(record, allowedKeys),
    unknownKeyClass: unknownClass,
    fields: Object.freeze(fields),
  });
}

function validOptionalObject(
  present: boolean,
  record: Record<string, unknown> | null,
  unknownKeyClass: ContactedRefundUnknownKeyClass,
  allowedKeys: readonly string[],
  fields: Readonly<Record<string, ContactedRefundValueClass>>,
): boolean {
  if (!present || record === null || unknownKeyClass !== "NONE") return false;
  return allowedKeys.every((key) => fields[key] === "ABSENT" || fields[key] === "VALID");
}

function recordDiagnostic(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  fields: Readonly<Record<string, ContactedRefundValueClass>>,
): ContactedRefundRecordDiagnostic {
  const unknownClass = classifyUnknownKeys(value, allowedKeys);
  return Object.freeze({ valueClass: "VALID",
    knownKeyPresence: knownKeyPresence(value, allowedKeys),
    missingRequiredKeys: Object.freeze(requiredKeys.filter((key) => !Object.hasOwn(value, key))),
    unknownKeyClass: unknownClass, exactKeysValid: unknownClass === "NONE",
    fields: Object.freeze(fields) });
}

function knownKeyPresence(
  value: Record<string, unknown> | null, knownKeys: readonly string[],
): Readonly<Record<string, boolean>> {
  const presence: Record<string, boolean> = {};
  for (const key of knownKeys) presence[key] = value !== null && Object.hasOwn(value, key);
  return Object.freeze(presence);
}

function classifyUnknownKeys(
  value: Record<string, unknown>, knownKeys: readonly string[],
): ContactedRefundUnknownKeyClass {
  let unknownCount = 0;
  for (const key of Object.keys(value)) {
    if (knownKeys.includes(key)) continue;
    unknownCount += 1;
    if (unknownCount > 1) return "MULTIPLE";
  }
  return unknownCount === 1 ? "ONE" : "NONE";
}

function classifyObjectMember(
  value: Record<string, unknown>, key: string,
): ContactedRefundValueClass {
  if (!Object.hasOwn(value, key)) return "ABSENT";
  return isRecord(value[key]) ? "VALID" : "NOT_OBJECT";
}

function classifyText(
  value: Record<string, unknown>, key: string, maxBytes: number, allowBlank = false,
  maxTextUnits?: number,
): ContactedRefundValueClass {
  if (!Object.hasOwn(value, key)) return "ABSENT";
  const member = value[key];
  if (typeof member !== "string") return "NOT_STRING";
  return classifyPresentText(member, maxBytes, allowBlank, maxTextUnits);
}

function classifyPresentText(
  member: string, maxBytes: number, allowBlank: boolean, maxTextUnits?: number,
): ContactedRefundValueClass {
  if (blankDisallowed(member, allowBlank)) return "EMPTY_OR_WHITESPACE_ONLY";
  if (member !== member.trim()) return "TRIM_MISMATCH";
  if (/\p{Cc}|\p{Cs}/u.test(member)) return "CONTROL_OR_SURROGATE";
  if (maxTextUnits !== undefined && member.length > maxTextUnits) return "OVER_MAX_TEXT_UNITS";
  if (new TextEncoder().encode(member).byteLength > maxBytes) return "OVER_MAX_UTF8_BYTES";
  return "VALID";
}

function blankDisallowed(member: string, allowBlank: boolean): boolean {
  return !allowBlank && member.trim().length === 0;
}

function rootFailure(value: unknown): string {
  if (!isRecord(value)) return "ROOT_NOT_OBJECT";
  if (!keysWithin(value, ROOT)) return "ROOT_UNKNOWN_KEY";
  if (!text(value.rescode, 32)) return "RESCODE_INVALID";
  if (!text(value.resmsg, 500)) return "RESMSG_INVALID";
  if (Object.hasOwn(value, "other_param") && !optionalMetadata(value.other_param)) {
    return "OTHER_PARAM_INVALID";
  }
  return "CARD_INFO_INVALID";
}

function paymentFailure(value: unknown): string {
  if (!isRecord(value)) return "PAYMENT_NOT_OBJECT";
  if (!keysWithin(value, PAYMENT)) return "PAYMENT_UNKNOWN_KEY";
  const required = ["status", "order_id", "currency", "amount", "transaction_id", "transaction_date"];
  if (required.some((key) => !Object.hasOwn(value, key))) return "PAYMENT_REQUIRED_FIELD_MISSING";
  if (required.some((key) => !text(value[key], 512))) return "PAYMENT_FIELD_INVALID";
  if (PAYMENT.some((key) => Object.hasOwn(value, key) && !paymentText(key, value[key]))) {
    return "PAYMENT_FIELD_INVALID";
  }
  return "TRANSACTION_DATE_INVALID";
}

function paymentText(key: string, value: unknown): value is string {
  if (key !== "auth_code") return text(value, 512);
  return text(value, 512) || safeBlankText(value, 512);
}

function safeBlankText(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.trim().length === 0 && safeText(value, maxBytes);
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
function unknownShape(
  firstFailure: string, shapeDiagnostic: ContactedRefundShapeDiagnostic,
): ContactedRefundEvidence {
  return Object.freeze({ ...emptyContactedRefundEvidence("UNKNOWN_SHAPE", firstFailure), shapeDiagnostic });
}
