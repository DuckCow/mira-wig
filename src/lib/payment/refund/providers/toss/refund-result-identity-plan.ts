import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import {
  fingerprintRefundRequest,
  normalizeRefundRequestFingerprintInput,
} from "../../refund-request-fingerprint";
import {
  fingerprintTossRefundEligibility,
  isTossRefundPaymentKey,
  normalizeTossRefundEligibility,
} from "./refund-eligibility";
import {
  fingerprintTossRefundContactEligibility,
} from "./refund-contact-eligibility";
import {
  deriveTossRefundOperationKey,
  TOSS_REFUND_OPERATION_KEY_VERSION,
} from "./refund-operation-key";
import {
  fingerprintTossRefundWireRequest,
  TOSS_REFUND_WIRE_VERSION,
} from "./refund-wire-fingerprint";
import {
  matchesTossRefundResultProvenance,
} from "./refund-result-provenance";
import {
  TOSS_RESULT_IDENTITY_FAILURE_CODE,
  type EligibilityProofSnapshot,
  type PlanTossRefundResultIdentity,
  type TossRefundResultIdentitySnapshot,
} from "./refund-result-identity-types";

export type {
  PlanTossRefundResultIdentity,
  TossRefundResultIdentitySnapshot,
  TossRefundResultProjectionPlan,
} from "./refund-result-identity-types";

/** Pure validation/planning only. This establishes no response provenance and performs no writes. */
export function planTossRefundResultIdentity(
  snapshot: TossRefundResultIdentitySnapshot,
): PlanTossRefundResultIdentity {
  try {
    const expected = expectedRequestIdentity(snapshot);
    const coherent = [
      coreMatches(snapshot),
      bindingMatches(snapshot, expected.providerOperationKey, expected.wireFingerprint),
      proofMatches(snapshot.authorizationProof, snapshot.binding.id, snapshot, false),
      proofMatches(snapshot.contactProof, snapshot.dispatch.id, snapshot, true),
      dispatchMatches(snapshot, expected.providerOperationKey, expected.neutralFingerprint),
      matchesTossRefundResultProvenance(snapshot),
      successMatches(snapshot),
    ].every(Boolean);
    if (!coherent) return failure();
    return planned(snapshot);
  } catch {
    return failure();
  }
}

export function isTossRefundResultBaseIdentityCoherent(
  snapshot: TossRefundResultIdentitySnapshot,
): boolean {
  try {
    const expected = expectedRequestIdentity(snapshot);
    return [
      coreMatches(snapshot),
      bindingMatches(snapshot, expected.providerOperationKey, expected.wireFingerprint),
      proofMatches(snapshot.authorizationProof, snapshot.binding.id, snapshot, false),
      proofMatches(snapshot.contactProof, snapshot.dispatch.id, snapshot, true),
      dispatchMatches(snapshot, expected.providerOperationKey, expected.neutralFingerprint),
      matchesTossRefundResultProvenance(snapshot),
    ].every(Boolean);
  } catch {
    return false;
  }
}

function expectedRequestIdentity(snapshot: TossRefundResultIdentitySnapshot): Readonly<{
  providerOperationKey: string;
  neutralFingerprint: string;
  wireFingerprint: string;
}> {
  const providerOperationKey = deriveTossRefundOperationKey(snapshot.refundAttempt.idempotencyKey);
  const neutralFingerprint = fingerprintRefundRequest(normalizeRefundRequestFingerprintInput({
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerPaymentReference: snapshot.payment.paymentKey,
    amountMinor: snapshot.refundAttempt.amount,
    currency: snapshot.refundAttempt.currency,
    providerOperationKey,
  }));
  const wireFingerprint = fingerprintTossRefundWireRequest({
    paymentKey: snapshot.payment.paymentKey,
    providerOperationKey,
    cancelAmount: snapshot.refundAttempt.amount,
  });
  return Object.freeze({ providerOperationKey, neutralFingerprint, wireFingerprint });
}

function coreMatches(snapshot: TossRefundResultIdentitySnapshot): boolean {
  return [
    snapshot.refundAttempt.paymentId === snapshot.payment.id,
    snapshot.refundAttempt.provider === PaymentProvider.TOSS,
    snapshot.refundAttempt.mode === PaymentMode.SANDBOX,
    snapshot.refundAttempt.amount === snapshot.payment.amount,
    snapshot.refundAttempt.currency === "KRW",
    snapshot.payment.provider === PaymentProvider.TOSS,
    snapshot.payment.mode === PaymentMode.SANDBOX,
    snapshot.payment.currency === "KRW",
    snapshot.payment.paymentKey === snapshot.payment.paymentKey.trim(),
    isTossRefundPaymentKey(snapshot.payment.paymentKey),
  ].every(Boolean);
}

