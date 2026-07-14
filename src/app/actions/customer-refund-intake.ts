"use server";

import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  isCustomerRefundIntakeSubmitEnabled,
} from "@/lib/payment/refund/customer-intake-activation";
import {
  normalizeSubmitCustomerRefundIntakeInput,
  normalizeWithdrawCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeFailureCode,
  type WithdrawCustomerRefundIntakeFailureCode,
} from "@/lib/payment/refund/customer-intake-contract";
import {
  submitCustomerRefundIntake,
  withdrawCustomerRefundIntake,
} from "@/lib/payment/refund/customer-intake";
import { getSession } from "@/lib/session";

export type CustomerRefundIntakeActionErrorCode =
  | "UNAUTHENTICATED"
  | "FEATURE_DISABLED"
  | "INVALID_INPUT"
  | "REASON_DETAIL_INVALID"
  | "REASON_DETAIL_TOO_LONG"
  | "NOT_FOUND"
  | "NOT_AVAILABLE"
  | "CONFLICT"
  | "NOT_WITHDRAWABLE";

type ActionFailure = {
  success: false;
  errorCode: CustomerRefundIntakeActionErrorCode;
};

export type SubmitCustomerRefundIntakeActionResult =
  | {
      success: true;
      outcome: "CREATED" | "REPLAYED_SAME_PAYLOAD" | "REPLAYED_DIFFERENT_PAYLOAD";
      intake: {
        orderId: string;
        status: typeof CustomerRefundIntakeStatus.SUBMITTED;
        reasonCode: CustomerRefundIntakeReasonCode;
        reasonDetail: string | null;
        submittedAt: string;
      };
    }
  | ActionFailure;

export type WithdrawCustomerRefundIntakeActionResult =
  | {
      success: true;
      outcome: "WITHDRAWN" | "ALREADY_WITHDRAWN";
      intake: {
        orderId: string;
        status: typeof CustomerRefundIntakeStatus.WITHDRAWN;
        withdrawnAt: string;
      };
    }
  | ActionFailure;

type ParsedSubmitInput = {
  orderId: string;
  reasonCode: CustomerRefundIntakeReasonCode;
  reasonDetail?: string | null;
};

type ParsedWithdrawInput = { orderId: string };

const SUBMIT_NORMALIZATION_FAILURES = {
  INVALID_ORDER_ID: "INVALID_INPUT", INVALID_CUSTOMER_USER_ID: null,
  INVALID_REASON_CODE: "INVALID_INPUT", INVALID_REASON_DETAIL_TYPE: "INVALID_INPUT",
  REASON_DETAIL_CONTROL_CHARACTER: "REASON_DETAIL_INVALID",
  REASON_DETAIL_FORMAT_CHARACTER: "REASON_DETAIL_INVALID",
  REASON_DETAIL_TOO_LONG: "REASON_DETAIL_TOO_LONG", INVALID_SUBMITTED_AT: null,
  ORDER_NOT_FOUND_OR_NOT_OWNED: null, ORDER_NOT_ELIGIBLE: null, INTAKE_INCONSISTENT: null,
} satisfies Record<SubmitCustomerRefundIntakeFailureCode, CustomerRefundIntakeActionErrorCode | null>;

const SUBMIT_CORE_FAILURES = {
  INVALID_ORDER_ID: null, INVALID_CUSTOMER_USER_ID: null, INVALID_REASON_CODE: null,
  INVALID_REASON_DETAIL_TYPE: null, REASON_DETAIL_CONTROL_CHARACTER: null,
  REASON_DETAIL_FORMAT_CHARACTER: null, REASON_DETAIL_TOO_LONG: null, INVALID_SUBMITTED_AT: null,
  ORDER_NOT_FOUND_OR_NOT_OWNED: "NOT_FOUND", ORDER_NOT_ELIGIBLE: "NOT_AVAILABLE",
  INTAKE_INCONSISTENT: "CONFLICT",
} satisfies Record<SubmitCustomerRefundIntakeFailureCode, CustomerRefundIntakeActionErrorCode | null>;

const WITHDRAW_NORMALIZATION_FAILURES = {
  INVALID_ORDER_ID: "INVALID_INPUT", INVALID_CUSTOMER_USER_ID: null, INVALID_WITHDRAWN_AT: null,
  INTAKE_NOT_FOUND_OR_NOT_OWNED: null, NOT_WITHDRAWABLE: null,
} satisfies Record<WithdrawCustomerRefundIntakeFailureCode, CustomerRefundIntakeActionErrorCode | null>;

const WITHDRAW_CORE_FAILURES = {
  INVALID_ORDER_ID: null, INVALID_CUSTOMER_USER_ID: null, INVALID_WITHDRAWN_AT: null,
  INTAKE_NOT_FOUND_OR_NOT_OWNED: "NOT_FOUND", NOT_WITHDRAWABLE: "NOT_WITHDRAWABLE",
} satisfies Record<WithdrawCustomerRefundIntakeFailureCode, CustomerRefundIntakeActionErrorCode | null>;

