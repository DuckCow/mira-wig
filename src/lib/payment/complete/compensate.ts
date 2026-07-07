import { CheckoutSessionStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { enqueue } from "@/lib/payment/outbox";
import { transitionCheckoutSession } from "@/lib/payment/session";
import type { CompensationEnqueued, CompensationSkipped, CompletionTerminalFailure } from "./types";

const VOID_TOPIC = "pg.void";

export async function compensateTerminalFailure(
  client: PrismaClient,
  failure: CompletionTerminalFailure,
): Promise<CompensationEnqueued | CompensationSkipped> {
  if (isVoidlessFailure(failure)) {
    await client.$transaction((tx) => markSessionFailed(tx, failure));
    return { kind: "compensationSkipped", failure, reason: "VOID_NOT_REQUIRED" };
  }

  const dedupKey = voidDedupKey(failure);
  await client.$transaction(async (tx) => {
    await enqueueVoid(tx, failure, dedupKey);
    await markSessionFailed(tx, failure);
  });
  return { kind: "compensationEnqueued", failure, outboxDedupKey: dedupKey };
}

function isVoidlessFailure(failure: CompletionTerminalFailure): boolean {
  return failure.code === "MODE_MISMATCH";
}

function voidDedupKey(failure: CompletionTerminalFailure): string {
  return `void:${failure.provider}:${failure.providerPaymentKey}`;
}

async function enqueueVoid(
  tx: Prisma.TransactionClient,
  failure: CompletionTerminalFailure,
  dedupKey: string,
): Promise<void> {
  await enqueue(tx, {
    topic: VOID_TOPIC,
    dedupKey,
    payload: {
      paymentId: failure.paymentId,
      provider: failure.provider,
      providerPaymentKey: failure.providerPaymentKey,
      reason: failure.code,
    },
  });
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
