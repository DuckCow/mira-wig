import "server-only";

import {
  CustomerRefundIntakeStatus,
  OrderStatus,
  type CustomerRefundIntakeReasonCode,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

export type LoadCustomerRefundIntakeReadModelInput = Readonly<{
  orderId: string;
  customerUserId: string;
  submitEnabled: boolean;
}>;

export type CustomerRefundIntakeReadModel = Readonly<{
  orderId: string;
  orderStatus: OrderStatus;
  latestIntake: null | Readonly<{
    status: CustomerRefundIntakeStatus;
    reasonCode: CustomerRefundIntakeReasonCode;
    reasonDetail: string | null;
    submittedAt: Date;
    withdrawnAt: Date | null;
  }>;
  canSubmit: boolean;
  canWithdraw: boolean;
  submissionUnavailableReason:
    | null
    | "FEATURE_DISABLED"
    | "OPEN_INTAKE"
    | "ORDER_STATE_UNAVAILABLE"
    | "UNAVAILABLE";
}>;

export class CustomerRefundIntakeReadInvariantError extends Error {
  constructor() {
    super("Customer refund intake read boundary invariant failed.");
    this.name = "CustomerRefundIntakeReadInvariantError";
  }
}

const CUSTOMER_READ_SELECT = {
  id: true,
  status: true,
  customerRefundIntakes: {
    where: { customerUserId: "" },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      status: true,
      reasonCode: true,
      reasonDetail: true,
      submittedAt: true,
      withdrawnAt: true,
    },
  },
  _count: {
    select: {
      customerRefundIntakes: { where: { status: CustomerRefundIntakeStatus.SUBMITTED } },
    },
  },
} satisfies Prisma.OrderSelect;

type CustomerReadClient = Pick<PrismaClient, "order">;

export async function loadCustomerRefundIntakeReadModel(
  client: CustomerReadClient,
  input: LoadCustomerRefundIntakeReadModelInput,
): Promise<CustomerRefundIntakeReadModel | null> {
  const orderId = normalizeOrderId(input.orderId);
  if (orderId === null) return null;
  const customerUserId = normalizeCustomerUserId(input.customerUserId);
  if (typeof input.submitEnabled !== "boolean") throw new CustomerRefundIntakeReadInvariantError();

  const select = customerReadSelect(customerUserId);
  const order = await client.order.findFirst({
    where: { id: orderId, userId: customerUserId },
    select,
  });
  if (!order) return null;

  const latest = order.customerRefundIntakes[0] ?? null;
  const hasOwnedOpen = latest?.status === CustomerRefundIntakeStatus.SUBMITTED;
  const hasAnyOpen = order._count.customerRefundIntakes > 0;
  const unavailableReason = submissionUnavailableReason(
    input.submitEnabled,
    order.status,
    hasOwnedOpen,
    hasAnyOpen,
  );
  return Object.freeze({
    orderId: order.id,
    orderStatus: order.status,
    latestIntake: latest ? Object.freeze({ ...latest }) : null,
    canSubmit: unavailableReason === null,
    canWithdraw: hasOwnedOpen,
    submissionUnavailableReason: unavailableReason,
  });
}

function customerReadSelect(customerUserId: string): typeof CUSTOMER_READ_SELECT {
  return {
    ...CUSTOMER_READ_SELECT,
    customerRefundIntakes: {
      ...CUSTOMER_READ_SELECT.customerRefundIntakes,
      where: { customerUserId },
    },
  };
}

function normalizeOrderId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCustomerUserId(value: unknown): string {
  if (typeof value !== "string") throw new CustomerRefundIntakeReadInvariantError();
  const normalized = value.trim();
  if (!normalized) throw new CustomerRefundIntakeReadInvariantError();
  return normalized;
}

function submissionUnavailableReason(
  submitEnabled: boolean,
  orderStatus: OrderStatus,
  hasOwnedOpen: boolean,
  hasAnyOpen: boolean,
): CustomerRefundIntakeReadModel["submissionUnavailableReason"] {
  if (!submitEnabled) return "FEATURE_DISABLED";
  if (orderStatus !== OrderStatus.PAID && orderStatus !== OrderStatus.PARTIALLY_REFUNDED) {
    return "ORDER_STATE_UNAVAILABLE";
  }
  if (hasOwnedOpen) return "OPEN_INTAKE";
  if (hasAnyOpen) return "UNAVAILABLE";
  return null;
}
