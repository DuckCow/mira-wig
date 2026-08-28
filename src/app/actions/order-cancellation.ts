"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  isCustomerMtoOrderCancellationEnabled,
  isMtoProductionStartEnabled,
} from "@/lib/order-cancellation/activation";
import { cancelEligibleMtoOrder } from "@/lib/order-cancellation/cancel";
import { canonicalUuid } from "@/lib/order-cancellation/contracts";
import { startMtoProduction } from "@/lib/order-cancellation/production-start";
import { replaceOutstandingCancellationRefund } from "@/lib/order-cancellation/replacement";
import { getSession } from "@/lib/session";

type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "FEATURE_DISABLED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_AVAILABLE"
  | "CONFLICT"
  | "MANUAL_REVIEW_REQUIRED";

type ActionFailure = Readonly<{ success: false; errorCode: ActionErrorCode }>;

export type CustomerCancelOrderActionResult = Readonly<{
  success: true;
  outcome: "ACCEPTED" | "REPLAYED";
  orderId: string;
  acceptedAt: string;
  expectedRefundAmount: number;
  currency: string;
}> | ActionFailure;

export type StartMtoProductionActionResult = Readonly<{
  success: true;
  outcome: "STARTED" | "REPLAYED";
  orderId: string;
  orderItemId: string;
  startedAt: string;
}> | ActionFailure;

export type ReplaceCancellationRefundActionResult = Readonly<{
  success: true;
  outcome: "CREATED" | "REPLAYED";
  orderId: string;
  refundAttemptId: string;
  amount: number;
  currency: string;
}> | ActionFailure;

export async function cancelMtoOrderAction(input: unknown): Promise<CustomerCancelOrderActionResult> {
  const session = await getSession();
  if (!session?.user.id) return actionFailure("UNAUTHENTICATED");
  if (!isCustomerMtoOrderCancellationEnabled()) return actionFailure("FEATURE_DISABLED");
  const parsed = parseExactCancellationInput(input);
  if (!parsed) return actionFailure("INVALID_INPUT");

  const result = await cancelEligibleMtoOrder(db, {
    ...parsed,
    requestedByUserId: session.user.id,
  });
  if (!result.ok) return mapCancellationFailure(result.code);
  revalidateOrderSurfaces(result.orderId);
  return {
    success: true,
    outcome: result.replayed ? "REPLAYED" : "ACCEPTED",
    orderId: result.orderId,
    acceptedAt: result.acceptedAt.toISOString(),
    expectedRefundAmount: result.expectedRefundAmount,
    currency: result.currency,
  };
}

export async function startMtoProductionAction(input: unknown): Promise<StartMtoProductionActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  if (!isMtoProductionStartEnabled()) return actionFailure("FEATURE_DISABLED");
  const parsed = parseExactProductionStartInput(input);
  if (!parsed) return actionFailure("INVALID_INPUT");

  const result = await startMtoProduction(db, {
    ...parsed,
    startedByUserId: guard.session.user.id,
  });
  if (!result.ok) {
    if (result.code === "ORDER_NOT_FOUND" || result.code === "ITEM_NOT_FOUND") return actionFailure("NOT_FOUND");
    if (result.code === "REQUEST_KEY_CONFLICT" || result.code === "MANUFACTURING_STATE_CONFLICT") {
      return actionFailure("CONFLICT");
    }
    return actionFailure("NOT_AVAILABLE");
  }
  revalidateOrderSurfaces(result.orderId);
  return {
    success: true,
    outcome: result.replayed ? "REPLAYED" : "STARTED",
    orderId: result.orderId,
    orderItemId: result.orderItemId,
    startedAt: result.startedAt.toISOString(),
  };
}

export async function replaceCancellationRefundAction(
  input: unknown,
): Promise<ReplaceCancellationRefundActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const parsed = parseExactReplacementInput(input);
  if (!parsed) return actionFailure("INVALID_INPUT");

  const result = await replaceOutstandingCancellationRefund(db, {
    ...parsed,
    requestedByAdminUserId: guard.session.user.id,
  });
  if (!result.ok) return mapReplacementFailure(result.code);
  revalidateOrderSurfaces(result.orderId);
  return {
    success: true,
    outcome: result.replayed ? "REPLAYED" : "CREATED",
    orderId: result.orderId,
    refundAttemptId: result.refundAttemptId,
    amount: result.amount,
    currency: result.currency,
  };
}

function parseExactCancellationInput(value: unknown): { orderId: string; requestKey: string } | null {
  if (!hasExactStringKeys(value, ["orderId", "requestKey"])) return null;
  const orderId = canonicalIdentifier(value.orderId);
  const requestKey = canonicalUuid(value.requestKey);
  return orderId && requestKey ? { orderId, requestKey } : null;
}

function parseExactProductionStartInput(
  value: unknown,
): { orderId: string; orderItemId: string; requestKey: string } | null {
  if (!hasExactStringKeys(value, ["orderId", "orderItemId", "requestKey"])) return null;
  const orderId = canonicalIdentifier(value.orderId);
  const orderItemId = canonicalIdentifier(value.orderItemId);
  const requestKey = canonicalUuid(value.requestKey);
  return orderId && orderItemId && requestKey ? { orderId, orderItemId, requestKey } : null;
}

function parseExactReplacementInput(value: unknown): { orderId: string; requestKey: string } | null {
  return parseExactCancellationInput(value);
}

function hasExactStringKeys<T extends readonly string[]>(
  value: unknown,
  keys: T,
): value is Record<T[number], string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && keys.every((key) => actual.includes(key) && typeof Reflect.get(value, key) === "string");
}

function canonicalIdentifier(value: string): string | null {
  return value.length > 0 && value.length <= 191 && value === value.trim() ? value : null;
}

function revalidateOrderSurfaces(orderId: string): void {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/refunds/intakes");
  revalidatePath("/admin/refunds/execution");
}

function mapCancellationFailure(
  code: Exclude<Awaited<ReturnType<typeof cancelEligibleMtoOrder>>, { ok: true }>["code"],
): ActionFailure {
  if (code === "ORDER_NOT_FOUND_OR_NOT_OWNED") return actionFailure("NOT_FOUND");
  if (code === "REQUEST_KEY_CONFLICT" || code === "PERSISTENCE_CONFLICT") {
    return actionFailure("CONFLICT");
  }
  if (code === "REFUND_HISTORY_CONFLICT" || code === "PAYMENT_NOT_REFUNDABLE") {
    return actionFailure("MANUAL_REVIEW_REQUIRED");
  }
  return actionFailure("NOT_AVAILABLE");
}

function mapReplacementFailure(
  code: Exclude<Awaited<ReturnType<typeof replaceOutstandingCancellationRefund>>, { ok: true }>["code"],
): ActionFailure {
  if (code === "ORDER_NOT_FOUND") return actionFailure("NOT_FOUND");
  if (code === "REQUEST_KEY_CONFLICT" || code === "PERSISTENCE_CONFLICT") {
    return actionFailure("CONFLICT");
  }
  if (code.includes("LEDGER")
    || code === "DISPUTE_REVIEW_REQUIRED"
    || code === "PAYMENT_NOT_REFUNDABLE") {
    return actionFailure("MANUAL_REVIEW_REQUIRED");
  }
  return actionFailure("NOT_AVAILABLE");
}

function actionFailure(errorCode: ActionErrorCode): ActionFailure {
  return { success: false, errorCode };
}
