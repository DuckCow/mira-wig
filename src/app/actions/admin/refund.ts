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
  claimRefundAttemptForAdminSandboxExecution,
  classifyExistingRefundExecutionClaim,
  type ClaimRefundAttemptForExecutionFailureCode,
} from "@/lib/payment/refund/claim";
import {
  isRefundExecutionClaimEnabled,
  RefundExecutionActivationConfigError,
} from "@/lib/payment/refund/execution-activation";
import {
  requestRefundAttempt,
  type RequestRefundAttemptFailureCode,
} from "@/lib/payment/refund/request";
import { normalizeRefundLines, type RefundLineInput } from "@/lib/payment/refund/lines";

export interface AdminRequestRefundAttemptInput {
  orderId: string;
  amount: number;
  reason: string;
  lines: readonly RefundLineInput[];
}

export interface AdminCloseRefundRequestInput {
  orderId: string;
  refundAttemptId: string;
}

export interface AdminClaimRefundExecutionInput {
  orderId: string;
  refundAttemptId: string;
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

export type AdminClaimRefundExecutionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "FEATURE_DISABLED"
  | "CAPABILITY_UNSUPPORTED"
  | "NOT_CLAIMABLE"
  | "CONFLICT"
  | "MANUAL_REVIEW_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_INPUT";

export type AdminClaimRefundExecutionResult =
  | { success: true; outcome: "CLAIMED" | "REPLAYED" | "ALREADY_CLAIMED" }
  | { success: false; errorCode: AdminClaimRefundExecutionErrorCode };

type InputValidationResult =
  | { success: true; input: AdminRequestRefundAttemptInput }
  | ActionFailure;

type CloseInputValidationResult =
  | { success: true; input: AdminCloseRefundRequestInput }
  | ActionFailure;

type ClaimInputValidationResult =
  | { success: true; input: AdminClaimRefundExecutionInput }
  | { success: false; errorCode: "INVALID_INPUT" };

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
  INVALID_REFUND_LINES: "INVALID_INPUT",
  REFUND_LINE_ITEM_NOT_FOUND: "INVALID_INPUT",
  OVER_REFUND_LINE_QUANTITY: "INSUFFICIENT_REFUNDABLE",
  REFUND_LINE_HISTORY_UNATTRIBUTED: "MANUAL_REVIEW_REQUIRED",
  REFUND_LINE_LEDGER_INCONSISTENT: "MANUAL_REVIEW_REQUIRED",
  DISPUTE_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED",
  INVALID_ORDER_ID: "INVALID_INPUT",
  INVALID_REFUND_ATTEMPT_ID: "CONFLICT",
  INVALID_PAYMENT_ID: "CONFLICT",
  INVALID_ACTOR_USER_ID: "CONFLICT",
  INVALID_REQUESTED_AT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "CONFLICT",
  ORDER_STATUS_CONFLICT: "CONFLICT",
  ORDER_CANCELLED: "INVALID_TRANSITION",
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
  CANCELLATION_OBLIGATION_REQUIRED: "MANUAL_REVIEW_REQUIRED",
};

const CLAIM_FAILURE_CODE_MAP: Record<
  Exclude<ClaimRefundAttemptForExecutionFailureCode, "CLAIM_ARTIFACT_CONFLICT">,
  AdminClaimRefundExecutionErrorCode
> = {
  INVALID_ORDER_ID: "CONFLICT",
  INVALID_REFUND_ATTEMPT_ID: "CONFLICT",
  INVALID_ACTOR_TYPE: "CONFLICT",
  INVALID_ACTOR_USER_ID: "CONFLICT",
  INVALID_CLAIM_TIMESTAMP: "CONFLICT",
  ORDER_NOT_FOUND: "NOT_FOUND",
  REFUND_ATTEMPT_NOT_FOUND: "NOT_FOUND",
  REFUND_ATTEMPT_NOT_CLAIMABLE: "NOT_CLAIMABLE",
  ORDER_STATUS_CONFLICT: "NOT_CLAIMABLE",
  PAYMENT_NOT_REFUNDABLE: "NOT_CLAIMABLE",
  CLAIM_CAPABILITY_UNSUPPORTED: "CAPABILITY_UNSUPPORTED",
  REFUND_LEDGER_INCONSISTENT: "MANUAL_REVIEW_REQUIRED",
};

