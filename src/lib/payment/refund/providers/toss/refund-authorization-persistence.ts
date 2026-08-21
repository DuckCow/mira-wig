import { createHash } from "crypto";
import {
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { fingerprintTossRefundEligibility, type NormalizedTossRefundEligibility } from "./refund-eligibility";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  tossRefundAuthorizationSuccess as success,
  type AuthorizeTossRefundExecutionDispatchResult,
  type NormalizedAuthorizeTossRefundExecutionDispatchInput,
  type TossRefundDispatchAuthorization,
} from "./refund-authorization-contract";
import type { DurableTossRefundRequest } from "./refund-authorization-identity";
import type { AuthorizationTx, LockedTossAuthorizationState } from "./refund-authorization-state";
import { TOSS_REFUND_OPERATION_KEY_VERSION } from "./refund-operation-key";
import { TOSS_REFUND_WIRE_VERSION } from "./refund-wire-fingerprint";

export class TossAuthorizationPersistenceRollbackError extends Error {}
export class TossAuthorizationUniqueConflictError extends Error {}

export async function persistFreshTossAuthorization(
  tx: AuthorizationTx,
  locked: LockedTossAuthorizationState,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
  eligibility: NormalizedTossRefundEligibility,
  request: DurableTossRefundRequest,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  try {
    const binding = await createBinding(tx, locked, credential, request);
    await createEligibilityProof(tx, binding.id, eligibility);
    const dispatch = await createAuthorizedDispatch(tx, locked, input, request);
    const updated = await updateCommandOrdinal(tx, locked, input);
    if (updated !== 1) throw new TossAuthorizationPersistenceRollbackError();
    // This proof is authorization-time evidence; E3B2 must lookup again immediately before contact.
    return success(authorizationHandle(locked.context.command.id, dispatch.authorizedAt, input), false);
  } catch (error) {
    if (error instanceof TossAuthorizationPersistenceRollbackError) throw error;
    if (isUniqueConflict(error)) throw new TossAuthorizationUniqueConflictError();
    if (isPersistenceError(error)) throw new TossAuthorizationPersistenceRollbackError();
    throw error;
  }
}

function createBinding(
  tx: AuthorizationTx,
  locked: LockedTossAuthorizationState,
  credential: ConfiguredTossRefundCredential,
  request: DurableTossRefundRequest,
) {
  return tx.refundExecutionProviderOperationBinding.create({
    data: {
      refundAttemptId: locked.context.target.id,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: request.providerOperationKey,
      operationFamilyKeyAlgorithmVersion: TOSS_REFUND_OPERATION_KEY_VERSION,
      wireContractVersion: TOSS_REFUND_WIRE_VERSION,
      operationFamilyFingerprint: request.wireFingerprint,
      merchantAccountBindingId: credential.merchantAccountBinding,
      credentialGenerationBindingId: credential.credentialGenerationBinding,
    },
  });
}

function createEligibilityProof(
  tx: AuthorizationTx,
  bindingId: string,
  eligibility: NormalizedTossRefundEligibility,
) {
  const localReceivedAt = new Date(eligibility.localReceivedAt);
  return tx.refundExecutionProviderEligibilityProof.create({
    data: {
      bindingId,
      paymentKey: eligibility.paymentKey,
      method: eligibility.method,
      easyPayPresent: eligibility.easyPayPresent,
      currency: eligibility.currency,
      providerStatus: eligibility.providerStatus,
      totalAmount: eligibility.totalAmount,
      balanceAmount: eligibility.balanceAmount,
      taxFreeAmount: eligibility.taxFreeAmount,
      taxExemptionAmount: eligibility.taxExemptionAmount,
      cancelsCount: eligibility.cancelsCount,
      localReceivedAt,
      eligibilityFingerprint: fingerprintTossRefundEligibility({ ...eligibility, localReceivedAt }),
    },
  });
}

function createAuthorizedDispatch(
  tx: AuthorizationTx,
  locked: LockedTossAuthorizationState,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  request: DurableTossRefundRequest,
) {
  return tx.refundExecutionDispatchAttempt.create({
    data: {
      commandId: locked.context.command.id,
      ordinal: 1,
      leaseGeneration: input.leaseGeneration,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: request.providerOperationKey,
      requestFingerprint: request.neutralFingerprint,
      state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      authorizedAt: locked.capturedAt,
      contactMarkedAt: null,
    },
  });
}

function updateCommandOrdinal(
  tx: AuthorizationTx,
  locked: LockedTossAuthorizationState,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
): Promise<number> {
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: locked.context.command.id,
      refundAttemptId: locked.context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      leaseGeneration: input.leaseGeneration,
      leaseTokenHash,
      dispatchAttempt: 0,
      leaseUntil: { gt: locked.capturedAt },
    },
    data: { dispatchAttempt: 1 },
  }).then((updated) => updated.count);
}

export function replayTossAuthorization(
  locked: LockedTossAuthorizationState,
): AuthorizeTossRefundExecutionDispatchResult {
  if (locked.structure.kind !== "replay") {
    throw new Error("Toss refund replay requires a durable authorized dispatch attempt.");
  }
  return success(authorizationHandle(
    locked.context.command.id,
    locked.structure.attempt.authorizedAt,
    { leaseGeneration: locked.context.command.leaseGeneration },
  ), true);
}

function authorizationHandle(
  commandId: string,
  authorizedAt: Date,
  input: Pick<NormalizedAuthorizeTossRefundExecutionDispatchInput, "leaseGeneration">,
): TossRefundDispatchAuthorization {
  return {
    commandId,
    dispatchAttempt: 1,
    leaseGeneration: input.leaseGeneration,
    authorizedAt: authorizedAt.toISOString(),
  };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isPersistenceError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Error && error.name === "DriverAdapterError";
}
