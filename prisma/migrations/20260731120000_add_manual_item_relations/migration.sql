BEGIN;

CREATE TYPE "WigStyleRelationPurpose" AS ENUM (
  'SIMILAR_STYLE',
  'COMPARE_WITH'
);

CREATE TABLE "WigStyleRelation" (
  "id" TEXT NOT NULL,
  "sourceStyleId" TEXT NOT NULL,
  "targetStyleId" TEXT NOT NULL,
  "marketCode" TEXT NOT NULL,
  "purpose" "WigStyleRelationPurpose" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "internalRationale" VARCHAR(500),
  "createdByAdminUserId" TEXT NOT NULL,
  "updatedByAdminUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WigStyleRelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WigStyleRelation_source_target_distinct_check" CHECK (
    "sourceStyleId" <> "targetStyleId"
  ),
  CONSTRAINT "WigStyleRelation_priority_lower_check" CHECK (
    "priority" >= 0
  ),
  CONSTRAINT "WigStyleRelation_priority_upper_check" CHECK (
    "priority" <= 10000
  ),
  CONSTRAINT "WigStyleRelation_active_rationale_check" CHECK (
    "isActive" = false
    OR (
      "internalRationale" IS NOT NULL
      AND btrim("internalRationale") <> ''
    )
  )
);

CREATE UNIQUE INDEX "WigStyleRelation_sourceStyleId_targetStyleId_marketCode_key"
ON "WigStyleRelation"("sourceStyleId", "targetStyleId", "marketCode");

CREATE INDEX "WigStyleRelation_sourceStyleId_marketCode_isActive_purpose_priority_idx"
ON "WigStyleRelation"("sourceStyleId", "marketCode", "isActive", "purpose", "priority");

CREATE INDEX "WigStyleRelation_targetStyleId_idx"
ON "WigStyleRelation"("targetStyleId");

ALTER TABLE "WigStyleRelation"
ADD CONSTRAINT "WigStyleRelation_sourceStyleId_fkey"
FOREIGN KEY ("sourceStyleId") REFERENCES "WigStyle"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WigStyleRelation"
ADD CONSTRAINT "WigStyleRelation_targetStyleId_fkey"
FOREIGN KEY ("targetStyleId") REFERENCES "WigStyle"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WigStyleRelation"
ADD CONSTRAINT "WigStyleRelation_marketCode_fkey"
FOREIGN KEY ("marketCode") REFERENCES "Market"("code")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
