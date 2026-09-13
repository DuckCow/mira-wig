-- Exact retirement of the fixed Eximbay refund-readiness readback authority.

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
END
$authority$;

REVOKE SELECT ("id", "communicationLocale") ON TABLE "CheckoutSession"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "checkoutSessionId", "provider", "mode", "adapterExecutionKind",
  "status", "attemptLifecycle", "amount", "currency", "providerOrderId",
  "providerPaymentKey", "financialSucceededAt") ON TABLE "Payment"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "checkoutSessionId", "paymentId", "currency", "totalAmount", "status")
  ON TABLE "Order" FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "orderId", "paymentId", "amount", "currency", "status", "reason", "actorType",
  "actorUserId", "provider", "mode", "providerRefundId", "idempotencyKey",
  "requestedAt", "processedAt", "failedAt", "failureCode", "safeFailureMessage",
  "createdAt")
  ON TABLE "RefundAttempt" FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "refundAttemptId", "status", "availableAt", "leaseOwner", "leaseUntil",
  "leaseGeneration", "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode",
  "lastSafeErrorMessage") ON TABLE "RefundExecutionCommand"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "formatVersion", "provider", "mode", "commandId",
  "targetBindingDigest", "consumedAt")
  ON TABLE "EximbayRefundSandboxCanaryApproval"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "refundAttemptId", "provider", "mode", "providerOperationKey",
  "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
  "merchantAccountBindingId", "credentialGenerationBindingId")
  ON TABLE "RefundExecutionProviderOperationBinding"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "commandId", "refundAttemptId", "providerOperationBindingId",
  "targetBindingDigest", "expectedPredecessorGeneration", "operationClass",
  "releasePolicyDigest", "issuedAt", "expiresAt", "revokedAt", "consumedAt",
  "consumedLeaseEventId") ON TABLE "RefundExecutionAuthorization"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "commandId", "eventType", "leaseGeneration", "dispatchAttempt",
  "occurredAt", "createdAt") ON TABLE "RefundExecutionCommandEvent"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "commandId", "state", "contactMarkedAt")
  ON TABLE "RefundExecutionDispatchAttempt"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "bindingId") ON TABLE "RefundExecutionEximbayPreflightObservation"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "bindingId") ON TABLE "RefundExecutionProviderEligibilityProof"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "dispatchAttemptId") ON TABLE "RefundExecutionProviderContactEligibilityProof"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "commandId", "outcome")
  ON TABLE "RefundExecutionEvidence" FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "refundAttemptId", "fromStatus", "toStatus", "orderStatusBefore",
  "orderStatusAfter", "actorType", "actorUserId", "reason", "operationKey", "createdAt")
  ON TABLE "RefundAttemptTransition"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE SELECT ("id", "dedupKey")
  ON TABLE "PaymentOutbox" FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE CREATE, USAGE ON SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE CONNECT ON DATABASE refund_sandbox
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
