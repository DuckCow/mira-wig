import "server-only";

import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { containsSuspensionCycle } from "@/lib/payment/remediation";
import type { PaymentReturnStatus } from "./return-status-contract";

export interface ReadPaymentReturnStatusInput {
  checkoutSessionId: string;
  userId: string;
}

export async function readPaymentReturnStatus(
  client: PrismaClient,
  input: ReadPaymentReturnStatusInput,
): Promise<PaymentReturnStatus | null> {
  const session = await client.checkoutSession.findFirst({
    where: { id: input.checkoutSessionId, userId: input.userId },
    select: {
      id: true,
      status: true,
      order: {
        select: {
          id: true,
          paymentId: true,
          payment: { select: paymentProjectionSelect() },
        },
      },
      payments: {
        select: paymentProjectionSelect(),
      },
    },
  });
  if (!session) return null;
  if (isPersistedSuccess(session)) return { kind: "SUCCEEDED", orderId: session.order.id };
  return session.payments.length === 0 && session.order === null
    ? { kind: "UNAVAILABLE" }
    : { kind: "PROCESSING" };
}

function paymentProjectionSelect() {
  return {
    id: true,
    checkoutSessionId: true,
    status: true,
    attemptLifecycle: true,
    remediationStatus: true,
    financialSucceededAt: true,
    blockingEndedAt: true,
    suspendedByPaymentId: true,
  } as const;
}

type ProjectedPayment = {
  id: string;
  checkoutSessionId: string;
  status: PaymentAttemptStatus;
  attemptLifecycle: PaymentAttemptLifecycle;
  remediationStatus: PaymentRemediationStatus;
  financialSucceededAt: Date | null;
  blockingEndedAt: Date | null;
  suspendedByPaymentId: string | null;
};

interface ProjectedSession {
  id: string;
  status: CheckoutSessionStatus;
  order: {
    id: string;
    paymentId: string;
    payment: ProjectedPayment;
  } | null;
  payments: ProjectedPayment[];
}

function isPersistedSuccess(session: ProjectedSession): session is ProjectedSession & {
  order: NonNullable<ProjectedSession["order"]>;
} {
  const linked = session.order?.payment;
  if (session.status !== CheckoutSessionStatus.COMPLETED || session.order === null || linked === undefined) {
    return false;
  }
  return hasExactOrderPaymentLink(session, linked)
    && hasCompletePaymentEvidence(linked)
    && !hasUnresolvedLineageExposure(session.payments, linked.id);
}

function hasExactOrderPaymentLink(session: ProjectedSession, linked: ProjectedPayment): boolean {
  return session.order?.paymentId === linked.id && linked.checkoutSessionId === session.id;
}

function hasCompletePaymentEvidence(linked: ProjectedPayment): boolean {
  return linked.status === PaymentAttemptStatus.SUCCEEDED
    && linked.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED
    && linked.remediationStatus === PaymentRemediationStatus.NONE
    && linked.financialSucceededAt !== null
    && linked.blockingEndedAt !== null
    && linked.suspendedByPaymentId === null;
}

function hasUnresolvedLineageExposure(
  payments: readonly ProjectedPayment[],
  linkedPaymentId: string,
): boolean {
  if (containsSuspensionCycle(payments)) return true;
  return payments.some((payment) => {
    if (hasUnresolvedRemediation(payment) || payment.blockingEndedAt === null) return true;
    if (isUnresolvedContactLifecycle(payment.attemptLifecycle)) return true;
    return payment.id !== linkedPaymentId
      && payment.status === PaymentAttemptStatus.SUCCEEDED
      && payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED;
  });
}

function hasUnresolvedRemediation(payment: ProjectedPayment): boolean {
  return payment.remediationStatus !== PaymentRemediationStatus.NONE
    && payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED;
}

function isUnresolvedContactLifecycle(lifecycle: PaymentAttemptLifecycle): boolean {
  return lifecycle === PaymentAttemptLifecycle.CONTACT_AUTHORIZED
    || lifecycle === PaymentAttemptLifecycle.CONTACTED
    || lifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN
    || lifecycle === PaymentAttemptLifecycle.SUSPENDED;
}
