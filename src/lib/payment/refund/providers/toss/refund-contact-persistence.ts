import {
  RefundExecutionDispatchAttemptState,
  type Prisma,
} from "@prisma/client";
import type { TossRefundContactEligibilityProofCandidate } from "./refund-contact-eligibility";
import {
  contactProofData,
  type LockedTossContactState,
} from "./refund-contact-state";

export class TossContactPersistenceRollbackError extends Error {}

export async function persistContactProofAndMarker(
  tx: Prisma.TransactionClient,
  locked: LockedTossContactState,
  candidate: TossRefundContactEligibilityProofCandidate,
): Promise<void> {
  const dispatch = locked.history.dispatchAttempts[0];
  if (!dispatch) throw new TossContactPersistenceRollbackError();
  try {
    await tx.refundExecutionProviderContactEligibilityProof.create({
      data: contactProofData(candidate, dispatch.id),
    });
    const marker = await tx.refundExecutionDispatchAttempt.updateMany({
      where: {
        id: dispatch.id,
        commandId: locked.context.command.id,
        ordinal: 1,
        leaseGeneration: locked.context.command.leaseGeneration,
        state: RefundExecutionDispatchAttemptState.AUTHORIZED,
        contactMarkedAt: null,
      },
      data: {
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        contactMarkedAt: locked.capturedAt,
      },
    });
    if (marker.count !== 1) throw new TossContactPersistenceRollbackError();
  } catch (error) {
    if (error instanceof TossContactPersistenceRollbackError) throw error;
    if (isPersistenceError(error)) throw new TossContactPersistenceRollbackError();
    throw error;
  }
}

function isPersistenceError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "DriverAdapterError" || error.name === "PrismaClientKnownRequestError"
  );
}
