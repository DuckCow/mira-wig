import {
  RefundExecutionCommandEventType,
  RefundExecutionEvidenceSource,
} from "@prisma/client";

export type TossRefundResultEvidenceProvenance = Readonly<{
  source: RefundExecutionEvidenceSource;
  dispatchAttemptId: string;
  authorizingLeaseGeneration: number;
}>;

export type TossRefundResultAcquisitionEvent = Readonly<{
  commandId: string;
  eventType: RefundExecutionCommandEventType;
  leaseGeneration: number;
  dispatchAttempt: number;
}>;

export type TossRefundResultProvenanceSnapshot = Readonly<{
  commandId: string;
  dispatch: Readonly<{
    id: string;
    ordinal: number;
    leaseGeneration: number;
  }>;
  evidenceProvenance: TossRefundResultEvidenceProvenance;
  acquisitionEvent: TossRefundResultAcquisitionEvent;
}>;

export function matchesTossRefundResultProvenance(
  snapshot: TossRefundResultProvenanceSnapshot,
): boolean {
  if (!matchesCoreProvenance(snapshot)) return false;
  if (snapshot.evidenceProvenance.source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP) {
    return matchesRecoveryGet(snapshot);
  }
  if (snapshot.evidenceProvenance.source !== RefundExecutionEvidenceSource.ADAPTER_RESPONSE) {
    return false;
  }
  return snapshot.dispatch.ordinal === 1
    ? matchesInitialPost(snapshot)
    : matchesRecoveryPost(snapshot);
}

function matchesCoreProvenance(snapshot: TossRefundResultProvenanceSnapshot): boolean {
  const provenance = snapshot.evidenceProvenance;
  const event = snapshot.acquisitionEvent;
  return provenance.dispatchAttemptId === snapshot.dispatch.id
    && provenance.authorizingLeaseGeneration === event.leaseGeneration
    && event.commandId === snapshot.commandId
    && Number.isSafeInteger(provenance.authorizingLeaseGeneration)
    && provenance.authorizingLeaseGeneration >= 1;
}

function matchesRecoveryGet(snapshot: TossRefundResultProvenanceSnapshot): boolean {
  return snapshot.acquisitionEvent.eventType
      === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    && snapshot.acquisitionEvent.dispatchAttempt === snapshot.dispatch.ordinal;
}

function matchesInitialPost(snapshot: TossRefundResultProvenanceSnapshot): boolean {
  return snapshot.acquisitionEvent.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    && snapshot.acquisitionEvent.dispatchAttempt === 0
    && snapshot.dispatch.leaseGeneration
      === snapshot.evidenceProvenance.authorizingLeaseGeneration;
}

function matchesRecoveryPost(snapshot: TossRefundResultProvenanceSnapshot): boolean {
  return snapshot.acquisitionEvent.eventType
      === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    && snapshot.acquisitionEvent.dispatchAttempt === snapshot.dispatch.ordinal - 1
    && snapshot.dispatch.leaseGeneration
      === snapshot.evidenceProvenance.authorizingLeaseGeneration;
}
