-- P3E-B1 reviewed manifest only. It is not run by Terraform or any package script.
-- Substitute the two role names through a separately reviewed administrative session in P3E-B2.
-- Password/database-secret creation is deliberately out of this manifest and out of Terraform state.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_preflight') THEN
    CREATE ROLE mira_refund_preflight LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_canary') THEN
    CREATE ROLE mira_refund_canary LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$roles$;

ALTER ROLE mira_refund_preflight NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
ALTER ROLE mira_refund_canary NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

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
