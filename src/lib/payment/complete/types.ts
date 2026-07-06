import type {
  Order,
  Payment,
  PaymentProvider,
} from "@prisma/client";

export interface CaptureFacts {
  checkoutSessionId: string;
  provider: PaymentProvider;
  providerPaymentKey: string;
  amount: number;
  currency: string;
  capturedAt?: Date;
  receivedAt: Date;
}

export type CapturedPayment = Pick<
  Payment,
  "id" | "checkoutSessionId" | "provider" | "status" | "amount" | "currency" | "providerPaymentKey"
>;

export type CompletionFailureCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_STATE_INVALID"
  | "SESSION_ALREADY_COMPLETED_BY_OTHER_PAYMENT"
  | "PAYMENT_NOT_SUCCEEDED"
  | "PAYMENT_SESSION_MISMATCH"
  | "PAYMENT_KEY_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "CAPTURE_AFTER_EXPIRY"
  | "SHIPPING_MISSING"
  | "LINES_MISSING"
  | "STOCK_INSUFFICIENT"
  | "TRANSITION_CONFLICT"
  | "TRANSIENT_DB_ERROR";

export interface CompletionTerminalFailure {
  kind: "terminalFailure";
  code: CompletionFailureCode;
  message: string;
  checkoutSessionId: string;
  paymentId: string;
  provider: PaymentProvider;
  providerPaymentKey: string;
  failedAt: Date;
}

export interface CompletionRetryableFailure {
  kind: "retryableFailure";
  code: CompletionFailureCode;
  message: string;
  checkoutSessionId: string;
  paymentId?: string;
}

export interface CompletionSucceeded {
  kind: "completed";
  checkoutSessionId: string;
  paymentId: string;
  orderId: string;
}

export interface CompletionAlreadyCompleted {
  kind: "alreadyCompleted";
  checkoutSessionId: string;
  paymentId: string;
  orderId: string;
}

export interface CompensationEnqueued {
  kind: "compensationEnqueued";
  failure: CompletionTerminalFailure;
  outboxDedupKey: string;
}

export type CompletionClassification =
  | CompletionRetryableFailure
  | CompletionTerminalFailure
  | CompletionAlreadyCompleted;

export type CompletionTransactionResult =
  | CompletionSucceeded
  | CompletionAlreadyCompleted
  | CompletionTerminalFailure
  | CompletionRetryableFailure;

export type CompleteFromCaptureResult =
  | CompletionSucceeded
  | CompletionAlreadyCompleted
  | CompensationEnqueued
  | CompletionRetryableFailure;

export type CreatedOrder = Pick<Order, "id" | "paymentId" | "checkoutSessionId">;
