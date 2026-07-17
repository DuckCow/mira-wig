import { createHash, randomBytes } from "node:crypto";
import {
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { REFUND_EXECUTION_LEASE_DURATION_MS } from "../../acquire-lease";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  recoveryFailure,
  recoverySuccess,
  type NormalizedTossRefundRecoveryInput,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import {
  classifyTossRecoveryDurableState,
  coherentContactedRecoveryBase,
  latestRecoveryDispatch,
} from "./refund-recovery-state";
import {
  discoverTossContactOwnership,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import { sameBindingCredential } from "./refund-authorization-identity";

const POSTGRES_INT_MAX = 2_147_483_647;

export type TossRecoveryFenceHandle = Readonly<{
  commandId: string;
  recoveryGeneration: number;
  recoveryToken: string;
  historicalDispatchId: string;
  historicalOrdinal: number;
  paymentKey: string;
  fullAmount: number;
  fenceCapturedAtEpochMs: number;
}>;

export type AcquireTossRecoveryFenceResult =
  | Readonly<{ kind: "ACQUIRED"; handle: TossRecoveryFenceHandle }>
  | Readonly<{ kind: "RESULT"; result: RecoverTossRefundExecutionResult }>;

class RecoveryFenceConflictRollbackError extends Error {}
class RecoveryFencePersistenceRollbackError extends Error {}

export async function acquireTossRecoveryFence(
  client: PrismaClient,
  input: NormalizedTossRefundRecoveryInput,
  credential: ConfiguredTossRefundCredential,
): Promise<AcquireTossRecoveryFenceResult> {
  try {
    return await client.$transaction((tx) => acquireInTransaction(
      tx,
      input,
      credential,
    ));
  } catch (error) {
    if (error instanceof RecoveryFenceConflictRollbackError || isUniqueConflict(error)) {
      return result(leaseConflict());
    }
    if (error instanceof RecoveryFencePersistenceRollbackError || isDatabaseWriteError(error)) {
      return result(persistenceConflict());
    }
    throw error;
  }
}

async function acquireInTransaction(
  tx: Prisma.TransactionClient,
  input: NormalizedTossRefundRecoveryInput,
  credential: ConfiguredTossRefundCredential,
): Promise<AcquireTossRecoveryFenceResult> {
  const ownership = await discoverTossContactOwnership(tx, input.commandId);
  if (!ownership) return result(commandNotFound());
  const locked = await lockAndLoadTossContactState(tx, ownership, input.commandId);
  if (!locked) return result(commandNotFound());
  const candidate = validateRecoveryFenceCandidate(locked, credential);
  if (candidate.kind === "RESULT") return candidate;
  return persistRecoveryFence(tx, input, locked, candidate);
}

function validateRecoveryFenceCandidate(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  credential: ConfiguredTossRefundCredential,
) {
  const durableResult = recoveryFenceDurableResult(locked);
  if (durableResult) return result(durableResult);
  if (!locked.binding || !sameBindingCredential(locked.binding, credential)) {
    return result(credentialUnavailable());
  }
  if (!coherentContactedRecoveryBase(locked, credential)) return result(ledgerFailure());
  const commandResult = recoveryCommandFailure(locked);
  if (commandResult) return result(commandResult);
  const dispatch = latestRecoveryDispatch(locked);
  const paymentKey = locked.context.aggregate.payment.providerPaymentKey;
  if (!dispatch || !paymentKey) return result(ledgerFailure());
  return Object.freeze({ kind: "CANDIDATE" as const, dispatch, paymentKey });
}

function recoveryFenceDurableResult(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
): RecoverTossRefundExecutionResult | null {
  const durable = classifyTossRecoveryDurableState(locked);
  if (durable.kind === "FINALITY") {
    return recoverySuccess(locked.context.command.id, true);
  }
  if (durable.kind === "MANUAL_REVIEW") return manualReview();
  if (durable.kind === "INCONSISTENT") return ledgerFailure();
  return durable.kind === "CONTACTED_WITHOUT_EVIDENCE" ? null : commandNotFound();
}

function recoveryCommandFailure(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
): RecoverTossRefundExecutionResult | null {
  const command = locked.context.command;
  if (!command.leaseUntil || command.leaseUntil.getTime() > locked.capturedAt.getTime()) {
    return leaseConflict();
  }
  return Number.isSafeInteger(command.leaseGeneration)
    && command.leaseGeneration >= 1
    && command.leaseGeneration < POSTGRES_INT_MAX
    ? null
    : ledgerFailure();
}

async function persistRecoveryFence(
  tx: Prisma.TransactionClient,
  input: NormalizedTossRefundRecoveryInput,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  candidate: Readonly<{
    kind: "CANDIDATE";
    dispatch: NonNullable<ReturnType<typeof latestRecoveryDispatch>>;
    paymentKey: string;
  }>,
): Promise<AcquireTossRecoveryFenceResult> {
  const command = locked.context.command;
  const recoveryGeneration = command.leaseGeneration + 1;
  const recoveryToken = randomBytes(32).toString("hex");
  const recoveryTokenHash = createHash("sha256")
    .update(recoveryToken, "utf8")
    .digest("hex");
  const leaseUntil = new Date(
    locked.capturedAt.getTime() + REFUND_EXECUTION_LEASE_DURATION_MS,
  );
  const updated = await updateRecoveryCommand(
    tx,
    input,
    locked,
    recoveryGeneration,
    recoveryTokenHash,
    leaseUntil,
  );
  if (updated !== 1) throw new RecoveryFenceConflictRollbackError();
  await insertRecoveryEvent(
    tx,
    command.id,
    recoveryGeneration,
    candidate.dispatch.ordinal,
    locked.capturedAt,
  );
  return acquired(buildRecoveryFenceHandle(locked, candidate, recoveryGeneration, recoveryToken));
}

function buildRecoveryFenceHandle(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  candidate: Readonly<{
    dispatch: NonNullable<ReturnType<typeof latestRecoveryDispatch>>;
    paymentKey: string;
  }>,
  recoveryGeneration: number,
  recoveryToken: string,
): TossRecoveryFenceHandle {
  return Object.freeze({
    commandId: locked.context.command.id,
    recoveryGeneration,
    recoveryToken,
    historicalDispatchId: candidate.dispatch.id,
    historicalOrdinal: candidate.dispatch.ordinal,
    paymentKey: candidate.paymentKey,
    fullAmount: locked.context.target.amount,
    fenceCapturedAtEpochMs: locked.capturedAt.getTime(),
  });
}

async function updateRecoveryCommand(
  tx: Prisma.TransactionClient,
  input: NormalizedTossRefundRecoveryInput,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  recoveryGeneration: number,
  recoveryTokenHash: string,
  leaseUntil: Date,
): Promise<number> {
  const command = locked.context.command;
  const updated = await tx.refundExecutionCommand.updateMany({
    where: {
      id: command.id,
      refundAttemptId: locked.context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: command.dispatchAttempt,
      leaseGeneration: command.leaseGeneration,
      leaseOwner: command.leaseOwner,
      leaseUntil: command.leaseUntil,
      leaseTokenHash: command.leaseTokenHash,
    },
    data: {
      leaseOwner: input.recoveryOwner,
      leaseUntil,
      leaseGeneration: recoveryGeneration,
      leaseTokenHash: recoveryTokenHash,
    },
  });
  return updated.count;
}

async function insertRecoveryEvent(
  tx: Prisma.TransactionClient,
  commandId: string,
  recoveryGeneration: number,
  historicalOrdinal: number,
  occurredAt: Date,
): Promise<void> {
  try {
    await tx.refundExecutionCommandEvent.create({
      data: {
        commandId,
        eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
        leaseGeneration: recoveryGeneration,
        dispatchAttempt: historicalOrdinal,
        occurredAt,
      },
    });
  } catch {
    throw new RecoveryFencePersistenceRollbackError();
  }
}

function acquired(
  handle: TossRecoveryFenceHandle,
): Extract<AcquireTossRecoveryFenceResult, { kind: "ACQUIRED" }> {
  return Object.freeze({ kind: "ACQUIRED", handle: Object.freeze(handle) });
}

function result(
  value: RecoverTossRefundExecutionResult,
): Extract<AcquireTossRecoveryFenceResult, { kind: "RESULT" }> {
  return Object.freeze({ kind: "RESULT", result: value });
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2002";
}

function isDatabaseWriteError(error: unknown): boolean {
  return error instanceof Error && ["PrismaClientKnownRequestError", "DriverAdapterError"]
    .includes(error.name);
}

const commandNotFound = () => recoveryFailure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "Refund execution command is not eligible.",
);
const leaseConflict = () => recoveryFailure(
  "RECOVERY_LEASE_CONFLICT",
  "Refund recovery lease acquisition conflicted.",
);
const credentialUnavailable = () => recoveryFailure(
  "RECOVERY_CREDENTIAL_UNAVAILABLE",
  "Toss refund recovery credential is unavailable.",
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
  "Toss refund recovery fence persistence conflicted.",
);
