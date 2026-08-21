import { PaymentMode, PaymentProvider } from "@prisma/client";
import {
  TOSS_REFUND_IDENTITY_POLICY_TUPLE,
  type RefundOperationFamilyInput,
  type RefundOperationIdentityPolicy,
  type RefundPhysicalDispatchIdentityInput,
} from "../../refund-operation-identity-policy";
import {
  fingerprintRefundRequest,
  normalizeRefundRequestFingerprintInput,
} from "../../refund-request-fingerprint";
import {
  deriveTossRefundOperationKey,
  TOSS_REFUND_OPERATION_KEY_VERSION,
} from "./refund-operation-key";
import {
  fingerprintTossRefundWireRequest,
  TOSS_REFUND_WIRE_VERSION,
} from "./refund-wire-fingerprint";

export const tossRefundOperationIdentityPolicy: RefundOperationIdentityPolicy = Object.freeze({
  tuple: TOSS_REFUND_IDENTITY_POLICY_TUPLE,
  regime: "STABLE_PER_LOGICAL_REFUND",
  allocateOperationFamily(input: RefundOperationFamilyInput) {
    const providerOperationFamilyKey = deriveTossRefundOperationKey(
      input.refundAttemptIdempotencyKey,
    );
    return Object.freeze({
      providerOperationFamilyKey,
      operationFamilyFingerprint: fingerprintTossRefundWireRequest({
        paymentKey: input.providerPaymentReference,
        providerOperationKey: providerOperationFamilyKey,
        cancelAmount: input.amountMinor,
      }),
    });
  },
  allocatePhysicalDispatch(input: RefundPhysicalDispatchIdentityInput) {
    const providerOperationKey = input.family.providerOperationFamilyKey;
    const facts = normalizeRefundRequestFingerprintInput({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerPaymentReference: input.providerPaymentReference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      providerOperationKey,
    });
    return Object.freeze({
      providerOperationKey,
      requestFingerprint: fingerprintRefundRequest(facts),
    });
  },
});

if (TOSS_REFUND_IDENTITY_POLICY_TUPLE.operationFamilyKeyAlgorithmVersion
  !== TOSS_REFUND_OPERATION_KEY_VERSION
  || TOSS_REFUND_IDENTITY_POLICY_TUPLE.wireContractVersion !== TOSS_REFUND_WIRE_VERSION) {
  throw new Error("Toss refund identity-policy tuple is inconsistent.");
}
