import { createHash } from "node:crypto";
import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { TossRecoveryEnv } from "./refund-recovery-config";
import {
  recoveryFailure,
  recoverySuccess,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import {
  deriveDurableTossRefundRequest,
} from "./refund-authorization-identity";
import { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  buildTossRefundContactEligibilityProofCandidate,
} from "./refund-contact-eligibility";
import {
  contactProofData,
  discoverTossContactOwnership,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import { parkTossRecoveryLocalExhaustion } from "./refund-recovery-exhaustion-parking";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";
import type { TossRefundRecoveryEligibility } from "./refund-recovery-lookup";
import {
  classifyTossRecoveryDurableState,
} from "./refund-recovery-state";
import {
  currentAdmissionCredential,
  isOrdinalTwoPlanCoherent,
  isRecoveryAdmissionFresh,
  recoveryAdmissionBaseFailure,
  recoveryAdmissionWindow,
} from "./refund-recovery-admission-state";

export type TossRecoveryContactHandle = Readonly<{
  fence: TossRecoveryFenceHandle;
  dispatchAttemptId: string;
  ordinal: 2;
  providerOperationKey: string;
  paymentKey: string;
  fullAmount: number;
}>;

export type TossRecoveryOrdinalAdmissionResult =
  | Readonly<{ kind: "CONTACT"; handle: TossRecoveryContactHandle }>
  | Readonly<{ kind: "RESULT"; result: RecoverTossRefundExecutionResult }>;

class TossRecoveryAdmissionRollbackError extends Error {}

export async function admitTossRecoveryOrdinalTwo(
  client: PrismaClient,
  fence: TossRecoveryFenceHandle,
  capturedCredential: ConfiguredTossRefundCredential,
  eligibility: TossRefundRecoveryEligibility,
  env: TossRecoveryEnv,
): Promise<TossRecoveryOrdinalAdmissionResult> {
  try {
    return await client.$transaction((tx) => admitInTransaction(
      tx,
      fence,
      capturedCredential,
      eligibility,
      env,
    ));
  } catch (error) {
    if (error instanceof TossRecoveryAdmissionRollbackError || isPersistenceConflict(error)) {
      return classifyAdmissionConflict(client, fence.commandId);
    }
    throw error;
  }
}

async function admitInTransaction(
  tx: Prisma.TransactionClient,
  fence: TossRecoveryFenceHandle,
  capturedCredential: ConfiguredTossRefundCredential,
  eligibility: TossRefundRecoveryEligibility,
  env: TossRecoveryEnv,
): Promise<TossRecoveryOrdinalAdmissionResult> {
  const ownership = await discoverTossContactOwnership(tx, fence.commandId);
  if (!ownership) return result(commandNotFound());
  const locked = await lockAndLoadTossContactState(tx, ownership, fence.commandId);
  if (!locked) return result(commandNotFound());
  return admitLockedState(tx, locked, fence, capturedCredential, eligibility, env);
}

async function admitLockedState(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  fence: TossRecoveryFenceHandle,
  capturedCredential: ConfiguredTossRefundCredential,
  eligibility: TossRefundRecoveryEligibility,
  env: TossRecoveryEnv,
): Promise<TossRecoveryOrdinalAdmissionResult> {
  const durable = durableResult(locked, fence.commandId);
  if (durable) return result(durable);
  const baseFailure = recoveryAdmissionBaseFailure(
    locked, fence, capturedCredential, eligibility,
  );
  if (baseFailure) return result(baseFailure);
  const window = recoveryAdmissionWindow(locked);
  if (!window.ok) return handleWindowFailure(tx, locked, fence, window.code);
  const currentCredential = currentAdmissionCredential(locked, capturedCredential, env);
  if (!(currentCredential instanceof ConfiguredTossRefundCredential)) {
    return result(currentCredential);
  }
  if (!isRecoveryAdmissionFresh(locked, fence)) return result(recontactRequired());
  const request = deriveDurableTossRefundRequest(locked.context);
  if (!request || !isOrdinalTwoPlanCoherent(
    locked, fence, currentCredential, eligibility,
  )) return result(ledgerFailure());
  return persistAdmission(tx, locked, fence, eligibility, request.providerOperationKey);
}

async function persistAdmission(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  fence: TossRecoveryFenceHandle,
  eligibility: TossRefundRecoveryEligibility,
  providerOperationKey: string,
): Promise<TossRecoveryOrdinalAdmissionResult> {
  const request = deriveDurableTossRefundRequest(locked.context);
  if (!request) return result(ledgerFailure());
  const dispatch = await insertContactedDispatch(
    tx, locked, fence, providerOperationKey, request.neutralFingerprint,
  );
  await insertProofAndAdvanceCommand(tx, locked, fence, eligibility, dispatch.id);
  return contactHandle(fence, dispatch.id, providerOperationKey);
}

async function insertContactedDispatch(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  fence: TossRecoveryFenceHandle,
  providerOperationKey: string,
  requestFingerprint: string,
) {
  return tx.refundExecutionDispatchAttempt.create({ data: {
    commandId: fence.commandId,
    ordinal: 2,
    leaseGeneration: fence.recoveryGeneration,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerOperationKey,
    requestFingerprint,
    state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
    authorizedAt: locked.capturedAt,
    contactMarkedAt: locked.capturedAt,
  } });
}

async function insertProofAndAdvanceCommand(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  fence: TossRecoveryFenceHandle,
  eligibility: TossRefundRecoveryEligibility,
  dispatchAttemptId: string,
): Promise<void> {
  const proof = buildTossRefundContactEligibilityProofCandidate(eligibility);
  await tx.refundExecutionProviderContactEligibilityProof.create({
    data: contactProofData(proof, dispatchAttemptId),
  });
  const command = await tx.refundExecutionCommand.updateMany({
    where: {
      id: fence.commandId,
      refundAttemptId: locked.context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: 1,
      leaseGeneration: fence.recoveryGeneration,
      leaseTokenHash: tokenDigest(fence.recoveryToken),
      leaseUntil: { gt: locked.capturedAt },
    },
    data: { dispatchAttempt: 2 },
  });
  if (command.count !== 1) throw new TossRecoveryAdmissionRollbackError();
}

function contactHandle(
  fence: TossRecoveryFenceHandle,
  dispatchAttemptId: string,
  providerOperationKey: string,
): TossRecoveryOrdinalAdmissionResult {
  return Object.freeze({
    kind: "CONTACT",
    handle: Object.freeze({
      fence,
      dispatchAttemptId,
      ordinal: 2 as const,
      providerOperationKey,
      paymentKey: fence.paymentKey,
      fullAmount: fence.fullAmount,
    }),
  });
}

async function handleWindowFailure(
  tx: Prisma.TransactionClient,
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  fence: TossRecoveryFenceHandle,
  code: "REFUND_LEDGER_INCONSISTENT" | "RECOVERY_DEADLINE_EXPIRED"
    | "RECOVERY_ORDINAL_LIMIT_REACHED" | "RECOVERY_INTERVAL_NOT_ELAPSED",
): Promise<TossRecoveryOrdinalAdmissionResult> {
  if (code === "RECOVERY_DEADLINE_EXPIRED" || code === "RECOVERY_ORDINAL_LIMIT_REACHED") {
    await parkTossRecoveryLocalExhaustion(
      tx,
      locked,
      fence,
      code === "RECOVERY_DEADLINE_EXPIRED" ? "DEADLINE" : "ORDINAL_LIMIT",
    );
  }
  return result(recoveryFailure(code, failureMessage(code)));
}

async function classifyAdmissionConflict(
  client: PrismaClient,
  commandId: string,
): Promise<TossRecoveryOrdinalAdmissionResult> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, commandId);
    if (!ownership) return result(commandNotFound());
    const locked = await lockAndLoadTossContactState(tx, ownership, commandId);
    if (!locked) return result(commandNotFound());
    const durable = durableResult(locked, commandId);
    return result(durable ?? persistenceConflict());
  });
}

