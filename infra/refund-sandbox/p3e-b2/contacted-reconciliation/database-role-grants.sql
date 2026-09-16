-- Temporary, attended P3E-B2 Eximbay CONTACTED-reconciliation authority.
-- This fixed delta is removed by restore-canary-refund-role-grants immediately
-- after the separately authorized one-shot reconciliation window.

DO $authority$
BEGIN
  IF current_database() NOT IN ('refund_sandbox', 'wig_platform_test') THEN
    RAISE EXCEPTION 'CONTACTED_RECONCILIATION_DATABASE_NOT_ADMITTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_canary') THEN
    RAISE EXCEPTION 'CONTACTED_RECONCILIATION_CANARY_ROLE_REQUIRED';
  END IF;
  IF to_regclass('public."CheckoutSession"') IS NULL
    OR to_regclass('public."Payment"') IS NULL
    OR to_regclass('public."PaymentEvent"') IS NULL THEN
    RAISE EXCEPTION 'CONTACTED_RECONCILIATION_SCHEMA_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE migration_name = '20260825130000_eximbay_refund_sandbox_canary_approval'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CONTACTED_RECONCILIATION_LEDGER_REQUIRED';
  END IF;
END
$authority$;

-- Canonical baseline has only refund-email columns; recovery temporarily reads
-- the checkout aggregate, matching its historical effective read authority.
GRANT SELECT ON TABLE "CheckoutSession" TO mira_refund_canary;

GRANT UPDATE ("id") ON TABLE "CheckoutSession"
  TO mira_refund_canary;

GRANT SELECT, INSERT ON TABLE "PaymentEvent"
  TO mira_refund_canary;

GRANT UPDATE (
  "blockingEndedAt",
  "errorCode",
  "errorMessage",
  "updatedAt"
) ON TABLE "Payment"
  TO mira_refund_canary;
