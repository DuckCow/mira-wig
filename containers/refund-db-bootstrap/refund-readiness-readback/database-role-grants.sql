-- Exact, temporary, SELECT-only authority for the fixed Eximbay refund-readiness readback.

DO $authority$
BEGIN
  IF current_database() NOT IN ('refund_sandbox', 'wig_platform_test') THEN
    RAISE EXCEPTION 'REFUND_READINESS_READBACK_DATABASE_NOT_ADMITTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam'
  ) THEN
    RAISE EXCEPTION 'REFUND_READINESS_READBACK_IAM_DATABASE_USER_REQUIRED';
  END IF;
  IF to_regclass('public."Payment"') IS NULL
    OR to_regclass('public."Order"') IS NULL
    OR to_regclass('public."RefundAttempt"') IS NULL
    OR to_regclass('public."RefundExecutionCommand"') IS NULL
    OR to_regclass('public."RefundExecutionAuthorization"') IS NULL THEN
    RAISE EXCEPTION 'REFUND_READINESS_READBACK_SCHEMA_REQUIRED';
  END IF;
END
$authority$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE CREATE ON SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT CONNECT ON DATABASE refund_sandbox
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
GRANT USAGE ON SCHEMA public
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "communicationLocale"
) ON TABLE "CheckoutSession"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "checkoutSessionId", "provider", "mode", "adapterExecutionKind",
  "status", "attemptLifecycle", "amount", "currency", "providerOrderId",
  "providerPaymentKey", "financialSucceededAt"
) ON TABLE "Payment"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "checkoutSessionId", "paymentId", "currency", "totalAmount", "status"
) ON TABLE "Order"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "orderId", "paymentId", "amount", "currency", "status", "reason", "actorType",
  "actorUserId", "provider", "mode", "providerRefundId", "idempotencyKey",
  "requestedAt", "processedAt", "failedAt", "failureCode", "safeFailureMessage",
  "createdAt"
) ON TABLE "RefundAttempt"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "refundAttemptId", "status", "availableAt", "leaseOwner", "leaseUntil",
  "leaseGeneration", "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode",
  "lastSafeErrorMessage"
) ON TABLE "RefundExecutionCommand"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "formatVersion", "provider", "mode", "commandId", "targetBindingDigest", "consumedAt"
) ON TABLE "EximbayRefundSandboxCanaryApproval"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "refundAttemptId", "provider", "mode", "providerOperationKey",
  "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
  "merchantAccountBindingId", "credentialGenerationBindingId"
) ON TABLE "RefundExecutionProviderOperationBinding"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "commandId", "refundAttemptId", "providerOperationBindingId",
  "targetBindingDigest", "expectedPredecessorGeneration", "operationClass",
  "releasePolicyDigest", "issuedAt", "expiresAt", "revokedAt", "consumedAt",
  "consumedLeaseEventId"
) ON TABLE "RefundExecutionAuthorization"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "commandId", "eventType", "leaseGeneration", "dispatchAttempt",
  "occurredAt", "createdAt"
) ON TABLE "RefundExecutionCommandEvent"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "commandId", "state", "contactMarkedAt"
) ON TABLE "RefundExecutionDispatchAttempt"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "bindingId"
) ON TABLE "RefundExecutionEximbayPreflightObservation"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "bindingId"
) ON TABLE "RefundExecutionProviderEligibilityProof"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "dispatchAttemptId"
) ON TABLE "RefundExecutionProviderContactEligibilityProof"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "commandId", "outcome"
) ON TABLE "RefundExecutionEvidence"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "refundAttemptId", "fromStatus", "toStatus", "orderStatusBefore",
  "orderStatusAfter", "actorType", "actorUserId", "reason", "operationKey", "createdAt"
) ON TABLE "RefundAttemptTransition"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "topic", "payload", "status", "attempts", "dedupKey", "processedAt"
) ON TABLE "PaymentOutbox"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
