import {
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";

const INTERNAL_ID_MAX_CODE_POINTS = 128;
const POSTGRES_INT_MAX = 2_147_483_647;

export type RecoveryDispatchReference = Readonly<{
  id: string;
  ordinal: number;
  state: RefundExecutionDispatchAttemptState;
  contactMarkedAt: number | null;
  hasContactProof: boolean;
}>;

export type TossProviderLookupEvidencePlan = Readonly<{
  source: typeof RefundExecutionEvidenceSource.PROVIDER_LOOKUP;
  outcome: RefundExecutionEvidenceOutcome;
  application: RefundExecutionEvidenceApplication;
  sourceDedupKey: string;
  dispatchAttemptId: string;
  authorizingLeaseGeneration: number;
}>;

export function buildTerminalRefundResultIdentity(commandId: string, ordinal: number): string {
  assertIdentityParts(commandId, ordinal);
  return `refund-result:${commandId}:${ordinal}`;
}

export function buildProviderLookupObservationIdentity(
  commandId: string,
  recoveryGeneration: number,
): string {
  assertIdentityParts(commandId, recoveryGeneration);
  return `refund-provider-lookup:${commandId}:${recoveryGeneration}`;
}

export function latestContactedDispatch(
  dispatches: readonly RecoveryDispatchReference[],
): RecoveryDispatchReference | null {
  if (dispatches.some((row) => row.state === RefundExecutionDispatchAttemptState.AUTHORIZED)) {
    return null;
  }
  const contacted = dispatches.filter((row) => (
    row.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
      && row.contactMarkedAt !== null
      && row.hasContactProof
      && validPositiveInteger(row.ordinal)
      && validInternalId(row.id)
  ));
  if (contacted.length !== dispatches.length || contacted.length === 0) return null;
  return contacted.reduce((latest, row) => row.ordinal > latest.ordinal ? row : latest);
}

export function planProviderLookupSuccessEvidence(input: Readonly<{
  commandId: string;
  recoveryGeneration: number;
  dispatches: readonly RecoveryDispatchReference[];
}>): TossProviderLookupEvidencePlan | null {
  const dispatch = latestContactedDispatch(input.dispatches);
  if (!dispatch || !validPositiveInteger(input.recoveryGeneration)) return null;
  return Object.freeze({
    source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    application: RefundExecutionEvidenceApplication.APPLIED,
    sourceDedupKey: buildTerminalRefundResultIdentity(input.commandId, dispatch.ordinal),
    dispatchAttemptId: dispatch.id,
    authorizingLeaseGeneration: input.recoveryGeneration,
  });
}

export function planProviderLookupNonterminalEvidence(input: Readonly<{
  commandId: string;
  recoveryGeneration: number;
  dispatches: readonly RecoveryDispatchReference[];
  disposition: "PROCESSING" | "CONFLICT";
}>): TossProviderLookupEvidencePlan | null {
  const dispatch = latestContactedDispatch(input.dispatches);
  if (!dispatch || !validPositiveInteger(input.recoveryGeneration)) return null;
  return Object.freeze({
    source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    application: input.disposition === "PROCESSING"
      ? RefundExecutionEvidenceApplication.PARKED
      : RefundExecutionEvidenceApplication.CONFLICT,
    sourceDedupKey: buildProviderLookupObservationIdentity(
      input.commandId, input.recoveryGeneration,
    ),
    dispatchAttemptId: dispatch.id,
    authorizingLeaseGeneration: input.recoveryGeneration,
  });
}

function assertIdentityParts(commandId: string, value: number): void {
  if (!validInternalId(commandId) || !validPositiveInteger(value)) {
    throw new Error("Refund recovery evidence identity input is invalid.");
  }
}

function validInternalId(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0
    && Array.from(value).length <= INTERNAL_ID_MAX_CODE_POINTS && !/\p{Cc}/u.test(value);
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= POSTGRES_INT_MAX;
}
