import { PaymentMode, PaymentProvider } from "@prisma/client";

export const REFUND_OPERATION_IDENTITY_REGIMES = [
  "STABLE_PER_LOGICAL_REFUND",
  "UNIQUE_PER_PHYSICAL_DISPATCH",
] as const;

export type RefundOperationIdentityRegime =
  (typeof REFUND_OPERATION_IDENTITY_REGIMES)[number];

export type RefundOperationIdentityPolicyTuple = Readonly<{
  provider: PaymentProvider;
  mode: PaymentMode;
  wireContractVersion: string;
  operationFamilyKeyAlgorithmVersion: string;
}>;

export type RefundOperationFamilyInput = Readonly<{
  refundAttemptIdempotencyKey: string;
  providerPaymentReference: string;
  amountMinor: number;
  currency: string;
}>;

export type RefundOperationFamilyIdentity = Readonly<{
  providerOperationFamilyKey: string;
  operationFamilyFingerprint: string;
}>;

export type RefundPhysicalDispatchIdentityInput = Readonly<{
  family: RefundOperationFamilyIdentity;
  ordinal: number;
  providerPaymentReference: string;
  amountMinor: number;
  currency: string;
}>;

export type RefundPhysicalDispatchIdentity = Readonly<{
  providerOperationKey: string;
  requestFingerprint: string;
}>;

export interface RefundOperationIdentityPolicy {
  readonly tuple: RefundOperationIdentityPolicyTuple;
  readonly regime: RefundOperationIdentityRegime;
  allocateOperationFamily(input: RefundOperationFamilyInput): RefundOperationFamilyIdentity;
  allocatePhysicalDispatch(
    input: RefundPhysicalDispatchIdentityInput,
  ): RefundPhysicalDispatchIdentity;
}

export const TOSS_REFUND_IDENTITY_POLICY_TUPLE = Object.freeze({
  provider: PaymentProvider.TOSS,
  mode: PaymentMode.SANDBOX,
  wireContractVersion: "refund-provider-toss-wire/v1",
  operationFamilyKeyAlgorithmVersion: "toss-refund-v1",
});

export const EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE = Object.freeze({
  provider: PaymentProvider.EXIMBAY,
  mode: PaymentMode.SANDBOX,
  wireContractVersion: "refund-provider-eximbay-cancel-wire/v1",
  operationFamilyKeyAlgorithmVersion: "eximbay-refund-family-v1",
});

export function resolveRefundOperationIdentityRegime(
  tuple: RefundOperationIdentityPolicyTuple,
): RefundOperationIdentityRegime | null {
  if (sameTuple(tuple, TOSS_REFUND_IDENTITY_POLICY_TUPLE)) {
    return "STABLE_PER_LOGICAL_REFUND";
  }
  if (sameTuple(tuple, EXIMBAY_REFUND_IDENTITY_POLICY_TUPLE)) {
    return "UNIQUE_PER_PHYSICAL_DISPATCH";
  }
  return null;
}

export function isPhysicalDispatchIdentityCoherent(
  regime: RefundOperationIdentityRegime,
  providerOperationFamilyKey: string,
  providerOperationKey: string,
  earlierProviderOperationKeys: readonly string[],
): boolean {
  if (regime === "STABLE_PER_LOGICAL_REFUND") {
    return providerOperationKey === providerOperationFamilyKey
      && earlierProviderOperationKeys.every((key) => key === providerOperationKey);
  }
  return earlierProviderOperationKeys.every((key) => key !== providerOperationKey);
}

function sameTuple(
  left: RefundOperationIdentityPolicyTuple,
  right: RefundOperationIdentityPolicyTuple,
): boolean {
  return left.provider === right.provider
    && left.mode === right.mode
    && left.wireContractVersion === right.wireContractVersion
    && left.operationFamilyKeyAlgorithmVersion === right.operationFamilyKeyAlgorithmVersion;
}
