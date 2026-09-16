import type { Prisma } from "@prisma/client";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../eximbay-refund-reentry-authority";
import { fingerprintEximbayCancelWire } from "./cancel-wire";
import {
  deriveEximbayRefundOperationFamily, fingerprintEximbayRefundObservation,
  normalizeEximbayRefundPreflightFacts, EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION, EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
  EXIMBAY_REFUND_INQUIRY_PARSER_VERSION, type EximbayRefundPreflightConfig,
} from "./preflight-contract";
import { isCanonicalEximbayMerchantRefundId } from "./refund-id";
import type { EximbayRefundLookupAuthority } from "./refund-lookup";

export const CONTACTED_EVIDENCE_COMMAND_ID = target.commandId;

// Only these relations/columns are needed; no customer, card, or raw response fields.
export const contactedEvidenceSelect = {
  id: true, refundAttemptId: true, status: true, leaseGeneration: true, dispatchAttempt: true,
  dispatchAttempts: { select: {
    id: true, commandId: true, ordinal: true, leaseGeneration: true, provider: true, mode: true,
    providerOperationKey: true, requestFingerprint: true, state: true, contactMarkedAt: true,
  } },
  eximbaySandboxCanaryApproval: { select: { commandId: true, targetBindingDigest: true, consumedAt: true } },
  refundAttempt: { select: {
    id: true, orderId: true, paymentId: true, provider: true, mode: true, amount: true,
    currency: true, status: true, providerRefundId: true, idempotencyKey: true,
    order: { select: { id: true, paymentId: true, status: true, totalAmount: true, currency: true } },
    payment: { select: {
      id: true, provider: true, mode: true, amount: true, currency: true, status: true,
      providerOrderId: true, providerPaymentKey: true, financialSucceededAt: true,
    } },
    providerOperationBinding: { select: {
      id: true, refundAttemptId: true, provider: true, mode: true, providerOperationFamilyKey: true,
      operationFamilyFingerprint: true, operationFamilyKeyAlgorithmVersion: true,
      wireContractVersion: true, merchantAccountBindingId: true, credentialGenerationBindingId: true,
      eximbayPreflightObservations: true,
    } },
  } },
} satisfies Prisma.RefundExecutionCommandSelect;

export type ContactedEvidenceRow = Prisma.RefundExecutionCommandGetPayload<{
  select: typeof contactedEvidenceSelect;
}>;
// No allocator is called. The immutable dispatch owns the already-used wire refund_id.
export function recoverContactedEvidenceAuthority(
  row: ContactedEvidenceRow, config: EximbayRefundPreflightConfig,
): EximbayRefundLookupAuthority | null {
  if (!exactTarget(row) || !exactBinding(row, config)) return null;
  const dispatch = row.dispatchAttempts[0];
  const facts = contactedFacts(row, config);
  if (!facts) return null;
  const cancel = {
    mid: config.mid, merchantAccountBindingId: config.merchantAccountBindingId,
    credentialGenerationBindingId: config.credentialGenerationBindingId,
    originalTransactionId: facts.providerTransactionId, providerOrderId: facts.providerOrderId,
    currency: facts.currency, originalAmount: facts.originalAmount,
    refundableBalance: facts.refundableBalance, requestedAmount: row.refundAttempt.amount,
    refundType: "F" as const, providerOperationKey: dispatch.providerOperationKey, language: "EN" as const,
  };
  if (dispatch.requestFingerprint !== fingerprintEximbayCancelWire(cancel)) return null;
  return Object.freeze({
    targetDispatchAttemptId: dispatch.id, mid: cancel.mid, providerOrderId: cancel.providerOrderId,
    originalTransactionId: cancel.originalTransactionId, currency: cancel.currency,
    originalAmount: cancel.originalAmount, preContactRefundableBalance: cancel.refundableBalance,
    expectedRefundAmount: cancel.requestedAmount, expectedRefundType: cancel.refundType,
    providerOperationKey: dispatch.providerOperationKey, language: cancel.language,
  });
}

function contactedFacts(row: ContactedEvidenceRow, config: EximbayRefundPreflightConfig) {
  const binding = row.refundAttempt.providerOperationBinding;
  if (!binding || !exactDispatch(row) || binding.eximbayPreflightObservations.length !== 1) return null;
  const facts = normalizeEximbayRefundPreflightFacts(binding.eximbayPreflightObservations[0]);
  return facts && exactObservation(row, config, facts) ? facts : null;
}

