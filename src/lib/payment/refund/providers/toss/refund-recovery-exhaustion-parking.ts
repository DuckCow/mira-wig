import { createHash } from "node:crypto";
import {
  OrderStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type Prisma,
} from "@prisma/client";
import type { LockedTossContactState } from "./refund-contact-state";
import {
  buildTossRecoveryExhaustionOperationKey,
  TOSS_RECOVERY_EXHAUSTION,
  type TossRecoveryExhaustionCause,
} from "./refund-recovery-exhaustion-contract";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";

export class TossRecoveryExhaustionRollbackError extends Error {}

export async function parkTossRecoveryLocalExhaustion(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  handle: TossRecoveryFenceHandle,
  cause: TossRecoveryExhaustionCause,
): Promise<void> {
  const policy = TOSS_RECOVERY_EXHAUSTION[cause];
  await updateAttempt(tx, locked, policy);
  await insertTransition(tx, locked, handle, policy);
  await parkCommand(tx, locked, handle, policy);
}

async function updateAttempt(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  policy: (typeof TOSS_RECOVERY_EXHAUSTION)[TossRecoveryExhaustionCause],
): Promise<void> {
  const attempt = await tx.refundAttempt.updateMany({
    where: {
      id: locked.context.target.id,
      orderId: locked.context.aggregate.id,
      status: RefundAttemptStatus.PROCESSING,
      providerRefundId: null,
    },
    data: {
      status: RefundAttemptStatus.MANUAL_REVIEW,
      failureCode: policy.code,
      safeFailureMessage: policy.message,
      processedAt: null,
      failedAt: null,
    },
  });
  if (attempt.count !== 1) throw new TossRecoveryExhaustionRollbackError();
}

async function insertTransition(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  handle: TossRecoveryFenceHandle,
  policy: (typeof TOSS_RECOVERY_EXHAUSTION)[TossRecoveryExhaustionCause],
): Promise<void> {
  await tx.refundAttemptTransition.create({
    data: {
      refundAttemptId: locked.context.target.id,
      fromStatus: RefundAttemptStatus.PROCESSING,
      toStatus: RefundAttemptStatus.MANUAL_REVIEW,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: policy.reason,
      operationKey: buildTossRecoveryExhaustionOperationKey(
        handle.commandId,
        handle.recoveryGeneration,
      ),
      createdAt: locked.capturedAt,
    },
  });
}

async function parkCommand(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  handle: TossRecoveryFenceHandle,
  policy: (typeof TOSS_RECOVERY_EXHAUSTION)[TossRecoveryExhaustionCause],
): Promise<void> {
  const command = await tx.refundExecutionCommand.updateMany({
    where: {
      id: handle.commandId,
      refundAttemptId: locked.context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      dispatchAttempt: locked.context.command.dispatchAttempt,
      leaseGeneration: handle.recoveryGeneration,
      leaseTokenHash: createHash("sha256")
        .update(handle.recoveryToken, "utf8")
        .digest("hex"),
    },
    data: {
      status: RefundExecutionCommandStatus.PARKED,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
      lastSafeErrorCode: policy.code,
      lastSafeErrorMessage: policy.message,
    },
  });
  if (command.count !== 1) throw new TossRecoveryExhaustionRollbackError();
}
