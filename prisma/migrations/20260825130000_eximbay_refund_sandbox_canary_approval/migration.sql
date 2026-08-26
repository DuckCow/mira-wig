BEGIN;

CREATE TABLE "EximbayRefundSandboxCanaryApproval" (
  "id" TEXT NOT NULL,
  "formatVersion" VARCHAR(64) NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "mode" "PaymentMode" NOT NULL,
  "approvalEvidenceDigest" VARCHAR(64) NOT NULL,
  "releaseBindingDigest" VARCHAR(64) NOT NULL,
  "canaryJobBindingDigest" VARCHAR(64) NOT NULL,
  "preflightJobBindingDigest" VARCHAR(64) NOT NULL,
  "imageBindingDigest" VARCHAR(64) NOT NULL,
  "secretGenerationBindingDigest" VARCHAR(64) NOT NULL,
  "targetBindingDigest" VARCHAR(64) NOT NULL,
  "commandId" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "issuedByPrincipalId" VARCHAR(255) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "consumedExecutionId" VARCHAR(255),
  "consumedExecutionBindingDigest" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EximbayRefundSandboxCanaryApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EximbayCanaryApproval_provider_check" CHECK ("provider" = 'EXIMBAY'),
  CONSTRAINT "EximbayCanaryApproval_mode_check" CHECK ("mode" = 'SANDBOX'),
  CONSTRAINT "EximbayCanaryApproval_format_check" CHECK ("formatVersion" = 'mira-refund-eximbay-sandbox-canary-approval/v1'),
  CONSTRAINT "EximbayCanaryApproval_digest_check" CHECK (
    "approvalEvidenceDigest" ~ '^[0-9a-f]{64}$' AND
    "releaseBindingDigest" ~ '^[0-9a-f]{64}$' AND
    "canaryJobBindingDigest" ~ '^[0-9a-f]{64}$' AND
    "preflightJobBindingDigest" ~ '^[0-9a-f]{64}$' AND
    "imageBindingDigest" ~ '^[0-9a-f]{64}$' AND
    "secretGenerationBindingDigest" ~ '^[0-9a-f]{64}$' AND
    "targetBindingDigest" ~ '^[0-9a-f]{64}$' AND
    ("consumedExecutionBindingDigest" IS NULL OR "consumedExecutionBindingDigest" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "EximbayCanaryApproval_validity_check" CHECK (
    "approvedAt" < "expiresAt" AND
    "expiresAt" <= "approvedAt" + INTERVAL '1 hour'
  ),
  CONSTRAINT "EximbayCanaryApproval_consumption_check" CHECK (
    (("consumedAt" IS NULL AND "consumedExecutionId" IS NULL AND "consumedExecutionBindingDigest" IS NULL) OR
     ("consumedAt" IS NOT NULL AND "consumedExecutionId" IS NOT NULL AND "consumedExecutionBindingDigest" IS NOT NULL
      AND "consumedAt" >= "approvedAt"))
  )
);

CREATE UNIQUE INDEX "EximbayRefundSandboxCanaryApproval_commandId_key"
  ON "EximbayRefundSandboxCanaryApproval"("commandId");
CREATE INDEX "EximbayRefundSandboxCanaryApproval_consumedAt_idx"
  ON "EximbayRefundSandboxCanaryApproval"("consumedAt");

ALTER TABLE "EximbayRefundSandboxCanaryApproval"
  ADD CONSTRAINT "EximbayRefundSandboxCanaryApproval_commandId_fkey"
  FOREIGN KEY ("commandId") REFERENCES "RefundExecutionCommand"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_eximbay_canary_approval_authority_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."formatVersion", NEW."provider", NEW."mode",
    NEW."approvalEvidenceDigest", NEW."releaseBindingDigest",
    NEW."canaryJobBindingDigest", NEW."preflightJobBindingDigest",
    NEW."imageBindingDigest", NEW."secretGenerationBindingDigest",
    NEW."targetBindingDigest", NEW."commandId", NEW."approvedAt", NEW."expiresAt",
    NEW."issuedByPrincipalId", NEW."createdAt") IS DISTINCT FROM
    ROW(OLD."id", OLD."formatVersion", OLD."provider", OLD."mode",
    OLD."approvalEvidenceDigest", OLD."releaseBindingDigest",
    OLD."canaryJobBindingDigest", OLD."preflightJobBindingDigest",
    OLD."imageBindingDigest", OLD."secretGenerationBindingDigest",
    OLD."targetBindingDigest", OLD."commandId", OLD."approvedAt", OLD."expiresAt",
    OLD."issuedByPrincipalId", OLD."createdAt") THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_APPROVAL_AUTHORITY_IMMUTABLE';
  END IF;
  IF OLD."consumedAt" IS NOT NULL AND ROW(NEW."consumedAt", NEW."consumedExecutionId",
    NEW."consumedExecutionBindingDigest") IS DISTINCT FROM
    ROW(OLD."consumedAt", OLD."consumedExecutionId", OLD."consumedExecutionBindingDigest") THEN
    RAISE EXCEPTION 'EXIMBAY_CANARY_APPROVAL_CONSUMPTION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "EximbayCanaryApproval_immutable"
BEFORE UPDATE ON "EximbayRefundSandboxCanaryApproval"
FOR EACH ROW EXECUTE FUNCTION "prevent_eximbay_canary_approval_authority_mutation"();

COMMIT;
