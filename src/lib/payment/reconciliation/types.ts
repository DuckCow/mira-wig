export type ReconciliationSeverity = "info" | "warning" | "critical";

export type ReconciliationConfidence = "high" | "medium" | "low";

export type ReconciliationRecommendedAction =
  | "NORMAL_IN_FLIGHT"
  | "WATCH_STALE"
  | "AUTO_REENTRY_CANDIDATE"
  | "MANUAL_REVIEW"
  | "ALERT_ONLY"
  | "SECURITY_SIGNAL"
  | "VOID_PENDING"
  | "VOID_FAILED_MAX_ATTEMPTS"
  | "VOID_MISMATCH_TERMINAL"
  | "DEFER_TO_D_STAGE"
  | "RETENTION_POLICY_OPEN";

export type ReconciliationFindingKind =
  | "SUCCEEDED_PAYMENT_WITHOUT_ORDER"
  | "ORDER_BAD_PAYMENT_STATUS"
  | "AMOUNT_CURRENCY_MISMATCH"
  | "SESSION_STATE_MISMATCH"
  | "PARTIAL_LOCAL_COMPLETION"
  | "PG_VOID_MAX_ATTEMPTS"
  | "PG_VOID_MISMATCH_TERMINAL"
  | "TRUSTED_EVENT_PARSE_FAILED"
  | "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED"
  | "STALE_PAYMENT_EVENT_RECEIVED"
  | "STALE_PAYMENT_EVENT_RETRYABLE_FAILED"
  | "WEBHOOK_VERIFY_REJECTION"
  | "WEBHOOK_METADATA_REJECTION"
  | "WEBHOOK_RAW_MISMATCH"
  | "WEBHOOK_VERIFY_REJECTION_SPIKE"
  | "WEBHOOK_METADATA_REJECTION_SPIKE"
  | "WEBHOOK_RAW_MISMATCH_SPIKE"
  | "TRUSTED_EVENT_PARSE_FAILED_SPIKE"
  | "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED_SPIKE";

export type ReconciliationSource =
  | "payment"
  | "order"
  | "checkoutSession"
  | "paymentOutbox"
  | "paymentEvent"
  | "webhookIngressRejection"
  | "orderItem"
  | "manufacturingRequest";

export type ReconciliationDetailValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export interface ReconciliationFinding {
  kind: ReconciliationFindingKind;
  severity: ReconciliationSeverity;
  recommendedAction: ReconciliationRecommendedAction;
  source: ReconciliationSource[];
  sourceIds: Partial<Record<ReconciliationSource, string[]>>;
  details: Record<string, ReconciliationDetailValue>;
  confidence?: ReconciliationConfidence;
}

export interface ReconcilePaymentCoreOptions {
  now?: Date;
  staleReceivedAfterMs?: number;
  staleRetryableFailedAfterMs?: number;
  staleSucceededPaymentAfterMs?: number;
  spikeWindowMs?: number;
  verifySpikeThreshold?: number;
  metadataSpikeThreshold?: number;
  rawMismatchSpikeThreshold?: number;
  parseFailureSpikeThreshold?: number;
  completeRetryableSpikeThreshold?: number;
}
