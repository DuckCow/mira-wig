"use server";

import { randomUUID } from "crypto";
import { OrderStatus, RefundAttemptActorType, RefundAttemptStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  closeRefundRequest,
  type CloseRefundRequestFailureCode,
} from "@/lib/payment/refund/close";
import {
  requestRefundAttempt,
  type RequestRefundAttemptFailureCode,
} from "@/lib/payment/refund/request";

export interface AdminRequestRefundAttemptInput {
  orderId: string;
  amount: number;
  reason: string;
}

export interface AdminCloseRefundRequestInput {
  orderId: string;
  refundAttemptId: string;
  reason: string;
}

export type AdminRefundActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_REFUNDABLE"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "REFUND_IN_PROGRESS"
  | "PROVIDER_CONTACT_ALREADY_STARTED"
  | "MANUAL_REVIEW_REQUIRED"
  | "CONFLICT";

type ActionFailure = { success: false; errorCode: AdminRefundActionErrorCode };

export type AdminRequestRefundAttemptResult =
  | { success: true; refundAttemptId: string; orderStatus: OrderStatus }
  | ActionFailure;

export type AdminCloseRefundRequestResult =
  | {
      success: true;
      transitionId: string;
      refundAttemptId: string;
      refundAttemptStatus: typeof RefundAttemptStatus.CANCELLED;
      restoredOrderStatus: typeof OrderStatus.PAID | typeof OrderStatus.PARTIALLY_REFUNDED;
      replayed: boolean;
    }
  | ActionFailure;

type InputValidationResult =
  | { success: true; input: AdminRequestRefundAttemptInput }
  | ActionFailure;

type CloseInputValidationResult =
  | { success: true; input: AdminCloseRefundRequestInput }
  | ActionFailure;

const REQUEST_FAILURE_CODE_MAP: Record<RequestRefundAttemptFailureCode, AdminRefundActionErrorCode> = {
  INVALID_REASON: "REASON_REQUIRED",
  REASON_TOO_LONG: "REASON_TOO_LONG",
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
  REFUND_LEDGER_INCONSISTENT: "MANUAL_REVIEW_REQUIRED",
  DISPUTE_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED",
  INVALID_ORDER_ID: "INVALID_INPUT",
  INVALID_REFUND_ATTEMPT_ID: "CONFLICT",
  INVALID_PAYMENT_ID: "CONFLICT",
  INVALID_ACTOR_USER_ID: "CONFLICT",
  INVALID_REQUESTED_AT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "CONFLICT",
  ORDER_STATUS_CONFLICT: "CONFLICT",
};

const CLOSE_FAILURE_CODE_MAP: Record<CloseRefundRequestFailureCode, AdminRefundActionErrorCode> = {
  INVALID_ORDER_ID: "INVALID_INPUT",
  INVALID_REFUND_ATTEMPT_ID: "INVALID_INPUT",
  INVALID_CLOSE_OPERATION_ID: "CONFLICT",
  INVALID_REASON: "REASON_REQUIRED",
  INVALID_ACTOR_USER_ID: "CONFLICT",
  INVALID_CLOSE_TIMESTAMP: "CONFLICT",
  ORDER_NOT_FOUND: "NOT_FOUND",
  REFUND_ATTEMPT_NOT_FOUND: "NOT_FOUND",
  REFUND_ATTEMPT_NOT_CANCELLABLE: "INVALID_TRANSITION",
  PROVIDER_CONTACT_ALREADY_STARTED: "PROVIDER_CONTACT_ALREADY_STARTED",
  ORDER_STATUS_CONFLICT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "CONFLICT",
  REFUND_LEDGER_INCONSISTENT: "MANUAL_REVIEW_REQUIRED",
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
  revalidatePath(`/admin/orders/${validated.input.orderId}`);
  return {
    success: true,
    refundAttemptId: result.refundAttempt.id,
    orderStatus: result.orderStatus,
  };
}

export async function closeRefundRequestAction(
  input: AdminCloseRefundRequestInput,
): Promise<AdminCloseRefundRequestResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;

  const validated = validateCloseInput(input);
  if (!validated.success) return validated;

  const result = await closeRefundRequest(db, {
    orderId: validated.input.orderId,
    refundAttemptId: validated.input.refundAttemptId,
    closeOperationId: randomUUID(),
    reason: validated.input.reason,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: guard.session.user.id,
    now: new Date(),
  });
  if (!result.ok) return failure(mapCloseFailureCode(result.code));
  revalidatePath(`/admin/orders/${validated.input.orderId}`);
  return {
    success: true,
    transitionId: result.transitionId,
    refundAttemptId: result.refundAttemptId,
    refundAttemptStatus: result.refundAttemptStatus,
    restoredOrderStatus: result.restoredOrderStatus,
    replayed: result.replayed,
  };
}

function validateInput(input: unknown): InputValidationResult {
  if (!isPlainRecord(input)) return failure("INVALID_INPUT");
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

function validateCloseInput(input: unknown): CloseInputValidationResult {
  if (!isPlainRecord(input)) return failure("INVALID_INPUT");
  const orderId = input.orderId;
  const refundAttemptId = input.refundAttemptId;
  const reason = input.reason;
  if (typeof orderId !== "string" || !orderId.trim()) return failure("INVALID_INPUT");
  if (typeof refundAttemptId !== "string" || !refundAttemptId.trim()) return failure("INVALID_INPUT");
  if (typeof reason !== "string") return failure("INVALID_INPUT");
  if (!reason.trim()) return failure("REASON_REQUIRED");
  return {
    success: true,
    input: {
      orderId: orderId.trim(),
      refundAttemptId: refundAttemptId.trim(),
      reason: reason.trim(),
    },
  };
}

function mapFailureCode(code: RequestRefundAttemptFailureCode): AdminRefundActionErrorCode {
  return REQUEST_FAILURE_CODE_MAP[code];
}

function mapCloseFailureCode(code: CloseRefundRequestFailureCode): AdminRefundActionErrorCode {
  return CLOSE_FAILURE_CODE_MAP[code];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function failure(errorCode: AdminRefundActionErrorCode): ActionFailure {
  return { success: false, errorCode };
}
