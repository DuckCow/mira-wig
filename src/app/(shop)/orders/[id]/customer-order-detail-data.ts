import "server-only";

import { db } from "@/lib/db";
import {
  loadCustomerRefundIntakeReadModel,
  type CustomerRefundIntakeReadModel,
} from "@/lib/payment/refund/customer-intake-read";
import { deriveCustomerRefundSummary } from "@/lib/payment/refund/customer-summary";

export type CustomerOrderDetailRecord = ReturnType<typeof projectOwnedOrder>;

export interface CustomerOrderDetailData {
  order: CustomerOrderDetailRecord;
  intake: CustomerRefundIntakeReadModel;
}

export async function loadCustomerOrderDetail(
  orderId: string,
  customerUserId: string,
  submitEnabled: boolean,
): Promise<CustomerOrderDetailData | null> {
  const [order, intake] = await Promise.all([
    loadOwnedOrder(orderId, customerUserId),
    loadCustomerRefundIntakeReadModel(db, { orderId, customerUserId, submitEnabled }),
  ]);
  return order && intake ? { order: projectOwnedOrder(order), intake } : null;
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
      shippingAmount: true,
      totalAmount: true,
      items: {
        select: {
          id: true,
          quantity: true,
          unitAmount: true,
          fulfillmentType: true,
          snapshotData: true,
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

function projectOwnedOrder(raw: NonNullable<Awaited<ReturnType<typeof loadOwnedOrder>>>) {
  const { refundAttempts, payment, ...order } = raw;
  const { id: paymentId, mode: paymentMode, ...customerPayment } = payment;
  return {
    ...order,
    payment: customerPayment,
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
