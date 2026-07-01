import type { PaymentAdjustmentStatus } from "@prisma/client";

export type AdminRefundErrorCode =
  | "NOT_FOUND"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_REFUNDABLE"
  | "ALREADY"
  | "PROVIDER_FAILED";

export type AdminRefundInput = {
  orderId: string;
  paymentId: string;
  amount?: number;
  reason: string;
  idempotencyKey: string;
};

export type FailedAdminRefundResult = {
  success: false;
  errorCode: AdminRefundErrorCode;
  adjustmentId?: string;
  existingStatus?: PaymentAdjustmentStatus;
  providerError?: string;
  refundableAmount?: number;
};

export type AdminRefundResult =
  | {
      success: true;
      adjustmentId: string;
      paymentId: string;
      orderId: string;
      refundedAmount: number;
      refundableAmount: number;
      paymentStatus: "REFUNDED" | "PARTIALLY_REFUNDED";
      providerRefundId?: string;
    }
  | FailedAdminRefundResult;

export type PreparedRefund = {
  adjustmentId: string;
  orderId: string;
  paymentId: string;
  refundAmount: number;
  providerAmount?: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
  marketCode: string;
  providerTransactionId: string;
};

export type PrepareResult =
  | { ready: true; refund: PreparedRefund }
  | { ready: false; result: FailedAdminRefundResult };

export type AmountResult =
  | { success: true; refundAmount: number; providerAmount?: number }
  | { success: false; result: FailedAdminRefundResult };

export type RefundablePayment = {
  amount: number;
  providerTransactionId: string | null;
  order: { marketCode: string; currency: string };
  adjustments: Array<{ amount: number }>;
};