function durableResult(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  commandId: string,
): RecoverTossRefundExecutionResult | null {
  const durable = classifyTossRecoveryDurableState(locked);
  if (durable.kind === "FINALITY") return recoverySuccess(commandId, true);
  if (durable.kind === "MANUAL_REVIEW") return manualReview();
  if (durable.kind === "INCONSISTENT") return ledgerFailure();
  return durable.kind === "CONTACTED_WITHOUT_EVIDENCE" ? null : commandNotFound();
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function result(value: RecoverTossRefundExecutionResult): TossRecoveryOrdinalAdmissionResult {
  return Object.freeze({ kind: "RESULT", result: value });
}

function isPersistenceConflict(error: unknown): boolean {
  return error instanceof Error && ["PrismaClientKnownRequestError", "DriverAdapterError"]
    .includes(error.name);
}

function failureMessage(code: string): string {
  if (code === "RECOVERY_DEADLINE_EXPIRED") return "Toss refund recovery deadline expired.";
  if (code === "RECOVERY_ORDINAL_LIMIT_REACHED") return "Toss refund recovery contact limit was reached.";
  if (code === "RECOVERY_INTERVAL_NOT_ELAPSED") return "Toss refund recovery interval has not elapsed.";
  return "Refund execution aggregate is inconsistent.";
}

const commandNotFound = () => recoveryFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const recontactRequired = () => recoveryFailure("RECOVERY_RECONTACT_REQUIRED", "Toss refund recovery requires separately authorized recontact.");
const manualReview = () => recoveryFailure("RECOVERY_MANUAL_REVIEW_REQUIRED", "Toss refund recovery requires manual review.");
const ledgerFailure = () => recoveryFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
const persistenceConflict = () => recoveryFailure("PERSISTENCE_CONFLICT", "Toss refund recovery admission conflicted.");