export async function submitCustomerRefundIntakeAction(
  input: unknown,
): Promise<SubmitCustomerRefundIntakeActionResult> {
  const actor = await authenticatedCustomerActor();
  if (!actor.success) return actor;
  if (!isCustomerRefundIntakeSubmitEnabled()) return failure("FEATURE_DISABLED");

  const parsed = parseSubmitInput(input);
  if (!parsed) return failure("INVALID_INPUT");
  const operationAt = new Date();
  const normalized = normalizeSubmitCustomerRefundIntakeInput({
    ...parsed,
    customerUserId: actor.customerUserId,
    now: operationAt,
  });
  if (!normalized.ok) return failure(mapSubmitNormalizationFailure(normalized.code));

  const result = await submitCustomerRefundIntake(db, {
    orderId: normalized.input.orderId,
    customerUserId: normalized.input.customerUserId,
    reasonCode: normalized.input.reasonCode,
    reasonDetail: normalized.input.reasonDetail,
    now: normalized.input.operationAt,
  });
  if (!result.ok) return failure(mapSubmitCoreFailure(result.code));

  const samePayload = result.intake.reasonCode === normalized.input.reasonCode
    && result.intake.reasonDetail === normalized.input.reasonDetail;
  const outcome = !result.replayed
    ? "CREATED"
    : samePayload
      ? "REPLAYED_SAME_PAYLOAD"
      : "REPLAYED_DIFFERENT_PAYLOAD";
  return {
    success: true,
    outcome,
    intake: {
      orderId: result.intake.orderId,
      status: result.intake.status,
      reasonCode: result.intake.reasonCode,
      reasonDetail: result.intake.reasonDetail,
      submittedAt: result.intake.submittedAt.toISOString(),
    },
  };
}

export async function withdrawCustomerRefundIntakeAction(
  input: unknown,
): Promise<WithdrawCustomerRefundIntakeActionResult> {
  const actor = await authenticatedCustomerActor();
  if (!actor.success) return actor;

  const parsed = parseWithdrawInput(input);
  if (!parsed) return failure("INVALID_INPUT");
  const operationAt = new Date();
  const normalized = normalizeWithdrawCustomerRefundIntakeInput({
    ...parsed,
    customerUserId: actor.customerUserId,
    now: operationAt,
  });
  if (!normalized.ok) return failure(mapWithdrawNormalizationFailure(normalized.code));

  const result = await withdrawCustomerRefundIntake(db, {
    orderId: normalized.input.orderId,
    customerUserId: normalized.input.customerUserId,
    now: normalized.input.operationAt,
  });
  if (!result.ok) return failure(mapWithdrawCoreFailure(result.code));
  return {
    success: true,
    outcome: result.replayed ? "ALREADY_WITHDRAWN" : "WITHDRAWN",
    intake: {
      orderId: result.intake.orderId,
      status: result.intake.status,
      withdrawnAt: result.intake.withdrawnAt.toISOString(),
    },
  };
}

async function authenticatedCustomerActor(): Promise<
  { success: true; customerUserId: string } | { success: false; errorCode: "UNAUTHENTICATED" }
> {
  const session = await getSession();
  if (!session?.user.id) return { success: false, errorCode: "UNAUTHENTICATED" };
  const customerUserId = session.user.id.trim();
  if (!customerUserId) throw actionInvariant();
  return { success: true, customerUserId };
}

function parseSubmitInput(value: unknown): ParsedSubmitInput | null {
  if (!hasExactKeys(value, ["orderId", "reasonCode", "reasonDetail"], ["orderId", "reasonCode"])) {
    return null;
  }
  if (typeof value.orderId !== "string" || !isReasonCode(value.reasonCode)) return null;
  const parsed = { orderId: value.orderId, reasonCode: value.reasonCode };
  if (!Object.hasOwn(value, "reasonDetail")) return parsed;
  const reasonDetail = value.reasonDetail;
  if (reasonDetail !== undefined && reasonDetail !== null && typeof reasonDetail !== "string") {
    return null;
  }
  return { ...parsed, reasonDetail };
}

function parseWithdrawInput(value: unknown): ParsedWithdrawInput | null {
  if (!hasExactKeys(value, ["orderId"], ["orderId"])) return null;
  return typeof value.orderId === "string" ? { orderId: value.orderId } : null;
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

function isReasonCode(value: unknown): value is CustomerRefundIntakeReasonCode {
  return value === CustomerRefundIntakeReasonCode.CHANGE_OF_MIND
    || value === CustomerRefundIntakeReasonCode.PRODUCT_DEFECT
    || value === CustomerRefundIntakeReasonCode.DELIVERY_ISSUE
    || value === CustomerRefundIntakeReasonCode.OTHER;
}

function mapSubmitNormalizationFailure(
  code: SubmitCustomerRefundIntakeFailureCode,
): CustomerRefundIntakeActionErrorCode {
  return mappedFailureOrInvariant(SUBMIT_NORMALIZATION_FAILURES[code]);
}

function mapSubmitCoreFailure(
  code: SubmitCustomerRefundIntakeFailureCode,
): CustomerRefundIntakeActionErrorCode {
  return mappedFailureOrInvariant(SUBMIT_CORE_FAILURES[code]);
}

function mapWithdrawNormalizationFailure(
  code: WithdrawCustomerRefundIntakeFailureCode,
): CustomerRefundIntakeActionErrorCode {
  return mappedFailureOrInvariant(WITHDRAW_NORMALIZATION_FAILURES[code]);
}

function mapWithdrawCoreFailure(
  code: WithdrawCustomerRefundIntakeFailureCode,
): CustomerRefundIntakeActionErrorCode {
  return mappedFailureOrInvariant(WITHDRAW_CORE_FAILURES[code]);
}

function failure(errorCode: CustomerRefundIntakeActionErrorCode): ActionFailure {
  return { success: false, errorCode };
}

function actionInvariant(): Error {
  return new Error("Customer refund intake action invariant failed.");
}

function mappedFailureOrInvariant(
  errorCode: CustomerRefundIntakeActionErrorCode | null,
): CustomerRefundIntakeActionErrorCode {
  if (errorCode === null) throw actionInvariant();
  return errorCode;
}
