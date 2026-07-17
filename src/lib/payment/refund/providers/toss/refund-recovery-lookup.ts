import { rejectDuplicateTossCancellationKeys } from "./refund-cancellation-json-scanner";
import { isTossRefundPaymentKey } from "./refund-eligibility";
import { TOSS_REFUND_CANCEL_REASON } from "./refund-wire-request";

const MAX_RESPONSE_BYTES = 64 * 1024;
const TRANSACTION_KEY_MAX_CODE_POINTS = 512;
const POSTGRES_INT_MAX = 2_147_483_647;

export type TossRefundRecoveryLookupTransport =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "rejected" }>
  | Readonly<{ kind: "response"; body: Uint8Array }>;

export type TossRefundRecoveryLookupExpectation = Readonly<{
  paymentKey: string;
  fullAmount: number;
  localReceivedAt: number;
}>;

export type TossRefundRecoverySuccess = Readonly<{
  paymentKey: string;
  currency: "KRW";
  paymentStatus: "CANCELED";
  totalAmount: number;
  balanceAmount: 0;
  transactionKey: string;
  cancelStatus: "DONE";
  cancelAmount: number;
  cancelReason: typeof TOSS_REFUND_CANCEL_REASON;
  localReceivedAt: number;
}>;

export type TossRefundRecoveryEligibility = Readonly<{
  paymentKey: string;
  method: "카드";
  easyPayPresent: false;
  currency: "KRW";
  providerStatus: "DONE";
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: 0;
  taxExemptionAmount: 0;
  cancelsCount: 0;
  localReceivedAt: number;
}>;

export type NormalizeTossRefundRecoveryLookupResult =
  | Readonly<{ kind: "EXACT_SUCCESS"; success: TossRefundRecoverySuccess }>
  | Readonly<{
    kind: "STILL_ELIGIBLE_AND_UNCANCELLED";
    eligibility: TossRefundRecoveryEligibility;
  }>
  | Readonly<{ kind: "PROVIDER_PROCESSING" }>
  | Readonly<{ kind: "CONFLICTING_PROVIDER_STATE" }>
  | Readonly<{ kind: "LOOKUP_UNAVAILABLE" }>
  | Readonly<{ kind: "LOOKUP_REJECTED" }>;

export function normalizeTossRefundRecoveryLookup(
  transport: TossRefundRecoveryLookupTransport,
  expectation: TossRefundRecoveryLookupExpectation,
): NormalizeTossRefundRecoveryLookupResult {
  if (!validExpectation(expectation)) return result("CONFLICTING_PROVIDER_STATE");
  if (transport.kind === "unavailable") return result("LOOKUP_UNAVAILABLE");
  if (transport.kind === "rejected") return result("LOOKUP_REJECTED");
  const parsed = parseOneBoundedBody(transport.body);
  if (!parsed) return result("LOOKUP_REJECTED");
  const success = exactSuccess(parsed, expectation);
  if (success) return Object.freeze({ kind: "EXACT_SUCCESS", success });
  const eligibility = exactEligibility(parsed, expectation);
  if (eligibility) {
    return Object.freeze({ kind: "STILL_ELIGIBLE_AND_UNCANCELLED", eligibility });
  }
  // No nonterminal cancellation status is allowlisted by the committed Toss policy.
  return result("CONFLICTING_PROVIDER_STATE");
}

function parseOneBoundedBody(body: Uint8Array): Record<string, unknown> | null {
  if (!(body instanceof Uint8Array) || body.byteLength > MAX_RESPONSE_BYTES) return null;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(body);
    rejectDuplicateTossCancellationKeys(json);
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function exactSuccess(
  parsed: Record<string, unknown>,
  expected: TossRefundRecoveryLookupExpectation,
): TossRefundRecoverySuccess | null {
  const rootMatches = [
    parsed.paymentKey === expected.paymentKey,
    parsed.currency === "KRW",
    parsed.status === "CANCELED",
    parsed.totalAmount === expected.fullAmount,
    parsed.balanceAmount === 0,
  ].every(Boolean);
  if (!rootMatches) return null;
  if (!Array.isArray(parsed.cancels) || parsed.cancels.length !== 1) return null;
  const cancellations: unknown[] = parsed.cancels;
  const cancellation = cancellations[0];
  if (!isRecord(cancellation)) return null;
  const cancellationMatches = [
    cancellation.cancelStatus === "DONE",
    cancellation.cancelAmount === expected.fullAmount,
    cancellation.cancelReason === TOSS_REFUND_CANCEL_REASON,
  ].every(Boolean);
  if (!cancellationMatches) return null;
  const transactionKey = boundedTransactionKey(cancellation.transactionKey);
  if (!transactionKey) return null;
  return Object.freeze({
    paymentKey: expected.paymentKey,
    currency: "KRW",
    paymentStatus: "CANCELED",
    totalAmount: expected.fullAmount,
    balanceAmount: 0,
    transactionKey,
    cancelStatus: "DONE",
    cancelAmount: expected.fullAmount,
    cancelReason: TOSS_REFUND_CANCEL_REASON,
    localReceivedAt: expected.localReceivedAt,
  });
}

function exactEligibility(
  parsed: Record<string, unknown>,
  expected: TossRefundRecoveryLookupExpectation,
): TossRefundRecoveryEligibility | null {
  const matches = [
    parsed.paymentKey === expected.paymentKey,
    parsed.method === "카드",
    parsed.easyPay === null || parsed.easyPay === undefined,
    parsed.currency === "KRW",
    parsed.status === "DONE",
    parsed.totalAmount === expected.fullAmount,
    parsed.balanceAmount === expected.fullAmount,
    parsed.taxFreeAmount === 0,
    parsed.taxExemptionAmount === 0,
    emptyCancellations(parsed.cancels),
  ].every(Boolean);
  if (!matches) return null;
  return Object.freeze({
    paymentKey: expected.paymentKey,
    method: "카드",
    easyPayPresent: false,
    currency: "KRW",
    providerStatus: "DONE",
    totalAmount: expected.fullAmount,
    balanceAmount: expected.fullAmount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancelsCount: 0,
    localReceivedAt: expected.localReceivedAt,
  });
}

function emptyCancellations(value: unknown): boolean {
  return value === null || Array.isArray(value) && value.length === 0;
}

function boundedTransactionKey(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    && Array.from(value).length <= TRANSACTION_KEY_MAX_CODE_POINTS && !/\p{Cc}/u.test(value)
    ? value
    : null;
}

function validExpectation(value: TossRefundRecoveryLookupExpectation): boolean {
  return isTossRefundPaymentKey(value.paymentKey)
    && Number.isSafeInteger(value.fullAmount) && value.fullAmount >= 1
    && value.fullAmount <= POSTGRES_INT_MAX
    && Number.isSafeInteger(value.localReceivedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function result<K extends Exclude<NormalizeTossRefundRecoveryLookupResult["kind"],
"EXACT_SUCCESS" | "STILL_ELIGIBLE_AND_UNCANCELLED">>(kind: K): Readonly<{ kind: K }> {
  return Object.freeze({ kind });
}
