import { createHash } from "node:crypto";
import {
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { NormalizedPersistFreshRefundExecutionObservationInput } from "../../execution-result-contract";
import { sameBindingCredential } from "./refund-authorization-identity";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  discoverTossContactOwnership,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import {
  recoveryFailure,
  recoverySuccess,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";
import {
  classifyTossRecoveryDurableState,
  coherentContactedRecoveryBase,
  latestRecoveryDispatch,
} from "./refund-recovery-state";

export async function loadCurrentTossRecoveryResultState(
  tx: Prisma.TransactionClient,
  handle: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
) {
  const ownership = await discoverTossContactOwnership(tx, handle.commandId);
  if (!ownership) return result(commandNotFound());
  const locked = await lockAndLoadTossContactState(tx, ownership, handle.commandId);
  if (!locked) return result(commandNotFound());
  const durableResult = classifyDurableResult(locked, handle.commandId);
  if (durableResult) return result(durableResult);
  const dispatch = latestRecoveryDispatch(locked);
  if (!matchesHistoricalDispatch(dispatch, handle)) return result(leaseConflict());
  if (!matchesCredentialAndLedger(locked, credential)) return result(ledgerFailure());
  if (!exactCapturedResultFence(locked, handle)) return result(leaseConflict());
  return Object.freeze({ kind: "LOADED" as const, locked, dispatch });
}

export function recoveryPersistenceInput(
  handle: TossRecoveryFenceHandle,
  observation: NormalizedPersistFreshRefundExecutionObservationInput["observation"],
): NormalizedPersistFreshRefundExecutionObservationInput {
  return Object.freeze({
    commandId: handle.commandId,
    dispatchAttempt: handle.historicalOrdinal,
    leaseGeneration: handle.recoveryGeneration,
    leaseToken: handle.recoveryToken,
    observation,
  });
}

export async function classifyTossRecoveryAfterPersistenceConflict(
  client: PrismaClient,
  commandId: string,
): Promise<RecoverTossRefundExecutionResult> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, commandId);
    if (!ownership) return commandNotFound();
    const locked = await lockAndLoadTossContactState(tx, ownership, commandId);
    if (!locked) return commandNotFound();
    return classifyDurableResult(locked, commandId) ?? persistenceConflict();
  });
}

export function isUniqueRecoveryPersistenceConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2002";
}

function classifyDurableResult(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  commandId: string,
): RecoverTossRefundExecutionResult | null {
  const durable = classifyTossRecoveryDurableState(locked);
  if (durable.kind === "FINALITY") return recoverySuccess(commandId, true);
  if (durable.kind === "MANUAL_REVIEW") return manualReview();
  if (durable.kind === "INCONSISTENT") return ledgerFailure();
  return durable.kind === "CONTACTED_WITHOUT_EVIDENCE" ? null : commandNotFound();
}

function matchesHistoricalDispatch(
  dispatch: ReturnType<typeof latestRecoveryDispatch>,
  handle: TossRecoveryFenceHandle,
): dispatch is NonNullable<typeof dispatch> {
  return dispatch !== null
    && dispatch.id === handle.historicalDispatchId
    && dispatch.ordinal === handle.historicalOrdinal;
}

function matchesCredentialAndLedger(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  credential: ConfiguredTossRefundCredential,
): boolean {
  return locked.binding !== null
    && sameBindingCredential(locked.binding, credential)
    && coherentContactedRecoveryBase(locked, credential);
}

function exactCapturedResultFence(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  handle: TossRecoveryFenceHandle,
): boolean {
  const command = locked.context.command;
  const digest = createHash("sha256").update(handle.recoveryToken, "utf8").digest("hex");
  const events = locked.history.events.filter((event) => (
    event.commandId === command.id
      && event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.leaseGeneration === handle.recoveryGeneration
      && event.dispatchAttempt === handle.historicalOrdinal
  ));
  return command.status === RefundExecutionCommandStatus.LEASED
    && command.leaseGeneration === handle.recoveryGeneration
    && command.leaseTokenHash === digest
    && command.dispatchAttempt === handle.historicalOrdinal
    && events.length === 1;
}

function result(value: RecoverTossRefundExecutionResult) {
  return Object.freeze({ kind: "RESULT" as const, result: value });
}

const commandNotFound = () => recoveryFailure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "Refund execution command is not eligible.",
);
const leaseConflict = () => recoveryFailure(
  "RECOVERY_LEASE_CONFLICT",
  "Refund recovery result fence was superseded.",
);
const manualReview = () => recoveryFailure(
  "RECOVERY_MANUAL_REVIEW_REQUIRED",
  "Toss refund recovery requires manual review.",
);
const ledgerFailure = () => recoveryFailure(
  "REFUND_LEDGER_INCONSISTENT",
  "Refund execution aggregate is inconsistent.",
);
const persistenceConflict = () => recoveryFailure(
  "PERSISTENCE_CONFLICT",
  "Toss refund recovery persistence conflicted.",
);
