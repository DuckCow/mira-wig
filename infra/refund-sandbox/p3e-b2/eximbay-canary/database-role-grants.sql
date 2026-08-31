-- R12 P3E Eximbay-lane DB-bootstrap delta.
-- Apply only after the frozen historical database_roles.sql authority and migration
-- 20260825130000_eximbay_refund_sandbox_canary_approval have been installed.

DO $authority$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mira_refund_preflight'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mira_refund_canary'
  ) THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_BASE_RUNTIME_ROLES_REQUIRED';
  END IF;
  IF to_regclass('public."EximbayRefundSandboxCanaryApproval"') IS NULL THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_APPROVAL_TABLE_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE migration_name = '20260825130000_eximbay_refund_sandbox_canary_approval'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_APPROVAL_MIGRATION_REQUIRED';
  END IF;
END
$authority$;

REVOKE ALL PRIVILEGES ON TABLE "EximbayRefundSandboxCanaryApproval"
  FROM mira_refund_preflight, mira_refund_canary;

GRANT SELECT ON TABLE "EximbayRefundSandboxCanaryApproval"
  TO mira_refund_preflight, mira_refund_canary;

GRANT UPDATE (
  "consumedAt",
  "consumedExecutionId",
  "consumedExecutionBindingDigest"
) ON TABLE "EximbayRefundSandboxCanaryApproval"
  TO mira_refund_canary;

-- The atomic refund-success transaction reads the checkout locale before it
-- inserts the deduplicated refund-success email intent. Keep these privileges
-- narrower than the existing refund persistence authority.
GRANT SELECT ON TABLE "CheckoutSession"
  TO mira_refund_canary;

GRANT INSERT ON TABLE "PaymentOutbox"
  TO mira_refund_canary;

-- The admitted Eximbay dispatch records and re-reads one immutable preflight
-- observation before cancellation. Mutation after insertion remains denied by
-- the table trigger and by the absence of UPDATE/DELETE grants.
GRANT SELECT, INSERT ON TABLE "RefundExecutionEximbayPreflightObservation"
  TO mira_refund_canary;

-- PostgreSQL requires UPDATE table authority for SELECT ... FOR UPDATE. The
-- Eximbay preflight locks Payment but does not update its columns.
GRANT UPDATE ("id") ON TABLE "Payment"
  TO mira_refund_canary;

GRANT UPDATE ("id") ON TABLE "RefundExecutionProviderOperationBinding"
  TO mira_refund_canary;

GRANT UPDATE ("id") ON TABLE "RefundExecutionEvidence"
  TO mira_refund_canary;

GRANT UPDATE ("id") ON TABLE "RefundExecutionCommandEvent"
  TO mira_refund_canary;