function bindingMatches(
  snapshot: TossRefundResultIdentitySnapshot,
  providerOperationKey: string,
  wireFingerprint: string,
): boolean {
  const binding = snapshot.binding;
  return [
    binding.refundAttemptId === snapshot.refundAttempt.id,
    binding.provider === PaymentProvider.TOSS,
    binding.mode === PaymentMode.SANDBOX,
    binding.providerOperationKey === providerOperationKey,
    binding.operationKeyAlgorithmVersion === TOSS_REFUND_OPERATION_KEY_VERSION,
    binding.wireContractVersion === TOSS_REFUND_WIRE_VERSION,
    binding.wireRequestFingerprint === wireFingerprint,
    binding.merchantAccountBindingId === snapshot.expectedCredential.merchantAccountBindingId,
    binding.credentialGenerationBindingId
      === snapshot.expectedCredential.credentialGenerationBindingId,
  ].every(Boolean);
}

function proofMatches(
  proof: EligibilityProofSnapshot & Readonly<{ bindingId?: string; dispatchAttemptId?: string }>,
  ownerId: string,
  snapshot: TossRefundResultIdentitySnapshot,
  contact: boolean,
): boolean {
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
    localReceivedAt: new Date(proof.localReceivedAt),
  });
  if (!normalized.ok) return false;
  const ownerMatches = contact
    ? proof.dispatchAttemptId === ownerId
    : proof.bindingId === ownerId;
  const expectedFingerprint = contact
    ? fingerprintTossRefundContactEligibility(normalized.facts)
    : fingerprintTossRefundEligibility({
      ...normalized.facts,
      localReceivedAt: new Date(normalized.facts.localReceivedAt),
    });
  return ownerMatches
    && proof.paymentKey === snapshot.payment.paymentKey
    && proof.totalAmount === snapshot.payment.amount
    && proof.balanceAmount === snapshot.refundAttempt.amount
    && proof.eligibilityFingerprint === expectedFingerprint;
}

function dispatchMatches(
  snapshot: TossRefundResultIdentitySnapshot,
  providerOperationKey: string,
  neutralFingerprint: string,
): boolean {
  const dispatch = snapshot.dispatch;
  return [
    dispatch.commandId === snapshot.commandId,
    Number.isSafeInteger(dispatch.ordinal),
    dispatch.ordinal >= 1,
    Number.isSafeInteger(dispatch.leaseGeneration),
    dispatch.leaseGeneration >= 1,
    dispatch.provider === PaymentProvider.TOSS,
    dispatch.mode === PaymentMode.SANDBOX,
    dispatch.providerOperationKey === providerOperationKey,
    dispatch.requestFingerprint === neutralFingerprint,
    dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
    dispatch.contactMarkedAt !== null,
    dispatch.contactMarkedAt !== null && Number.isSafeInteger(dispatch.contactMarkedAt),
  ].every(Boolean);
}

function successMatches(snapshot: TossRefundResultIdentitySnapshot): boolean {
  const success = snapshot.success;
  return [
    success.paymentKey === snapshot.payment.paymentKey,
    success.currency === "KRW",
    success.paymentStatus === "CANCELED",
    success.totalAmount === snapshot.refundAttempt.amount,
    success.balanceAmount === 0,
    success.cancelStatus === "DONE",
    success.cancelAmount === snapshot.refundAttempt.amount,
    success.cancelReason === "Mira merchant refund",
    validTransactionKey(success.transactionKey),
  ].every(Boolean);
}

function validTransactionKey(value: unknown): boolean {
  return typeof value === "string"
    && value.trim().length > 0
    && Array.from(value).length <= 512
    && !/\p{Cc}/u.test(value);
}

function planned(snapshot: TossRefundResultIdentitySnapshot): PlanTossRefundResultIdentity {
  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      sourceDedupKey: `refund-result:${snapshot.commandId}:${snapshot.dispatch.ordinal}`,
      evidenceSource: snapshot.evidenceProvenance.source,
      evidenceOutcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      evidenceApplication: RefundExecutionEvidenceApplication.APPLIED,
      observedProviderRefundId: snapshot.success.transactionKey,
      reportedAmount: snapshot.refundAttempt.amount,
      reportedCurrency: "KRW",
      refundAttemptStatus: RefundAttemptStatus.SUCCEEDED,
      orderStatus: OrderStatus.REFUNDED,
      commandStatus: RefundExecutionCommandStatus.DONE,
      dispatchAttemptId: snapshot.dispatch.id,
      authorizingLeaseGeneration: snapshot.evidenceProvenance.authorizingLeaseGeneration,
    }),
  });
}

function failure(): PlanTossRefundResultIdentity {
  return Object.freeze({ ok: false, code: TOSS_RESULT_IDENTITY_FAILURE_CODE });
}
