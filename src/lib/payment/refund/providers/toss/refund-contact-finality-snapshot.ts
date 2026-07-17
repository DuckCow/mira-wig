import {
  RefundExecutionCommandEventType,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import type { LockedTossContactState } from "./refund-contact-state";
import type { TossRefundCancellationSuccessCandidate } from "./refund-cancellation-response";
import type { TossRefundResultIdentitySnapshot } from "./refund-result-identity-plan";

type Evidence = LockedTossContactState["evidence"][number];
type Dispatch = LockedTossContactState["history"]["dispatchAttempts"][number];

export function buildTossResultIdentitySnapshot(
  locked: LockedTossContactState,
  success: TossRefundCancellationSuccessCandidate,
  credential: ConfiguredTossRefundCredential | null,
  evidence: Evidence | null = null,
): TossRefundResultIdentitySnapshot | null {
  const parts = resolveSnapshotParts(locked, evidence);
  if (!parts) return null;
  const { binding, authorizationProof, contactProof, dispatch, paymentKey, provenance } = parts;
  return {
    commandId: locked.context.command.id,
    refundAttempt: refundAttemptSnapshot(locked),
    payment: paymentSnapshot(locked, paymentKey),
    binding: { ...binding },
    expectedCredential: expectedCredentialSnapshot(binding, credential),
    authorizationProof: { ...proofFacts(authorizationProof), bindingId: authorizationProof.bindingId },
    contactProof: { ...proofFacts(contactProof), dispatchAttemptId: contactProof.dispatchAttemptId },
    dispatch: dispatchSnapshot(dispatch),
    evidenceProvenance: provenance.evidence,
    acquisitionEvent: provenance.event,
    success,
  };
}

function resolveSnapshotParts(locked: LockedTossContactState, evidence: Evidence | null) {
  const binding = locked.binding;
  const authorizationProof = binding?.eligibilityProof;
  const dispatch = findDispatch(locked, evidence);
  const contactProof = findContactProof(locked, dispatch);
  const paymentKey = locked.context.aggregate.payment.providerPaymentKey;
  if (!binding) return null;
  if (!authorizationProof) return null;
  if (!dispatch) return null;
  if (!contactProof) return null;
  if (!paymentKey) return null;
  const provenance = resolveProvenance(locked, dispatch, evidence);
  return provenance
    ? { binding, authorizationProof, dispatch, contactProof, paymentKey, provenance }
    : null;
}

function findContactProof(locked: LockedTossContactState, dispatch: Dispatch | undefined) {
  if (!dispatch) return null;
  return locked.contactProofs.find((proof) => proof.dispatchAttemptId === dispatch.id) ?? null;
}

function findDispatch(locked: LockedTossContactState, evidence: Evidence | null): Dispatch | undefined {
  return evidence?.dispatchAttemptId
    ? locked.history.dispatchAttempts.find((row) => row.id === evidence.dispatchAttemptId)
    : locked.history.dispatchAttempts[0];
}

function resolveProvenance(
  locked: LockedTossContactState,
  dispatch: Dispatch,
  evidence: Evidence | null,
) {
  if (!hasEvidenceDispatchLink(evidence)) return null;
  const source = evidence?.source ?? RefundExecutionEvidenceSource.ADAPTER_RESPONSE;
  const generation = evidenceGeneration(locked, evidence);
  if (!generation) return null;
  const eventType = expectedEventType(source, dispatch.ordinal);
  const events = matchingEvents(locked, eventType, generation);
  if (events.length !== 1) return null;
  return {
    evidence: {
      source,
      dispatchAttemptId: dispatch.id,
      authorizingLeaseGeneration: generation,
    },
    event: {
      commandId: events[0].commandId,
      eventType: events[0].eventType,
      leaseGeneration: events[0].leaseGeneration,
      dispatchAttempt: events[0].dispatchAttempt,
    },
  };
}

function hasEvidenceDispatchLink(evidence: Evidence | null): boolean {
  return evidence === null || evidence.dispatchAttemptId !== null;
}

function evidenceGeneration(locked: LockedTossContactState, evidence: Evidence | null) {
  return evidence?.authorizingLeaseGeneration ?? locked.context.command.leaseGeneration;
}

function matchingEvents(
  locked: LockedTossContactState,
  eventType: RefundExecutionCommandEventType,
  generation: number,
) {
  return locked.history.events.filter((event) => [
    event.eventType === eventType,
    event.leaseGeneration === generation,
  ].every(Boolean));
}

function expectedEventType(source: RefundExecutionEvidenceSource, ordinal: number) {
  return source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP || ordinal > 1
    ? RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    : RefundExecutionCommandEventType.LEASE_ACQUIRED;
}

function expectedCredentialSnapshot(
  binding: NonNullable<LockedTossContactState["binding"]>,
  credential: ConfiguredTossRefundCredential | null,
) {
  return {
    merchantAccountBindingId: credential?.merchantAccountBinding ?? binding.merchantAccountBindingId,
    credentialGenerationBindingId: credential?.credentialGenerationBinding
      ?? binding.credentialGenerationBindingId,
  };
}

function dispatchSnapshot(dispatch: Dispatch) {
  return { ...dispatch, contactMarkedAt: dispatch.contactMarkedAt?.getTime() ?? null };
}

function refundAttemptSnapshot(locked: LockedTossContactState) {
  const target = locked.context.target;
  return {
    id: target.id,
    paymentId: target.paymentId,
    provider: target.provider,
    mode: target.mode,
    amount: target.amount,
    currency: target.currency,
    idempotencyKey: target.idempotencyKey,
  };
}

function paymentSnapshot(locked: LockedTossContactState, paymentKey: string) {
  const payment = locked.context.aggregate.payment;
  return {
    id: payment.id,
    provider: payment.provider,
    mode: payment.mode,
    amount: payment.amount,
    currency: payment.currency,
    paymentKey,
  };
}

function proofFacts(proof: Readonly<{
  paymentKey: string;
  method: string;
  easyPayPresent: boolean;
  currency: string;
  providerStatus: string;
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: number;
  taxExemptionAmount: number;
  cancelsCount: number;
  localReceivedAt: Date;
  eligibilityFingerprint: string;
}>) {
  return {
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
    localReceivedAt: proof.localReceivedAt.getTime(),
    eligibilityFingerprint: proof.eligibilityFingerprint,
  };
}
