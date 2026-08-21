import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type Prisma,
} from "@prisma/client";
import type { RefundExecutionWorkerProvider } from "./worker-allocation";

const TOSS_ONLY = Object.freeze([PaymentProvider.TOSS] as const);

export function readyRefundExecutionWorkerWhere(
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[] = TOSS_ONLY,
): Prisma.RefundExecutionCommandWhereInput {
  return {
    status: RefundExecutionCommandStatus.READY,
    dispatchAttempt: 0,
    availableAt: { lte: capturedAt },
    leaseOwner: null,
    leaseUntil: null,
    leaseTokenHash: null,
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider: providerFilter(providers),
      mode: PaymentMode.SANDBOX,
      providerRefundId: null,
      order: { status: OrderStatus.REFUND_PENDING },
    },
  };
}

export function uncontactedRefundExecutionWorkerWhere(
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[] = TOSS_ONLY,
): Prisma.RefundExecutionCommandWhereInput {
  const ordinalZero = ordinalZeroUncontactedRefundExecutionWorkerWhere(capturedAt, providers);
  return providers.includes(PaymentProvider.EXIMBAY)
    ? { OR: [ordinalZero, authorizedEximbayR1RefundExecutionWorkerWhere(capturedAt)] }
    : ordinalZero;
}

function ordinalZeroUncontactedRefundExecutionWorkerWhere(
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[],
): Prisma.RefundExecutionCommandWhereInput {
  return {
    status: RefundExecutionCommandStatus.LEASED,
    dispatchAttempt: 0,
    leaseUntil: { lte: capturedAt },
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider: providerFilter(providers),
      mode: PaymentMode.SANDBOX,
      providerRefundId: null,
      order: { status: OrderStatus.REFUND_PENDING },
    },
  };
}

function authorizedEximbayR1RefundExecutionWorkerWhere(
  capturedAt: Date,
): Prisma.RefundExecutionCommandWhereInput {
  const exactR1 = {
    ordinal: 1,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    contactMarkedAt: null,
  } satisfies Prisma.RefundExecutionDispatchAttemptWhereInput;
  return {
    status: RefundExecutionCommandStatus.LEASED,
    dispatchAttempt: 1,
    leaseUntil: { lte: capturedAt },
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      providerRefundId: null,
      order: { status: OrderStatus.REFUND_PENDING },
    },
    dispatchAttempts: {
      some: exactR1,
      every: exactR1,
    },
    evidence: { none: {} },
  };
}

export function contactedRefundExecutionWorkerWhere(
  capturedAt: Date,
  providers: readonly RefundExecutionWorkerProvider[] = TOSS_ONLY,
): Prisma.RefundExecutionCommandWhereInput {
  if (providers.length === 1 && providers[0] === PaymentProvider.TOSS) {
    return tossContactedRefundExecutionWorkerWhere(capturedAt);
  }
  return {
    OR: [
      tossContactedRefundExecutionWorkerWhere(capturedAt),
      eximbayContactedRefundExecutionWorkerWhere(capturedAt),
    ],
  };
}

function tossContactedRefundExecutionWorkerWhere(
  capturedAt: Date,
): Prisma.RefundExecutionCommandWhereInput {
  return contactedBaseWhere(PaymentProvider.TOSS, {
    status: RefundExecutionCommandStatus.LEASED,
    leaseUntil: { lte: capturedAt },
  });
}

function eximbayContactedRefundExecutionWorkerWhere(
  capturedAt: Date,
): Prisma.RefundExecutionCommandWhereInput {
  return {
    ...contactedBaseWhere(PaymentProvider.EXIMBAY, {}),
    OR: [
      {
        status: RefundExecutionCommandStatus.LEASED,
        leaseUntil: { lte: capturedAt },
      },
      {
        status: RefundExecutionCommandStatus.WAITING_EVIDENCE,
        availableAt: { lte: capturedAt },
        leaseOwner: null,
        leaseUntil: null,
        leaseTokenHash: null,
      },
    ],
  };
}

function contactedBaseWhere(
  provider: RefundExecutionWorkerProvider,
  command: Prisma.RefundExecutionCommandWhereInput,
): Prisma.RefundExecutionCommandWhereInput {
  return {
    ...command,
    dispatchAttempt: { gte: 1 },
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider,
      mode: PaymentMode.SANDBOX,
      order: { status: OrderStatus.REFUND_PENDING },
    },
    dispatchAttempts: {
      some: { state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED },
    },
  };
}

function providerFilter(
  providers: readonly RefundExecutionWorkerProvider[],
): PaymentProvider | { in: PaymentProvider[] } {
  if (providers.length === 1 && providers[0] === PaymentProvider.TOSS) {
    return PaymentProvider.TOSS;
  }
  return { in: [...providers] };
}

export function manualReviewRefundExecutionWorkerWhere(): Prisma.RefundExecutionCommandWhereInput {
  return {
    status: RefundExecutionCommandStatus.PARKED,
    refundAttempt: {
      status: RefundAttemptStatus.MANUAL_REVIEW,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      order: { status: OrderStatus.REFUND_PENDING },
    },
  };
}
