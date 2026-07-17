import { createHash } from "node:crypto";
import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { NormalizedPersistFreshRefundExecutionObservationInput } from "../../execution-result-contract";
import {
  persistResolution,
  ResolutionRollbackError,
} from "../../execution-result-persistence";
import {
  EXECUTION_SUCCEEDED_TRANSITION_REASON,
  hasRefundProviderIdentityConflict,
  type ResolutionPlan,
} from "../../execution-result-plan";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import { buildTossResultIdentitySnapshot } from "./refund-contact-finality-snapshot";
import {
  discoverTossContactOwnership,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import type { TossRefundCancellationSuccessCandidate } from "./refund-cancellation-response";
import {
  recoveryFailure,
  recoverySuccess,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import type { TossRecoveryContactHandle } from "./refund-recovery-ordinal-admission";
import {
  classifyTossRecoveryAfterPersistenceConflict,
  isUniqueRecoveryPersistenceConflict,
} from "./refund-recovery-result-state";
import { coherentContactedRecoveryBase } from "./refund-recovery-state";
import { planTossRefundResultIdentity } from "./refund-result-identity-plan";

export async function applyTossRecoveryPostSuccess(
  client: PrismaClient,
  handle: TossRecoveryContactHandle,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
): Promise<RecoverTossRefundExecutionResult> {
  try {
    return await client.$transaction((tx) => applyInTransaction(
      tx,
      handle,
      credential,
      success,
    ));
  } catch (error) {
    if (error instanceof ResolutionRollbackError
      || isUniqueRecoveryPersistenceConflict(error)) {
      return classifyTossRecoveryAfterPersistenceConflict(
        client,
        handle.fence.commandId,
      );
    }
    throw error;
  }
}

async function applyInTransaction(
  tx: Prisma.TransactionClient,
  handle: TossRecoveryContactHandle,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
): Promise<RecoverTossRefundExecutionResult> {
  const loaded = await loadPostResultState(tx, handle, credential, success);
  if (loaded.kind === "RESULT") return loaded.result;
  return persistPostSuccess(tx, loaded.locked, handle, success, loaded.provenance);
}

async function loadPostResultState(
  tx: Prisma.TransactionClient,
  handle: TossRecoveryContactHandle,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
) {
  const ownership = await discoverTossContactOwnership(tx, handle.fence.commandId);
  if (!ownership) return postResult(commandNotFound());
  const locked = await lockAndLoadTossContactState(tx, ownership, handle.fence.commandId);
  if (!locked) return postResult(commandNotFound());
  const dispatch = locked.history.dispatchAttempts.find(
    (row) => row.id === handle.dispatchAttemptId && row.ordinal === 2,
  );
  const stateValid = [
    dispatch !== undefined,
    exactPostFence(locked, handle),
    locked.evidence.length === 0,
    coherentContactedRecoveryBase(locked, credential),
  ].every(Boolean);
  if (!dispatch || !stateValid) return postResult(leaseConflict());
  const provenance = Object.freeze({
    source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    dispatchAttemptId: dispatch.id,
    authorizingLeaseGeneration: handle.fence.recoveryGeneration,
  });
  const snapshot = buildTossResultIdentitySnapshot(
    locked,
    success,
    credential,
    null,
    provenance,
  );
  if (!snapshot || !planTossRefundResultIdentity(snapshot).ok) {
    return postResult(ledgerFailure());
  }
  return Object.freeze({ kind: "LOADED" as const, locked, provenance });
}

async function persistPostSuccess(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  handle: TossRecoveryContactHandle,
  success: TossRefundCancellationSuccessCandidate,
  provenance: Readonly<{
    source: typeof RefundExecutionEvidenceSource.ADAPTER_RESPONSE;
    dispatchAttemptId: string;
    authorizingLeaseGeneration: number;
  }>,
): Promise<RecoverTossRefundExecutionResult> {
  const observation = successObservation(success, locked.capturedAt);
  if (await hasRefundProviderIdentityConflict(tx, locked.context.target, observation)) {
    return ledgerFailure();
  }
  const persisted = await persistResolution(
    tx,
    locked.context,
    persistenceInput(handle, observation),
    successPlan(success.transactionKey, locked.capturedAt),
    locked.capturedAt,
    provenance,
  );
  return persisted.ok ? recoverySuccess(handle.fence.commandId, false) : ledgerFailure();
}

function exactPostFence(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  handle: TossRecoveryContactHandle,
): boolean {
  const command = locked.context.command;
  const digest = createHash("sha256")
      .update(handle.fence.recoveryToken, "utf8")
      .digest("hex");
  return [
    command.status === RefundExecutionCommandStatus.LEASED,
    command.dispatchAttempt === 2,
    command.leaseGeneration === handle.fence.recoveryGeneration,
    command.leaseTokenHash === digest,
    locked.contactProofs.some(
      (proof) => proof.dispatchAttemptId === handle.dispatchAttemptId,
    ),
    !locked.history.dispatchAttempts.some((dispatch) => dispatch.ordinal > 2),
  ].every(Boolean);
}

function postResult(result: RecoverTossRefundExecutionResult) {
  return Object.freeze({ kind: "RESULT" as const, result });
}

function persistenceInput(
  handle: TossRecoveryContactHandle,
  observation: NormalizedPersistFreshRefundExecutionObservationInput["observation"],
): NormalizedPersistFreshRefundExecutionObservationInput {
  return Object.freeze({
    commandId: handle.fence.commandId,
    dispatchAttempt: 2,
    leaseGeneration: handle.fence.recoveryGeneration,
    leaseToken: handle.fence.recoveryToken,
    observation,
  });
}

function successObservation(
  success: TossRefundCancellationSuccessCandidate,
  observedAt: Date,
): NormalizedPersistFreshRefundExecutionObservationInput["observation"] {
  return Object.freeze({
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: success.transactionKey,
    reportedAmount: success.cancelAmount,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(observedAt.getTime()),
  });
}

function successPlan(transactionKey: string, capturedAt: Date): ResolutionPlan {
  return {
    application: RefundExecutionEvidenceApplication.APPLIED,
    diagnostic: { safeCode: null, safeMessage: null },
    attemptStatus: RefundAttemptStatus.SUCCEEDED,
    commandStatus: RefundExecutionCommandStatus.DONE,
    orderStatus: OrderStatus.REFUNDED,
    processedAt: capturedAt,
    failedAt: null,
    providerRefundId: transactionKey,
    transitionReason: EXECUTION_SUCCEEDED_TRANSITION_REASON,
  };
}

const commandNotFound = () => recoveryFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const leaseConflict = () => recoveryFailure("RECOVERY_LEASE_CONFLICT", "Refund recovery result fence was superseded.");
const ledgerFailure = () => recoveryFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
