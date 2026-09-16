-- Current convergent authority for the dormant Eximbay refund canary.
-- This is intentionally self-contained: the frozen historical broad manifest is
-- evidence of an older state, not an executable prerequisite for this authority.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_preflight') THEN
    CREATE ROLE mira_refund_preflight LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_refund_canary') THEN
    CREATE ROLE mira_refund_canary LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE mira_refund_preflight LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE mira_refund_canary LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;

-- Remove membership edges in both directions so an old grant cannot broaden a
-- runtime identity and neither runtime role remains delegated to another role.
DO $memberships$
DECLARE
  target_name text;
  related_name text;
BEGIN
  FOREACH target_name IN ARRAY ARRAY['mira_refund_preflight', 'mira_refund_canary']
  LOOP
    FOR related_name IN
      SELECT parent.rolname
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles parent ON parent.oid = membership.roleid
      WHERE member.rolname = target_name
    LOOP
      EXECUTE format('REVOKE %I FROM %I', related_name, target_name);
    END LOOP;
    FOR related_name IN
      SELECT member.rolname
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles parent ON parent.oid = membership.roleid
      WHERE parent.rolname = target_name
    LOOP
      EXECUTE format('REVOKE %I FROM %I', target_name, related_name);
    END LOOP;
  END LOOP;
END
$memberships$;

DO $authority$
BEGIN
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
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON DATABASE %I FROM mira_refund_preflight, mira_refund_canary',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO mira_refund_preflight, mira_refund_canary',
    current_database()
  );
  -- PostgreSQL has no per-role DENY. Database-local PUBLIC TEMPORARY would
  -- otherwise remain effective after every direct-role REVOKE.
  EXECUTE format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );
END
$authority$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public
  FROM mira_refund_preflight, mira_refund_canary;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, mira_refund_preflight, mira_refund_canary;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM PUBLIC, mira_refund_preflight, mira_refund_canary;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, mira_refund_preflight, mira_refund_canary;
REVOKE ALL PRIVILEGES ON ALL PROCEDURES IN SCHEMA public
  FROM PUBLIC, mira_refund_preflight, mira_refund_canary;

-- Remove global and public-schema defaults that could recreate effective
-- runtime authority on a later object. The owner inventory is confined to
-- this database's current PUBLIC objects, bootstrap identity, database owner,
-- and any owner whose installed default ACL already names PUBLIC or a runtime
-- role.
DO $default_privileges$
DECLARE
  owner_name text;
BEGIN
  FOR owner_name IN
    SELECT DISTINCT owner.rolname
    FROM pg_roles owner
    WHERE owner.oid IN (
      SELECT role.oid FROM pg_roles role WHERE role.rolname = current_user
      UNION
      SELECT database.datdba FROM pg_database database
        WHERE database.datname = current_database()
      UNION
      SELECT relation.relowner
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
      UNION
      SELECT routine.proowner
      FROM pg_proc routine
      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
      UNION
      SELECT defaults.defaclrole
      FROM pg_default_acl defaults,
        aclexplode(defaults.defaclacl) acl
      WHERE acl.grantee = 0 OR acl.grantee IN (
        SELECT role.oid FROM pg_roles role
        WHERE role.rolname IN ('mira_refund_preflight', 'mira_refund_canary')
      )
    )
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, mira_refund_preflight, mira_refund_canary',
      owner_name
    );
  END LOOP;
END
$default_privileges$;

