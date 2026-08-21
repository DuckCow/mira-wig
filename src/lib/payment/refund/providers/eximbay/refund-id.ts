import { createHash } from "node:crypto";

export const EXIMBAY_MERCHANT_REFUND_ID_VERSION = "mira-eximbay-refund-id-v1";
export const EXIMBAY_MERCHANT_REFUND_ID_MAX_LENGTH = 30;

const OPERATION_FAMILY_FINGERPRINT = /^[0-9a-f]{64}$/u;
const MERCHANT_REFUND_ID = /^er[12]_[0-9a-z]{25}$/u;

export type EximbayPhysicalCancelOrdinal = 1 | 2;

export function deriveEximbayMerchantRefundId(
  operationFamilyFingerprint: string,
  ordinal: EximbayPhysicalCancelOrdinal,
): string {
  if (!OPERATION_FAMILY_FINGERPRINT.test(operationFamilyFingerprint)
    || (ordinal !== 1 && ordinal !== 2)) {
    throw new Error("INVALID_EXIMBAY_MERCHANT_REFUND_ID_SOURCE");
  }
  const preimage = JSON.stringify([
    EXIMBAY_MERCHANT_REFUND_ID_VERSION,
    operationFamilyFingerprint,
    ordinal,
  ]);
  const projection = createHash("sha256").update(preimage, "utf8").digest("hex").slice(0, 32);
  const suffix = BigInt(`0x${projection}`).toString(36).padStart(25, "0");
  const refundId = `er${ordinal}_${suffix}`;
  if (!isCanonicalEximbayMerchantRefundId(refundId)) {
    throw new Error("INVALID_EXIMBAY_MERCHANT_REFUND_ID_ALLOCATION");
  }
  return refundId;
}

export function isCanonicalEximbayMerchantRefundId(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= EXIMBAY_MERCHANT_REFUND_ID_MAX_LENGTH
    && MERCHANT_REFUND_ID.test(value);
}

export function requireCanonicalEximbayMerchantRefundId(value: unknown): string {
  if (!isCanonicalEximbayMerchantRefundId(value)) {
    throw new Error("INVALID_EXIMBAY_MERCHANT_REFUND_ID");
  }
  return value;
}
