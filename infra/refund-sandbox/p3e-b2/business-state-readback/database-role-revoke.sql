-- Exact retirement of the temporary CONTACTED-reconciliation readback authority.

DO $authority$
BEGIN
  IF current_database() NOT IN ('refund_sandbox', 'wig_platform_test') THEN
    RAISE EXCEPTION 'BUSINESS_STATE_READBACK_DATABASE_NOT_ADMITTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam'
  ) THEN
    RAISE EXCEPTION 'BUSINESS_STATE_READBACK_IAM_DATABASE_USER_REQUIRED';
  END IF;
END
$authority$;

REVOKE SELECT (
  "id", "status", "expiresAt", "createdAt", "updatedAt"
) ON TABLE "CheckoutSession"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

REVOKE SELECT (
  "id", "checkoutSessionId", "provider", "mode", "status",
  "attemptLifecycle", "remediationStatus", "amount", "currency",
  "providerOrderId", "providerPaymentKey", "contactStartedAt",
  "financialSucceededAt", "blockingEndedAt", "suspendedByPaymentId",
  "errorCode", "errorMessage", "createdAt", "updatedAt"
) ON TABLE "Payment"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

REVOKE SELECT (
  "id", "provider", "source", "transmissionId", "eventType",
  "verifiedMode", "verifiedCredentialBinding", "checkoutSessionId",
  "raw", "status", "receivedAt", "processedAt"
) ON TABLE "PaymentEvent"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

REVOKE SELECT (
  "id", "checkoutSessionId", "paymentId", "status", "createdAt", "updatedAt"
) ON TABLE "Order"
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE CREATE, USAGE ON SCHEMA public
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
REVOKE CONNECT ON DATABASE refund_sandbox
  FROM "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
