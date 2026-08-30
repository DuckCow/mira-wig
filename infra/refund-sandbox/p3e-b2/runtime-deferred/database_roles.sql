-- P3E-B2 reviewed Cloud SQL-compatible application-role authority.
-- It is executed only by the separately admitted database-bootstrap role/grant transaction.
-- PASSWORD NULL is bounded sanitation; password/secret creation remains out of scope.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_preflight') THEN
    CREATE ROLE mira_refund_preflight LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_canary') THEN
    CREATE ROLE mira_refund_canary LOGIN NOINHERIT;
  END IF;
END
$roles$;

ALTER ROLE mira_refund_preflight PASSWORD NULL;
ALTER ROLE mira_refund_canary PASSWORD NULL;

GRANT CONNECT ON DATABASE refund_sandbox TO mira_refund_preflight;
GRANT CONNECT ON DATABASE refund_sandbox TO mira_refund_canary;
GRANT USAGE ON SCHEMA public TO mira_refund_preflight;
GRANT USAGE ON SCHEMA public TO mira_refund_canary;

GRANT SELECT ON TABLE
  "_prisma_migrations",
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof"
TO mira_refund_preflight;

GRANT SELECT ON TABLE
  "_prisma_migrations",
  "Payment",
  "Order",
  "RefundAttempt",
  "RefundAttemptTransition",
  "RefundExecutionCommand",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEvidence"
TO mira_refund_canary;

GRANT UPDATE ON TABLE
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt"
TO mira_refund_canary;

GRANT INSERT ON TABLE
  "RefundAttemptTransition",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEvidence"
TO mira_refund_canary;

REVOKE CREATE ON SCHEMA public FROM mira_refund_preflight, mira_refund_canary;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM mira_refund_preflight;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM mira_refund_canary;
REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
  FROM mira_refund_preflight, mira_refund_canary;
