import "server-only";

import { Prisma, type PaymentAdjustmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import type { RefundInput, RefundResult } from "@/lib/payment/types";
import type {
  AdminRefundErrorCode,
  AdminRefundInput,
  AdminRefundResult,
  AmountResult,
  FailedAdminRefundResult,
  PreparedRefund,
  PrepareResult,
  RefundablePayment,
} from "@/lib/payment/admin-refund-types";

export type { AdminRefundErrorCode, AdminRefundInput, AdminRefundResult };

export async function refundOrderPayment(input: AdminRefundInput): Promise<AdminRefundResult> {
  const prepared = await prepareRefund(input);
  if (!prepared.ready) return prepared.result;
  const providerResult = await requestProviderRefund(prepared.refund);
  if (providerResult.status !== "SUCCEEDED") {
    return markProviderFailure(prepared.refund, providerResult);
  }
  return finalizeSuccessfulRefund(prepared.refund, providerResult);
}

async function prepareRefund(input: AdminRefundInput): Promise<PrepareResult> {
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.paymentAdjustment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, status: true },
      });
      if (existing) return already(existing);

      const payment = await loadRefundablePayment(input, tx);
      const providerTransactionId = payment?.providerTransactionId;
      if (!payment || !providerTransactionId) return prepFailed(failed("NOT_FOUND"));

      const amount = resolveRefundAmount(input.amount, payment);
      if (!amount.success) return prepFailed(amount.result);

      const adjustment = await createPendingAdjustment(input, amount.refundAmount, payment, tx);
      return {
        ready: true,
        refund: toPreparedRefund(input, amount, payment, providerTransactionId, adjustment.id),
      };
    });
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    return findExistingAdjustment(input.idempotencyKey);
  }
}

async function loadRefundablePayment(
  input: AdminRefundInput,
  tx: Prisma.TransactionClient,
): Promise<RefundablePayment | null> {
  return tx.payment.findFirst({
    where: {
      id: input.paymentId,
      orderId: input.orderId,
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
    },
    select: {
      amount: true,
      providerTransactionId: true,
      order: { select: { marketCode: true, currency: true } },
      adjustments: { where: { status: "SUCCEEDED" }, select: { amount: true } },
    },
  });
}

async function createPendingAdjustment(
  input: AdminRefundInput,
  amount: number,
  payment: RefundablePayment,
  tx: Prisma.TransactionClient,
): Promise<{ id: string }> {
  return tx.paymentAdjustment.create({
    data: {
      paymentId: input.paymentId,
      amount,
      currency: payment.order.currency,
      reason: input.reason,
      status: "PENDING",
      idempotencyKey: input.idempotencyKey,
    },
    select: { id: true },
  });
}

function resolveRefundAmount(
  requestedAmount: number | undefined,
  payment: RefundablePayment,
): AmountResult {
  const refundableAmount = payment.amount - sumAmounts(payment.adjustments);
  if (requestedAmount === undefined) {
    if (refundableAmount <= 0) return { success: false, result: failed("INSUFFICIENT_REFUNDABLE", { refundableAmount }) };
    return { success: true, refundAmount: refundableAmount };
  }
  if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
    return { success: false, result: failed("INVALID_AMOUNT") };
  }
  if (requestedAmount > refundableAmount) {
    return { success: false, result: failed("INSUFFICIENT_REFUNDABLE", { refundableAmount }) };
  }
  return { success: true, refundAmount: requestedAmount, providerAmount: requestedAmount };
}

function toPreparedRefund(
  input: AdminRefundInput,
  amount: { refundAmount: number; providerAmount?: number },
  payment: RefundablePayment,
  providerTransactionId: string,
  adjustmentId: string,
): PreparedRefund {
  return {
    adjustmentId,
    orderId: input.orderId,
    paymentId: input.paymentId,
    refundAmount: amount.refundAmount,
    providerAmount: amount.providerAmount,
    currency: payment.order.currency,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    marketCode: payment.order.marketCode,
    providerTransactionId,
  };
}

async function requestProviderRefund(refund: PreparedRefund): Promise<RefundResult> {
  const provider = getPaymentProvider(refund.marketCode);
  if (!provider.refund) return unsupportedRefund(refund);
  const input: RefundInput = {
    orderId: refund.orderId,
    providerTransactionId: refund.providerTransactionId,
    amount: refund.providerAmount,
    currency: refund.currency,
    reason: refund.reason,
    idempotencyKey: refund.idempotencyKey,
  };
  return provider.refund(input);
}

