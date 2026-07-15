"use server";

import {
  CustomerRefundIntakeStatus,
  type RefundAttemptStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  isCustomerRefundIntakeApproveEnabled,
} from "@/lib/payment/refund/customer-intake-activation";
import {
  normalizeApproveCustomerRefundIntakeInput,
  normalizeRejectCustomerRefundIntakeInput,
  type ApproveCustomerRefundIntakeFailureCode,
  type RejectCustomerRefundIntakeFailureCode,
} from "@/lib/payment/refund/customer-intake-review-contract";
import {
  approveCustomerRefundIntake,
  rejectCustomerRefundIntake,
} from "@/lib/payment/refund/customer-intake-review";

export type AdminCustomerRefundIntakeActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "FEATURE_DISABLED"
  | "INVALID_INPUT"
  | "INVALID_AMOUNT"
  | "REJECTION_REASON_REQUIRED"
  | "REJECTION_REASON_TOO_LONG"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "ORDER_NOT_FOUND"
  | "INTAKE_NOT_FOUND"
  | "INTAKE_INCONSISTENT"
  | "NOT_REJECTABLE"
  | "NOT_APPROVABLE"
  | "INSUFFICIENT_REFUNDABLE"
  | "INVALID_TRANSITION"
  | "REFUND_IN_PROGRESS"
  | "MANUAL_REVIEW_REQUIRED";

type ActionFailure = {
  success: false;
  errorCode: AdminCustomerRefundIntakeActionErrorCode;
};

export type RejectCustomerRefundIntakeActionResult =
  | {
      success: true;
      outcome: "REJECTED" | "ALREADY_REJECTED";
      intake: {
        id: string;
        orderId: string;
        status: typeof CustomerRefundIntakeStatus.REJECTED;
        reviewedAt: string;
        adminRejectionReason: string;
      };
    }
  | ActionFailure;

export type ApproveCustomerRefundIntakeActionResult =
  | {
      success: true;
      outcome: "APPROVED" | "ALREADY_APPROVED";
      intake: {
        id: string;
        orderId: string;
        status: typeof CustomerRefundIntakeStatus.APPROVED;
        reviewedAt: string;
        approvedRefundAttemptId: string;
      };
      attempt: {
        id: string;
        orderId: string;
        status: RefundAttemptStatus;
        amount: number;
        currency: string;
        requestedAt: string;
      };
    }
  | ActionFailure;

type ParsedRejectInput = {
  orderId: string;
  intakeId: string;
  adminRejectionReason: string;
};

type ParsedApproveInput = {
  orderId: string;
  intakeId: string;
  amount: number;
  merchantRationale: string;
};

type ParseApproveResult =
  | { success: true; input: ParsedApproveInput }
  | { success: false; errorCode: "INVALID_INPUT" | "INVALID_AMOUNT" };

const REJECT_NORMALIZATION_FAILURES = {
  INVALID_ORDER_ID: "INVALID_INPUT", INVALID_INTAKE_ID: "INVALID_INPUT",
  INVALID_REVIEWER_ID: null, INVALID_REVIEWED_AT: null, ORDER_NOT_FOUND: null,
  INTAKE_NOT_FOUND: null, INVALID_REJECTION_REASON_TYPE: "INVALID_INPUT",
  REJECTION_REASON_REQUIRED: "REJECTION_REASON_REQUIRED",
  REJECTION_REASON_TOO_LONG: "REJECTION_REASON_TOO_LONG", NOT_REJECTABLE: null,
} satisfies Record<RejectCustomerRefundIntakeFailureCode, AdminCustomerRefundIntakeActionErrorCode | null>;

const REJECT_CORE_FAILURES = {
  INVALID_ORDER_ID: null, INVALID_INTAKE_ID: null, INVALID_REVIEWER_ID: null,
  INVALID_REVIEWED_AT: null, ORDER_NOT_FOUND: "ORDER_NOT_FOUND", INTAKE_NOT_FOUND: "INTAKE_NOT_FOUND",
  INVALID_REJECTION_REASON_TYPE: null, REJECTION_REASON_REQUIRED: null,
  REJECTION_REASON_TOO_LONG: null, NOT_REJECTABLE: "NOT_REJECTABLE",
} satisfies Record<RejectCustomerRefundIntakeFailureCode, AdminCustomerRefundIntakeActionErrorCode | null>;

