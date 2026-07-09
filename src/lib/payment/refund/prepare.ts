import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
} from "@prisma/client";
import {
  buildRefundAttemptIdempotencyKey,
  validateRefundRequest,
  type RefundAmountStateInput,
  type RefundInvariantViolationCode,
} from "./invariants";

export interface PrepareRefundAttemptInput {
  refundAttemptId: string;
  orderId: string;
  paymentId: string;
  orderAmount: number;
  currency: string;
  requestedAmount: number;
  requestedCurrency: string;
  existingAttempts: readonly RefundAmountStateInput[];
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId?: string | null;
  provider: PaymentProvider;
  mode: PaymentMode;
  now: Date;
}

export interface PreparedRefundAttempt {
  id: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: typeof RefundAttemptStatus.REQUESTED;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId: string | null;
  provider: PaymentProvider;
  mode: PaymentMode;
  providerRefundId: null;
  idempotencyKey: string;
  requestedAt: Date;
  processedAt: null;
  failedAt: null;
  failureCode: null;
  safeFailureMessage: null;
}

export type PrepareRefundAttemptFailureCode =
  | RefundInvariantViolationCode
  | "INVALID_REFUND_ATTEMPT_ID"
  | "INVALID_ORDER_ID"
  | "INVALID_PAYMENT_ID"
  | "INVALID_REASON"
  | "INVALID_ACTOR_USER_ID"
  | "INVALID_REQUESTED_AT";

export interface PrepareRefundAttemptFailure {
  ok: false;
  code: PrepareRefundAttemptFailureCode;
  message: string;
}

export type PrepareRefundAttemptResult =
  | {
      ok: true;
      refundAttempt: PreparedRefundAttempt;
      remainingRequestableAmount: number;
    }
  | PrepareRefundAttemptFailure;

interface NormalizedTextInput {
  refundAttemptId: string;
  orderId: string;
  paymentId: string;
  reason: string;
}

type NormalizeTextResult =
  | { ok: true; value: NormalizedTextInput }
  | PrepareRefundAttemptFailure;

type NormalizeActorResult =
  | { ok: true; value: string | null }
  | PrepareRefundAttemptFailure;

export function prepareRefundAttempt(
  input: PrepareRefundAttemptInput,
): PrepareRefundAttemptResult {
  const text = normalizeTextInput(input);
  if (!text.ok) return text;

  const actorUserId = normalizeActorUserId(input.actorType, input.actorUserId);
  if (!actorUserId.ok) return actorUserId;
  if (!isValidDate(input.now)) {
    return failure("INVALID_REQUESTED_AT", "Requested-at timestamp must be a valid date.");
  }

  const invariant = validateRefundRequest({
    totalAmount: input.orderAmount,
    currency: input.currency,
    requestedAmount: input.requestedAmount,
    requestedCurrency: input.requestedCurrency,
    attempts: input.existingAttempts,
  });
  if (!invariant.ok) return invariant;

  return {
    ok: true,
    refundAttempt: toPreparedAttempt(input, text.value, actorUserId.value),
    remainingRequestableAmount: invariant.remainingRequestableAmount,
  };
}

function normalizeTextInput(input: PrepareRefundAttemptInput): NormalizeTextResult {
  const refundAttemptId = input.refundAttemptId.trim();
  if (!refundAttemptId) {
    return failure("INVALID_REFUND_ATTEMPT_ID", "Refund attempt id is required.");
  }
  const orderId = input.orderId.trim();
  if (!orderId) return failure("INVALID_ORDER_ID", "Order id is required.");
  const paymentId = input.paymentId.trim();
  if (!paymentId) return failure("INVALID_PAYMENT_ID", "Payment id is required.");
  const reason = input.reason.trim();
  if (!reason) return failure("INVALID_REASON", "Refund reason is required.");
  return { ok: true, value: { refundAttemptId, orderId, paymentId, reason } };
}

function normalizeActorUserId(
  actorType: RefundAttemptActorType,
  actorUserId: string | null | undefined,
): NormalizeActorResult {
  if (actorUserId === null || actorUserId === undefined) {
    if (actorType === RefundAttemptActorType.ADMIN) {
      return failure("INVALID_ACTOR_USER_ID", "Admin refund attempts require an actor user id.");
    }
    return { ok: true, value: null };
  }

  const normalized = actorUserId.trim();
  if (!normalized) return failure("INVALID_ACTOR_USER_ID", "Actor user id cannot be blank.");
  return { ok: true, value: normalized };
}

function toPreparedAttempt(
  input: PrepareRefundAttemptInput,
  text: NormalizedTextInput,
  actorUserId: string | null,
): PreparedRefundAttempt {
  return {
    id: text.refundAttemptId,
    orderId: text.orderId,
    paymentId: text.paymentId,
    amount: input.requestedAmount,
    currency: input.currency,
    status: RefundAttemptStatus.REQUESTED,
    reason: text.reason,
    actorType: input.actorType,
    actorUserId,
    provider: input.provider,
    mode: input.mode,
    providerRefundId: null,
    idempotencyKey: buildRefundAttemptIdempotencyKey(text.paymentId, text.refundAttemptId),
    requestedAt: input.now,
    processedAt: null,
    failedAt: null,
    failureCode: null,
    safeFailureMessage: null,
  };
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function failure(
  code: PrepareRefundAttemptFailureCode,
  message: string,
): PrepareRefundAttemptFailure {
  return { ok: false, code, message };
}
