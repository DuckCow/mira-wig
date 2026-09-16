-- Prospective v2 only. No historical row updates or digest relabeling.
BEGIN;
ALTER TABLE "EximbayRefundSandboxCanaryApproval"
  ADD COLUMN "approvalAuthorityDigestV2" VARCHAR(64),
  ADD COLUMN "custodyArtifactSha256" VARCHAR(64),
  ADD COLUMN "syntheticProvenanceDigest" VARCHAR(64),
  ADD COLUMN "noCustomerPiiAttested" BOOLEAN,
  ADD COLUMN "merchantAccountBindingId" VARCHAR(64),
  ADD COLUMN "credentialGenerationBindingId" VARCHAR(64),
  ADD COLUMN "jobContractVersion" VARCHAR(64),
  ADD COLUMN "custodyContractVersion" VARCHAR(64),
  ADD COLUMN "targetContractVersion" VARCHAR(64);
ALTER TABLE "EximbayRefundSandboxCanaryApproval"
  DROP CONSTRAINT "EximbayCanaryApproval_format_check",
  ADD CONSTRAINT "EximbayCanaryApproval_format_check" CHECK (
    "formatVersion" IN ('mira-refund-eximbay-sandbox-canary-approval/v1',
      'mira-refund-eximbay-sandbox-canary-approval/v2')),
  ADD CONSTRAINT "EximbayCanaryApproval_v2_facts_check" CHECK (
    ("formatVersion" = 'mira-refund-eximbay-sandbox-canary-approval/v1' AND
"approvalAuthorityDigestV2" IS NULL AND "custodyArtifactSha256" IS NULL AND "syntheticProvenanceDigest" IS NULL AND "noCustomerPiiAttested" IS NULL AND "merchantAccountBindingId" IS NULL AND "credentialGenerationBindingId" IS NULL AND "jobContractVersion" IS NULL AND "custodyContractVersion" IS NULL AND "targetContractVersion" IS NULL) OR
    ("formatVersion" = 'mira-refund-eximbay-sandbox-canary-approval/v2' AND
"approvalAuthorityDigestV2" IS NOT NULL AND "custodyArtifactSha256" IS NOT NULL AND "syntheticProvenanceDigest" IS NOT NULL AND "noCustomerPiiAttested" IS NOT NULL AND "merchantAccountBindingId" IS NOT NULL AND "credentialGenerationBindingId" IS NOT NULL AND "jobContractVersion" IS NOT NULL AND "custodyContractVersion" IS NOT NULL AND "targetContractVersion" IS NOT NULL AND
      "approvalAuthorityDigestV2" ~ '^[0-9a-f]{64}$' AND
      "custodyArtifactSha256" ~ '^[0-9a-f]{64}$' AND
      "syntheticProvenanceDigest" ~ '^[0-9a-f]{64}$' AND
      "approvalEvidenceDigest" = "custodyArtifactSha256" AND
      "noCustomerPiiAttested" = TRUE AND
      "merchantAccountBindingId" ~ '^[0-9a-f]{64}$' AND
      "credentialGenerationBindingId" ~ '^[0-9a-f]{64}$' AND
      "jobContractVersion" = 'mira-refund-eximbay-canary-job/v2' AND
      "custodyContractVersion" = 'mira-refund-eximbay-canary-fresh-sale-custody/v3' AND
      "targetContractVersion" = 'mira-refund-eximbay-sandbox-canary-target/v2' AND
      ("consumedAt" IS NULL OR "consumedAt" < "expiresAt")));

CREATE FUNCTION public.prevent_eximbay_canary_approval_v2_authority_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."formatVersion" = 'mira-refund-eximbay-sandbox-canary-approval/v2' AND
      (current_user <> session_user OR session_user IN ('mira_refund_canary', 'mira_refund_preflight')
       OR NEW."issuedByPrincipalId" <> 'postgres-session/v1:' || session_user
       OR NEW."consumedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'EXIMBAY_CANARY_V2_ISSUER_INVALID';
    END IF;
  ELSIF ROW(NEW."approvalAuthorityDigestV2", NEW."custodyArtifactSha256", NEW."syntheticProvenanceDigest", NEW."noCustomerPiiAttested", NEW."merchantAccountBindingId", NEW."credentialGenerationBindingId", NEW."jobContractVersion", NEW."custodyContractVersion", NEW."targetContractVersion") IS DISTINCT FROM ROW(OLD."approvalAuthorityDigestV2", OLD."custodyArtifactSha256", OLD."syntheticProvenanceDigest", OLD."noCustomerPiiAttested", OLD."merchantAccountBindingId", OLD."credentialGenerationBindingId", OLD."jobContractVersion", OLD."custodyContractVersion", OLD."targetContractVersion") THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_APPROVAL_AUTHORITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_eximbay_canary_approval_v2_authority_mutation() FROM PUBLIC;
CREATE TRIGGER "EximbayCanaryApproval_v2_immutable"
BEFORE INSERT OR UPDATE ON "EximbayRefundSandboxCanaryApproval"
FOR EACH ROW EXECUTE FUNCTION public.prevent_eximbay_canary_approval_v2_authority_mutation();

-- V2 consumption must not bypass the installed post-consumption command guards.
-- The v1 predicate and every historical row remain unchanged.
CREATE OR REPLACE FUNCTION public.refund_authorization_lane(command_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public."EximbayRefundSandboxCanaryApproval" a
    WHERE a."commandId" = command_id AND a."consumedAt" IS NOT NULL
      AND a."formatVersion" IN ('mira-refund-eximbay-sandbox-canary-approval/v1',
        'mira-refund-eximbay-sandbox-canary-approval/v2')
      AND a."provider" = 'EXIMBAY' AND a."mode" = 'SANDBOX');
$$;
REVOKE ALL ON FUNCTION public.refund_authorization_lane(TEXT) FROM PUBLIC;
COMMIT;
