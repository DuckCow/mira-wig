-- Temporary, attended P3E-B2 synthetic Eximbay SALE authority.
-- This is a fixed delta over the canonical refund-only grants and is removed by
-- restore-canary-refund-role-grants before Phase B.

DO $authority$
BEGIN
  IF current_database() NOT IN ('refund_sandbox', 'wig_platform_test') THEN
    RAISE EXCEPTION 'SYNTHETIC_SALE_DATABASE_NOT_ADMITTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_canary') THEN
    RAISE EXCEPTION 'SYNTHETIC_SALE_CANARY_ROLE_REQUIRED';
  END IF;
END
$authority$;

REVOKE UPDATE ("code") ON TABLE "Market" FROM mira_refund_canary;

GRANT SELECT ON TABLE
  "User", "Market", "WigStyle", "WigVariant", "WigStyleMarket",
  "VariantMarketPrice", "CartItem", "CheckoutSession", "CheckoutSessionLine",
  "CheckoutSessionShipping", "Payment", "PaymentEvent", "Order", "OrderItem",
  "OrderShipping"
TO mira_refund_canary;

GRANT INSERT ON TABLE
  "User", "WigStyle", "WigVariant", "WigStyleMarket", "VariantMarketPrice",
  "CartItem", "CheckoutSession", "CheckoutSessionLine", "CheckoutSessionShipping",
  "Payment", "PaymentEvent", "Order", "OrderItem", "OrderShipping"
TO mira_refund_canary;

GRANT DELETE ON TABLE "CartItem" TO mira_refund_canary;

GRANT UPDATE ("id") ON TABLE "User", "WigStyle", "CheckoutSessionLine"
  TO mira_refund_canary;
GRANT UPDATE ("wigStyleId") ON TABLE "WigStyleMarket" TO mira_refund_canary;
GRANT UPDATE ("variantId") ON TABLE "VariantMarketPrice" TO mira_refund_canary;

GRANT UPDATE ("stock") ON TABLE "WigVariant" TO mira_refund_canary;
GRANT UPDATE ("quantity") ON TABLE "CartItem" TO mira_refund_canary;
GRANT UPDATE ("status", "completedAt", "updatedAt") ON TABLE "CheckoutSession"
  TO mira_refund_canary;
GRANT UPDATE (
  "status", "attemptLifecycle", "remediationStatus", "amount", "currency",
  "providerPaymentKey", "contactStartedAt", "initiationOutputKind",
  "initiationApproveUrl", "initiationCompletedAt", "financialSucceededAt",
  "errorCode", "errorMessage", "supersededAt", "blockingEndedAt",
  "suspendedByPaymentId", "updatedAt"
) ON TABLE "Payment" TO mira_refund_canary;
GRANT UPDATE (
  "transmissionId", "raw", "status", "processedAt", "failureStage",
  "failureCode", "lastError", "verifiedMode", "verifiedCredentialBinding",
  "providerPaymentKey"
) ON TABLE "PaymentEvent" TO mira_refund_canary;
