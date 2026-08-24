-- CreateEnum
CREATE TYPE "WigStyleLocalizedRevisionSourceKind" AS ENUM ('MANUAL_AUTHORING', 'LEGACY_IMPORT', 'LOCALIZATION');

-- CreateEnum
CREATE TYPE "WigStyleLocalizedClaimDisposition" AS ENUM ('NON_MATERIAL', 'MATERIAL_OR_UNRESOLVED');

-- CreateEnum
CREATE TYPE "WigStyleLocalizedApprovalDecisionType" AS ENUM ('APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WigStyleLocalizedPublicationAction" AS ENUM ('PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WigStyleLocalizedAuthorityBasis" AS ENUM ('PROJECT_OWNER_EDITORIAL_CONFIG', 'PROJECT_OWNER_PUBLICATION_CONFIG', 'APPROVAL_REVOCATION_ENFORCEMENT');

-- CreateTable
CREATE TABLE "WigStyleLocalizedRevision" (
    "id" TEXT NOT NULL,
    "wigStyleId" TEXT NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "sourceKind" "WigStyleLocalizedRevisionSourceKind" NOT NULL,
    "sourceRevisionId" TEXT,
    "legacySourceUpdatedAt" TIMESTAMP(3),
    "claimDisposition" "WigStyleLocalizedClaimDisposition" NOT NULL,
    "submissionKey" VARCHAR(128) NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WigStyleLocalizedRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WigStyleLocalizedRevision_locale_check" CHECK ("locale" IN ('ko', 'en', 'ja')),
    CONSTRAINT "WigStyleLocalizedRevision_nonblank_check" CHECK (
      length(btrim("displayName")) > 0
      AND ("description" IS NULL OR length(btrim("description")) > 0)
      AND length(btrim("submissionKey")) > 0
      AND length(btrim("submittedByUserId")) > 0
      AND length(btrim("wigStyleId")) > 0
    ),
    CONSTRAINT "WigStyleLocalizedRevision_source_check" CHECK (
      ("sourceRevisionId" IS NULL OR "sourceRevisionId" <> "id")
      AND (
        (
          "sourceKind" = 'MANUAL_AUTHORING'
          AND "sourceRevisionId" IS NULL
          AND "legacySourceUpdatedAt" IS NULL
        )
        OR (
          "sourceKind" = 'LEGACY_IMPORT'
          AND "sourceRevisionId" IS NULL
          AND "legacySourceUpdatedAt" IS NOT NULL
        )
        OR (
          "sourceKind" = 'LOCALIZATION'
          AND "sourceRevisionId" IS NOT NULL
          AND "legacySourceUpdatedAt" IS NULL
        )
      )
    )
);

-- CreateTable
CREATE TABLE "WigStyleLocalizedApprovalDecision" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "decision" "WigStyleLocalizedApprovalDecisionType" NOT NULL,
    "rationale" VARCHAR(1000),
    "requestKey" VARCHAR(128) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "authorityBasis" "WigStyleLocalizedAuthorityBasis" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WigStyleLocalizedApprovalDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WigStyleLocalizedApprovalDecision_ordinal_check" CHECK ("ordinal" >= 1),
    CONSTRAINT "WigStyleLocalizedApprovalDecision_nonblank_check" CHECK (
      length(btrim("requestKey")) > 0 AND length(btrim("actorUserId")) > 0
    ),
    CONSTRAINT "WigStyleLocalizedApprovalDecision_authority_check" CHECK ("authorityBasis" = 'PROJECT_OWNER_EDITORIAL_CONFIG'),
    CONSTRAINT "WigStyleLocalizedApprovalDecision_rationale_check" CHECK (
      "decision" = 'APPROVED'
      OR ("rationale" IS NOT NULL AND length(btrim("rationale")) > 0)
    )
);

