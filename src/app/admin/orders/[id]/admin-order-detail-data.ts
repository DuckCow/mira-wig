import "server-only";

import {
  Prisma,
  type CustomerRefundIntakeReasonCode,
  type CustomerRefundIntakeStatus,
  type RefundAttemptStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildAdminOrderDetailViewModel,
} from "./admin-order-detail-view-model";
import type {
  AdminOrderDetailSource,
  AdminOrderDetailViewModel,
} from "./admin-order-detail-types";

const ORDER_DETAIL_SELECT = {
  id: true,
  status: true,
  disputeStatus: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  marketCode: true,
  currency: true,
  subtotalAmount: true,
  shippingAmount: true,
  totalAmount: true,
  user: { select: { id: true, email: true, name: true } },
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
      updatedAt: true,
    },
  },
  items: {
    select: {
      id: true,
      quantity: true,
      unitAmount: true,
      fulfillmentType: true,
      snapshotData: true,
      mr: { select: { status: true, startedAt: true, createdAt: true, updatedAt: true } },
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
      createdAt: true,
      updatedAt: true,
      providerPaymentKey: true,
    },
  },
  refundAttempts: {
    orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      reason: true,
      actorType: true,
      actorUserId: true,
      provider: true,
      mode: true,
      requestedAt: true,
      processedAt: true,
      failedAt: true,
      safeFailureMessage: true,
      createdAt: true,
      updatedAt: true,
      providerRefundId: true,
      transitions: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          orderStatusBefore: true,
          orderStatusAfter: true,
          actorType: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  },
  customerRefundIntakes: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      customerUserId: true,
      status: true,
      reasonCode: true,
      reasonDetail: true,
      submittedAt: true,
      withdrawnAt: true,
      reviewedAt: true,
      adminRejectionReason: true,
      approvedRefundAttemptId: true,
    },
  },
} satisfies Prisma.OrderSelect;

type OrderDetailRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;

export interface AdminCustomerRefundIntakeDetail {
  id: string;
  status: CustomerRefundIntakeStatus;
  reasonCode: CustomerRefundIntakeReasonCode;
  reasonDetail: string | null;
  submittedAt: Date;
  withdrawnAt: Date | null;
  reviewedAt: Date | null;
  adminRejectionReason: string | null;
  approvedRefundAttemptId: string | null;
  ownershipConsistent: boolean;
  approvedRefundAttempt: null | {
    id: string;
    status: RefundAttemptStatus;
    amount: number;
    currency: string;
    requestedAt: Date;
  };
}

export type AdminOrderDetailReadModel = AdminOrderDetailViewModel & {
  customerRefundIntakes: AdminCustomerRefundIntakeDetail[];
};

export async function loadAdminOrderDetail(
  orderId: string,
): Promise<AdminOrderDetailReadModel | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: ORDER_DETAIL_SELECT });
  if (!order) return null;
  return {
    ...buildAdminOrderDetailViewModel(toSafeSource(order)),
    customerRefundIntakes: toSafeCustomerRefundIntakes(order),
  };
}

function toSafeSource(order: OrderDetailRecord): AdminOrderDetailSource {
  const { payment, refundAttempts, customerRefundIntakes: _customerRefundIntakes, ...orderFields } = order;
  return {
    ...orderFields,
    payment: {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      mode: payment.mode,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      providerPaymentKeyPresent: Boolean(payment.providerPaymentKey?.trim()),
    },
    refundAttempts: refundAttempts.map(({ providerRefundId, ...attempt }) => ({
      ...attempt,
      hasProviderRefundId: Boolean(providerRefundId?.trim()),
    })),
  };
}

function toSafeCustomerRefundIntakes(order: OrderDetailRecord): AdminCustomerRefundIntakeDetail[] {
  const attemptsById = new Map(order.refundAttempts.map((attempt) => [attempt.id, attempt]));
  return order.customerRefundIntakes.map((intake) => {
    const attempt = intake.approvedRefundAttemptId
      ? attemptsById.get(intake.approvedRefundAttemptId) ?? null
      : null;
    return {
      id: intake.id,
      status: intake.status,
      reasonCode: intake.reasonCode,
      reasonDetail: intake.reasonDetail,
      submittedAt: intake.submittedAt,
      withdrawnAt: intake.withdrawnAt,
      reviewedAt: intake.reviewedAt,
      adminRejectionReason: intake.adminRejectionReason,
      approvedRefundAttemptId: intake.approvedRefundAttemptId,
      ownershipConsistent: intake.customerUserId === order.user.id,
      approvedRefundAttempt: attempt ? {
        id: attempt.id,
        status: attempt.status,
        amount: attempt.amount,
        currency: attempt.currency,
        requestedAt: attempt.requestedAt,
      } : null,
    };
  });
}
