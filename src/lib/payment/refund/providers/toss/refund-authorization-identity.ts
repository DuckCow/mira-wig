import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionDispatchAttemptState,
  type RefundExecutionDispatchAttempt,
} from "@prisma/client";
import type { DispatchAuthorizationContext } from "../../dispatch-authorization-contract";
import {
  fingerprintRefundRequest,
  normalizeRefundRequestFingerprintInput,
  RefundRequestFingerprintInputError,
} from "../../refund-request-fingerprint";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  fingerprintTossRefundEligibility,
  isTossRefundPaymentKey,
  normalizeTossRefundEligibility,
  type NormalizedTossRefundEligibility,
} from "./refund-eligibility";
import {
  deriveTossRefundOperationKey,
  TOSS_REFUND_OPERATION_KEY_VERSION,
  TossRefundOperationKeyInputError,
} from "./refund-operation-key";
import type {
  BindingWithProof,
  FreshTossLookupAuthority,
  LockedTossAuthorizationState,
} from "./refund-authorization-state";
import {
  fingerprintTossRefundWireRequest,
  TOSS_REFUND_WIRE_VERSION,
} from "./refund-wire-fingerprint";

export type DurableTossRefundRequest = Readonly<{
  providerOperationKey: string;
  neutralFingerprint: string;
  wireFingerprint: string;
}>;

export function isTossFullRefundContext(context: DispatchAuthorizationContext): boolean {
  const payment = context.aggregate.payment;
  const target = context.target;
  return [
    exactTossPaymentKey(payment.providerPaymentKey) !== null,
    payment.provider === PaymentProvider.TOSS,
    payment.mode === PaymentMode.SANDBOX,
    target.provider === PaymentProvider.TOSS,
    target.mode === PaymentMode.SANDBOX,
    context.aggregate.currency === "KRW",
    payment.currency === "KRW",
    target.currency === "KRW",
    target.amount === payment.amount,
    target.amount === context.aggregate.totalAmount,
  ].every(Boolean);
}

export function exactTossPaymentKey(value: string | null): string | null {
  return value !== null && value === value.trim() && isTossRefundPaymentKey(value)
    ? value
    : null;
}

export function deriveDurableTossRefundRequest(
  context: DispatchAuthorizationContext,
): DurableTossRefundRequest | null {
  const paymentKey = exactTossPaymentKey(context.aggregate.payment.providerPaymentKey);
  if (!paymentKey) return null;
  try {
    const providerOperationKey = deriveTossRefundOperationKey(context.target.idempotencyKey);
    const neutral = normalizeRefundRequestFingerprintInput({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerPaymentReference: paymentKey,
      amountMinor: context.target.amount,
      currency: context.target.currency,
      providerOperationKey,
    });
    return Object.freeze({
      providerOperationKey,
      neutralFingerprint: fingerprintRefundRequest(neutral),
      wireFingerprint: fingerprintTossRefundWireRequest({
        paymentKey,
        providerOperationKey,
        cancelAmount: context.target.amount,
      }),
    });
  } catch (error) {
    if (error instanceof TossRefundOperationKeyInputError
      || error instanceof RefundRequestFingerprintInputError) return null;
    throw error;
  }
}

export function matchesCurrentTossEligibility(
  context: DispatchAuthorizationContext,
  eligibility: NormalizedTossRefundEligibility,
  authority: FreshTossLookupAuthority,
): boolean {
  const paymentKey = exactTossPaymentKey(context.aggregate.payment.providerPaymentKey);
  return paymentKey !== null
    && paymentKey === authority.paymentKey
    && eligibility.paymentKey === paymentKey
    && eligibility.totalAmount === context.aggregate.payment.amount
    && eligibility.balanceAmount === context.target.amount
    && eligibility.currency === context.target.currency
    && eligibility.localReceivedAt === authority.conservativeNoLaterThanLookupTimestamp;
}

