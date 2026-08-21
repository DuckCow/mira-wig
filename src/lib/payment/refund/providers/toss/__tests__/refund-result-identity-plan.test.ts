import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  fingerprintRefundRequest,
  normalizeRefundRequestFingerprintInput,
} from "../../../refund-request-fingerprint";
import { fingerprintTossRefundEligibility } from "../refund-eligibility";
import {
  fingerprintTossRefundContactEligibility,
} from "../refund-contact-eligibility";
import { deriveTossRefundOperationKey } from "../refund-operation-key";
import {
  normalizeTossRefundCancellationSuccess,
} from "../refund-cancellation-response";
import {
  planTossRefundResultIdentity,
  type TossRefundResultIdentitySnapshot,
} from "../refund-result-identity-plan";
import { fingerprintTossRefundWireRequest } from "../refund-wire-fingerprint";

const FAILURE_CODE = "TOSS_RESULT_IDENTITY_MISMATCH";

describe("pure Toss binding-aware result identity plan", () => {
  it("prepares the exact frozen future projection for a coherent synthetic snapshot", () => {
    const result = planTossRefundResultIdentity(coherentSnapshot());
    if (!result.ok) throw new Error("Expected coherent Toss result identity.");

    expect(Object.isFrozen(result) && Object.isFrozen(result.plan)).toBe(true);
    expect(result.plan.sourceDedupKey.endsWith(":1")).toBe(true);
    expect(result.plan.evidenceSource === "ADAPTER_RESPONSE").toBe(true);
    expect(result.plan.evidenceOutcome === "SUCCEEDED").toBe(true);
    expect(result.plan.evidenceApplication === "APPLIED").toBe(true);
    expect(result.plan.reportedCurrency === "KRW").toBe(true);
    expect(result.plan.refundAttemptStatus === "SUCCEEDED").toBe(true);
    expect(result.plan.orderStatus === "REFUNDED").toBe(true);
    expect(result.plan.commandStatus === "DONE").toBe(true);
  });

  it.each([
    ["binding owner", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, refundAttemptId: "other-attempt" },
    })],
    ["binding provider", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, provider: PaymentProvider.MOCK },
    })],
    ["attempt provider", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      refundAttempt: { ...value.refundAttempt, provider: PaymentProvider.MOCK },
    })],
    ["binding mode", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, mode: PaymentMode.LIVE },
    })],
    ["payment mode", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      payment: { ...value.payment, mode: PaymentMode.LIVE },
    })],
    ["operation-key version", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, operationFamilyKeyAlgorithmVersion: "other-version" },
    })],
    ["operation-key value", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, providerOperationFamilyKey: "other-key" },
    })],
    ["wire version", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, wireContractVersion: "other-version" },
    })],
    ["wire fingerprint", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, binding: { ...value.binding, operationFamilyFingerprint: "0".repeat(64) },
    })],
    ["merchant credential label", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      expectedCredential: { ...value.expectedCredential, merchantAccountBindingId: "other" },
    })],
    ["generation credential label", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      expectedCredential: {
        ...value.expectedCredential,
        credentialGenerationBindingId: "other",
      },
    })],
    ["authorization proof owner", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      authorizationProof: { ...value.authorizationProof, bindingId: "other-binding" },
    })],
    ["authorization proof field", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      authorizationProof: { ...value.authorizationProof, balanceAmount: 84_999 },
    })],
    ["authorization proof fingerprint", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      authorizationProof: {
        ...value.authorizationProof,
        eligibilityFingerprint: "0".repeat(64),
      },
    })],
    ["contact proof dispatch", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      contactProof: { ...value.contactProof, dispatchAttemptId: "other-dispatch" },
    })],
    ["contact proof field", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      contactProof: { ...value.contactProof, paymentKey: "other-payment" },
    })],
    ["contact proof fingerprint", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      contactProof: { ...value.contactProof, eligibilityFingerprint: "0".repeat(64) },
    })],
    ["dispatch state", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      dispatch: { ...value.dispatch, state: RefundExecutionDispatchAttemptState.AUTHORIZED },
    })],
    ["contact marker", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, dispatch: { ...value.dispatch, contactMarkedAt: null },
    })],
    ["dispatch ordinal", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, dispatch: { ...value.dispatch, ordinal: 2 },
    })],
    ["dispatch generation", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, dispatch: { ...value.dispatch, leaseGeneration: 0 },
    })],
    ["evidence dispatch owner", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      evidenceProvenance: { ...value.evidenceProvenance, dispatchAttemptId: "other-dispatch" },
    })],
    ["evidence generation", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      evidenceProvenance: { ...value.evidenceProvenance, authorizingLeaseGeneration: 2 },
    })],
    ["acquisition event type", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      acquisitionEvent: {
        ...value.acquisitionEvent,
        eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
      },
    })],
    ["acquisition event ordinal", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, acquisitionEvent: { ...value.acquisitionEvent, dispatchAttempt: 1 },
    })],
    ["neutral fingerprint", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, dispatch: { ...value.dispatch, requestFingerprint: "0".repeat(64) },
    })],
    ["success payment key", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, success: { ...value.success, paymentKey: "other-payment" },
    })],
    ["success amount", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, success: { ...value.success, cancelAmount: 84_999 },
    })],
    ["success currency", (value: TossRefundResultIdentitySnapshot) => ({
      ...value,
      success: { ...value.success, currency: "USD" },
    })],
    ["blank transaction key", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, success: { ...value.success, transactionKey: " " },
    })],
    ["invalid transaction key", (value: TossRefundResultIdentitySnapshot) => ({
      ...value, success: { ...value.success, transactionKey: "bad\nkey" },
    })],
  ] as const)("rejects a %s mismatch with one static failure", (_name, mutate) => {
    const result = planTossRefundResultIdentity(mutate(coherentSnapshot()));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code === FAILURE_CODE).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects field mismatch even when the contact proof hash matches its own altered fields", () => {
    const snapshot = coherentSnapshot();
    const contactProof = { ...snapshot.contactProof, balanceAmount: 84_999 };
    const eligibilityFingerprint = fingerprintTossRefundContactEligibility({
      paymentKey: contactProof.paymentKey,
      method: "카드",
      easyPayPresent: false,
      currency: "KRW",
      providerStatus: "DONE",
      totalAmount: contactProof.totalAmount,
      balanceAmount: contactProof.balanceAmount,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancelsCount: 0,
      localReceivedAt: contactProof.localReceivedAt,
    });
    const result = planTossRefundResultIdentity({
      ...snapshot,
      contactProof: { ...contactProof, eligibilityFingerprint },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code === FAILURE_CODE).toBe(true);
  });

  it("accepts recovery GET provenance against the historical contacted ordinal", () => {
    const value = coherentSnapshot();
    const result = planTossRefundResultIdentity({
      ...value,
      evidenceProvenance: {
        source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
        dispatchAttemptId: value.dispatch.id,
        authorizingLeaseGeneration: 2,
      },
      acquisitionEvent: {
        commandId: value.commandId,
        eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
        leaseGeneration: 2,
        dispatchAttempt: 1,
      },
    });
    expect(result.ok && result.plan.evidenceSource === RefundExecutionEvidenceSource.PROVIDER_LOOKUP)
      .toBe(true);
  });

  it("accepts recovery POST provenance on the next contacted ordinal", () => {
    const value = coherentSnapshot();
    const dispatch = { ...value.dispatch, id: "dispatch-2", ordinal: 2, leaseGeneration: 2 };
    const result = planTossRefundResultIdentity({
      ...value,
      dispatch,
      contactProof: { ...value.contactProof, dispatchAttemptId: dispatch.id },
      evidenceProvenance: {
        source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
        dispatchAttemptId: dispatch.id,
        authorizingLeaseGeneration: 2,
      },
      acquisitionEvent: {
        commandId: value.commandId,
        eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
        leaseGeneration: 2,
        dispatchAttempt: 1,
      },
    });
    expect(result.ok && result.plan.sourceDedupKey.endsWith(":2")).toBe(true);
  });
});

