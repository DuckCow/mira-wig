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
import type { ResolutionPlan } from "../../execution-result-plan";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import { buildTossResultIdentitySnapshot } from "./refund-contact-finality-snapshot";
import {
  recoveryFailure,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import { buildProviderLookupObservationIdentity } from "./refund-recovery-evidence";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";
import {
  classifyTossRecoveryAfterPersistenceConflict,
  isUniqueRecoveryPersistenceConflict,
  loadCurrentTossRecoveryResultState,
  recoveryPersistenceInput,
} from "./refund-recovery-result-state";
import {
  TOSS_RECOVERY_CONFLICT_SAFE_CODE,
  TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
  TOSS_RECOVERY_CONFLICT_TRANSITION_REASON,
} from "./refund-recovery-state";
import { isTossRefundResultBaseIdentityCoherent } from "./refund-result-identity-plan";

export async function parkTossRecoveryProviderConflict(
  client: PrismaClient,
  handle: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
): Promise<RecoverTossRefundExecutionResult> {
  try {
    return await client.$transaction((tx) => parkConflictInTransaction(
      tx,
      handle,
      credential,
    ));
  } catch (error) {
    if (error instanceof ResolutionRollbackError
      || isUniqueRecoveryPersistenceConflict(error)) {
      return classifyTossRecoveryAfterPersistenceConflict(client, handle.commandId);
    }
    throw error;
  }
}

async function parkConflictInTransaction(
  tx: Prisma.TransactionClient,
  handle: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
): Promise<RecoverTossRefundExecutionResult> {
  const loaded = await loadCurrentTossRecoveryResultState(tx, handle, credential);
  if (loaded.kind === "RESULT") return loaded.result;
  const { locked, dispatch } = loaded;
  const snapshot = buildTossResultIdentitySnapshot(
    locked,
    syntheticSuccess(locked.context.aggregate.payment.providerPaymentKey ?? "", handle.fullAmount),
    credential,
    null,
    {
      source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
      dispatchAttemptId: dispatch.id,
      authorizingLeaseGeneration: handle.recoveryGeneration,
    },
  );
  if (!snapshot || !isTossRefundResultBaseIdentityCoherent(snapshot)) return ledgerFailure();
  const observation = conflictObservation(locked.capturedAt);
  const persisted = await persistResolution(
    tx,
    locked.context,
    recoveryPersistenceInput(handle, observation),
    conflictPlan(),
    locked.capturedAt,
    {
      source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
      sourceDedupKey: buildProviderLookupObservationIdentity(
        handle.commandId,
        handle.recoveryGeneration,
      ),
      dispatchAttemptId: dispatch.id,
      authorizingLeaseGeneration: handle.recoveryGeneration,
    },
  );
  return persisted.ok ? manualReview() : ledgerFailure();
}

function conflictObservation(
  observedAt: Date,
): NormalizedPersistFreshRefundExecutionObservationInput["observation"] {
  return Object.freeze({
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    observedProviderRefundId: null,
    reportedAmount: null,
    reportedCurrency: null,
    safeCode: TOSS_RECOVERY_CONFLICT_SAFE_CODE,
    safeMessage: TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
    observedAt: new Date(observedAt.getTime()),
  });
}

function conflictPlan(): ResolutionPlan {
  return {
    application: RefundExecutionEvidenceApplication.CONFLICT,
    diagnostic: {
      safeCode: TOSS_RECOVERY_CONFLICT_SAFE_CODE,
      safeMessage: TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
    },
    attemptStatus: RefundAttemptStatus.MANUAL_REVIEW,
    commandStatus: RefundExecutionCommandStatus.PARKED,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: null,
    transitionReason: TOSS_RECOVERY_CONFLICT_TRANSITION_REASON,
  };
}

function syntheticSuccess(paymentKey: string, amount: number) {
  return Object.freeze({
    paymentKey,
    currency: "KRW" as const,
    paymentStatus: "CANCELED" as const,
    totalAmount: amount,
    balanceAmount: 0 as const,
    transactionKey: "recovery-conflict-validation",
    cancelStatus: "DONE" as const,
    cancelAmount: amount,
    cancelReason: "Mira merchant refund" as const,
  });
}

const manualReview = () => recoveryFailure(
  "RECOVERY_MANUAL_REVIEW_REQUIRED",
  "Toss refund recovery requires manual review.",
);
const ledgerFailure = () => recoveryFailure(
  "REFUND_LEDGER_INCONSISTENT",
  "Refund execution aggregate is inconsistent.",
);