const APPROVE_NORMALIZATION_FAILURES = {
  INVALID_ORDER_ID: "INVALID_INPUT", INVALID_INTAKE_ID: "INVALID_INPUT", INVALID_REVIEWER_ID: null,
  INVALID_REVIEWED_AT: null, ORDER_NOT_FOUND: null, INTAKE_NOT_FOUND: null,
  INVALID_REQUEST_AMOUNT: null, INVALID_REASON: "REASON_REQUIRED", REASON_TOO_LONG: "REASON_TOO_LONG",
  INTAKE_INCONSISTENT: null, NOT_APPROVABLE: null, ORDER_STATUS_NOT_REFUNDABLE: null,
  REFUND_IN_PROGRESS: null, PAYMENT_NOT_REFUNDABLE: null, PAYMENT_IDENTITY_MISMATCH: null,
  REFUND_LEDGER_INCONSISTENT: null, DISPUTE_REVIEW_REQUIRED: null, OVER_REFUND: null,
  INVALID_TOTAL_AMOUNT: null, CURRENCY_MISMATCH: null, EXISTING_ATTEMPT_CURRENCY_MISMATCH: null,
  INVALID_EXISTING_ATTEMPT_AMOUNT: null,
} satisfies Record<ApproveCustomerRefundIntakeFailureCode, AdminCustomerRefundIntakeActionErrorCode | null>;

const APPROVE_CORE_FAILURES = {
  INVALID_ORDER_ID: null, INVALID_INTAKE_ID: null, INVALID_REVIEWER_ID: null, INVALID_REVIEWED_AT: null,
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND", INTAKE_NOT_FOUND: "INTAKE_NOT_FOUND", INVALID_REQUEST_AMOUNT: null,
  INVALID_REASON: null, REASON_TOO_LONG: null, INTAKE_INCONSISTENT: "INTAKE_INCONSISTENT",
  NOT_APPROVABLE: "NOT_APPROVABLE", ORDER_STATUS_NOT_REFUNDABLE: "INVALID_TRANSITION",
  REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS", PAYMENT_NOT_REFUNDABLE: "INVALID_TRANSITION",
  PAYMENT_IDENTITY_MISMATCH: "MANUAL_REVIEW_REQUIRED", REFUND_LEDGER_INCONSISTENT: "MANUAL_REVIEW_REQUIRED",
  DISPUTE_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED", OVER_REFUND: "INSUFFICIENT_REFUNDABLE",
  INVALID_TOTAL_AMOUNT: "MANUAL_REVIEW_REQUIRED", CURRENCY_MISMATCH: "MANUAL_REVIEW_REQUIRED",
  EXISTING_ATTEMPT_CURRENCY_MISMATCH: "MANUAL_REVIEW_REQUIRED",
  INVALID_EXISTING_ATTEMPT_AMOUNT: "MANUAL_REVIEW_REQUIRED",
} satisfies Record<ApproveCustomerRefundIntakeFailureCode, AdminCustomerRefundIntakeActionErrorCode | null>;

export async function rejectCustomerRefundIntakeAction(
  input: unknown,
): Promise<RejectCustomerRefundIntakeActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const reviewedByUserId = guard.session.user.id.trim();
  if (!reviewedByUserId) throw actionInvariant();

  const parsed = parseRejectInput(input);
  if (!parsed) return failure("INVALID_INPUT");
  const operationAt = new Date();
  const normalized = normalizeRejectCustomerRefundIntakeInput({
    ...parsed,
    reviewedByUserId,
    now: operationAt,
  });
  if (!normalized.ok) return failure(mappedFailureOrInvariant(REJECT_NORMALIZATION_FAILURES[normalized.code]));

  const result = await rejectCustomerRefundIntake(db, {
    orderId: normalized.input.orderId,
    intakeId: normalized.input.intakeId,
    reviewedByUserId: normalized.input.reviewedByUserId,
    adminRejectionReason: normalized.input.adminRejectionReason,
    now: normalized.input.reviewedAt,
  });
  if (!result.ok) return failure(mappedFailureOrInvariant(REJECT_CORE_FAILURES[result.code]));
  const storedOrderId = result.intake.orderId;
  revalidatePath(`/admin/orders/${storedOrderId}`);
  revalidatePath("/admin/refunds/intakes");
  revalidatePath(`/orders/${storedOrderId}`);
  return {
    success: true,
    outcome: result.replayed ? "ALREADY_REJECTED" : "REJECTED",
    intake: {
      id: result.intake.id,
      orderId: storedOrderId,
      status: result.intake.status,
      reviewedAt: result.intake.reviewedAt.toISOString(),
      adminRejectionReason: result.intake.adminRejectionReason,
    },
  };
}