-- SELECT ... FOR UPDATE requires UPDATE on a user column. Four exact
-- SECURITY DEFINER routines preserve the canonical row locks without granting
-- direct mutation of immutable Payment, binding, event, or evidence facts.
-- Each body is static, schema-qualified, non-data-returning except for row
-- presence, and runs with a fixed safe search path.
CREATE OR REPLACE FUNCTION public.mira_refund_canary_lock_payment(target_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  locked boolean := false;
BEGIN
  SELECT true INTO locked
  FROM public."Payment" payment
  WHERE payment."id" = target_id
  FOR UPDATE;
  RETURN COALESCE(locked, false);
END
$function$;

CREATE OR REPLACE FUNCTION
  public.mira_refund_canary_lock_provider_operation_binding(target_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  locked boolean := false;
BEGIN
  SELECT true INTO locked
  FROM public."RefundExecutionProviderOperationBinding" binding
  WHERE binding."id" = target_id
  FOR UPDATE;
  RETURN COALESCE(locked, false);
END
$function$;

CREATE OR REPLACE FUNCTION
  public.mira_refund_canary_lock_command_events(target_command_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  PERFORM event."id"
  FROM public."RefundExecutionCommandEvent" event
  WHERE event."commandId" = target_command_id
  ORDER BY event."occurredAt", event."id"
  FOR UPDATE;
END
$function$;

CREATE OR REPLACE FUNCTION public.mira_refund_canary_lock_evidence(target_command_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  PERFORM evidence."id"
  FROM public."RefundExecutionEvidence" evidence
  WHERE evidence."commandId" = target_command_id
  ORDER BY evidence."id"
  FOR UPDATE;
END
$function$;

ALTER FUNCTION public.mira_refund_canary_lock_payment(text) OWNER TO CURRENT_USER;
ALTER FUNCTION public.mira_refund_canary_lock_provider_operation_binding(text)
  OWNER TO CURRENT_USER;
ALTER FUNCTION public.mira_refund_canary_lock_command_events(text) OWNER TO CURRENT_USER;
ALTER FUNCTION public.mira_refund_canary_lock_evidence(text) OWNER TO CURRENT_USER;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.mira_refund_canary_lock_payment(text),
  public.mira_refund_canary_lock_provider_operation_binding(text),
  public.mira_refund_canary_lock_command_events(text),
  public.mira_refund_canary_lock_evidence(text)
FROM PUBLIC, mira_refund_preflight, mira_refund_canary;
GRANT EXECUTE ON FUNCTION
  public.mira_refund_canary_lock_payment(text),
  public.mira_refund_canary_lock_provider_operation_binding(text),
  public.mira_refund_canary_lock_command_events(text),
  public.mira_refund_canary_lock_evidence(text)
TO mira_refund_canary;

GRANT USAGE ON SCHEMA public TO mira_refund_preflight, mira_refund_canary;

-- Provider-free preflight is read-only. Toss proof tables remain readable only
-- because the unchanged generic preflight invariant checks their absence.
GRANT SELECT ON TABLE
  "_prisma_migrations",
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEximbayPreflightObservation",
  "EximbayRefundSandboxCanaryApproval"
TO mira_refund_preflight;

-- Complete Eximbay execution read set. CheckoutSession remains column-scoped
-- solely for the canonical refund-success email intent.
GRANT SELECT ON TABLE
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
  "RefundExecutionEximbayPreflightObservation",
  "RefundExecutionEvidence",
  "EximbayRefundSandboxCanaryApproval"
TO mira_refund_canary;
GRANT SELECT ("id", "communicationLocale") ON TABLE "CheckoutSession"
  TO mira_refund_canary;

-- Genuine facts produced by this exact execution path.
GRANT INSERT ON TABLE
  "RefundAttemptTransition",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionEximbayPreflightObservation",
  "RefundExecutionEvidence",
  "PaymentOutbox"
TO mira_refund_canary;

-- Terminal application and one-use approval consumption use exact columns.
GRANT UPDATE ("status", "updatedAt") ON TABLE "Order"
  TO mira_refund_canary;
GRANT UPDATE (
  "status", "providerRefundId", "processedAt", "failedAt", "failureCode",
  "safeFailureMessage", "updatedAt"
) ON TABLE "RefundAttempt" TO mira_refund_canary;
GRANT UPDATE (
  "status", "availableAt", "leaseOwner", "leaseUntil", "leaseGeneration",
  "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode",
  "lastSafeErrorMessage", "updatedAt"
) ON TABLE "RefundExecutionCommand" TO mira_refund_canary;
GRANT UPDATE ("state", "contactMarkedAt")
  ON TABLE "RefundExecutionDispatchAttempt" TO mira_refund_canary;
GRANT UPDATE (
  "consumedAt", "consumedExecutionId", "consumedExecutionBindingDigest"
) ON TABLE "EximbayRefundSandboxCanaryApproval" TO mira_refund_canary;
