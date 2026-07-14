import {
  CustomerRefundIntakeStatus,
  RefundAttemptStatus,
  type RefundAttempt,
} from "@prisma/client";
import { isRefundRequestReasonWithinCodePointLimit } from "./invariants";
import type { RequestRefundAttemptFailure, RequestRefundAttemptFailureCode } from "./request";

export interface RejectCustomerRefundIntakeInput {
  orderId: string;
  intakeId: string;
  reviewedByUserId: string;
  adminRejectionReason: string;
  now: Date;
}

export interface ApproveCustomerRefundIntakeInput {
  orderId: string;
  intakeId: string;
  reviewedByUserId: string;
  amount: number;
  merchantRationale: string;
  now: Date;
}

export type SharedCustomerIntakeReviewFailureCode =
  | "INVALID_ORDER_ID"
  | "INVALID_INTAKE_ID"
  | "INVALID_REVIEWER_ID"
  | "INVALID_REVIEWED_AT"
  | "ORDER_NOT_FOUND"
  | "INTAKE_NOT_FOUND";

export type RejectCustomerRefundIntakeFailureCode =
  | SharedCustomerIntakeReviewFailureCode
  | "INVALID_REJECTION_REASON_TYPE"
  | "REJECTION_REASON_REQUIRED"
  | "REJECTION_REASON_TOO_LONG"
  | "NOT_REJECTABLE";

export type ApproveCustomerRefundIntakeFailureCode =
  | SharedCustomerIntakeReviewFailureCode
  | "INVALID_REQUEST_AMOUNT"
  | "INVALID_REASON"
  | "REASON_TOO_LONG"
  | "INTAKE_INCONSISTENT"
  | "NOT_APPROVABLE"
  | "ORDER_STATUS_NOT_REFUNDABLE"
  | "REFUND_IN_PROGRESS"
  | "PAYMENT_NOT_REFUNDABLE"
  | "PAYMENT_IDENTITY_MISMATCH"
  | "REFUND_LEDGER_INCONSISTENT"
  | "DISPUTE_REVIEW_REQUIRED"
  | "OVER_REFUND"
  | "INVALID_TOTAL_AMOUNT"
  | "CURRENCY_MISMATCH"
  | "EXISTING_ATTEMPT_CURRENCY_MISMATCH"
  | "INVALID_EXISTING_ATTEMPT_AMOUNT";

export interface RejectCustomerRefundIntakeFailure {
  ok: false;
  code: RejectCustomerRefundIntakeFailureCode;
  message: string;
}

export interface ApproveCustomerRefundIntakeFailure {
  ok: false;
  code: ApproveCustomerRefundIntakeFailureCode;
  message: string;
}

export interface RejectedCustomerRefundIntakeProjection {
  id: string;
  orderId: string;
  status: typeof CustomerRefundIntakeStatus.REJECTED;
  reviewedAt: Date;
  reviewedByUserId: string;
  adminRejectionReason: string;
}

export interface ApprovedCustomerRefundIntakeProjection {
  id: string;
  orderId: string;
  status: typeof CustomerRefundIntakeStatus.APPROVED;
  reviewedAt: Date;
  reviewedByUserId: string;
  approvedRefundAttemptId: string;
}

export interface ApprovedRefundAttemptProjection {
  id: string;
  orderId: string;
  status: RefundAttemptStatus;
  amount: number;
  currency: string;
  requestedAt: Date;
}

export type RejectCustomerRefundIntakeResult =
  | {
      ok: true;
      replayed: boolean;
      intake: RejectedCustomerRefundIntakeProjection;
    }
  | RejectCustomerRefundIntakeFailure;

export type ApproveCustomerRefundIntakeResult =
  | {
      ok: true;
      replayed: boolean;
      intake: ApprovedCustomerRefundIntakeProjection;
      attempt: ApprovedRefundAttemptProjection;
    }
  | ApproveCustomerRefundIntakeFailure;

export interface NormalizedRejectCustomerRefundIntakeInput {
  orderId: string;
  intakeId: string;
  reviewedByUserId: string;
  adminRejectionReason: string;
  reviewedAt: Date;
}

export interface NormalizedApproveCustomerRefundIntakeInput {
  orderId: string;
  intakeId: string;
  reviewedByUserId: string;
  amount: number;
  merchantRationale: string;
  reviewedAt: Date;
}

export type NormalizeRejectCustomerRefundIntakeResult =
  | { ok: true; input: NormalizedRejectCustomerRefundIntakeInput }
  | RejectCustomerRefundIntakeFailure;

export type NormalizeApproveCustomerRefundIntakeResult =
  | { ok: true; input: NormalizedApproveCustomerRefundIntakeInput }
  | ApproveCustomerRefundIntakeFailure;