export async function approveCustomerRefundIntakeAction(
  input: unknown,
): Promise<ApproveCustomerRefundIntakeActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const reviewedByUserId = guard.session.user.id.trim();
  if (!reviewedByUserId) throw actionInvariant();
  if (!isCustomerRefundIntakeApproveEnabled()) return failure("FEATURE_DISABLED");
  const parsed = parseApproveInput(input);
  if (!parsed.success) return failure(parsed.errorCode);
  const operationAt = new Date();
  const normalized = normalizeApproveCustomerRefundIntakeInput({
    ...parsed.input,
    reviewedByUserId,
    now: operationAt,
  });
  if (!normalized.ok) return failure(mappedFailureOrInvariant(APPROVE_NORMALIZATION_FAILURES[normalized.code]));

  const result = await approveCustomerRefundIntake(db, {
    orderId: normalized.input.orderId,
    intakeId: normalized.input.intakeId,
    reviewedByUserId: normalized.input.reviewedByUserId,
    amount: normalized.input.amount,
    merchantRationale: normalized.input.merchantRationale,
    now: normalized.input.reviewedAt,
  });
  if (!result.ok) return failure(mappedFailureOrInvariant(APPROVE_CORE_FAILURES[result.code]));

  const storedOrderId = result.intake.orderId;
  revalidateApprovedCustomerRefundIntake(storedOrderId);
  return {
    success: true,
    outcome: result.replayed ? "ALREADY_APPROVED" : "APPROVED",
    intake: {
      id: result.intake.id,
      orderId: storedOrderId,
      status: result.intake.status,
      reviewedAt: result.intake.reviewedAt.toISOString(),
      approvedRefundAttemptId: result.intake.approvedRefundAttemptId,
    },
    attempt: {
      id: result.attempt.id,
      orderId: result.attempt.orderId,
      status: result.attempt.status,
      amount: result.attempt.amount,
      currency: result.attempt.currency,
      requestedAt: result.attempt.requestedAt.toISOString(),
    },
  };
}

function revalidateApprovedCustomerRefundIntake(orderId: string): void {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/refunds/intakes");
}

function parseRejectInput(value: unknown): ParsedRejectInput | null {
  if (!hasExactKeys(
    value,
    ["orderId", "intakeId", "adminRejectionReason"],
    ["orderId", "intakeId", "adminRejectionReason"],
  )) {
    return null;
  }
  if (
    typeof value.orderId !== "string"
    || typeof value.intakeId !== "string"
    || typeof value.adminRejectionReason !== "string"
  ) {
    return null;
  }
  return {
    orderId: value.orderId,
    intakeId: value.intakeId,
    adminRejectionReason: value.adminRejectionReason,
  };
}

function parseApproveInput(value: unknown): ParseApproveResult {
  if (!hasExactKeys(
    value,
    ["orderId", "intakeId", "amountMinor", "merchantRationale"],
    ["orderId", "intakeId", "amountMinor", "merchantRationale"],
  )) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }
  if (
    typeof value.orderId !== "string"
    || typeof value.intakeId !== "string"
    || typeof value.amountMinor !== "string"
    || typeof value.merchantRationale !== "string"
  ) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }
  if (!/^[1-9][0-9]*$/.test(value.amountMinor)) {
    return { success: false, errorCode: "INVALID_AMOUNT" };
  }
  const amount = Number(value.amountMinor);
  if (!Number.isSafeInteger(amount)) return { success: false, errorCode: "INVALID_AMOUNT" };
  return {
    success: true,
    input: {
      orderId: value.orderId,
      intakeId: value.intakeId,
      amount,
      merchantRationale: value.merchantRationale,
    },
  };
}

function hasExactKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) return false;
  return requiredKeys.every((key) => Object.hasOwn(value, key));
}

function failure(errorCode: AdminCustomerRefundIntakeActionErrorCode): ActionFailure {
  return { success: false, errorCode };
}

function actionInvariant(): Error {
  return new Error("Administrator customer refund intake action invariant failed.");
}

function mappedFailureOrInvariant(
  errorCode: AdminCustomerRefundIntakeActionErrorCode | null,
): AdminCustomerRefundIntakeActionErrorCode {
  if (errorCode === null) throw actionInvariant();
  return errorCode;
}
