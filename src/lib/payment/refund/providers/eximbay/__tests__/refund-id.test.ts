import { describe, expect, it } from "vitest";
import {
  EXIMBAY_MERCHANT_REFUND_ID_MAX_LENGTH,
  deriveEximbayMerchantRefundId,
  isCanonicalEximbayMerchantRefundId,
  requireCanonicalEximbayMerchantRefundId,
} from "../refund-id";

describe("Mira Eximbay merchant refund_id", () => {
  it("derives stable lowercase ASCII R1 and R2 vectors within the 30-character ceiling", () => {
    const fingerprint = "a".repeat(64);
    const r1 = deriveEximbayMerchantRefundId(fingerprint, 1);
    const r2 = deriveEximbayMerchantRefundId(fingerprint, 2);

    expect(r1).toBe("er1_djehvgag6iqtqujfhvfl6s72d");
    expect(r2).toBe("er2_9zsedk6yhewj80t9vhfvnp0mg");
    expect(r1).not.toBe(r2);
    expect([r1, r2].every((value) => value.length <= EXIMBAY_MERCHANT_REFUND_ID_MAX_LENGTH))
      .toBe(true);
    expect([r1, r2].every((value) => /^er[12]_[0-9a-z]{25}$/u.test(value))).toBe(true);
  });

  it("never uses case variation as identity and rejects every noncanonical family", () => {
    const canonical = deriveEximbayMerchantRefundId("b".repeat(64), 1);
    expect(isCanonicalEximbayMerchantRefundId(canonical)).toBe(true);
    expect(isCanonicalEximbayMerchantRefundId(canonical.toUpperCase())).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("")).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("er1_" + "a".repeat(27))).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("er1_" + "a".repeat(26))).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("er1_" + "a".repeat(24))).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("er1_" + "é".repeat(25))).toBe(false);
    expect(isCanonicalEximbayMerchantRefundId("er1_" + "-".repeat(25))).toBe(false);
    expect(() => requireCanonicalEximbayMerchantRefundId(canonical.toUpperCase()))
      .toThrow("INVALID_EXIMBAY_MERCHANT_REFUND_ID");
  });

  it("does not silently collide across representative family identities", () => {
    const identities = Array.from({ length: 1_024 }, (_value, index) => (
      deriveEximbayMerchantRefundId(index.toString(16).padStart(64, "0"), 1)
    ));
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("rejects impossible allocator inputs", () => {
    expect(() => deriveEximbayMerchantRefundId("A".repeat(64), 1))
      .toThrow("INVALID_EXIMBAY_MERCHANT_REFUND_ID_SOURCE");
    expect(() => deriveEximbayMerchantRefundId("a".repeat(63), 2))
      .toThrow("INVALID_EXIMBAY_MERCHANT_REFUND_ID_SOURCE");
  });
});