const ADMIN_CLOSE_REASON = "관리자가 처리 전 환불 요청을 철회함";

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
    reason: ADMIN_CLOSE_REASON,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: guard.session.user.id,
    now: new Date(),
  });
  if (!result.ok) return failure(mapCloseFailureCode(result.code));
  revalidateClosedRefundRequest(validated.input.orderId);
  return {
    success: true,
    transitionId: result.transitionId,
    refundAttemptId: result.refundAttemptId,
    refundAttemptStatus: result.refundAttemptStatus,
    restoredOrderStatus: result.restoredOrderStatus,
    replayed: result.replayed,
  };
}

export async function claimRefundExecutionAction(
  input: unknown,
): Promise<AdminClaimRefundExecutionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  if (!claimGateEnabled()) return { success: false, errorCode: "FEATURE_DISABLED" };

  const validated = validateClaimInput(input);
  if (!validated.success) return validated;

  let result: Awaited<ReturnType<typeof claimRefundAttemptForAdminSandboxExecution>>;
  try {
    result = await claimRefundAttemptForAdminSandboxExecution(db, {
      ...validated.input,
      actorUserId: guard.session.user.id,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return { success: false, errorCode: "FEATURE_DISABLED" };
    }
    throw error;
  }
  if (!result.ok) return mapClaimFailure(result.code, validated.input);

  revalidatePath(`/admin/orders/${validated.input.orderId}`);
  revalidatePath("/admin/refunds/execution");
  return { success: true, outcome: result.replayed ? "REPLAYED" : "CLAIMED" };
}

function validateInput(input: unknown): InputValidationResult {
  if (!isPlainRecord(input)) return failure("INVALID_INPUT");
  const orderId = input.orderId;
  const amount = input.amount;
  const reason = input.reason;
  const lines = input.lines;
  if (typeof orderId !== "string" || !orderId.trim()) return failure("INVALID_INPUT");
  if (typeof reason !== "string") return failure("INVALID_INPUT");
  if (!reason.trim()) return failure("REASON_REQUIRED");
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return failure("INVALID_AMOUNT");
  }
  const normalizedLines = normalizeRefundLines(lines);
  if (!normalizedLines.ok) return failure("INVALID_INPUT");
  return {
    success: true,
    input: {
      orderId: orderId.trim(),
      amount,
      reason: reason.trim(),
      lines: normalizedLines.lines,
    },
  };
}

function validateCloseInput(input: unknown): CloseInputValidationResult {
  if (!isPlainRecord(input)) return failure("INVALID_INPUT");
  const orderId = input.orderId;
  const refundAttemptId = input.refundAttemptId;
  if (typeof orderId !== "string" || !orderId.trim()) return failure("INVALID_INPUT");
  if (typeof refundAttemptId !== "string" || !refundAttemptId.trim()) return failure("INVALID_INPUT");
  return {
    success: true,
    input: {
      orderId: orderId.trim(),
      refundAttemptId: refundAttemptId.trim(),
    },
  };
}

function validateClaimInput(input: unknown): ClaimInputValidationResult {
  if (!isPlainRecord(input)) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !keys.every((key) => key === "orderId" || key === "refundAttemptId")) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }
  const orderId = input.orderId;
  const refundAttemptId = input.refundAttemptId;
  if (typeof orderId !== "string" || !orderId.trim()) return { success: false, errorCode: "INVALID_INPUT" };
  if (typeof refundAttemptId !== "string" || !refundAttemptId.trim()) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }
  return {
    success: true,
    input: { orderId: orderId.trim(), refundAttemptId: refundAttemptId.trim() },
  };
}

function revalidateClosedRefundRequest(orderId: string): void {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/admin/refunds/intakes");
}

function mapFailureCode(code: RequestRefundAttemptFailureCode): AdminRefundActionErrorCode {
  return REQUEST_FAILURE_CODE_MAP[code];
}

function mapCloseFailureCode(code: CloseRefundRequestFailureCode): AdminRefundActionErrorCode {
  return CLOSE_FAILURE_CODE_MAP[code];
}

async function mapClaimFailure(
  code: ClaimRefundAttemptForExecutionFailureCode,
  input: AdminClaimRefundExecutionInput,
): Promise<AdminClaimRefundExecutionResult> {
  if (code !== "CLAIM_ARTIFACT_CONFLICT") {
    return { success: false, errorCode: CLAIM_FAILURE_CODE_MAP[code] };
  }
  const classification = await classifyExistingRefundExecutionClaim(db, input);
  if (classification === "HEALTHY_EXISTING_CLAIM") {
    return { success: true, outcome: "ALREADY_CLAIMED" };
  }
  return { success: false, errorCode: "MANUAL_REVIEW_REQUIRED" };
}

function claimGateEnabled(): boolean {
  try {
    return isRefundExecutionClaimEnabled();
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) return false;
    throw error;
  }
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
