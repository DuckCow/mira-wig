import { createHash } from "node:crypto";
import { vi } from "vitest";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../../eximbay-refund-reentry-authority";
import type { ContactedEvidenceRow } from "../contacted-evidence-state";
import type { EximbayRefundLookupAuthority } from "../refund-lookup";
import { deriveEximbayMerchantRefundId } from "../refund-id";
import { fingerprintEximbayCancelWire } from "../cancel-wire";
import { deriveEximbayRefundOperationFamily, fingerprintEximbayRefundObservation,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION, EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
  EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION, EXIMBAY_REFUND_INQUIRY_PARSER_VERSION } from "../preflight-contract";
export const config = { mode: "SANDBOX" as const, mid: "fake-mid", merchantAccountBindingId: "fake-merchant",
  credentialGenerationBindingId: "fake-generation" };
export const env = { EXIMBAY_SANDBOX_MID: config.mid,
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: "projects/fake-project/secrets/fake-key",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST: createHash("sha256").update(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1", "projects/fake-project/secrets/fake-key", "1", config.credentialGenerationBindingId,
  ])).digest("hex"),
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING: config.merchantAccountBindingId,
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING: config.credentialGenerationBindingId };
export const family = deriveEximbayRefundOperationFamily("fake-logical-operation", "fake-original-transaction", 100, "USD");
export const refundId = deriveEximbayMerchantRefundId(family.fingerprint, 1);
export const facts = { mid: config.mid, providerOrderId: "fake-provider-order", providerTransactionId: "fake-original-transaction",
  providerStatus: "SALE" as const, currency: "USD" as const, originalAmount: 100, refundableBalance: 100 };
export const authority: EximbayRefundLookupAuthority = {
  targetDispatchAttemptId: "fake-dispatch", mid: config.mid, providerOrderId: facts.providerOrderId,
  originalTransactionId: facts.providerTransactionId, currency: "USD", originalAmount: 100,
  preContactRefundableBalance: 100, expectedRefundAmount: 100, expectedRefundType: "F",
  providerOperationKey: refundId, language: "EN",
};

export function fixture(providerOrderId = facts.providerOrderId): ContactedEvidenceRow {
  const localFacts = { ...facts, providerOrderId };
  const time = new Date("2026-09-14T00:00:00Z");
  return {
    id: target.commandId, refundAttemptId: target.refundAttemptId, status: "WAITING_EVIDENCE",
    leaseGeneration: 6, dispatchAttempt: 1,
    eximbaySandboxCanaryApproval: { commandId: target.commandId, targetBindingDigest: target.targetBindingDigest, consumedAt: time },
    dispatchAttempts: [{ id: "fake-dispatch", commandId: target.commandId, ordinal: 1, leaseGeneration: 6,
      provider: "EXIMBAY", mode: "SANDBOX", providerOperationKey: refundId,
      requestFingerprint: fingerprintEximbayCancelWire({ mid: config.mid, merchantAccountBindingId: config.merchantAccountBindingId,
        credentialGenerationBindingId: config.credentialGenerationBindingId,
        originalTransactionId: localFacts.providerTransactionId, providerOrderId: localFacts.providerOrderId,
        currency: "USD", originalAmount: 100, refundableBalance: 100, requestedAmount: 100,
        refundType: "F", providerOperationKey: refundId, language: "EN",
      }), state: "CONTACT_MAY_HAVE_OCCURRED", contactMarkedAt: time }],
    refundAttempt: {
      id: target.refundAttemptId, orderId: target.orderId, paymentId: target.paymentId,
      provider: "EXIMBAY", mode: "SANDBOX", amount: 100, currency: "USD", status: "PROCESSING",
      providerRefundId: null, idempotencyKey: "fake-logical-operation",
      order: { id: target.orderId, paymentId: target.paymentId, status: "REFUND_PENDING", totalAmount: 100, currency: "USD" },
      payment: { id: target.paymentId, provider: "EXIMBAY", mode: "SANDBOX", amount: 100, currency: "USD",
        status: "SUCCEEDED", providerOrderId: localFacts.providerOrderId, providerPaymentKey: localFacts.providerTransactionId,
        financialSucceededAt: time },
      providerOperationBinding: {
        id: target.providerOperationBindingId, refundAttemptId: target.refundAttemptId, provider: "EXIMBAY", mode: "SANDBOX",
        providerOperationFamilyKey: family.key, operationFamilyFingerprint: family.fingerprint,
        operationFamilyKeyAlgorithmVersion: EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
        wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
        merchantAccountBindingId: config.merchantAccountBindingId,
        credentialGenerationBindingId: config.credentialGenerationBindingId,
        eximbayPreflightObservations: [{ id: "fake-observation", bindingId: target.providerOperationBindingId,
          observingLeaseGeneration: 6, ...localFacts, observedAt: time, createdAt: time,
          inquiryContractVersion: EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION, parserVersion: EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
          observationFingerprint: fingerprintEximbayRefundObservation({ refundAttemptId: target.refundAttemptId,
            commandId: target.commandId, bindingId: target.providerOperationBindingId, observingLeaseGeneration: 6,
            provider: "EXIMBAY", mode: "SANDBOX", merchantAccountBindingId: config.merchantAccountBindingId,
            credentialGenerationBindingId: config.credentialGenerationBindingId,
            wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION, facts: localFacts, observedAt: time }),
        }],
      },
    },
  };
}
export function response(payment: Record<string, unknown> = {}) {
  return { rescode: "0000", resmsg: "Success", mid: config.mid, payment: {
    status: "REFUND", order_id: facts.providerOrderId, currency: "USD", amount: "1.00",
    transaction_id: facts.providerTransactionId, transaction_date: "20260914000000",
    refund_id: refundId, refund_transaction_id: "fake-refund-transaction", refund_amount: "1.00", ...payment,
  } };
}
export function fakeFetch(body: unknown = response()) {
  return vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
}
