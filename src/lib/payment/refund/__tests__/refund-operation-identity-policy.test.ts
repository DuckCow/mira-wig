import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE,
  TOSS_REFUND_IDENTITY_POLICY_TUPLE,
  isPhysicalDispatchIdentityCoherent,
  resolveRefundOperationIdentityRegime,
  type RefundOperationFamilyInput,
  type RefundOperationIdentityPolicy,
  type RefundPhysicalDispatchIdentityInput,
} from "../refund-operation-identity-policy";
import { tossRefundOperationIdentityPolicy } from "../providers/toss/refund-operation-identity-policy";
import { deriveTossRefundOperationKey } from "../providers/toss/refund-operation-key";
import { fingerprintTossRefundWireRequest } from "../providers/toss/refund-wire-fingerprint";

const LOGICAL_KEY = "refund:payment-1:attempt-1";
const PAYMENT_KEY = "synthetic-payment-key";
const AMOUNT = 85_000;

describe("refund operation identity policy", () => {
  it("resolves only closed persisted provider/version tuples", () => {
    expect(resolveRefundOperationIdentityRegime(TOSS_REFUND_IDENTITY_POLICY_TUPLE))
      .toBe("STABLE_PER_LOGICAL_REFUND");
    expect(resolveRefundOperationIdentityRegime(EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE))
      .toBe("UNIQUE_PER_PHYSICAL_DISPATCH");
    expect(resolveRefundOperationIdentityRegime({
      ...EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE,
      wireContractVersion: "refund-provider-eximbay-cancel-wire/current",
    })).toBeNull();
  });

  it("preserves the exact existing Toss family, dispatch key, and fingerprint bytes", () => {
    const family = tossRefundOperationIdentityPolicy.allocateOperationFamily(familyInput());
    const first = tossRefundOperationIdentityPolicy.allocatePhysicalDispatch(dispatchInput(family, 1));
    const second = tossRefundOperationIdentityPolicy.allocatePhysicalDispatch(dispatchInput(family, 2));
    const operationKey = deriveTossRefundOperationKey(LOGICAL_KEY);

    expect(family.providerOperationFamilyKey).toBe(operationKey);
    expect(family.operationFamilyFingerprint).toBe(fingerprintTossRefundWireRequest({
      paymentKey: PAYMENT_KEY,
      providerOperationKey: operationKey,
      cancelAmount: AMOUNT,
    }));
    expect(first).toEqual(second);
    expect(first.providerOperationKey).toBe(operationKey);
    expect(isPhysicalDispatchIdentityCoherent(
      tossRefundOperationIdentityPolicy.regime,
      family.providerOperationFamilyKey,
      second.providerOperationKey,
      [first.providerOperationKey],
    )).toBe(true);
  });

  it("represents a dormant unique-per-dispatch family without an Eximbay serializer", () => {
    const policy = syntheticUniquePolicy();
    const family = policy.allocateOperationFamily(familyInput());
    const first = policy.allocatePhysicalDispatch(dispatchInput(family, 1));
    const storedFirst = Object.freeze({ ...first });
    const second = policy.allocatePhysicalDispatch(dispatchInput(family, 2));

    expect(family.providerOperationFamilyKey).not.toBe(LOGICAL_KEY);
    expect(first.providerOperationKey).not.toBe(second.providerOperationKey);
    expect(first.requestFingerprint).not.toBe(second.requestFingerprint);
    expect(storedFirst).toEqual(first);
    expect(isPhysicalDispatchIdentityCoherent(
      policy.regime,
      family.providerOperationFamilyKey,
      second.providerOperationKey,
      [storedFirst.providerOperationKey],
    )).toBe(true);
    expect(isPhysicalDispatchIdentityCoherent(
      policy.regime,
      family.providerOperationFamilyKey,
      storedFirst.providerOperationKey,
      [storedFirst.providerOperationKey],
    )).toBe(false);
  });
});

function familyInput() {
  return Object.freeze({
    refundAttemptIdempotencyKey: LOGICAL_KEY,
    providerPaymentReference: PAYMENT_KEY,
    amountMinor: AMOUNT,
    currency: "KRW",
  });
}

function dispatchInput(
  family: ReturnType<RefundOperationIdentityPolicy["allocateOperationFamily"]>,
  ordinal: number,
) {
  return Object.freeze({
    family,
    ordinal,
    providerPaymentReference: PAYMENT_KEY,
    amountMinor: AMOUNT,
    currency: "KRW",
  });
}

function syntheticUniquePolicy(): RefundOperationIdentityPolicy {
  return Object.freeze({
    tuple: EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE,
    regime: "UNIQUE_PER_PHYSICAL_DISPATCH",
    allocateOperationFamily(input: RefundOperationFamilyInput) {
      const digest = sha256(`family\u0000${input.refundAttemptIdempotencyKey}`);
      return Object.freeze({
        providerOperationFamilyKey: `synthetic-family-${digest}`,
        operationFamilyFingerprint: sha256(`family-request\u0000${digest}`),
      });
    },
    allocatePhysicalDispatch(input: RefundPhysicalDispatchIdentityInput) {
      const providerOperationKey = `synthetic-wire-${input.ordinal}-${sha256(
        input.family.providerOperationFamilyKey,
      )}`;
      return Object.freeze({
        providerOperationKey,
        requestFingerprint: sha256([
          input.providerPaymentReference,
          input.amountMinor,
          input.currency,
          providerOperationKey,
        ].join("\u0000")),
      });
    },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
