import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { enqueue } from "@/lib/payment/outbox";

export const PAYMENT_REMEDIATION_REQUIRED_TOPIC = "payment.remediation_required";

export const unresolvedSessionExposureWhere = {
  OR: [
    {
      remediationStatus: {
        notIn: [PaymentRemediationStatus.NONE, PaymentRemediationStatus.REMEDIATED],
      },
    },
    {
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      remediationStatus: PaymentRemediationStatus.NONE,
      providerOrderId: { not: null },
      contactStartedAt: { not: null },
      providerPaymentKey: null,
      financialSucceededAt: null,
      blockingEndedAt: { not: null },
      suspendedByPaymentId: null,
      errorCode: "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
    },
  ],
} satisfies Prisma.PaymentWhereInput;

export async function hasUnresolvedSessionExposure(
  client: Pick<Prisma.TransactionClient, "payment">,
  checkoutSessionId: string,
): Promise<boolean> {
  const count = await client.payment.count({
    where: { checkoutSessionId, ...unresolvedSessionExposureWhere },
  });
  return count > 0;
}

export async function hasSessionSuspensionCycle(
  client: Pick<Prisma.TransactionClient, "payment">,
  checkoutSessionId: string,
): Promise<boolean> {
  const rows = await client.payment.findMany({
    where: { checkoutSessionId, suspendedByPaymentId: { not: null } },
    select: { id: true, suspendedByPaymentId: true },
  });
  return containsSuspensionCycle(rows);
}

export function containsSuspensionCycle(
  rows: ReadonlyArray<{ id: string; suspendedByPaymentId: string | null }>,
): boolean {
  const nextById = new Map(rows.map((row) => [row.id, row.suspendedByPaymentId]));
  for (const row of rows) {
    const visited = new Set<string>();
    let current: string | null = row.id;
    while (current !== null) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = nextById.get(current) ?? null;
    }
  }
  return false;
}

interface RemediationSignal {
  paymentId: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  providerPaymentKey: string;
  reason: string;
}

export function remediationDedupKey(signal: Pick<RemediationSignal, "provider" | "providerPaymentKey">): string {
  return `payment-remediation:${signal.provider}:${signal.providerPaymentKey}`;
}

export async function enqueuePaymentRemediationRequired(
  tx: Prisma.TransactionClient,
  signal: RemediationSignal,
): Promise<string> {
  const dedupKey = remediationDedupKey(signal);
  await enqueue(tx, {
    topic: PAYMENT_REMEDIATION_REQUIRED_TOPIC,
    dedupKey,
    payload: {
      paymentId: signal.paymentId,
      provider: signal.provider,
      mode: signal.mode,
      providerPaymentKey: signal.providerPaymentKey,
      reason: signal.reason,
    },
  });
  return dedupKey;
}
