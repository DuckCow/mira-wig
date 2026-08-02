import type {
  Order,
  Payment,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";

export interface CaptureFacts {
  paymentId?: string;
  checkoutSessionId: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  providerPaymentKey: string;
  amount: number;
  currency: string;
  capturedAt?: Date;
  receivedAt: Date;
}

export type CapturedPayment = Pick<
  Payment,
  | "id"
  | "checkoutSessionId"
  | "provider"
  | "mode"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "amount"
  | "currency"
  | "providerPaymentKey"
  | "contactStartedAt"
  | "supersededAt"
  | "blockingEndedAt"
  | "suspendedByPaymentId"
>;

export type CompletionFailureCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_STATE_INVALID"
  | "SESSION_ALREADY_COMPLETED_BY_OTHER_PAYMENT"
  | "PAYMENT_NOT_SUCCEEDED"
  | "SUPERSEDED_ATTEMPT_CAPTURED"
  | "PAYMENT_BLOCKED_BY_REMEDIATION"
  | "PAYMENT_SESSION_MISMATCH"
  | "MODE_MISMATCH"
  | "PAYMENT_KEY_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "CAPTURE_AFTER_EXPIRY"
  | "SHIPPING_MISSING"
  | "LINES_MISSING"
  | "VARIANT_PARENT_MISMATCH"
  | "STYLE_UNPUBLISHED"
  | "VARIANT_UNAVAILABLE"
  | "VARIANT_PRICE_UNAVAILABLE"
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

export interface CompensationSkipped {
  kind: "compensationSkipped";
  failure: CompletionTerminalFailure;
  reason: "VOID_NOT_REQUIRED";
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
  | CompensationSkipped
  | CompletionRetryableFailure;

export type CreatedOrder = Pick<Order, "id" | "paymentId" | "checkoutSessionId">;