export function matchesCompleteTossAuthorization(
  locked: LockedTossAuthorizationState,
  request: DurableTossRefundRequest,
): boolean {
  const parts = completeAuthorizationParts(locked);
  if (!parts) return false;
  const { binding, proof, dispatch } = parts;
  const normalized = normalizeTossRefundEligibility({
    paymentKey: proof.paymentKey,
    method: proof.method,
    easyPayPresent: proof.easyPayPresent,
    currency: proof.currency,
    providerStatus: proof.providerStatus,
    totalAmount: proof.totalAmount,
    balanceAmount: proof.balanceAmount,
    taxFreeAmount: proof.taxFreeAmount,
    taxExemptionAmount: proof.taxExemptionAmount,
    cancelsCount: proof.cancelsCount,
    localReceivedAt: proof.localReceivedAt,
  });
  if (!normalized.ok) return false;
  return bindingMatches(locked, binding, request)
    && proofMatches(locked, proof, normalized.facts)
    && dispatchMatches(locked, dispatch, binding.providerOperationKey, request);
}

function completeAuthorizationParts(locked: LockedTossAuthorizationState): Readonly<{
  binding: BindingWithProof;
  proof: NonNullable<BindingWithProof["eligibilityProof"]>;
  dispatch: RefundExecutionDispatchAttempt;
}> | null {
  const binding = locked.binding;
  if (!binding?.eligibilityProof || locked.structure.kind !== "replay") return null;
  return { binding, proof: binding.eligibilityProof, dispatch: locked.structure.attempt };
}

function bindingMatches(
  locked: LockedTossAuthorizationState,
  binding: BindingWithProof,
  request: DurableTossRefundRequest,
): boolean {
  return binding.provider === PaymentProvider.TOSS
    && binding.mode === PaymentMode.SANDBOX
    && binding.providerOperationKey === request.providerOperationKey
    && binding.operationKeyAlgorithmVersion === TOSS_REFUND_OPERATION_KEY_VERSION
    && binding.wireContractVersion === TOSS_REFUND_WIRE_VERSION
    && binding.wireRequestFingerprint === request.wireFingerprint
    && binding.refundAttemptId === locked.context.target.id;
}

function proofMatches(
  locked: LockedTossAuthorizationState,
  proof: NonNullable<BindingWithProof["eligibilityProof"]>,
  normalized: NormalizedTossRefundEligibility,
): boolean {
  const paymentKey = exactTossPaymentKey(locked.context.aggregate.payment.providerPaymentKey);
  const fingerprint = fingerprintTossRefundEligibility({
    ...normalized,
    localReceivedAt: proof.localReceivedAt,
  });
  return paymentKey !== null
    && proof.paymentKey === paymentKey
    && proof.totalAmount === locked.context.aggregate.payment.amount
    && proof.balanceAmount === locked.context.target.amount
    && proof.localReceivedAt.getTime() <= locked.capturedAt.getTime()
    && proof.eligibilityFingerprint === fingerprint;
}

function dispatchMatches(
  locked: LockedTossAuthorizationState,
  dispatch: RefundExecutionDispatchAttempt,
  providerOperationKey: string,
  request: DurableTossRefundRequest,
): boolean {
  return [
    dispatch.commandId === locked.context.command.id,
    dispatch.ordinal === 1,
    dispatch.leaseGeneration === locked.context.command.leaseGeneration,
    dispatch.provider === PaymentProvider.TOSS,
    dispatch.mode === PaymentMode.SANDBOX,
    dispatch.providerOperationKey === providerOperationKey,
    dispatch.requestFingerprint === request.neutralFingerprint,
    dispatch.state === RefundExecutionDispatchAttemptState.AUTHORIZED,
    dispatch.contactMarkedAt === null,
  ].every(Boolean);
}

export function sameBindingCredential(
  binding: BindingWithProof,
  credential: ConfiguredTossRefundCredential,
): boolean {
  return binding.merchantAccountBindingId === credential.merchantAccountBinding
    && binding.credentialGenerationBindingId === credential.credentialGenerationBinding;
}

export function sameCredentialLabels(
  left: ConfiguredTossRefundCredential,
  right: ConfiguredTossRefundCredential,
): boolean {
  return left.merchantAccountBinding === right.merchantAccountBinding
    && left.credentialGenerationBinding === right.credentialGenerationBinding;
}