-- CreateTable
CREATE TABLE "WigStyleLocalizedPublication" (
    "wigStyleId" TEXT NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "currentRevisionId" TEXT,
    "version" INTEGER NOT NULL,
    "lastChangedByUserId" TEXT NOT NULL,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WigStyleLocalizedPublication_pkey" PRIMARY KEY ("wigStyleId", "locale"),
    CONSTRAINT "WigStyleLocalizedPublication_locale_check" CHECK ("locale" IN ('ko', 'en', 'ja')),
    CONSTRAINT "WigStyleLocalizedPublication_version_check" CHECK ("version" >= 1),
    CONSTRAINT "WigStyleLocalizedPublication_nonblank_check" CHECK (
      length(btrim("wigStyleId")) > 0 AND length(btrim("lastChangedByUserId")) > 0
    )
);

-- CreateTable
CREATE TABLE "WigStyleLocalizedPublicationEvent" (
    "id" TEXT NOT NULL,
    "wigStyleId" TEXT NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action" "WigStyleLocalizedPublicationAction" NOT NULL,
    "fromRevisionId" TEXT,
    "toRevisionId" TEXT,
    "reason" VARCHAR(1000),
    "requestKey" VARCHAR(128) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "authorityBasis" "WigStyleLocalizedAuthorityBasis" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WigStyleLocalizedPublicationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WigStyleLocalizedPublicationEvent_locale_check" CHECK ("locale" IN ('ko', 'en', 'ja')),
    CONSTRAINT "WigStyleLocalizedPublicationEvent_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "WigStyleLocalizedPublicationEvent_nonblank_check" CHECK (
      length(btrim("wigStyleId")) > 0
      AND length(btrim("requestKey")) > 0
      AND length(btrim("actorUserId")) > 0
    ),
    CONSTRAINT "WigStyleLocalizedPublicationEvent_request_namespace_check" CHECK (
      (
        "authorityBasis" = 'APPROVAL_REVOCATION_ENFORCEMENT'
        AND left("requestKey", length('lpc:auto-withdraw:')) = 'lpc:auto-withdraw:'
      )
      OR (
        "authorityBasis" = 'PROJECT_OWNER_PUBLICATION_CONFIG'
        AND left("requestKey", length('lpc:auto-withdraw:')) <> 'lpc:auto-withdraw:'
      )
    ),
    CONSTRAINT "WigStyleLocalizedPublicationEvent_transition_check" CHECK (
      (
        "action" = 'PUBLISHED'
        AND "toRevisionId" IS NOT NULL
        AND "fromRevisionId" IS DISTINCT FROM "toRevisionId"
        AND "reason" IS NULL
        AND "authorityBasis" = 'PROJECT_OWNER_PUBLICATION_CONFIG'
      )
      OR
      (
        "action" = 'WITHDRAWN'
        AND "fromRevisionId" IS NOT NULL
        AND "toRevisionId" IS NULL
        AND "reason" IS NOT NULL
        AND length(btrim("reason")) > 0
        AND "authorityBasis" IN ('PROJECT_OWNER_PUBLICATION_CONFIG', 'APPROVAL_REVOCATION_ENFORCEMENT')
      )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "WigStyleLocalizedRevision_id_wigStyleId_key" ON "WigStyleLocalizedRevision"("id", "wigStyleId");
CREATE UNIQUE INDEX "WigStyleLocalizedRevision_id_wigStyleId_locale_key" ON "WigStyleLocalizedRevision"("id", "wigStyleId", "locale");
CREATE UNIQUE INDEX "WigStyleLocalizedRevision_submissionKey_key" ON "WigStyleLocalizedRevision"("submissionKey");
CREATE INDEX "WigStyleLocalizedRevision_wigStyleId_locale_submittedAt_idx" ON "WigStyleLocalizedRevision"("wigStyleId", "locale", "submittedAt");
CREATE INDEX "WigStyleLocalizedRevision_sourceRevisionId_wigStyleId_idx" ON "WigStyleLocalizedRevision"("sourceRevisionId", "wigStyleId");
CREATE UNIQUE INDEX "WigStyleLocalizedApprovalDecision_requestKey_key" ON "WigStyleLocalizedApprovalDecision"("requestKey");
CREATE UNIQUE INDEX "WigStyleLocalizedApprovalDecision_revisionId_ordinal_key" ON "WigStyleLocalizedApprovalDecision"("revisionId", "ordinal");
CREATE INDEX "WigStyleLocalizedPublication_currentRevisionId_idx" ON "WigStyleLocalizedPublication"("currentRevisionId");
CREATE UNIQUE INDEX "WigStyleLocalizedPublicationEvent_requestKey_key" ON "WigStyleLocalizedPublicationEvent"("requestKey");
CREATE UNIQUE INDEX "WigStyleLocalizedPublicationEvent_scope_sequence_key" ON "WigStyleLocalizedPublicationEvent"("wigStyleId", "locale", "sequence");

-- AddForeignKey
ALTER TABLE "WigStyleLocalizedRevision" ADD CONSTRAINT "WigStyleLocalizedRevision_wigStyleId_fkey" FOREIGN KEY ("wigStyleId") REFERENCES "WigStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedRevision" ADD CONSTRAINT "WigStyleLocalizedRevision_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedRevision" ADD CONSTRAINT "WigStyleLocalizedRevision_source_fkey" FOREIGN KEY ("sourceRevisionId", "wigStyleId") REFERENCES "WigStyleLocalizedRevision"("id", "wigStyleId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WigStyleLocalizedApprovalDecision" ADD CONSTRAINT "WigStyleLocalizedApprovalDecision_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WigStyleLocalizedRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedApprovalDecision" ADD CONSTRAINT "WigStyleLocalizedApprovalDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WigStyleLocalizedPublication" ADD CONSTRAINT "WigStyleLocalizedPublication_wigStyleId_fkey" FOREIGN KEY ("wigStyleId") REFERENCES "WigStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublication" ADD CONSTRAINT "WigStyleLocalizedPublication_currentRevision_fkey" FOREIGN KEY ("currentRevisionId", "wigStyleId", "locale") REFERENCES "WigStyleLocalizedRevision"("id", "wigStyleId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublication" ADD CONSTRAINT "WigStyleLocalizedPublication_actorUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WigStyleLocalizedPublicationEvent" ADD CONSTRAINT "WigStyleLocalizedPublicationEvent_publication_fkey" FOREIGN KEY ("wigStyleId", "locale") REFERENCES "WigStyleLocalizedPublication"("wigStyleId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublicationEvent" ADD CONSTRAINT "WigStyleLocalizedPublicationEvent_wigStyleId_fkey" FOREIGN KEY ("wigStyleId") REFERENCES "WigStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublicationEvent" ADD CONSTRAINT "WigStyleLocalizedPublicationEvent_fromRevision_fkey" FOREIGN KEY ("fromRevisionId", "wigStyleId", "locale") REFERENCES "WigStyleLocalizedRevision"("id", "wigStyleId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublicationEvent" ADD CONSTRAINT "WigStyleLocalizedPublicationEvent_toRevision_fkey" FOREIGN KEY ("toRevisionId", "wigStyleId", "locale") REFERENCES "WigStyleLocalizedRevision"("id", "wigStyleId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WigStyleLocalizedPublicationEvent" ADD CONSTRAINT "WigStyleLocalizedPublicationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable audit records: revisions, approval decisions, and publication events are append-only.
CREATE FUNCTION "reject_wig_style_localized_audit_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WigStyleLocalizedRevision_immutable"
BEFORE UPDATE OR DELETE ON "WigStyleLocalizedRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_wig_style_localized_audit_mutation"();

CREATE TRIGGER "WigStyleLocalizedApprovalDecision_immutable"
BEFORE UPDATE OR DELETE ON "WigStyleLocalizedApprovalDecision"
FOR EACH ROW EXECUTE FUNCTION "reject_wig_style_localized_audit_mutation"();

CREATE TRIGGER "WigStyleLocalizedPublicationEvent_immutable"
BEFORE UPDATE OR DELETE ON "WigStyleLocalizedPublicationEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_wig_style_localized_audit_mutation"();
