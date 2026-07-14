import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";

const REASON_DETAIL_MAX_CODE_POINTS = 500;
const ALLOWED_FORMAT_CHARACTERS = new Set(["\u200C", "\u200D"]);
const CONTROL_CHARACTER = /\p{Cc}/u;
const FORMAT_CHARACTER = /\p{Cf}/u;

export interface SubmitCustomerRefundIntakeInput {
  orderId: string;
  customerUserId: string;
  reasonCode: CustomerRefundIntakeReasonCode;
  reasonDetail?: string | null;
  now: Date;
}

export interface WithdrawCustomerRefundIntakeInput {
  orderId: string;
  customerUserId: string;
  now: Date;
}

export type SubmitCustomerRefundIntakeFailureCode =
  | "INVALID_ORDER_ID"
  | "INVALID_CUSTOMER_USER_ID"
  | "INVALID_REASON_CODE"
  | "INVALID_REASON_DETAIL_TYPE"
  | "REASON_DETAIL_CONTROL_CHARACTER"
  | "REASON_DETAIL_FORMAT_CHARACTER"
  | "REASON_DETAIL_TOO_LONG"
  | "INVALID_SUBMITTED_AT"
  | "ORDER_NOT_FOUND_OR_NOT_OWNED"
  | "ORDER_NOT_ELIGIBLE"
  | "INTAKE_INCONSISTENT";

export type WithdrawCustomerRefundIntakeFailureCode =
  | "INVALID_ORDER_ID"
  | "INVALID_CUSTOMER_USER_ID"
  | "INVALID_WITHDRAWN_AT"
  | "INTAKE_NOT_FOUND_OR_NOT_OWNED"
  | "NOT_WITHDRAWABLE";

export interface SubmitCustomerRefundIntakeFailure {
  ok: false;
  code: SubmitCustomerRefundIntakeFailureCode;
  message: string;
}

export interface WithdrawCustomerRefundIntakeFailure {
  ok: false;
  code: WithdrawCustomerRefundIntakeFailureCode;
  message: string;
}

export interface SubmittedCustomerRefundIntakeProjection {
  orderId: string;
  status: typeof CustomerRefundIntakeStatus.SUBMITTED;
  reasonCode: CustomerRefundIntakeReasonCode;
  reasonDetail: string | null;
  submittedAt: Date;
}

export interface WithdrawnCustomerRefundIntakeProjection {
  orderId: string;
  status: typeof CustomerRefundIntakeStatus.WITHDRAWN;
  withdrawnAt: Date;
}

export type SubmitCustomerRefundIntakeResult =
  | {
      ok: true;
      replayed: boolean;
      intake: SubmittedCustomerRefundIntakeProjection;
    }
  | SubmitCustomerRefundIntakeFailure;

export type WithdrawCustomerRefundIntakeResult =
  | {
      ok: true;
      replayed: boolean;
      intake: WithdrawnCustomerRefundIntakeProjection;
    }
  | WithdrawCustomerRefundIntakeFailure;

export interface NormalizedSubmitCustomerRefundIntakeInput {
  orderId: string;
  customerUserId: string;
  reasonCode: CustomerRefundIntakeReasonCode;
  reasonDetail: string | null;
  operationAt: Date;
}

export interface NormalizedWithdrawCustomerRefundIntakeInput {
  orderId: string;
  customerUserId: string;
  operationAt: Date;
}

export type NormalizeSubmitCustomerRefundIntakeResult =
  | { ok: true; input: NormalizedSubmitCustomerRefundIntakeInput }
  | SubmitCustomerRefundIntakeFailure;

export type NormalizeWithdrawCustomerRefundIntakeResult =
  | { ok: true; input: NormalizedWithdrawCustomerRefundIntakeInput }
  | WithdrawCustomerRefundIntakeFailure;

type NormalizeReasonDetailResult =
  | { ok: true; value: string | null }
  | SubmitCustomerRefundIntakeFailure;

export function normalizeSubmitCustomerRefundIntakeInput(
  input: SubmitCustomerRefundIntakeInput,
): NormalizeSubmitCustomerRefundIntakeResult {
  const orderId = normalizeIdentifier(input.orderId);
  if (orderId === null) return submitCustomerIntakeFailure("INVALID_ORDER_ID", "Order id is required.");
  const customerUserId = normalizeIdentifier(input.customerUserId);
  if (customerUserId === null) {
    return submitCustomerIntakeFailure("INVALID_CUSTOMER_USER_ID", "Customer user id is required.");
  }
  if (!isReasonCode(input.reasonCode)) {
    return submitCustomerIntakeFailure("INVALID_REASON_CODE", "Customer refund intake reason code is invalid.");
  }
  const reasonDetail = normalizeReasonDetail(input.reasonDetail);
  if (!reasonDetail.ok) return reasonDetail;
  const operationAt = normalizeOperationTime(input.now);
  if (operationAt === null) {
    return submitCustomerIntakeFailure("INVALID_SUBMITTED_AT", "Submission timestamp must be a valid date.");
  }
  return {
    ok: true,
    input: {
      orderId,
      customerUserId,
      reasonCode: input.reasonCode,
      reasonDetail: reasonDetail.value,
      operationAt,
    },
  };
}

