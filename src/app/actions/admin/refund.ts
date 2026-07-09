"use server";

import { randomUUID } from "crypto";
import { OrderStatus, RefundAttemptActorType } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  requestRefundAttempt,
  type RequestRefundAttemptFailureCode,
} from "@/lib/payment/refund/request";

export interface AdminRequestRefundAttemptInput {
  orderId: string;
  amount: number;
  reason: string;
}

export type AdminRefundActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "REASON_REQUIRED"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_REFUNDABLE"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "REFUND_IN_PROGRESS"
  | "MANUAL_REVIEW_REQUIRED"
  | "CONFLICT";

type ActionFailure = { success: false; errorCode: AdminRefundActionErrorCode };

export type AdminRequestRefundAttemptResult =
  | { success: true; refundAttemptId: string; orderStatus: OrderStatus }
  | ActionFailure;

type InputValidationResult =
  | { success: true; input: AdminRequestRefundAttemptInput }
  | ActionFailure;

const FAILURE_CODE_MAP: Record<RequestRefundAttemptFailureCode, AdminRefundActionErrorCode> = {
  INVALID_REASON: "REASON_REQUIRED",
  INVALID_REQUEST_AMOUNT: "INVALID_AMOUNT",
  OVER_REFUND: "INSUFFICIENT_REFUNDABLE",
  ORDER_NOT_FOUND: "NOT_FOUND",
  ORDER_STATUS_NOT_REFUNDABLE: "INVALID_TRANSITION",
  PAYMENT_NOT_REFUNDABLE: "INVALID_TRANSITION",
  INVALID_TOTAL_AMOUNT: "INVALID_TRANSITION",
  REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS",
  CURRENCY_MISMATCH: "MANUAL_REVIEW_REQUIRED",
  EXISTING_ATTEMPT_CURRENCY_MISMATCH: "MANUAL_REVIEW_REQUIRED",
  INVALID_EXISTING_ATTEMPT_AMOUNT: "MANUAL_REVIEW_REQUIRED",
  PAYMENT_IDENTITY_MISMATCH: "MANUAL_REVIEW_REQUIRED",
  DISPUTE_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED",
  INVALID_ORDER_ID: "INVALID_INPUT",
  INVALID_REFUND_ATTEMPT_ID: "CONFLICT",
  INVALID_PAYMENT_ID: "CONFLICT",
  INVALID_ACTOR_USER_ID: "CONFLICT",
  INVALID_REQUESTED_AT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "CONFLICT",
  ORDER_STATUS_CONFLICT: "CONFLICT",
};

export async function requestRefundAttemptAction(
  input: AdminRequestRefundAttemptInput,
): Promise<AdminRequestRefundAttemptResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;

  const validated = validateInput(input);
  if (!validated.success) return validated;

  const result = await requestRefundAttempt(db, {
    refundAttemptId: randomUUID(),
    ...validated.input,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: guard.session.user.id,
    now: new Date(),
  });
  if (!result.ok) return failure(mapFailureCode(result.code));
  return {
    success: true,
    refundAttemptId: result.refundAttempt.id,
    orderStatus: result.orderStatus,
  };
}

function validateInput(input: unknown): InputValidationResult {
  if (!isRecord(input)) return failure("INVALID_INPUT");
  const orderId = input.orderId;
  const amount = input.amount;
  const reason = input.reason;
  if (typeof orderId !== "string" || !orderId.trim()) return failure("INVALID_INPUT");
  if (typeof reason !== "string") return failure("INVALID_INPUT");
  if (!reason.trim()) return failure("REASON_REQUIRED");
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return failure("INVALID_AMOUNT");
  }
  return { success: true, input: { orderId: orderId.trim(), amount, reason: reason.trim() } };
}

function mapFailureCode(code: RequestRefundAttemptFailureCode): AdminRefundActionErrorCode {
  return FAILURE_CODE_MAP[code];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(errorCode: AdminRefundActionErrorCode): ActionFailure {
  return { success: false, errorCode };
}
