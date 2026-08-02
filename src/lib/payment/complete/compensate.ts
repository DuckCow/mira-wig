import {
  CheckoutSessionStatus,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { enqueuePaymentRemediationRequired } from "@/lib/payment/remediation";
import { transitionCheckoutSession } from "@/lib/payment/session";
import type { CompensationEnqueued, CompensationSkipped, CompletionFailureCode, CompletionTerminalFailure } from "./types";

export async function compensateTerminalFailure(
  client: PrismaClient,
  failure: CompletionTerminalFailure,
): Promise<CompensationEnqueued | CompensationSkipped> {
  if (failure.code === "MODE_MISMATCH") {
    return { kind: "compensationSkipped", failure, reason: "VOID_NOT_REQUIRED" };
  }

  const dedupKey = await client.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "CheckoutSession"
      WHERE "id" = ${failure.checkoutSessionId}
      FOR UPDATE
    `);
    await markRemediationPending(tx, failure);
    const key = await enqueuePaymentRemediationRequired(tx, {
      paymentId: failure.paymentId,
      provider: failure.provider,
      mode: await paymentMode(tx, failure.paymentId),
      providerPaymentKey: failure.providerPaymentKey,
      reason: failure.code,
    });
    if (mayMutateSession(failure.code)) await markSessionFailed(tx, failure);
    return key;
  });
  return { kind: "compensationEnqueued", failure, outboxDedupKey: dedupKey };
}

async function markRemediationPending(
  tx: Prisma.TransactionClient,
  failure: CompletionTerminalFailure,
): Promise<void> {
  const result = await tx.payment.updateMany({
    where: {
      id: failure.paymentId,
      status: PaymentAttemptStatus.SUCCEEDED,
      remediationStatus: {
        in: [PaymentRemediationStatus.NONE, PaymentRemediationStatus.REQUIRED],
      },
    },
    data: {
      remediationStatus: PaymentRemediationStatus.PENDING,
      errorCode: failure.code,
      errorMessage: failure.message,
    },
  });
  if (result.count === 1) return;
  const payment = await tx.payment.findUnique({
    where: { id: failure.paymentId },
    select: { status: true, remediationStatus: true },
  });
  if (payment?.status === PaymentAttemptStatus.SUCCEEDED
    && payment.remediationStatus !== PaymentRemediationStatus.NONE) return;
  throw new Error("Payment remediation transition conflict");
}

async function paymentMode(
  tx: Prisma.TransactionClient,
  paymentId: string,
) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { mode: true } });
  if (!payment) throw new Error("Payment remediation target is missing");
  return payment.mode;
}

function mayMutateSession(code: CompletionFailureCode): boolean {
  return code !== "VARIANT_PARENT_MISMATCH"
    && code !== "SUPERSEDED_ATTEMPT_CAPTURED"
    && code !== "PAYMENT_BLOCKED_BY_REMEDIATION";
}

async function markSessionFailed(
  tx: Prisma.TransactionClient,
  failure: CompletionTerminalFailure,
): Promise<void> {
  await transitionCheckoutSession(tx, {
    sessionId: failure.checkoutSessionId,
    transition: { from: CheckoutSessionStatus.SUBMITTED, to: CheckoutSessionStatus.FAILED },
    now: failure.failedAt,
  });
}
