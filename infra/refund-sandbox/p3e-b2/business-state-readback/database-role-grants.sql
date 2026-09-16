-- Exact, temporary, SELECT-only authority for the single historical
-- Eximbay CONTACTED-reconciliation business-state readback.

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
  IF to_regclass('public."CheckoutSession"') IS NULL
    OR to_regclass('public."Payment"') IS NULL
    OR to_regclass('public."PaymentEvent"') IS NULL
    OR to_regclass('public."Order"') IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_STATE_READBACK_SCHEMA_REQUIRED';
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
  "id", "status", "expiresAt", "createdAt", "updatedAt"
) ON TABLE "CheckoutSession"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "checkoutSessionId", "provider", "mode", "status",
  "attemptLifecycle", "remediationStatus", "amount", "currency",
  "providerOrderId", "providerPaymentKey", "contactStartedAt",
  "financialSucceededAt", "blockingEndedAt", "suspendedByPaymentId",
  "errorCode", "errorMessage", "createdAt", "updatedAt"
) ON TABLE "Payment"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "provider", "source", "transmissionId", "eventType",
  "verifiedMode", "verifiedCredentialBinding", "checkoutSessionId",
  "raw", "status", "receivedAt", "processedAt"
) ON TABLE "PaymentEvent"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";

GRANT SELECT (
  "id", "checkoutSessionId", "paymentId", "status", "createdAt", "updatedAt"
) ON TABLE "Order"
  TO "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam";
