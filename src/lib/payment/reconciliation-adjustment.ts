import { db } from "@/lib/db";
import { Prisma, type PaymentAdjustmentStatus } from "@prisma/client";
import type { RefundResult } from "./types";

type ClaimInput = {
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
};

type ClaimResult =
  | { claimed: true; adjustmentId: string }
  | { claimed: false; status: PaymentAdjustmentStatus };

async function existingStatus(idempotencyKey: string): Promise<PaymentAdjustmentStatus> {
  const existing = await db.paymentAdjustment.findUnique({
    where: { idempotencyKey },
    select: { status: true },
  });
  if (!existing) throw new Error("auto_refund_adjustment_conflict_without_row");
  return existing.status;
}

export async function claimPendingAutoRefundAdjustment(input: ClaimInput): Promise<ClaimResult> {
  try {
    const adjustment = await db.paymentAdjustment.create({
      data: {
        paymentId: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        status: "PENDING",
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true },
    });
    return { claimed: true, adjustmentId: adjustment.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { claimed: false, status: await existingStatus(input.idempotencyKey) };
    }
    throw error;
  }
}

export async function updateAutoRefundAdjustment(adjustmentId: string, result: RefundResult): Promise<void> {
  await db.paymentAdjustment.update({
    where: { id: adjustmentId },
    data: {
      providerRefundId: result.providerRefundId,
      status: result.status,
      refundableAmount: result.refundableAmount,
    },
  });
}
