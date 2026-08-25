BEGIN;

ALTER TABLE "Payment"
  DROP CONSTRAINT "Payment_attempt_lifecycle_evidence_check",
  ADD CONSTRAINT "Payment_attempt_lifecycle_evidence_check" CHECK (
    (
      "attemptLifecycle" = 'CONTACT_AUTHORIZED'
      AND "status" = 'INITIATED'
      AND "routingRuleId" IS NOT NULL
      AND "idempotencyKey" IS NOT NULL
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NULL
      AND "initiationOutputKind" IS NULL
      AND "initiationApproveUrl" IS NULL
      AND "initiationCompletedAt" IS NULL
      AND "providerRef" IS NULL
      AND "providerPaymentKey" IS NULL
      AND "financialSucceededAt" IS NULL
      AND "blockingEndedAt" IS NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" IN ('CONTACTED', 'OUTCOME_UNKNOWN')
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
      AND "blockingEndedAt" IS NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "provider" = 'EXIMBAY'
      AND "mode" = 'SANDBOX'
      AND "attemptLifecycle" = 'CONTACTED'
      AND "status" IN ('INITIATED', 'AWAITING')
      AND "remediationStatus" = 'NONE'
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
      AND "providerOrderId" IS NOT NULL
      AND "providerPaymentKey" IS NULL
      AND "financialSucceededAt" IS NULL
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
      AND "errorCode" = 'EXIMBAY_NO_TRANSACTION_OBSERVED'
    ) OR (
      "provider" = 'EXIMBAY'
      AND "mode" = 'SANDBOX'
      AND "attemptLifecycle" = 'OUTCOME_UNKNOWN'
      AND "status" IN ('INITIATED', 'AWAITING')
      AND "remediationStatus" = 'NONE'
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
      AND "providerOrderId" IS NOT NULL
      AND "providerPaymentKey" IS NULL
      AND "financialSucceededAt" IS NULL
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
      AND "errorCode" = 'EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN'
    ) OR (
      "attemptLifecycle" = 'SUPERSEDED'
      AND "supersededAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
      AND (
        (
          "remediationStatus" = 'NONE'
          AND "status" = 'INITIATED'
          AND "contactStartedAt" IS NULL
          AND "providerRef" IS NULL
          AND "providerPaymentKey" IS NULL
          AND "initiationOutputKind" IS NULL
          AND "initiationApproveUrl" IS NULL
          AND "initiationCompletedAt" IS NULL
          AND "financialSucceededAt" IS NULL
          AND "blockingEndedAt" IS NOT NULL
        )
        OR ("remediationStatus" <> 'NONE' AND "blockingEndedAt" IS NULL)
      )
    ) OR (
      "attemptLifecycle" = 'TERMINAL_FAILURE'
      AND "status" = 'FAILED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" = 'SUSPENDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NOT NULL
    ) OR (
      "attemptLifecycle" = 'FINALIZED'
      AND "status" = 'SUCCEEDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" = 'TERMINAL_REMEDIATED'
      AND "status" = 'VOIDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    )
  );

COMMIT;