type ApprovalRequestFailureResolution =
  | { kind: "expected"; code: ApproveCustomerRefundIntakeFailureCode }
  | { kind: "invariant"; code: RequestRefundAttemptFailureCode };

const APPROVAL_REQUEST_FAILURES = {
  ORDER_STATUS_NOT_REFUNDABLE: { kind: "expected", code: "ORDER_STATUS_NOT_REFUNDABLE" },
  REFUND_IN_PROGRESS: { kind: "expected", code: "REFUND_IN_PROGRESS" },
  PAYMENT_NOT_REFUNDABLE: { kind: "expected", code: "PAYMENT_NOT_REFUNDABLE" },
  PAYMENT_IDENTITY_MISMATCH: { kind: "expected", code: "PAYMENT_IDENTITY_MISMATCH" },
  REFUND_LEDGER_INCONSISTENT: { kind: "expected", code: "REFUND_LEDGER_INCONSISTENT" },
  DISPUTE_REVIEW_REQUIRED: { kind: "expected", code: "DISPUTE_REVIEW_REQUIRED" },
  OVER_REFUND: { kind: "expected", code: "OVER_REFUND" },
  INVALID_TOTAL_AMOUNT: { kind: "expected", code: "INVALID_TOTAL_AMOUNT" },
  CURRENCY_MISMATCH: { kind: "expected", code: "CURRENCY_MISMATCH" },
  EXISTING_ATTEMPT_CURRENCY_MISMATCH: { kind: "expected", code: "EXISTING_ATTEMPT_CURRENCY_MISMATCH" },
  INVALID_EXISTING_ATTEMPT_AMOUNT: { kind: "expected", code: "INVALID_EXISTING_ATTEMPT_AMOUNT" },
  ORDER_NOT_FOUND: { kind: "invariant", code: "ORDER_NOT_FOUND" },
  ORDER_STATUS_CONFLICT: { kind: "invariant", code: "ORDER_STATUS_CONFLICT" },
  IDEMPOTENCY_CONFLICT: { kind: "invariant", code: "IDEMPOTENCY_CONFLICT" },
  INVALID_REQUEST_AMOUNT: { kind: "invariant", code: "INVALID_REQUEST_AMOUNT" },
  INVALID_REASON: { kind: "invariant", code: "INVALID_REASON" },
  REASON_TOO_LONG: { kind: "invariant", code: "REASON_TOO_LONG" },
  INVALID_REFUND_ATTEMPT_ID: { kind: "invariant", code: "INVALID_REFUND_ATTEMPT_ID" },
  INVALID_ORDER_ID: { kind: "invariant", code: "INVALID_ORDER_ID" },
  INVALID_PAYMENT_ID: { kind: "invariant", code: "INVALID_PAYMENT_ID" },
  INVALID_ACTOR_USER_ID: { kind: "invariant", code: "INVALID_ACTOR_USER_ID" },
  INVALID_REQUESTED_AT: { kind: "invariant", code: "INVALID_REQUESTED_AT" },
} as const satisfies Record<RequestRefundAttemptFailureCode, ApprovalRequestFailureResolution>;

export function classifyApprovalRequestFailure(
  failure: RequestRefundAttemptFailure,
): { kind: "expected"; failure: ApproveCustomerRefundIntakeFailure } | { kind: "invariant"; code: string } {
  const resolution: ApprovalRequestFailureResolution = APPROVAL_REQUEST_FAILURES[failure.code];
  switch (resolution.kind) {
    case "expected":
      return { kind: "expected", failure: approveCustomerIntakeReviewFailure(resolution.code, failure.message) };
    case "invariant":
      return { kind: "invariant", code: resolution.code };
    default:
      return assertNever(resolution);
  }
}

export function normalizeRejectCustomerRefundIntakeInput(
  input: RejectCustomerRefundIntakeInput,
): NormalizeRejectCustomerRefundIntakeResult {
  const shared = normalizeSharedInput(input);
  if (!shared.ok) return rejectCustomerIntakeReviewFailure(shared.code, shared.message);
  if (typeof input.adminRejectionReason !== "string") {
    return rejectCustomerIntakeReviewFailure(
      "INVALID_REJECTION_REASON_TYPE",
      "Administrator rejection reason must be text.",
    );
  }
  const adminRejectionReason = input.adminRejectionReason.trim();
  if (!adminRejectionReason) {
    return rejectCustomerIntakeReviewFailure("REJECTION_REASON_REQUIRED", "Administrator rejection reason is required.");
  }
  if (!isRefundRequestReasonWithinCodePointLimit(adminRejectionReason)) {
    return rejectCustomerIntakeReviewFailure(
      "REJECTION_REASON_TOO_LONG",
      "Administrator rejection reason exceeds the 500-code-point limit.",
    );
  }
  return { ok: true, input: { ...shared.input, adminRejectionReason } };
}

