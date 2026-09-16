"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createRefundAuthorizationAdmin } from "@/lib/payment/refund/authorization/admin";
import { RefundAuthorizationError, type AuthorizationErrorCode } from "@/lib/payment/refund/authorization/contract";
import { loadRefundReentryRelease } from "@/lib/payment/refund/authorization/release";

type ActionResult<T> = { success: true; data: T } | { success: false; errorCode: AuthorizationErrorCode };
const admin = () => createRefundAuthorizationAdmin(db, getSession, loadRefundReentryRelease);

export async function issueRefundExecutionAuthorizationAction(input: unknown) {
  return runAction(() => admin().issue(input));
}

export async function readRefundExecutionAuthorizationsAction(input: unknown) {
  return runAction(() => admin().read(input));
}

export async function revokeRefundExecutionAuthorizationAction(input: unknown) {
  return runAction(() => admin().revoke(input));
}

async function runAction<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    if (error instanceof RefundAuthorizationError) return { success: false, errorCode: error.code };
    throw error;
  }
}
