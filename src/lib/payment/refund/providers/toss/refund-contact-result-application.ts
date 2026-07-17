import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { isDispatchAuthorizationLedgerCoherent } from "../../dispatch-authorization-contract";
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
import {
  contactFailure,
  contactSuccess,
  type ExecuteTossRefundContactResult,
  type NormalizedExecuteTossRefundContactInput,
} from "./refund-contact-contract";
import {
  classifyTossContactDurableState,
} from "./refund-contact-finality";
import { buildTossResultIdentitySnapshot } from "./refund-contact-finality-snapshot";
import {
  discoverTossContactOwnership,
  exactPostContactFence,
  hasAtomicContactMarker,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import type { TossRefundCancellationSuccessCandidate } from "./refund-cancellation-response";
import { planTossRefundResultIdentity } from "./refund-result-identity-plan";

export async function applyTossContactSuccess(
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
): Promise<ExecuteTossRefundContactResult> {
  try {
    return await client.$transaction((tx) => applyInTransaction(
      tx, input, credential, success,
    ));
  } catch (error) {
    if (error instanceof ResolutionRollbackError || isUniqueConflict(error)) {
      return classifyAfterPersistenceConflict(client, input.commandId);
    }
    throw error;
  }
}

async function applyInTransaction(
  tx: Prisma.TransactionClient,
  input: NormalizedExecuteTossRefundContactInput,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
): Promise<ExecuteTossRefundContactResult> {
  const ownership = await discoverTossContactOwnership(tx, input.commandId);
  if (!ownership) return commandNotFound();
  const locked = await lockAndLoadTossContactState(tx, ownership, input.commandId);
  if (!locked) return commandNotFound();
  const validation = validateApplicationState(locked, input, credential, success);
  if (validation) return validation;
  const observation = successRefundObservation(success, locked.capturedAt);
  const conflict = await hasRefundProviderIdentityConflict(tx, locked.context.target, observation);
  if (conflict) return ledgerFailure();
  const persisted = await persistResolution(
    tx,
    {
      aggregate: locked.context.aggregate,
      target: locked.context.target,
      command: locked.context.command,
    },
    resultPersistenceInput(input, observation),
    successPlan(success.transactionKey, locked.capturedAt),
    locked.capturedAt,
    initialTossEvidenceProvenance(locked),
  );
  return persisted.ok ? contactSuccess(input.commandId, false) : ledgerFailure();
}

function initialTossEvidenceProvenance(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
) {
  const dispatch = locked.history.dispatchAttempts[0];
  if (!dispatch) throw new Error("Toss refund dispatch provenance is unavailable.");
  return Object.freeze({
    dispatchAttemptId: dispatch.id,
    authorizingLeaseGeneration: locked.context.command.leaseGeneration,
  });
}

function validateApplicationState(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  input: NormalizedExecuteTossRefundContactInput,
  credential: ConfiguredTossRefundCredential,
  success: TossRefundCancellationSuccessCandidate,
): ExecuteTossRefundContactResult | null {
  if (!exactPostContactFence(locked, input) || !hasAtomicContactMarker(locked)) {
    return ledgerFailure();
  }
  if (locked.evidence.length !== 0 || locked.structure.kind !== "contacted"
    || !isDispatchAuthorizationLedgerCoherent(
      locked.context, locked.history, locked.structure,
    )) return ledgerFailure();
  const snapshot = buildTossResultIdentitySnapshot(locked, success, credential);
  return snapshot && planTossRefundResultIdentity(snapshot).ok ? null : ledgerFailure();
}

function successRefundObservation(
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

function resultPersistenceInput(
  input: NormalizedExecuteTossRefundContactInput,
  observation: NormalizedPersistFreshRefundExecutionObservationInput["observation"],
): NormalizedPersistFreshRefundExecutionObservationInput {
  return Object.freeze({
    commandId: input.commandId,
    dispatchAttempt: 1,
    leaseGeneration: input.leaseGeneration,
    leaseToken: input.leaseToken,
    observation,
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

async function classifyAfterPersistenceConflict(
  client: PrismaClient,
  commandId: string,
): Promise<ExecuteTossRefundContactResult> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, commandId);
    if (!ownership) return commandNotFound();
    const locked = await lockAndLoadTossContactState(tx, ownership, commandId);
    if (!locked) return commandNotFound();
    const classification = classifyTossContactDurableState(locked);
    if (classification.kind === "result" && classification.result.ok) {
      return classification.result;
    }
    return classification.kind === "result"
      && !classification.result.ok
      && classification.result.code === "REFUND_LEDGER_INCONSISTENT"
      ? classification.result
      : persistenceFailure();
  });
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

const commandNotFound = () => contactFailure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.",
);
const ledgerFailure = () => contactFailure(
  "REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.",
);
const persistenceFailure = () => contactFailure(
  "PERSISTENCE_CONFLICT", "Toss refund result persistence conflicted.",
);
