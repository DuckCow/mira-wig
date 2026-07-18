import type { PrismaClient } from "@prisma/client";
import { AcceptanceBootstrap, type AcceptanceBootstrapHandle } from "./bootstrap";

export type RefundFixtureIds = Readonly<{
  refundAttemptId: string;
  commandId: string;
}>;

export async function cleanupRunDatabase(
  client: PrismaClient,
  bootstrap: AcceptanceBootstrap,
  handle: AcceptanceBootstrapHandle,
  refund: RefundFixtureIds | null,
): Promise<void> {
  if (refund) {
    await client.$transaction(async (tx) => {
      const attempt = await tx.refundAttempt.findUnique({
        where: { id: refund.refundAttemptId },
        select: { orderId: true, executionCommand: { select: { id: true } } },
      });
      if (attempt && (attempt.orderId !== handle.orderId
        || attempt.executionCommand?.id !== refund.commandId)) {
        throw new Error("CLEANUP_OWNERSHIP_MISMATCH");
      }
      const dispatches = await tx.refundExecutionDispatchAttempt.findMany({
        where: { commandId: refund.commandId }, select: { id: true },
      });
      const dispatchIds = dispatches.map((row) => row.id);
      const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
        where: { refundAttemptId: refund.refundAttemptId }, select: { id: true },
      });
      await tx.refundExecutionEvidence.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionProviderContactEligibilityProof.deleteMany({ where: { dispatchAttemptId: { in: dispatchIds } } });
      if (binding) await tx.refundExecutionProviderEligibilityProof.deleteMany({ where: { bindingId: binding.id } });
      await tx.refundExecutionProviderOperationBinding.deleteMany({ where: { refundAttemptId: refund.refundAttemptId } });
      await tx.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionCommandEvent.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionCommand.deleteMany({ where: { id: refund.commandId, refundAttemptId: refund.refundAttemptId } });
      await tx.refundAttemptTransition.deleteMany({ where: { refundAttemptId: refund.refundAttemptId } });
      await tx.refundAttempt.deleteMany({ where: { id: refund.refundAttemptId, orderId: handle.orderId } });
    });
  }
  await bootstrap.cleanup(handle);
}

export async function assertRunResidueZero(
  client: PrismaClient,
  handle: AcceptanceBootstrapHandle,
  refund: RefundFixtureIds | null,
): Promise<void> {
  const [user, session, payment, order, attempt, command] = await Promise.all([
    client.user.count({ where: { id: handle.userId } }),
    client.checkoutSession.count({ where: { id: handle.checkoutSessionId } }),
    client.payment.count({ where: { id: handle.paymentId } }),
    client.order.count({ where: { id: handle.orderId } }),
    refund ? client.refundAttempt.count({ where: { id: refund.refundAttemptId } }) : 0,
    refund ? client.refundExecutionCommand.count({ where: { id: refund.commandId } }) : 0,
  ]);
  if ([user, session, payment, order, attempt, command].some((count) => count !== 0)) {
    throw new Error("CLEANUP_RESIDUE_REMAINS");
  }
}
