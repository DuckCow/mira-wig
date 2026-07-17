import { createHash } from "crypto";

export const TOSS_REFUND_ELIGIBILITY_VERSION = "refund-toss-eligibility/v1";
export const TOSS_REFUND_PAYMENT_KEY_MAX_CODE_POINTS = 200;

const POSTGRES_INT_MAX = 2_147_483_647;
const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");
const ELIGIBILITY_FIELDS = [
  "paymentKey",
  "method",
  "easyPayPresent",
  "currency",
  "providerStatus",
  "totalAmount",
  "balanceAmount",
  "taxFreeAmount",
  "taxExemptionAmount",
  "cancelsCount",
  "localReceivedAt",
] as const;

type EligibilityInput = Record<(typeof ELIGIBILITY_FIELDS)[number], unknown>;

export type NormalizedTossRefundEligibility = Readonly<{
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

export type NormalizeTossRefundEligibilityResult =
  | Readonly<{ ok: true; facts: NormalizedTossRefundEligibility }>
  | Readonly<{ ok: false; code: "INVALID_TOSS_REFUND_ELIGIBILITY" }>;

export function normalizeTossRefundEligibility(
  input: unknown,
): NormalizeTossRefundEligibilityResult {
  if (!hasExactEnumerableFields(input)) return invalidEligibility();
  if (!isTossRefundPaymentKey(input.paymentKey)) return invalidEligibility();
  if (!hasEligibleConstants(input)) return invalidEligibility();
  if (!isPositivePostgresInteger(input.totalAmount)) return invalidEligibility();
  if (!isPositivePostgresInteger(input.balanceAmount)) return invalidEligibility();
  if (!isPostgresSafeDate(input.localReceivedAt)) return invalidEligibility();
  const localReceivedAt = input.localReceivedAt.getTime();
  return Object.freeze({
    ok: true,
    facts: Object.freeze({
      paymentKey: input.paymentKey,
      method: "카드",
      easyPayPresent: false,
      currency: "KRW",
      providerStatus: "DONE",
      totalAmount: input.totalAmount,
      balanceAmount: input.balanceAmount,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancelsCount: 0,
      localReceivedAt,
    }),
  });
}

export function serializeTossRefundEligibility(input: unknown): string {
  const normalized = normalizeTossRefundEligibility(input);
  if (!normalized.ok) throw new Error("Toss refund eligibility input is invalid.");
  const facts = normalized.facts;
  return JSON.stringify([
    TOSS_REFUND_ELIGIBILITY_VERSION,
    "TOSS",
    "SANDBOX",
    facts.paymentKey,
    facts.method,
    facts.easyPayPresent,
    facts.currency,
    facts.totalAmount,
    facts.balanceAmount,
    facts.taxFreeAmount,
    facts.taxExemptionAmount,
    facts.cancelsCount,
  ]);
}

export function fingerprintTossRefundEligibility(input: unknown): string {
  return createHash("sha256")
    .update(serializeTossRefundEligibility(input), "utf8")
    .digest("hex");
}

export function isTossRefundPaymentKey(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && Array.from(value).length <= TOSS_REFUND_PAYMENT_KEY_MAX_CODE_POINTS
    && !/\p{Cc}/u.test(value);
}

function hasEligibleConstants(input: EligibilityInput): boolean {
  return input.method === "카드"
    && input.easyPayPresent === false
    && input.currency === "KRW"
    && input.providerStatus === "DONE"
    && input.taxFreeAmount === 0
    && input.taxExemptionAmount === 0
    && input.cancelsCount === 0;
}

function hasExactEnumerableFields(value: unknown): value is EligibilityInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value)
    .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
  return keys.length === ELIGIBILITY_FIELDS.length
    && keys.every((key) => (
      typeof key === "string" && ELIGIBILITY_FIELDS.some((field) => field === key)
    ));
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}

function isPostgresSafeDate(value: unknown): value is Date {
  return value instanceof Date
    && Number.isFinite(value.getTime())
    && value.getTime() >= POSTGRES_SAFE_MINIMUM_MS;
}

function invalidEligibility(): NormalizeTossRefundEligibilityResult {
  return Object.freeze({ ok: false, code: "INVALID_TOSS_REFUND_ELIGIBILITY" });
}
