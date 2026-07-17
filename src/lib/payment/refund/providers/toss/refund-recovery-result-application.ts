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
import type { LockedTossContactState } from "./refund-contact-state";
import {
  recoveryFailure,
  recoverySuccess,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import { buildTerminalRefundResultIdentity } from "./refund-recovery-evidence";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";
import type { TossRefundRecoverySuccess } from "./refund-recovery-lookup";
import {
  classifyTossRecoveryAfterPersistenceConflict,
  isUniqueRecoveryPersistenceConflict,
  loadCurrentTossRecoveryResultState,
  recoveryPersistenceInput,
} from "./refund-recovery-result-state";
import { planTossRefundResultIdentity } from "./refund-result-identity-plan";

export async function applyTossRecoveryLookupSuccess(
  client: PrismaClient,
  handle: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundRecoverySuccess,
): Promise<RecoverTossRefundExecutionResult> {
  try {
    return await client.$transaction((tx) => applySuccessInTransaction(
      tx,
      handle,
      credential,
      success,
    ));
  } catch (error) {
    if (error instanceof ResolutionRollbackError
      || isUniqueRecoveryPersistenceConflict(error)) {
      return classifyTossRecoveryAfterPersistenceConflict(client, handle.commandId);
    }
    throw error;
  }
}

async function applySuccessInTransaction(
  tx: Prisma.TransactionClient,
  handle: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundRecoverySuccess,
): Promise<RecoverTossRefundExecutionResult> {
  const loaded = await loadCurrentTossRecoveryResultState(tx, handle, credential);
  if (loaded.kind === "RESULT") return loaded.result;
  const { locked, dispatch } = loaded;
  const provenance = Object.freeze({
    source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    dispatchAttemptId: dispatch.id,
    authorizingLeaseGeneration: handle.recoveryGeneration,
  });
  const snapshot = buildTossResultIdentitySnapshot(
    locked,
    successCandidate(success),
    credential,
    null,
    provenance,
  );
  if (!snapshot || !planTossRefundResultIdentity(snapshot).ok) return ledgerFailure();
  return persistSuccess(tx, locked, handle, success, provenance);
}

async function persistSuccess(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  handle: TossRecoveryFenceHandle,
  success: TossRefundRecoverySuccess,
  provenance: Readonly<{
    source: typeof RefundExecutionEvidenceSource.PROVIDER_LOOKUP;
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
    recoveryPersistenceInput(handle, observation),
    successPlan(success.transactionKey, locked.capturedAt),
    locked.capturedAt,
    {
      ...provenance,
      sourceDedupKey: buildTerminalRefundResultIdentity(
        handle.commandId,
        handle.historicalOrdinal,
      ),
    },
  );
  return persisted.ok ? recoverySuccess(handle.commandId, false) : ledgerFailure();
}

function successCandidate(success: TossRefundRecoverySuccess) {
  return Object.freeze({
    paymentKey: success.paymentKey,
    currency: success.currency,
    paymentStatus: success.paymentStatus,
    totalAmount: success.totalAmount,
    balanceAmount: success.balanceAmount,
    transactionKey: success.transactionKey,
    cancelStatus: success.cancelStatus,
    cancelAmount: success.cancelAmount,
    cancelReason: success.cancelReason,
  });
}

function successObservation(
  success: TossRefundRecoverySuccess,
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

const ledgerFailure = () => recoveryFailure(
  "REFUND_LEDGER_INCONSISTENT",
  "Refund execution aggregate is inconsistent.",
);