export function normalizeWithdrawCustomerRefundIntakeInput(
  input: WithdrawCustomerRefundIntakeInput,
): NormalizeWithdrawCustomerRefundIntakeResult {
  const orderId = normalizeIdentifier(input.orderId);
  if (orderId === null) return withdrawCustomerIntakeFailure("INVALID_ORDER_ID", "Order id is required.");
  const customerUserId = normalizeIdentifier(input.customerUserId);
  if (customerUserId === null) {
    return withdrawCustomerIntakeFailure("INVALID_CUSTOMER_USER_ID", "Customer user id is required.");
  }
  const operationAt = normalizeOperationTime(input.now);
  if (operationAt === null) {
    return withdrawCustomerIntakeFailure("INVALID_WITHDRAWN_AT", "Withdrawal timestamp must be a valid date.");
  }
  return { ok: true, input: { orderId, customerUserId, operationAt } };
}

export function submitCustomerIntakeSuccess(
  intake: SubmittedCustomerRefundIntakeProjection,
  replayed: boolean,
): Extract<SubmitCustomerRefundIntakeResult, { ok: true }> {
  return { ok: true, replayed, intake };
}

export function withdrawCustomerIntakeSuccess(
  intake: WithdrawnCustomerRefundIntakeProjection,
  replayed: boolean,
): Extract<WithdrawCustomerRefundIntakeResult, { ok: true }> {
  return { ok: true, replayed, intake };
}

export function submitCustomerIntakeFailure(
  code: SubmitCustomerRefundIntakeFailureCode,
  message: string,
): SubmitCustomerRefundIntakeFailure {
  return { ok: false, code, message };
}

export function withdrawCustomerIntakeFailure(
  code: WithdrawCustomerRefundIntakeFailureCode,
  message: string,
): WithdrawCustomerRefundIntakeFailure {
  return { ok: false, code, message };
}

function normalizeIdentifier(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function isReasonCode(value: CustomerRefundIntakeReasonCode): boolean {
  return value === CustomerRefundIntakeReasonCode.CHANGE_OF_MIND
    || value === CustomerRefundIntakeReasonCode.PRODUCT_DEFECT
    || value === CustomerRefundIntakeReasonCode.DELIVERY_ISSUE
    || value === CustomerRefundIntakeReasonCode.OTHER;
}

function normalizeReasonDetail(value: string | null | undefined): NormalizeReasonDetailResult {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") {
    return submitCustomerIntakeFailure("INVALID_REASON_DETAIL_TYPE", "Reason detail must be text when present.");
  }

  // ECMAScript trim deliberately runs before character validation. It removes edge controls
  // such as TAB/LF and edge U+FEFF, while the same characters remain invalid in the interior.
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { ok: true, value: null };

  if (hasDisallowedControlCharacter(normalized)) {
    return submitCustomerIntakeFailure(
      "REASON_DETAIL_CONTROL_CHARACTER",
      "Reason detail contains a prohibited control character.",
    );
  }
  if (hasDisallowedFormatCharacter(normalized)) {
    return submitCustomerIntakeFailure(
      "REASON_DETAIL_FORMAT_CHARACTER",
      "Reason detail contains a prohibited format character.",
    );
  }
  if (Array.from(normalized).length > REASON_DETAIL_MAX_CODE_POINTS) {
    return submitCustomerIntakeFailure(
      "REASON_DETAIL_TOO_LONG",
      "Reason detail exceeds the 500-code-point limit.",
    );
  }
  return { ok: true, value: normalized };
}

function hasDisallowedControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => character !== "\n" && CONTROL_CHARACTER.test(character));
}

function hasDisallowedFormatCharacter(value: string): boolean {
  return Array.from(value).some((character) => (
    FORMAT_CHARACTER.test(character) && !ALLOWED_FORMAT_CHARACTERS.has(character)
  ));
}

function normalizeOperationTime(value: Date): Date | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return new Date(value.getTime());
}
