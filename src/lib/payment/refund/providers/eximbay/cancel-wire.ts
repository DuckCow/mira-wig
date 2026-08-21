import { createHash } from "node:crypto";
import { encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import type { EximbayCurrency } from "@/lib/payment/providers/eximbay/types";
import { requireExactText } from "@/lib/payment/providers/eximbay/validation";
import {
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  boundedEximbayRefundIdentifier,
  type EximbayRefundType,
} from "./preflight-contract";
import { isCanonicalEximbayMerchantRefundId } from "./refund-id";

export const EXIMBAY_REFUND_CANCEL_REASON = "MIRA_REFUND_V1";
export const EXIMBAY_REFUND_CANCEL_FINGERPRINT_VERSION =
  "refund-eximbay-cancel-wire-fingerprint/v1";

const ENDPOINT = "https://api-test.eximbay.com/v1/payments";
const BINDING_LABEL = /^[A-Za-z0-9._-]{1,64}$/u;

export type EximbayCancelWireAuthority = Readonly<{
  mid: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  originalTransactionId: string;
  providerOrderId: string;
  currency: EximbayCurrency;
  originalAmount: number;
  refundableBalance: number;
  requestedAmount: number;
  refundType: EximbayRefundType;
  providerOperationKey: string;
  language: "EN" | "JP";
}>;

export type EximbayCancelPlan = Readonly<{
  mode: "SANDBOX";
  endpoint: string;
  method: "POST";
  contentType: "application/json";
  body: string;
  requestFingerprint: string;
}>;

export function createEximbayCancelPlan(
  input: EximbayCancelWireAuthority,
): EximbayCancelPlan {
  const authority = normalizeAuthority(input);
  const plan = Object.freeze({
    mode: "SANDBOX" as const,
    endpoint: `${ENDPOINT}/${encodeURIComponent(authority.originalTransactionId)}/cancel`,
    method: "POST" as const,
    contentType: "application/json" as const,
    body: JSON.stringify({
      mid: authority.mid,
      refund: {
        refund_type: authority.refundType,
        refund_amount: encodeEximbayAmount(authority.currency, authority.requestedAmount),
        refund_id: authority.providerOperationKey,
        reason: EXIMBAY_REFUND_CANCEL_REASON,
      },
      payment: {
        order_id: authority.providerOrderId,
        currency: authority.currency,
        amount: encodeEximbayAmount(authority.currency, authority.originalAmount),
        balance: encodeEximbayAmount(authority.currency, authority.refundableBalance),
        lang: authority.language,
      },
    }),
    requestFingerprint: fingerprintEximbayCancelWire(authority),
  });
  return plan;
}

export function fingerprintEximbayCancelWire(
  input: EximbayCancelWireAuthority,
): string {
  const authority = normalizeAuthority(input);
  const preimage = JSON.stringify([
    EXIMBAY_REFUND_CANCEL_FINGERPRINT_VERSION,
    EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    "EXIMBAY",
    "SANDBOX",
    authority.mid,
    authority.merchantAccountBindingId,
    authority.credentialGenerationBindingId,
    authority.originalTransactionId,
    authority.refundType,
    encodeEximbayAmount(authority.currency, authority.requestedAmount),
    authority.providerOperationKey,
    EXIMBAY_REFUND_CANCEL_REASON,
    authority.providerOrderId,
    authority.currency,
    encodeEximbayAmount(authority.currency, authority.originalAmount),
    encodeEximbayAmount(authority.currency, authority.refundableBalance),
    authority.language,
  ]);
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

function normalizeAuthority(input: EximbayCancelWireAuthority): EximbayCancelWireAuthority {
  if (!hasExactAuthorityFields(input)) throw new Error("INVALID_EXIMBAY_CANCEL_AUTHORITY");
  const identity = normalizeIdentity(input);
  if (!identity || !wireValuesAreLawful(input)) {
    throw new Error("INVALID_EXIMBAY_CANCEL_AUTHORITY");
  }
  return Object.freeze({ ...input, ...identity });
}

function hasExactAuthorityFields(input: EximbayCancelWireAuthority): boolean {
  return isExactObject(input, [
    "mid",
    "merchantAccountBindingId",
    "credentialGenerationBindingId",
    "originalTransactionId",
    "providerOrderId",
    "currency",
    "originalAmount",
    "refundableBalance",
    "requestedAmount",
    "refundType",
    "providerOperationKey",
    "language",
  ]);
}

function normalizeIdentity(input: EximbayCancelWireAuthority) {
  const mid = boundedEximbayRefundIdentifier(input.mid);
  const originalTransactionId = boundedEximbayRefundIdentifier(input.originalTransactionId);
  const providerOrderId = boundedEximbayRefundIdentifier(input.providerOrderId);
  const providerOperationKey = isCanonicalEximbayMerchantRefundId(input.providerOperationKey)
    ? input.providerOperationKey
    : null;
  const merchantAccountBindingId = binding(input.merchantAccountBindingId);
  const credentialGenerationBindingId = binding(input.credentialGenerationBindingId);
  return mid && originalTransactionId && providerOrderId && providerOperationKey
    && merchantAccountBindingId && credentialGenerationBindingId
    ? Object.freeze({
    mid,
    originalTransactionId,
    providerOrderId,
    providerOperationKey,
    merchantAccountBindingId,
    credentialGenerationBindingId,
    })
    : null;
}

function wireValuesAreLawful(input: EximbayCancelWireAuthority): boolean {
  return validWireEnums(input)
    && validWireAmounts(input)
    && (input.refundType !== "F" || fullRefundAmountsMatch(input));
}

function validWireEnums(input: EximbayCancelWireAuthority): boolean {
  return (input.currency === "USD" || input.currency === "JPY")
    && (input.refundType === "F" || input.refundType === "P")
    && input.language === (input.currency === "JPY" ? "JP" : "EN");
}

function validWireAmounts(input: EximbayCancelWireAuthority): boolean {
  return positiveAmount(input.originalAmount)
    && positiveAmount(input.requestedAmount)
    && positiveAmount(input.refundableBalance)
    && input.requestedAmount <= input.refundableBalance
    && input.refundableBalance <= input.originalAmount;
}

function fullRefundAmountsMatch(input: EximbayCancelWireAuthority): boolean {
  return input.requestedAmount === input.originalAmount
    && input.refundableBalance === input.originalAmount;
}

function binding(value: unknown): string | null {
  try {
    const text = requireExactText(value, "INVALID_EXIMBAY_CANCEL_BINDING");
    return BINDING_LABEL.test(text) ? text : null;
  } catch {
    return null;
  }
}

function positiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= 2_147_483_647;
}

function isExactObject(value: object, fields: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}
