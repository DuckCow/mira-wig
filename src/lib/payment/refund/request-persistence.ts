import {
  OrderStatus,
  RefundAttemptStatus,
  type Prisma,
  type RefundAttempt,
  type RefundAttemptLine,
} from "@prisma/client";
import type { PreparedRefundAttempt } from "./prepare";
import type { CanonicalRefundLine } from "./lines";
import { buildRefundRequestOperationKey } from "./request-evidence";

type RefundRequestTx = Prisma.TransactionClient;

export type PersistRefundRequestResult =
  | {
      ok: true;
      refundAttempt: RefundAttempt & { lines: RefundAttemptLine[] };
      orderStatus: typeof OrderStatus.REFUND_PENDING;
    }
  | {
      ok: false;
      code: "ORDER_STATUS_CONFLICT";
      message: string;
    };

/**
 * Writes the canonical refund request artifacts after the caller already owns
 * the Order row lock and has completed its workflow-specific admission.
 */
export async function persistRefundRequestAfterOrderLock(
  tx: RefundRequestTx,
  order: Readonly<{ id: string; status: OrderStatus }>,
  prepared: PreparedRefundAttempt,
  lines: readonly CanonicalRefundLine[],
): Promise<PersistRefundRequestResult> {
  const orderUpdate = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: OrderStatus.REFUND_PENDING },
  });
  if (orderUpdate.count !== 1) {
    return {
      ok: false,
      code: "ORDER_STATUS_CONFLICT",
      message: "Order status changed before the refund request was saved.",
    };
  }

  const refundAttempt = await tx.refundAttempt.create({
    data: {
      ...prepared,
      lines: {
        create: lines.map((line) => ({
          quantity: line.quantity,
          economicAllocation: line.merchandiseRefundAmount === undefined
            ? undefined
            : { create: { merchandiseRefundAmount: line.merchandiseRefundAmount } },
          orderItem: {
            connect: {
              id_orderId: { id: line.orderItemId, orderId: order.id },
            },
          },
        })),
      },
    },
    include: { lines: { orderBy: { orderItemId: "asc" } } },
  });
  await tx.refundAttemptTransition.create({
    data: {
      refundAttemptId: prepared.id,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: order.status,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: prepared.actorType,
      actorUserId: prepared.actorUserId,
      reason: prepared.reason,
      operationKey: buildRefundRequestOperationKey(prepared.id),
      createdAt: prepared.requestedAt,
    },
  });
  return { ok: true, refundAttempt, orderStatus: OrderStatus.REFUND_PENDING };
}
