-- M: quiesce old admissions before applying. Enforcement begins at this COMMIT.
-- No historical grant backfill. No application setting disables these constraints.
BEGIN;

CREATE UNIQUE INDEX "RefundCommand_authorization_target_key" ON "RefundExecutionCommand" ("id", "refundAttemptId");
CREATE UNIQUE INDEX "RefundBinding_authorization_target_key" ON "RefundExecutionProviderOperationBinding" ("id", "refundAttemptId");
CREATE TABLE "RefundExecutionAuthorization" (
  "id" TEXT PRIMARY KEY,
  "issuanceRequestId" UUID NOT NULL UNIQUE,
  "commandId" TEXT NOT NULL,
  "refundAttemptId" TEXT NOT NULL,
  "providerOperationBindingId" TEXT NOT NULL,
  "targetBindingDigest" VARCHAR(64) NOT NULL,
  "expectedPredecessorGeneration" INTEGER NOT NULL,
  "operationClass" VARCHAR(64) NOT NULL,
  "releasePolicyDigest" VARCHAR(64) NOT NULL,
  "issuedByUserId" VARCHAR(255) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" VARCHAR(255),
  "consumedAt" TIMESTAMP(3),
  "consumedByPrincipalId" VARCHAR(255),
  "consumedExecutionId" VARCHAR(255) UNIQUE,
  "consumedExecutionUid" UUID UNIQUE,
  "consumedLeaseEventId" TEXT UNIQUE,
  CONSTRAINT "RefundAuthorization_command_fkey" FOREIGN KEY ("commandId", "refundAttemptId")
    REFERENCES "RefundExecutionCommand" ("id", "refundAttemptId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "RefundAuthorization_binding_fkey" FOREIGN KEY ("providerOperationBindingId", "refundAttemptId")
    REFERENCES "RefundExecutionProviderOperationBinding" ("id", "refundAttemptId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "RefundAuthorization_event_fkey" FOREIGN KEY ("consumedLeaseEventId")
    REFERENCES "RefundExecutionCommandEvent" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "RefundAuthorization_scope_check" CHECK (
    "expectedPredecessorGeneration" BETWEEN 1 AND 2147483646
    AND "operationClass" = 'EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY'
    AND "targetBindingDigest" ~ '^[0-9a-f]{64}$' AND "releasePolicyDigest" ~ '^[0-9a-f]{64}$'
    AND length(btrim("issuedByUserId")) > 0
  ),
  CONSTRAINT "RefundAuthorization_time_check" CHECK (
    "expiresAt" > "issuedAt" AND "expiresAt" <= "issuedAt" + INTERVAL '30 minutes'
    AND ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt")
    AND ("consumedAt" IS NULL OR ("consumedAt" >= "issuedAt" AND "consumedAt" < "expiresAt"))
  ),
  CONSTRAINT "RefundAuthorization_lifecycle_check" CHECK (
    (("revokedAt" IS NULL AND "revokedByUserId" IS NULL)
      OR ("revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL AND length(btrim("revokedByUserId")) > 0))
    AND num_nonnulls("consumedAt", "consumedByPrincipalId", "consumedExecutionId", "consumedExecutionUid", "consumedLeaseEventId") IN (0, 5)
    AND ("consumedAt" IS NULL OR ("revokedAt" IS NULL
      AND length(btrim("consumedByPrincipalId")) > 0 AND length(btrim("consumedExecutionId")) > 0))
  )
);
CREATE UNIQUE INDEX "RefundAuthorization_generation_slot" ON "RefundExecutionAuthorization"
  ("commandId", "expectedPredecessorGeneration") WHERE "revokedAt" IS NULL;
CREATE INDEX "RefundAuthorization_command_history_idx" ON "RefundExecutionAuthorization" ("commandId", "issuedAt", "id");
CREATE INDEX "RefundAuthorization_binding_idx" ON "RefundExecutionAuthorization" ("providerOperationBindingId");
REVOKE ALL ON "RefundExecutionAuthorization" FROM PUBLIC;

-- The origin is immutable and is independent of any new grant or mutable command phase.
CREATE FUNCTION public.refund_authorization_lane(command_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public."EximbayRefundSandboxCanaryApproval" a
    WHERE a."commandId" = command_id AND a."consumedAt" IS NOT NULL
      AND a."formatVersion" = 'mira-refund-eximbay-sandbox-canary-approval/v1'
      AND a."provider" = 'EXIMBAY' AND a."mode" = 'SANDBOX');
$$;
REVOKE ALL ON FUNCTION public.refund_authorization_lane(TEXT) FROM PUBLIC;

CREATE FUNCTION public.refund_authorization_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c public."RefundExecutionCommand"; seal TEXT;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN RAISE EXCEPTION 'REFUND_AUTHORIZATION_HISTORY_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['revokedAt','revokedByUserId','consumedAt','consumedByPrincipalId','consumedExecutionId','consumedExecutionUid','consumedLeaseEventId'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revokedAt','revokedByUserId','consumedAt','consumedByPrincipalId','consumedExecutionId','consumedExecutionUid','consumedLeaseEventId'])
      OR (OLD."revokedAt" IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
      OR (OLD."consumedAt" IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_IMMUTABLE';
    END IF;
    IF NEW."consumedAt" IS NULL OR OLD."consumedAt" IS NOT NULL THEN RETURN NEW; END IF;
  ELSE
    IF NEW."consumedAt" IS NOT NULL OR NEW."revokedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_MUST_START_UNUSED';
    END IF;
  END IF;
  -- Fixed causal order: issuance and the first consumption both observe the predecessor.
  -- Consumption must precede the actual command UPDATE, never attach to an old generation.
  SELECT * INTO c FROM public."RefundExecutionCommand" WHERE "id" = NEW."commandId";
  IF NOT FOUND OR NOT public.refund_authorization_lane(c."id")
    OR c."refundAttemptId" <> NEW."refundAttemptId"
    OR c."leaseGeneration" <> NEW."expectedPredecessorGeneration"
    OR c."status" <> 'LEASED' OR c."dispatchAttempt" <> 0 THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_PREDECESSOR_MISMATCH';
  END IF;
  SELECT "targetBindingDigest" INTO seal FROM public."EximbayRefundSandboxCanaryApproval" WHERE "commandId" = c."id";
  IF seal IS DISTINCT FROM NEW."targetBindingDigest" THEN RAISE EXCEPTION 'REFUND_AUTHORIZATION_TARGET_MISMATCH'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF c."leaseUntil" IS NULL OR c."leaseUntil" > NEW."consumedAt"
      OR EXISTS (SELECT 1 FROM public."RefundExecutionCommandEvent" WHERE "id" = NEW."consumedLeaseEventId") THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_FRESH_TRANSITION_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundAuthorization_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "RefundExecutionAuthorization"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_lifecycle();
CREATE TRIGGER "RefundAuthorization_retention" BEFORE TRUNCATE ON "RefundExecutionAuthorization"
  FOR EACH STATEMENT EXECUTE FUNCTION public.refund_authorization_lifecycle();

CREATE FUNCTION public.refund_authorization_command_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT public.refund_authorization_lane(OLD."id") THEN RETURN NEW; END IF;
  IF NEW."id" <> OLD."id" OR NEW."refundAttemptId" <> OLD."refundAttemptId"
    OR NEW."leaseGeneration" < OLD."leaseGeneration" OR NEW."dispatchAttempt" < OLD."dispatchAttempt"
    OR NEW."leaseGeneration"::bigint > OLD."leaseGeneration"::bigint + 1 THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_LINEAGE_IMMUTABLE';
  END IF;
  IF OLD."leaseGeneration" >= 1 AND OLD."dispatchAttempt" = 0 AND NEW."status" = 'READY' THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_READY_DETOUR_RETIRED';
  END IF;
  IF NEW."leaseGeneration" = OLD."leaseGeneration" THEN
    IF ROW(NEW."leaseOwner", NEW."leaseUntil", NEW."leaseTokenHash") IS DISTINCT FROM
       ROW(OLD."leaseOwner", OLD."leaseUntil", OLD."leaseTokenHash")
       AND NOT (NEW."leaseOwner" IS NULL AND NEW."leaseUntil" IS NULL AND NEW."leaseTokenHash" IS NULL
         AND NEW."status" NOT IN ('LEASED', 'READY')) THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_SAME_GENERATION_FENCE_FORBIDDEN';
    END IF;
  ELSIF OLD."leaseGeneration" >= 1 AND OLD."dispatchAttempt" = 0 THEN
    IF OLD."status" <> 'LEASED' OR NEW."status" <> 'LEASED' OR NEW."dispatchAttempt" <> 0
      OR OLD."leaseUntil" IS NULL OR OLD."leaseUntil" > (clock_timestamp() AT TIME ZONE 'UTC')
      OR NEW."leaseOwner" IS NULL OR NEW."leaseUntil" IS NULL
      OR NEW."leaseTokenHash" IS NULL OR NEW."leaseTokenHash" = OLD."leaseTokenHash" THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_TAKEOVER_SHAPE_INVALID';
    END IF;
    -- This row can only be written by the authenticated application. Its BEFORE trigger
    -- observed this exact predecessor, and its deferred constraint cannot commit alone.
    IF NOT EXISTS (SELECT 1 FROM public."RefundExecutionAuthorization" g
      WHERE g."commandId" = OLD."id" AND g."expectedPredecessorGeneration" = OLD."leaseGeneration"
        AND g."revokedAt" IS NULL AND g."consumedAt" IS NOT NULL
        AND g."consumedExecutionId" = NEW."leaseOwner"
        AND NEW."leaseUntil" = g."consumedAt" + INTERVAL '5 minutes') THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_REQUIRED';
    END IF;
  END IF;
  -- A separate ordinal UPDATE cannot disguise an expired ordinal-zero lease.
  IF NEW."dispatchAttempt" <> OLD."dispatchAttempt" THEN
    IF NEW."leaseGeneration" <> OLD."leaseGeneration" OR OLD."status" <> 'LEASED'
      OR OLD."leaseUntil" IS NULL OR OLD."leaseUntil" <= (clock_timestamp() AT TIME ZONE 'UTC')
      OR NOT EXISTS (SELECT 1 FROM public."RefundExecutionDispatchAttempt" d
        WHERE d."commandId" = OLD."id" AND d."ordinal" = NEW."dispatchAttempt"
          AND d."leaseGeneration" = OLD."leaseGeneration") THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_ORDINAL_DISGUISE_FORBIDDEN';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundAuthorization_command_guard" BEFORE UPDATE ON "RefundExecutionCommand"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_command_guard();

CREATE FUNCTION public.refund_authorization_coupling() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE g public."RefundExecutionAuthorization"; c public."RefundExecutionCommand"; e public."RefundExecutionCommandEvent";
BEGIN
  IF TG_TABLE_NAME = 'RefundExecutionAuthorization' THEN
    IF NEW."consumedAt" IS NULL OR OLD."consumedAt" IS NOT NULL THEN RETURN NULL; END IF;
    g := NEW;
  ELSE
    IF NOT public.refund_authorization_lane(OLD."id") OR OLD."leaseGeneration" < 1
      OR OLD."dispatchAttempt" <> 0 OR NEW."leaseGeneration" = OLD."leaseGeneration" THEN RETURN NULL; END IF;
    SELECT * INTO g FROM public."RefundExecutionAuthorization"
      WHERE "commandId" = OLD."id" AND "expectedPredecessorGeneration" = OLD."leaseGeneration" AND "revokedAt" IS NULL;
    IF NOT FOUND OR NEW."leaseGeneration" <> g."expectedPredecessorGeneration" + 1 THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_TRANSITION_UNPAIRED';
    END IF;
  END IF;
  SELECT * INTO c FROM public."RefundExecutionCommand" WHERE "id" = g."commandId";
  SELECT * INTO e FROM public."RefundExecutionCommandEvent" WHERE "id" = g."consumedLeaseEventId";
  IF g."consumedAt" IS NULL OR e."id" IS NULL OR c."id" IS NULL
    OR c."status" <> 'LEASED' OR c."dispatchAttempt" <> 0
    OR c."leaseGeneration" <> g."expectedPredecessorGeneration" + 1
    OR c."leaseOwner" IS DISTINCT FROM g."consumedExecutionId"
    OR c."leaseUntil" IS DISTINCT FROM g."consumedAt" + INTERVAL '5 minutes'
    OR e."commandId" <> c."id" OR e."leaseGeneration" <> c."leaseGeneration"
    OR e."eventType" <> 'LEASE_ACQUIRED' OR e."dispatchAttempt" <> 0
    OR e."occurredAt" <> g."consumedAt" THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_TRANSITION_UNPAIRED';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "RefundAuthorization_consumption_coupled" AFTER UPDATE ON "RefundExecutionAuthorization"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_coupling();
CREATE CONSTRAINT TRIGGER "RefundAuthorization_generation_coupled" AFTER UPDATE ON "RefundExecutionCommand"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_coupling();

CREATE FUNCTION public.refund_authorization_event_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c public."RefundExecutionCommand";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF TG_OP = 'UPDATE' AND public.refund_authorization_lane(NEW."commandId")
      AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_EVENT_IMMUTABLE';
    END IF;
    IF public.refund_authorization_lane(OLD."commandId") THEN
      IF TG_OP = 'DELETE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'REFUND_AUTHORIZATION_EVENT_IMMUTABLE';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF NOT public.refund_authorization_lane(NEW."commandId") THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public."RefundExecutionCommand" WHERE "id" = NEW."commandId";
  IF NEW."eventType" = 'PRE_CONTACT_RELEASED' OR NEW."leaseGeneration" <> c."leaseGeneration"
    OR NEW."dispatchAttempt" <> c."dispatchAttempt"
    OR (NEW."eventType" = 'RECOVERY_LEASE_ACQUIRED' AND NEW."dispatchAttempt" = 0) THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_EVENT_SHAPE_INVALID';
  END IF;
  IF NEW."leaseGeneration" >= 2 AND NEW."dispatchAttempt" = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public."RefundExecutionAuthorization" g
      WHERE g."consumedLeaseEventId" = NEW."id" AND g."commandId" = NEW."commandId"
        AND g."expectedPredecessorGeneration" + 1 = NEW."leaseGeneration"
        AND g."consumedAt" = NEW."occurredAt" AND g."revokedAt" IS NULL) THEN
      RAISE EXCEPTION 'REFUND_AUTHORIZATION_EVENT_UNPAIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundAuthorization_event_guard" BEFORE INSERT OR UPDATE OR DELETE ON "RefundExecutionCommandEvent"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_event_guard();

-- Reference immutability protects membership/approval content, not mutable financial projections.
CREATE FUNCTION public.refund_authorization_reference_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE protected BOOLEAN := FALSE; old_facts JSONB; new_facts JSONB;
BEGIN
  IF TG_TABLE_NAME = 'EximbayRefundSandboxCanaryApproval' THEN
    IF TG_OP = 'DELETE' AND OLD."consumedAt" IS NOT NULL THEN RAISE EXCEPTION 'REFUND_AUTHORIZATION_ORIGIN_IMMUTABLE'; END IF;
    RETURN OLD;
  ELSIF TG_TABLE_NAME = 'RefundExecutionProviderOperationBinding' THEN
    SELECT EXISTS (SELECT 1 FROM public."RefundExecutionCommand" c WHERE c."refundAttemptId" = OLD."refundAttemptId"
      AND public.refund_authorization_lane(c."id")) INTO protected;
    old_facts := to_jsonb(OLD); new_facts := to_jsonb(NEW);
  ELSIF TG_TABLE_NAME = 'RefundAttempt' THEN
    SELECT EXISTS (SELECT 1 FROM public."RefundExecutionCommand" c WHERE c."refundAttemptId" = OLD."id"
      AND public.refund_authorization_lane(c."id")) INTO protected;
    old_facts := to_jsonb(OLD) - ARRAY['status','processedAt','failedAt','failureCode','safeFailureMessage','providerRefundId','updatedAt'];
    new_facts := to_jsonb(NEW) - ARRAY['status','processedAt','failedAt','failureCode','safeFailureMessage','providerRefundId','updatedAt'];
  ELSIF TG_TABLE_NAME = 'Payment' THEN
    SELECT EXISTS (SELECT 1 FROM public."RefundAttempt" a JOIN public."RefundExecutionCommand" c ON c."refundAttemptId" = a."id"
      WHERE a."paymentId" = OLD."id" AND public.refund_authorization_lane(c."id")) INTO protected;
    old_facts := jsonb_build_array(OLD."id", OLD."provider", OLD."mode", OLD."amount", OLD."currency",
      OLD."providerOrderId", OLD."providerPaymentKey", OLD."financialSucceededAt");
    new_facts := jsonb_build_array(NEW."id", NEW."provider", NEW."mode", NEW."amount", NEW."currency",
      NEW."providerOrderId", NEW."providerPaymentKey", NEW."financialSucceededAt");
  ELSIF TG_TABLE_NAME = 'Order' THEN
    SELECT EXISTS (SELECT 1 FROM public."RefundAttempt" a JOIN public."RefundExecutionCommand" c ON c."refundAttemptId" = a."id"
      WHERE a."orderId" = OLD."id" AND public.refund_authorization_lane(c."id")) INTO protected;
    old_facts := jsonb_build_array(OLD."id", OLD."paymentId", OLD."currency", OLD."totalAmount");
    new_facts := jsonb_build_array(NEW."id", NEW."paymentId", NEW."currency", NEW."totalAmount");
  ELSE
    -- UPDATE(id) grants are required for SELECT FOR UPDATE, not identity changes.
    IF TG_OP = 'UPDATE' AND OLD."id" IS DISTINCT FROM NEW."id" THEN RAISE EXCEPTION 'REFUND_AUTHORIZATION_ID_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  IF protected AND (TG_OP = 'DELETE' OR old_facts IS DISTINCT FROM new_facts) THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_TARGET_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundAuthorization_origin_retention" BEFORE DELETE ON "EximbayRefundSandboxCanaryApproval"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();
CREATE TRIGGER "RefundAuthorization_binding_immutable" BEFORE UPDATE OR DELETE ON "RefundExecutionProviderOperationBinding"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();
CREATE TRIGGER "RefundAuthorization_attempt_identity" BEFORE UPDATE OR DELETE ON "RefundAttempt"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();
CREATE TRIGGER "RefundAuthorization_payment_lock_id" BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();
CREATE TRIGGER "RefundAuthorization_order_identity" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();
CREATE TRIGGER "RefundAuthorization_evidence_lock_id" BEFORE UPDATE ON "RefundExecutionEvidence"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_reference_guard();

CREATE FUNCTION public.refund_authorization_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF public.refund_authorization_lane(OLD."commandId") AND
    ((to_jsonb(NEW) - ARRAY['state','contactMarkedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','contactMarkedAt'])
      OR (OLD."contactMarkedAt" IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))) THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_DISPATCH_HISTORY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundAuthorization_contact_history" BEFORE UPDATE ON "RefundExecutionDispatchAttempt"
  FOR EACH ROW EXECUTE FUNCTION public.refund_authorization_contact_guard();

REVOKE ALL ON FUNCTION public.refund_authorization_lifecycle(), public.refund_authorization_command_guard(),
  public.refund_authorization_coupling(), public.refund_authorization_event_guard(),
  public.refund_authorization_reference_guard(), public.refund_authorization_contact_guard() FROM PUBLIC;
COMMIT;