function coherentSnapshot(): TossRefundResultIdentitySnapshot {
  const paymentKey = "toss-payment-1";
  const amount = 85_000;
  const idempotencyKey = "refund:payment-1:attempt-1";
  const providerOperationKey = deriveTossRefundOperationKey(idempotencyKey);
  const eligibility = {
    paymentKey,
    method: "카드" as const,
    easyPayPresent: false as const,
    currency: "KRW" as const,
    providerStatus: "DONE" as const,
    totalAmount: amount,
    balanceAmount: amount,
    taxFreeAmount: 0 as const,
    taxExemptionAmount: 0 as const,
    cancelsCount: 0 as const,
    localReceivedAt: Date.parse("2026-07-17T00:00:00.000Z"),
  };
  const normalizedSuccess = normalizeTossRefundCancellationSuccess(JSON.stringify({
    paymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: amount,
    balanceAmount: 0,
    cancels: [{
      transactionKey: "toss-cancel-transaction-1",
      cancelStatus: "DONE",
      cancelAmount: amount,
      cancelReason: "Mira merchant refund",
    }],
  }), { paymentKey, fullAmount: amount });
  if (!normalizedSuccess.ok) throw new Error("Expected synthetic cancellation success.");
  return {
    commandId: "command-1",
    refundAttempt: {
      id: "refund-attempt-1",
      paymentId: "payment-1",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      amount,
      currency: "KRW",
      idempotencyKey,
    },
    payment: {
      id: "payment-1",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      amount,
      currency: "KRW",
      paymentKey,
    },
    binding: {
      id: "binding-1",
      refundAttemptId: "refund-attempt-1",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: providerOperationKey,
      operationFamilyKeyAlgorithmVersion: "toss-refund-v1",
      wireContractVersion: "refund-provider-toss-wire/v1",
      operationFamilyFingerprint: fingerprintTossRefundWireRequest({
        paymentKey,
        providerOperationKey,
        cancelAmount: amount,
      }),
      merchantAccountBindingId: "merchant-binding-1",
      credentialGenerationBindingId: "generation-binding-1",
    },
    expectedCredential: {
      merchantAccountBindingId: "merchant-binding-1",
      credentialGenerationBindingId: "generation-binding-1",
    },
    authorizationProof: {
      bindingId: "binding-1",
      ...eligibility,
      eligibilityFingerprint: fingerprintTossRefundEligibility({
        ...eligibility,
        localReceivedAt: new Date(eligibility.localReceivedAt),
      }),
    },
    contactProof: {
      dispatchAttemptId: "dispatch-1",
      ...eligibility,
      eligibilityFingerprint: fingerprintTossRefundContactEligibility(eligibility),
    },
    dispatch: {
      id: "dispatch-1",
      commandId: "command-1",
      ordinal: 1,
      leaseGeneration: 1,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey,
      requestFingerprint: fingerprintRefundRequest(normalizeRefundRequestFingerprintInput({
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        providerPaymentReference: paymentKey,
        amountMinor: amount,
        currency: "KRW",
        providerOperationKey,
      })),
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      contactMarkedAt: Date.parse("2026-07-17T00:00:01.000Z"),
    },
    evidenceProvenance: {
      source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
      dispatchAttemptId: "dispatch-1",
      authorizingLeaseGeneration: 1,
    },
    acquisitionEvent: {
      commandId: "command-1",
      eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED,
      leaseGeneration: 1,
      dispatchAttempt: 0,
    },
    success: normalizedSuccess.candidate,
  };
}
