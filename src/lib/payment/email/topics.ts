import type { Prisma } from "@prisma/client";

export const CUSTOMER_ORDER_PAID_EMAIL_V1 = "customer.order-paid.email.v1";
export const CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1 = "customer.refund-succeeded.email.v1";

export interface OrderPaidEmailPayload {
  orderId: string;
}

export interface RefundSucceededEmailPayload {
  refundAttemptId: string;
}

export function orderPaidEmailDedupKey(orderId: string): string {
  return `customer-order-paid:v1:${orderId}`;
}

export function refundSucceededEmailDedupKey(refundAttemptId: string): string {
  return `customer-refund-succeeded:v1:${refundAttemptId}`;
}

export function orderPaidEmailPayload(orderId: string): Prisma.InputJsonObject {
  return { orderId };
}

export function refundSucceededEmailPayload(refundAttemptId: string): Prisma.InputJsonObject {
  return { refundAttemptId };
}

export function parseOrderPaidEmailPayload(value: Prisma.JsonValue): OrderPaidEmailPayload | null {
  if (!isJsonObject(value) || !hasOnlyKey(value, "orderId")) return null;
  const orderId = value.orderId;
  return typeof orderId === "string" && orderId.trim().length > 0 ? { orderId } : null;
}

export function parseRefundSucceededEmailPayload(
  value: Prisma.JsonValue,
): RefundSucceededEmailPayload | null {
  if (!isJsonObject(value) || !hasOnlyKey(value, "refundAttemptId")) return null;
  const refundAttemptId = value.refundAttemptId;
  return typeof refundAttemptId === "string" && refundAttemptId.trim().length > 0
    ? { refundAttemptId }
    : null;
}

function hasOnlyKey(value: Prisma.JsonObject, key: string): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === key;
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
