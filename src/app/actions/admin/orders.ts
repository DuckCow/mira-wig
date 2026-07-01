"use server";

// app/actions/admin/orders.ts -- admin order mutation actions
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  transitionOrderStatus,
  type OrderStatusTransitionErrorCode,
} from "@/lib/order/status-transition";
import {
  refundOrderPayment,
  type AdminRefundErrorCode,
} from "@/lib/payment/admin-refund";

type AdminOrderGuardErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

type AdminOrderTransitionActionErrorCode =
  | AdminOrderGuardErrorCode
  | OrderStatusTransitionErrorCode;

type RefundOrderPaymentActionErrorCode =
  | AdminOrderGuardErrorCode
  | AdminRefundErrorCode;

export type TransitionOrderStatusActionResult =
  | {
    success: true;
    previousStatus: string;
    status: string;
    idempotent: boolean;
  }
  | { success: false; errorCode: AdminOrderTransitionActionErrorCode };

export type RefundOrderPaymentActionInput = {
  orderId: string;
  paymentId: string;
  amount?: number;
  reason: string;
  idempotencyKey: string;
};

export type RefundOrderPaymentActionResult =
  | { success: true }
  | {
    success: false;
    errorCode: RefundOrderPaymentActionErrorCode;
    adjustmentId?: string;
    existingStatus?: string;
    providerError?: string;
    refundableAmount?: number;
  };

export async function transitionOrderStatusAction(
  orderId: string,
  targetStatus: string,
  expectedCurrentStatus?: string,
): Promise<TransitionOrderStatusActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const result = await transitionOrderStatus({ orderId, targetStatus, expectedCurrentStatus });
  if (!result.success) return { success: false, errorCode: result.errorCode };
  revalidateOrderPaths();
  return {
    success: true,
    previousStatus: result.previousStatus,
    status: result.status,
    idempotent: result.idempotent,
  };
}

export async function refundOrderPaymentAction(
  input: RefundOrderPaymentActionInput,
): Promise<RefundOrderPaymentActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;

  const result = await refundOrderPayment(input);
  revalidateOrderPaths();
  if (result.success) return { success: true };

  return {
    success: false,
    errorCode: result.errorCode,
    adjustmentId: result.adjustmentId,
    existingStatus: result.existingStatus,
    providerError: result.providerError,
    refundableAmount: result.refundableAmount,
  };
}

function revalidateOrderPaths(): void {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/[id]", "page");
  revalidatePath("/orders/[id]", "page");
}
