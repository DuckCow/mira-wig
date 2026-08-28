import "server-only";

import { db } from "@/lib/db";
import {
  loadCustomerRefundIntakeReadModel,
  type CustomerRefundIntakeReadModel,
} from "@/lib/payment/refund/customer-intake-read";
import { deriveCustomerRefundSummary } from "@/lib/payment/refund/customer-summary";
import { deriveCancellationObligation } from "@/lib/order-cancellation/obligation";
import {
  CustomerRefundIntakeStatus,
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  RefundAttemptStatus,
} from "@prisma/client";

type ProjectedCustomerOrderDetailRecord = ReturnType<typeof projectOwnedOrder>;
export type CustomerOrderDetailRecord = Omit<
  ProjectedCustomerOrderDetailRecord,
  "cancellation" | "canCancelAutomatically" | "disputeStatus" | "items"
> & {
  cancellation?: ProjectedCustomerOrderDetailRecord["cancellation"];
  canCancelAutomatically?: boolean;
  disputeStatus?: string | null;
  items: Array<Omit<ProjectedCustomerOrderDetailRecord["items"][number], "mr"> & {
    mr?: ProjectedCustomerOrderDetailRecord["items"][number]["mr"];
  }>;
};

export interface CustomerOrderDetailData {
  order: CustomerOrderDetailRecord;
  intake: CustomerRefundIntakeReadModel;
}

export async function loadCustomerOrderDetail(
  orderId: string,
  customerUserId: string,
  submitEnabled: boolean,
  cancellationEnabled = false,
): Promise<CustomerOrderDetailData | null> {
  const [order, intake] = await Promise.all([
    loadOwnedOrder(orderId, customerUserId),
    loadCustomerRefundIntakeReadModel(db, { orderId, customerUserId, submitEnabled }),
  ]);
  return order && intake ? { order: projectOwnedOrder(order, cancellationEnabled), intake } : null;
}

function loadOwnedOrder(orderId: string, userId: string) {
  return db.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      currency: true,
      subtotalAmount: true,
      discountAmount: true,
      shippingAmount: true,
      totalAmount: true,
      disputeStatus: true,
      cancellation: {
        select: { acceptedAt: true },
      },
      customerRefundIntakes: {
        where: { status: CustomerRefundIntakeStatus.SUBMITTED },
        select: { id: true },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          unitAmount: true,
          fulfillmentType: true,
          snapshotData: true,
          mr: {
            select: {
              status: true,
              startedAt: true,
              productionStartRequestKey: true,
              startedByUserId: true,
            },
          },
        },
      },
      shipping: {
        select: {
          recipientName: true,
          phone: true,
          country: true,
          postalCode: true,
          administrativeArea: true,
          city: true,
          addressLine1: true,
          addressLine2: true,
          memo: true,
        },
      },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          provider: true,
          mode: true,
        },
      },
      refundAttempts: {
        select: {
          orderId: true,
          paymentId: true,
          amount: true,
          currency: true,
          provider: true,
          mode: true,
          status: true,
          processedAt: true,
        },
      },
    },
  });
}

function projectOwnedOrder(
  raw: NonNullable<Awaited<ReturnType<typeof loadOwnedOrder>>>,
  cancellationEnabled = false,
) {
  const { refundAttempts, payment, customerRefundIntakes: _customerRefundIntakes, ...order } = raw;
  const { id: paymentId, mode: paymentMode, ...customerPayment } = payment;
  const obligation = raw.cancellation
    ? deriveCancellationObligation(raw, payment, refundAttempts)
    : null;
  const cancellation = raw.cancellation && obligation ? {
    acceptedAt: raw.cancellation.acceptedAt,
    expectedRefundAmount: obligation.state === "INCONSISTENT" ? null : payment.amount,
    succeededRefundAmount: obligation.succeededAmount,
    outstandingRefundAmount: obligation.outstandingAmount,
    obligationState: obligation.state,
  } : null;
  return {
    ...order,
    payment: customerPayment,
    cancellation,
    canCancelAutomatically: isAdvisoryCancellationEligible(raw, cancellationEnabled),
    refundSummary: deriveCustomerRefundSummary(
      { id: order.id, currency: order.currency },
      {
        id: paymentId,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        mode: paymentMode,
      },
      refundAttempts,
    ),
  };
}

function isAdvisoryCancellationEligible(
  raw: NonNullable<Awaited<ReturnType<typeof loadOwnedOrder>>>,
  cancellationEnabled: boolean,
): boolean {
  const orderFacts = [
    cancellationEnabled,
    raw.cancellation === null,
    raw.status === OrderStatus.PAID,
    raw.disputeStatus === null,
    raw.payment.status === PaymentAttemptStatus.SUCCEEDED,
    raw.payment.amount === raw.totalAmount,
    raw.payment.currency === raw.currency,
    raw.items.length > 0,
  ];
  return orderFacts.every(Boolean)
    && raw.customerRefundIntakes.length === 0
    && raw.items.every(isAdvisoryPreProductionMtoItem)
    && raw.refundAttempts.every(hasAdvisoryTerminalRefundState);
}

function isAdvisoryPreProductionMtoItem(
  item: NonNullable<Awaited<ReturnType<typeof loadOwnedOrder>>>["items"][number],
): boolean {
  return [
    item.fulfillmentType === FulfillmentType.MTO,
    item.mr?.status === MrStatus.RECEIVED,
    item.mr?.startedAt === null,
    item.mr?.productionStartRequestKey === null,
    item.mr?.startedByUserId === null,
  ].every(Boolean);
}

function hasAdvisoryTerminalRefundState(
  attempt: NonNullable<Awaited<ReturnType<typeof loadOwnedOrder>>>["refundAttempts"][number],
): boolean {
  return attempt.status === RefundAttemptStatus.FAILED_TERMINAL
    || attempt.status === RefundAttemptStatus.CANCELLED;
}