export function normalizeApproveCustomerRefundIntakeInput(
  input: ApproveCustomerRefundIntakeInput,
): NormalizeApproveCustomerRefundIntakeResult {
  const shared = normalizeSharedInput(input);
  if (!shared.ok) return approveCustomerIntakeReviewFailure(shared.code, shared.message);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return approveCustomerIntakeReviewFailure(
      "INVALID_REQUEST_AMOUNT",
      "Requested refund amount must be a positive safe integer.",
    );
  }
  if (typeof input.merchantRationale !== "string") {
    return approveCustomerIntakeReviewFailure("INVALID_REASON", "Refund reason is required.");
  }
  const merchantRationale = input.merchantRationale.trim();
  if (!merchantRationale) {
    return approveCustomerIntakeReviewFailure("INVALID_REASON", "Refund reason is required.");
  }
  if (!isRefundRequestReasonWithinCodePointLimit(merchantRationale)) {
    return approveCustomerIntakeReviewFailure(
      "REASON_TOO_LONG",
      "Refund reason exceeds the 500-code-point limit.",
    );
  }
  return { ok: true, input: { ...shared.input, amount: input.amount, merchantRationale } };
}

export function rejectCustomerIntakeReviewSuccess(
  intake: RejectedCustomerRefundIntakeProjection,
  replayed: boolean,
): Extract<RejectCustomerRefundIntakeResult, { ok: true }> {
  return { ok: true, replayed, intake };
}

export function approveCustomerIntakeReviewSuccess(
  intake: ApprovedCustomerRefundIntakeProjection,
  attempt: ApprovedRefundAttemptProjection,
  replayed: boolean,
): Extract<ApproveCustomerRefundIntakeResult, { ok: true }> {
  return { ok: true, replayed, intake, attempt };
}

export function toApprovedRefundAttemptProjection(
  attempt: Pick<RefundAttempt, "id" | "orderId" | "status" | "amount" | "currency" | "requestedAt">,
): ApprovedRefundAttemptProjection {
  return {
    id: attempt.id,
    orderId: attempt.orderId,
    status: attempt.status,
    amount: attempt.amount,
    currency: attempt.currency,
    requestedAt: attempt.requestedAt,
  };
}

export function rejectCustomerIntakeReviewFailure(
  code: RejectCustomerRefundIntakeFailureCode,
  message: string,
): RejectCustomerRefundIntakeFailure {
  return { ok: false, code, message };
}

export function approveCustomerIntakeReviewFailure(
  code: ApproveCustomerRefundIntakeFailureCode,
  message: string,
): ApproveCustomerRefundIntakeFailure {
  return { ok: false, code, message };
}

type SharedInput = Pick<RejectCustomerRefundIntakeInput, "orderId" | "intakeId" | "reviewedByUserId" | "now">;

type NormalizeSharedInputResult =
  | {
      ok: true;
      input: {
        orderId: string;
        intakeId: string;
        reviewedByUserId: string;
        reviewedAt: Date;
      };
    }
  | {
      ok: false;
      code: Extract<
        SharedCustomerIntakeReviewFailureCode,
        "INVALID_ORDER_ID" | "INVALID_INTAKE_ID" | "INVALID_REVIEWER_ID" | "INVALID_REVIEWED_AT"
      >;
      message: string;
    };

function normalizeSharedInput(input: SharedInput): NormalizeSharedInputResult {
  const orderId = normalizeIdentifier(input.orderId);
  if (orderId === null) return { ok: false, code: "INVALID_ORDER_ID", message: "Order id is required." };
  const intakeId = normalizeIdentifier(input.intakeId);
  if (intakeId === null) return { ok: false, code: "INVALID_INTAKE_ID", message: "Intake id is required." };
  const reviewedByUserId = normalizeIdentifier(input.reviewedByUserId);
  if (reviewedByUserId === null) {
    return { ok: false, code: "INVALID_REVIEWER_ID", message: "Reviewer id is required." };
  }
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    return { ok: false, code: "INVALID_REVIEWED_AT", message: "Review timestamp must be a valid date." };
  }
  return {
    ok: true,
    input: {
      orderId,
      intakeId,
      reviewedByUserId,
      reviewedAt: new Date(input.now.getTime()),
    },
  };
}

function normalizeIdentifier(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled approval request failure classification: ${String(value)}`);
}
