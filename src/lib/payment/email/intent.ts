import type { Prisma } from "@prisma/client";
import { isLocale } from "@/lib/market/locale";
import { enqueue } from "@/lib/payment/outbox";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  orderPaidEmailDedupKey,
  orderPaidEmailPayload,
  refundSucceededEmailDedupKey,
  refundSucceededEmailPayload,
} from "./topics";

export async function enqueueOrderPaidEmailIntent(
  tx: Prisma.TransactionClient,
  input: Readonly<{ orderId: string; communicationLocale: string | null }>,
): Promise<void> {
  if (!isLocale(input.communicationLocale ?? "")) return;
  await enqueue(tx, {
    topic: CUSTOMER_ORDER_PAID_EMAIL_V1,
    dedupKey: orderPaidEmailDedupKey(input.orderId),
    payload: orderPaidEmailPayload(input.orderId),
  });
}

export async function enqueueRefundSucceededEmailIntent(
  tx: Prisma.TransactionClient,
  input: Readonly<{ refundAttemptId: string; checkoutSessionId: string }>,
): Promise<void> {
  const session = await tx.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
    select: { communicationLocale: true },
  });
  if (!isLocale(session?.communicationLocale ?? "")) return;
  await enqueue(tx, {
    topic: CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
    dedupKey: refundSucceededEmailDedupKey(input.refundAttemptId),
    payload: refundSucceededEmailPayload(input.refundAttemptId),
  });
}
