import "server-only";

import {
  Prisma,
  OrderStatus,
  MrStatus,
  PaymentAttemptStatus,
  RefundAttemptStatus,
  type CustomerRefundIntakeReasonCode,
  type CustomerRefundIntakeStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { formatPersistedMoney } from "@/lib/market/persisted-money";
import {
  deriveCancellationObligation,
  type CancellationObligation,
} from "@/lib/order-cancellation/obligation";
import { isTerminalRefundAttemptStatus } from "@/lib/payment/refund/invariants";
import {
  buildAdminOrderDetailViewModel,
} from "./admin-order-detail-view-model";
import type {
  AdminOrderDetailSource,
  AdminOrderDetailViewModel,
} from "./admin-order-detail-types";
import type { RefundExecutionClaimActivationState } from "./refund-claim-presentation";

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
  promotionGrantId: true,
  cancellation: {
    select: {
      acceptedAt: true,
      initialRefundAttemptId: true,
      requestedBy: { select: { id: true, email: true, name: true } },
    },
  },
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
      mr: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          productionStartRequestKey: true,
          startedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
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
      orderId: true,
      paymentId: true,
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
      executionCommand: { select: { id: true } },
      lines: {
        orderBy: { orderItemId: "asc" },
        select: { orderItemId: true, orderId: true, quantity: true },
      },
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
    lines: readonly { orderItemId: string; quantity: number }[];
  };
}

export type AdminOrderDetailReadModel = Omit<AdminOrderDetailViewModel, "items"> & {
  items: Array<AdminOrderDetailViewModel["items"][number] & {
    canStartProduction?: boolean;
  }>;
  cancellation?: null | {
    acceptedAt: string;
    requestedBy: string;
    requestedByUserId: string;
    initialRefundAttemptId: string;
    capturedObligation: string;
    succeededAmount: string;
    outstandingAmount: string;
    obligationState: CancellationObligation["state"];
    hasOutstandingAmount: boolean;
    canReplaceRefund: boolean;
  };
  customerRefundIntakes: AdminCustomerRefundIntakeDetail[];
  requiresRefundEconomicAllocation?: boolean;
};

export async function loadAdminOrderDetail(
  orderId: string,
  claimActivationState: RefundExecutionClaimActivationState = "disabled",
): Promise<AdminOrderDetailReadModel | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: ORDER_DETAIL_SELECT });
  if (!order) return null;
  const base = buildAdminOrderDetailViewModel(toSafeSource(order), { claimActivationState });
  const hasOpenRefund = order.refundAttempts.some((attempt) => !isTerminalRefundAttemptStatus(attempt.status));
  const hasSubmittedIntake = order.customerRefundIntakes.some((intake) => intake.status === "SUBMITTED");
  return {
    ...base,
    statusLabel: order.cancellation ? "주문 취소" : base.statusLabel,
    items: base.items.map((item, index) => {
      const source = order.items[index];
      return {
        ...item,
        canStartProduction: isAdvisoryProductionStartEligible(
          order,
          source,
          hasOpenRefund,
          hasSubmittedIntake,
        ),
      };
    }),
    cancellation: cancellationProjection(order),
    customerRefundIntakes: toSafeCustomerRefundIntakes(order),
    requiresRefundEconomicAllocation: order.promotionGrantId !== null,
  };
}

function isAdvisoryProductionStartEligible(
  order: OrderDetailRecord,
  source: OrderDetailRecord["items"][number] | undefined,
  hasOpenRefund: boolean,
  hasSubmittedIntake: boolean,
): boolean {
  return [
    source?.mr?.status === MrStatus.RECEIVED,
    source?.mr?.startedAt === null,
    source?.mr?.productionStartRequestKey === null,
    source?.mr?.startedByUserId === null,
    order.cancellation === null,
    order.status === OrderStatus.PAID,
    order.disputeStatus === null,
    !hasOpenRefund,
    !hasSubmittedIntake,
    source?.fulfillmentType === "MTO",
  ].every(Boolean);
}

function toSafeSource(order: OrderDetailRecord): AdminOrderDetailSource {
  const {
    payment,
    refundAttempts,
    customerRefundIntakes: _customerRefundIntakes,
    cancellation: _cancellation,
    ...orderFields
  } = order;
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
    refundAttempts: refundAttempts.map(({ paymentId, providerRefundId, executionCommand, ...attempt }) => ({
      ...attempt,
      hasProviderRefundId: Boolean(providerRefundId?.trim()),
      hasExecutionCommand: executionCommand !== null,
      paymentIdentityMatches: paymentId === payment.id,
    })),
  };
}

function cancellationProjection(order: OrderDetailRecord): AdminOrderDetailReadModel["cancellation"] {
  if (!order.cancellation) return null;
  const obligation = deriveCancellationObligation(order, order.payment, order.refundAttempts);
  const coherent = obligation.state !== "INCONSISTENT";
  const currency = order.payment.currency;
  return {
    acceptedAt: formatAdminDateTime(order.cancellation.acceptedAt),
    requestedBy: order.cancellation.requestedBy.name?.trim()
      || order.cancellation.requestedBy.email,
    requestedByUserId: order.cancellation.requestedBy.id,
    initialRefundAttemptId: order.cancellation.initialRefundAttemptId,
    capturedObligation: coherent ? formatPersistedMoney(order.payment.amount, currency) : "금액 확인 필요",
    succeededAmount: coherent
      ? formatPersistedMoney(obligation.succeededAmount, currency)
      : "금액 확인 필요",
    outstandingAmount: coherent
      ? formatPersistedMoney(obligation.outstandingAmount, currency)
      : "금액 확인 필요",
    obligationState: obligation.state,
    hasOutstandingAmount: obligation.state === "OUTSTANDING",
    canReplaceRefund: canReplaceCancellationRefund(order, obligation),
  };
}

function canReplaceCancellationRefund(
  order: OrderDetailRecord,
  obligation: CancellationObligation,
): boolean {
  return [
    obligation.state === "OUTSTANDING",
    order.disputeStatus === null,
    order.payment.status === PaymentAttemptStatus.SUCCEEDED,
    Boolean(order.payment.providerPaymentKey?.trim()),
    order.refundAttempts.every((attempt) => isTerminalRefundAttemptStatus(attempt.status)),
  ].every(Boolean);
}

function formatAdminDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
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
        lines: attempt.lines.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
      } : null,
    };
  });
}
