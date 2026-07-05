"use server";

// app/actions/admin/orders.ts -- admin order mutation actions
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  transitionOrderStatus,
  type OrderStatusTransitionErrorCode,
} from "@/lib/order/status-transition";

type AdminOrderGuardErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

type AdminOrderTransitionActionErrorCode =
  | AdminOrderGuardErrorCode
  | OrderStatusTransitionErrorCode;

export type TransitionOrderStatusActionResult =
  | {
    success: true;
    previousStatus: string;
    status: string;
    idempotent: boolean;
  }
  | { success: false; errorCode: AdminOrderTransitionActionErrorCode };

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

function revalidateOrderPaths(): void {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/[id]", "page");
  revalidatePath("/orders/[id]", "page");
}