function exactTarget(row: ContactedEvidenceRow): boolean {
  const a = row.refundAttempt;
  const p = a.payment;
  const o = a.order;
  return [
    row.id === target.commandId, row.refundAttemptId === target.refundAttemptId,
    row.status === "WAITING_EVIDENCE", row.leaseGeneration === 6, row.dispatchAttempt === 1,
    a.id === target.refundAttemptId, a.paymentId === target.paymentId, a.orderId === target.orderId,
    a.provider === "EXIMBAY", a.mode === "SANDBOX", a.status === "PROCESSING", a.providerRefundId === null,
    a.amount === 100, a.currency === "USD", p.id === target.paymentId, p.provider === "EXIMBAY",
    p.mode === "SANDBOX", p.status === "SUCCEEDED", p.amount === 100, p.currency === "USD",
    o.id === target.orderId, o.paymentId === p.id, o.status === "REFUND_PENDING",
    o.totalAmount === 100, o.currency === "USD",
    row.eximbaySandboxCanaryApproval?.commandId === row.id,
    row.eximbaySandboxCanaryApproval?.targetBindingDigest === target.targetBindingDigest,
    row.eximbaySandboxCanaryApproval?.consumedAt instanceof Date,
  ].every(Boolean);
}

function exactDispatch(row: ContactedEvidenceRow): boolean {
  if (row.dispatchAttempts.length !== 1) return false;
  const d = row.dispatchAttempts[0];
  return [d.commandId === row.id, d.ordinal === 1, d.leaseGeneration === 6,
    d.provider === "EXIMBAY", d.mode === "SANDBOX", d.state === "CONTACT_MAY_HAVE_OCCURRED",
    d.contactMarkedAt instanceof Date, isCanonicalEximbayMerchantRefundId(d.providerOperationKey),
  ].every(Boolean);
}

function exactBinding(row: ContactedEvidenceRow, config: EximbayRefundPreflightConfig): boolean {
  const a = row.refundAttempt;
  const p = a.payment;
  const b = a.providerOperationBinding;
  if (!b || !p.providerPaymentKey) return false;
  const family = deriveEximbayRefundOperationFamily(a.idempotencyKey, p.providerPaymentKey, a.amount, a.currency);
  return [b.id === target.providerOperationBindingId,
    b.refundAttemptId === a.id, b.provider === "EXIMBAY", b.mode === "SANDBOX",
    b.providerOperationFamilyKey === family.key, b.operationFamilyFingerprint === family.fingerprint,
    b.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    b.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    b.merchantAccountBindingId === config.merchantAccountBindingId,
    b.credentialGenerationBindingId === config.credentialGenerationBindingId,
    config.mode === "SANDBOX",
  ].every(Boolean);
}

function exactObservation(
  row: ContactedEvidenceRow, config: EximbayRefundPreflightConfig,
  facts: NonNullable<ReturnType<typeof normalizeEximbayRefundPreflightFacts>>,
): boolean {
  const b = row.refundAttempt.providerOperationBinding;
  if (!b) return false;
  const o = b.eximbayPreflightObservations[0];
  const p = row.refundAttempt.payment;
  return [
    o.bindingId === b.id, o.observingLeaseGeneration === 6,
    o.inquiryContractVersion === EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
    o.parserVersion === EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
    facts.mid === config.mid, facts.providerOrderId === p.providerOrderId,
    facts.providerTransactionId === p.providerPaymentKey, facts.currency === "USD",
    facts.originalAmount === 100, facts.refundableBalance === 100,
    o.observationFingerprint === fingerprintEximbayRefundObservation({
      refundAttemptId: row.refundAttempt.id, commandId: row.id, bindingId: b.id,
      observingLeaseGeneration: 6, provider: "EXIMBAY", mode: "SANDBOX",
      merchantAccountBindingId: b.merchantAccountBindingId,
      credentialGenerationBindingId: b.credentialGenerationBindingId,
      wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION, facts, observedAt: o.observedAt,
    }),
  ].every(Boolean);
}