async function markProviderFailure(
  refund: PreparedRefund,
  result: RefundResult,
): Promise<AdminRefundResult> {
  await db.paymentAdjustment.update({
    where: { id: refund.adjustmentId },
    data: {
      status: toAdjustmentStatus(result.status),
      providerRefundId: result.providerRefundId,
      refundableAmount: result.refundableAmount,
    },
  });
  const providerError = providerErrorMessage(result);
  console.error("ADMIN_REFUND_PROVIDER_FAILED", {
    orderId: refund.orderId,
    paymentId: refund.paymentId,
    adjustmentId: refund.adjustmentId,
    providerError,
  });
  return failed("PROVIDER_FAILED", { adjustmentId: refund.adjustmentId, providerError });
}

async function finalizeSuccessfulRefund(
  refund: PreparedRefund,
  result: RefundResult,
): Promise<AdminRefundResult> {
  try {
    return await db.$transaction((tx) => finalizeRefundTransaction(refund, result, tx));
  } catch (error) {
    console.error("ADMIN_REFUND_POST_PROVIDER_FAILED", {
      orderId: refund.orderId,
      paymentId: refund.paymentId,
      adjustmentId: refund.adjustmentId,
      providerRefundId: result.providerRefundId,
      providerError: errorMessage(error),
    });
    return failed("PROVIDER_FAILED", {
      adjustmentId: refund.adjustmentId,
      providerError: errorMessage(error),
    });
  }
}

async function finalizeRefundTransaction(
  refund: PreparedRefund,
  result: RefundResult,
  tx: Prisma.TransactionClient,
): Promise<AdminRefundResult> {
  const payment = await tx.payment.findUnique({
    where: { id: refund.paymentId },
    select: { amount: true },
  });
  if (!payment) throw new Error("payment_not_found_after_refund");
  const refundedAmount = (await succeededAdjustmentTotal(refund.paymentId, tx)) + refund.refundAmount;
  if (refundedAmount > payment.amount) throw new Error("refund_total_exceeds_payment");

  const paymentStatus = refundedAmount === payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const refundableAmount = payment.amount - refundedAmount;
  await tx.paymentAdjustment.update({
    where: { id: refund.adjustmentId },
    data: { status: "SUCCEEDED", providerRefundId: result.providerRefundId, refundableAmount: result.refundableAmount ?? refundableAmount },
  });
  await tx.payment.update({ where: { id: refund.paymentId }, data: { status: paymentStatus } });
  await updateOrderAfterRefund(refund.orderId, paymentStatus, tx);

  return {
    success: true,
    adjustmentId: refund.adjustmentId,
    paymentId: refund.paymentId,
    orderId: refund.orderId,
    refundedAmount,
    refundableAmount,
    paymentStatus,
    providerRefundId: result.providerRefundId,
  };
}

async function updateOrderAfterRefund(
  orderId: string,
  paymentStatus: "REFUNDED" | "PARTIALLY_REFUNDED",
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (paymentStatus === "REFUNDED") {
    await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } });
    return;
  }
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus } });
}

async function succeededAdjustmentTotal(paymentId: string, tx: Prisma.TransactionClient): Promise<number> {
  const aggregate = await tx.paymentAdjustment.aggregate({
    where: { paymentId, status: "SUCCEEDED" },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? 0;
}

function sumAmounts(adjustments: Array<{ amount: number }>): number {
  return adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
}

function already(existing: { id: string; status: PaymentAdjustmentStatus }): PrepareResult {
  return prepFailed(failed("ALREADY", { adjustmentId: existing.id, existingStatus: existing.status }));
}

function prepFailed(result: FailedAdminRefundResult): PrepareResult {
  return { ready: false, result };
}

function failed(
  errorCode: AdminRefundErrorCode,
  extra: Omit<FailedAdminRefundResult, "success" | "errorCode"> = {},
): FailedAdminRefundResult {
  return { success: false, errorCode, ...extra };
}

async function findExistingAdjustment(idempotencyKey: string): Promise<PrepareResult> {
  const existing = await db.paymentAdjustment.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error("idempotency_conflict_without_adjustment");
  return already(existing);
}

function unsupportedRefund(refund: PreparedRefund): RefundResult {
  return {
    providerTransactionId: refund.providerTransactionId,
    status: "FAILED",
    errorMessage: "refund_not_supported",
  };
}

function toAdjustmentStatus(status: RefundResult["status"]): PaymentAdjustmentStatus {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "PENDING") return "PENDING";
  return "FAILED";
}

function providerErrorMessage(result: RefundResult): string {
  return result.errorMessage ?? `refund_${result.status.toLowerCase()}`;
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}
