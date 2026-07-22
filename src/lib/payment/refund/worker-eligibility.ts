import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type Prisma,
} from "@prisma/client";

export function readyRefundExecutionWorkerWhere(
  capturedAt: Date,
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
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerRefundId: null,
      order: { status: OrderStatus.REFUND_PENDING },
    },
  };
}

export function uncontactedRefundExecutionWorkerWhere(
  capturedAt: Date,
): Prisma.RefundExecutionCommandWhereInput {
  return {
    status: RefundExecutionCommandStatus.LEASED,
    dispatchAttempt: 0,
    leaseUntil: { lte: capturedAt },
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerRefundId: null,
      order: { status: OrderStatus.REFUND_PENDING },
    },
  };
}

export function contactedRefundExecutionWorkerWhere(
  capturedAt: Date,
): Prisma.RefundExecutionCommandWhereInput {
  return {
    status: RefundExecutionCommandStatus.LEASED,
    dispatchAttempt: { gte: 1 },
    leaseUntil: { lte: capturedAt },
    refundAttempt: {
      status: RefundAttemptStatus.PROCESSING,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      order: { status: OrderStatus.REFUND_PENDING },
    },
    dispatchAttempts: {
      some: { state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED },
    },
  };
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
