// lib/order/status-transition.ts -- order fulfillment status transition core
import "server-only";

import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const NEXT_ORDER_STATUS_BY_CURRENT: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: "CONFIRMED",
  CONFIRMED: "MANUFACTURING",
  MANUFACTURING: "SHIPPED",
  SHIPPED: "DELIVERED",
};

const ORDER_STATUS_VALUES = [
  "PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "PENDING", "CONFIRMED",
  "MANUFACTURING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED",
] as const satisfies readonly OrderStatus[];

export type OrderStatusTransitionErrorCode =
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CONFLICT";

export type TransitionOrderStatusInput = {
  orderId: string;
  targetStatus: string;
  expectedCurrentStatus?: string;
};

export type TransitionOrderStatusResult =
  | {
    success: true;
    orderId: string;
    previousStatus: OrderStatus;
    status: OrderStatus;
    idempotent: boolean;
  }
  | {
    success: false;
    errorCode: OrderStatusTransitionErrorCode;
    currentStatus?: OrderStatus;
    expectedCurrentStatus?: OrderStatus;
    targetStatus?: OrderStatus;
  };

type NormalizedTransitionInput =
  | { success: true; targetStatus: OrderStatus; expectedStatus?: OrderStatus }
  | { success: false; result: TransitionOrderStatusResult };

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_VALUES.some((status) => status === value);
}

export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_ORDER_STATUS_BY_CURRENT[status] ?? null;
}

function invalid(targetStatus?: OrderStatus): TransitionOrderStatusResult {
  return { success: false, errorCode: "INVALID_TRANSITION", targetStatus };
}

function conflict(
  currentStatus: OrderStatus,
  expectedCurrentStatus?: OrderStatus,
  targetStatus?: OrderStatus,
): TransitionOrderStatusResult {
  return { success: false, errorCode: "CONFLICT", currentStatus, expectedCurrentStatus, targetStatus };
}

function normalizeInput(input: TransitionOrderStatusInput): NormalizedTransitionInput {
  const targetStatus = input.targetStatus;
  const expectedCurrentStatus = input.expectedCurrentStatus;
  if (!isOrderStatus(targetStatus)) return { success: false, result: invalid() };
  if (expectedCurrentStatus === undefined) return { success: true, targetStatus };
  if (!isOrderStatus(expectedCurrentStatus)) return { success: false, result: invalid(targetStatus) };
  return { success: true, targetStatus, expectedStatus: expectedCurrentStatus };
}

async function conflictAfterFailedUpdate(
  orderId: string,
  expectedStatus: OrderStatus,
  targetStatus: OrderStatus,
): Promise<TransitionOrderStatusResult> {
  const fresh = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!fresh) return { success: false, errorCode: "NOT_FOUND" };
  return conflict(fresh.status, expectedStatus, targetStatus);
}

export async function transitionOrderStatus(
  input: TransitionOrderStatusInput,
): Promise<TransitionOrderStatusResult> {
  const normalized = normalizeInput(input);
  if (!normalized.success) return normalized.result;
  const { targetStatus, expectedStatus } = normalized;
  const order = await db.order.findUnique({ where: { id: input.orderId }, select: { id: true, status: true } });
  if (!order) return { success: false, errorCode: "NOT_FOUND", targetStatus };
  if (expectedStatus && order.status !== expectedStatus) {
    return conflict(order.status, expectedStatus, targetStatus);
  }
  if (order.status === targetStatus) {
    return { success: true, orderId: order.id, previousStatus: order.status, status: order.status, idempotent: true };
  }
  if (getNextOrderStatus(order.status) !== targetStatus) return invalid(targetStatus);
  const updated = await db.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: targetStatus },
  });
  if (updated.count === 1) {
    return { success: true, orderId: order.id, previousStatus: order.status, status: targetStatus, idempotent: false };
  }
  return conflictAfterFailedUpdate(order.id, order.status, targetStatus);
}
