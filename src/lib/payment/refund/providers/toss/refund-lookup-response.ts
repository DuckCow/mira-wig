import {
  normalizeTossRefundEligibility,
  type NormalizedTossRefundEligibility,
} from "./refund-eligibility";
import { rejectDuplicateTossLookupRootKeys } from "./refund-lookup-json-scanner";
const POSTGRES_INT_MAX = 2_147_483_647;

export type TossRefundLookupExtractionResult =
  | Readonly<{ kind: "eligible"; facts: NormalizedTossRefundEligibility }>
  | Readonly<{ kind: "ineligible" }>
  | Readonly<{ kind: "rejected" }>;

export type TossRefundLookupExpectation = Readonly<{
  paymentKey: string;
  conservativeNoLaterThanLookupTimestamp: number;
}>;

type TextFacts = Readonly<{
  paymentKey: string;
  method: string;
  currency: string;
  status: string;
}>;

type NumberFacts = Readonly<{
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: number;
  taxExemptionAmount: number;
}>;

type ExtractedCandidate = Readonly<{
  text: TextFacts;
  numbers: NumberFacts;
  easyPay: boolean;
  cancelsCount: number;
}>;

export function extractTossRefundEligibilityResponse(
  body: string,
  expectation: TossRefundLookupExpectation,
): TossRefundLookupExtractionResult {
  const parsed = parseLookupBody(body);
  if (!isRecord(parsed)) return rejected();
  const candidate = extractedCandidate(parsed);
  if (!candidate) return rejected();
  return classifyCandidate(candidate, expectation);
}

function extractedCandidate(parsed: Record<string, unknown>): ExtractedCandidate | null {
  const text = textFacts(parsed);
  const numbers = numberFacts(parsed);
  const easyPay = easyPayPresence(parsed);
  const cancelsCount = cancelsLength(parsed);
  if (!text || !numbers || easyPay === null || cancelsCount === null) return null;
  return { text, numbers, easyPay, cancelsCount };
}

function classifyCandidate(
  candidate: ExtractedCandidate,
  expectation: TossRefundLookupExpectation,
): TossRefundLookupExtractionResult {
  const { text, numbers, easyPay, cancelsCount } = candidate;
  if (text.paymentKey !== expectation.paymentKey) return rejected();
  if (!eligibleConstants(text, numbers, easyPay, cancelsCount)) return ineligible();
  const normalized = normalizeTossRefundEligibility({
    paymentKey: text.paymentKey,
    method: text.method,
    easyPayPresent: easyPay,
    currency: text.currency,
    providerStatus: text.status,
    ...numbers,
    cancelsCount,
    localReceivedAt: new Date(expectation.conservativeNoLaterThanLookupTimestamp),
  });
  return normalized.ok
    ? Object.freeze({ kind: "eligible", facts: normalized.facts })
    : rejected();
}

function parseLookupBody(body: string): unknown {
  try {
    rejectDuplicateTossLookupRootKeys(body);
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return undefined;
  }
}

function textFacts(record: Record<string, unknown>): TextFacts | null {
  const paymentKey = requiredText(record.paymentKey);
  const method = requiredText(record.method);
  const currency = requiredText(record.currency);
  const status = requiredText(record.status);
  return paymentKey && method && currency && status
    ? { paymentKey, method, currency, status }
    : null;
}

function numberFacts(record: Record<string, unknown>): NumberFacts | null {
  const totalAmount = positivePostgresInteger(record.totalAmount);
  const balanceAmount = positivePostgresInteger(record.balanceAmount);
  const taxFreeAmount = nonnegativePostgresInteger(record.taxFreeAmount);
  const taxExemptionAmount = nonnegativePostgresInteger(record.taxExemptionAmount);
  return totalAmount !== null && balanceAmount !== null
    && taxFreeAmount !== null && taxExemptionAmount !== null
    ? { totalAmount, balanceAmount, taxFreeAmount, taxExemptionAmount }
    : null;
}

function eligibleConstants(
  text: TextFacts,
  numbers: NumberFacts,
  easyPay: boolean,
  cancelsCount: number,
): boolean {
  return [
    text.method === "카드",
    !easyPay,
    text.currency === "KRW",
    text.status === "DONE",
    numbers.taxFreeAmount === 0,
    numbers.taxExemptionAmount === 0,
    cancelsCount === 0,
  ].every(Boolean);
}

function easyPayPresence(record: Record<string, unknown>): boolean | null {
  if (!Object.prototype.hasOwnProperty.call(record, "easyPay")
    || record.easyPay === null) return false;
  return isRecord(record.easyPay) ? true : null;
}

function cancelsLength(record: Record<string, unknown>): number | null {
  if (!Object.prototype.hasOwnProperty.call(record, "cancels")
    || record.cancels === null) return 0;
  return Array.isArray(record.cancels) ? record.cancels.length : null;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || /\p{Cc}/u.test(value)) return null;
  return value;
}

function positivePostgresInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX
    ? value
    : null;
}

function nonnegativePostgresInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= POSTGRES_INT_MAX
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eligibleFailure<Kind extends "ineligible" | "rejected">(
  kind: Kind,
): Readonly<{ kind: Kind }> {
  return Object.freeze({ kind });
}

function ineligible(): Readonly<{ kind: "ineligible" }> {
  return eligibleFailure("ineligible");
}

function rejected(): Readonly<{ kind: "rejected" }> {
  return eligibleFailure("rejected");
}
